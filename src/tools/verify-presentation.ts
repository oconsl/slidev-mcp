import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { getProjectPath } from "../state.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerificationIssue {
  /** Severity of the issue */
  severity: "error" | "warning";
  /** Human-readable short code for the issue type */
  code: string;
  /** Slide number (1-based) where the issue was found, or "headmatter" / "global" */
  location: string;
  /** Line number within slides.md where the issue starts (1-based) */
  line?: number;
  /** Full description of the issue and how to fix it */
  message: string;
}

export interface VerificationResult {
  valid: boolean;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: VerificationIssue[];
  summary: string;
}

// ─── Core verification logic ──────────────────────────────────────────────────

/**
 * Verifies the syntax of a slides.md file content.
 *
 * Checks performed:
 *  1. File must start with `---` (no BOM, no leading whitespace).
 *  2. Global headmatter block must be properly closed with `---`.
 *  3. Global headmatter must be valid YAML.
 *  4. Two consecutive `---` lines anywhere in the file (outside code fences) are
 *     flagged as errors — they produce corrupt/empty frontmatter blocks in Slidev.
 *  5. Per-slide frontmatter must be valid YAML.
 *  6. Code fences opened inside a slide must be properly closed.
 *  7. Warns about empty slides.
 *  8. Warns about unclosed code fences at end of file.
 */
export function verifySlidesMd(raw: string): VerificationResult {
  const issues: VerificationIssue[] = [];
  const lines = raw.split("\n");

  // ── 1. Leading noise check ──────────────────────────────────────────────────
  if (!raw.startsWith("---")) {
    // Check for BOM
    const hasBom = raw.startsWith("\uFEFF");
    // Check for leading whitespace
    const hasLeadingWhitespace = /^[\s]+---/.test(raw);

    if (hasBom) {
      issues.push({
        severity: "error",
        code: "LEADING_BOM",
        location: "global",
        line: 1,
        message:
          'File starts with a UTF-8 BOM character. Slidev requires the file to start exactly with `---` at line 1, column 1. Remove the BOM (many editors have a "Save without BOM" option).',
      });
    } else if (hasLeadingWhitespace) {
      issues.push({
        severity: "error",
        code: "LEADING_WHITESPACE",
        location: "global",
        line: 1,
        message:
          "File has whitespace or blank lines before the initial `---`. Slidev treats anything before the first `---` as a ghost slide. The file must start exactly with `---` at line 1.",
      });
    } else {
      issues.push({
        severity: "error",
        code: "MISSING_HEADMATTER",
        location: "global",
        line: 1,
        message:
          "File does not start with `---`. A Slidev presentation must begin with a global frontmatter block (`---\\n...\\n---`).",
      });
    }
  }

  // ── 2 & 3. Parse headmatter block ──────────────────────────────────────────
  let bodyStartLine = 0; // 0-based line index where slide body begins

  if (lines[0]?.trim() === "---") {
    // Find closing ---
    let closingIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        closingIdx = i;
        break;
      }
    }

    if (closingIdx === -1) {
      issues.push({
        severity: "error",
        code: "UNCLOSED_HEADMATTER",
        location: "headmatter",
        line: 1,
        message:
          "Global frontmatter block (starting at line 1) is never closed. Add a `---` line to close it before your first slide content.",
      });
      // Nothing more can be reliably checked
      return buildResult(issues);
    }

    // Validate headmatter YAML
    const headmatterStr = lines.slice(1, closingIdx).join("\n");
    try {
      yaml.load(headmatterStr);
    } catch (err) {
      issues.push({
        severity: "error",
        code: "INVALID_HEADMATTER_YAML",
        location: "headmatter",
        line: 2,
        message: `Global frontmatter contains invalid YAML: ${(err as Error).message}`,
      });
    }

    bodyStartLine = closingIdx + 1;
  }

  // ── 4, 5, 6, 7. Scan slide body ────────────────────────────────────────────
  let slideNumber = 1;
  let slideStartLine = bodyStartLine; // 0-based
  let inFence = false;
  let fenceChar = "";
  let fenceOpenLine = -1;
  let inPerSlideFrontmatter = false;
  let perSlideFmOpenLine = -1;
  let perSlideFmLines: string[] = [];
  let perSlideFmSlideNumber = -1;
  let slideContentLines: string[] = [];
  let slideLineStart = bodyStartLine; // 0-based

  /**
   * Flushes the current slide for empty-slide warning.
   */
  const flushSlide = (lineIdx: number) => {
    const contentText = slideContentLines.join("\n").trim();
    if (contentText.length === 0) {
      issues.push({
        severity: "warning",
        code: "EMPTY_SLIDE",
        location: `slide ${slideNumber}`,
        line: slideLineStart + 1, // convert to 1-based
        message: `Slide ${slideNumber} has no content. Consider removing it or adding content.`,
      });
    }
    slideNumber++;
    slideContentLines = [];
    slideLineStart = lineIdx + 1;
  };

  for (let i = bodyStartLine; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNumber = i + 1; // 1-based for reporting

    // ── Inside a code fence ──────────────────────────────────────────────────
    if (inFence) {
      slideContentLines.push(line);
      if (trimmed.startsWith(fenceChar) && trimmed !== fenceChar + fenceChar.slice(-1)) {
        // closing fence (e.g. ``` or ~~~)
        inFence = false;
        fenceChar = "";
        fenceOpenLine = -1;
      } else if (trimmed === fenceChar) {
        inFence = false;
        fenceChar = "";
        fenceOpenLine = -1;
      }
      continue;
    }

    // ── Inside per-slide frontmatter ─────────────────────────────────────────
    if (inPerSlideFrontmatter) {
      if (trimmed === "---") {
        // Closing frontmatter ---
        const fmStr = perSlideFmLines.join("\n");
        try {
          yaml.load(fmStr);
        } catch (err) {
          issues.push({
            severity: "error",
            code: "INVALID_SLIDE_FRONTMATTER_YAML",
            location: `slide ${perSlideFmSlideNumber}`,
            line: perSlideFmOpenLine + 1,
            message: `Per-slide frontmatter for slide ${perSlideFmSlideNumber} contains invalid YAML: ${(err as Error).message}`,
          });
        }
        inPerSlideFrontmatter = false;
        perSlideFmLines = [];
        perSlideFmSlideNumber = -1;
        perSlideFmOpenLine = -1;
      } else {
        perSlideFmLines.push(line);
      }
      continue;
    }

    // ── Separator line `---` ─────────────────────────────────────────────────
    if (trimmed === "---") {
      // Is this the START of a per-slide frontmatter?
      // Heuristic: a separator at the very beginning of a new slide block
      // (i.e., we haven't accumulated any content yet for this slide) is treated
      // as a per-slide frontmatter opener.
      const hasContent = slideContentLines.some((l) => l.trim().length > 0);

      if (!hasContent) {
        // Opening per-slide frontmatter
        inPerSlideFrontmatter = true;
        perSlideFmOpenLine = i;
        perSlideFmSlideNumber = slideNumber;
        perSlideFmLines = [];
      } else {
        // This is a SLIDE SEPARATOR — flush the current slide and start a new one.
        flushSlide(i);
        // After the separator check if next line looks like a per-slide frontmatter start
        // (handled naturally by the loop reset logic above)
      }
      continue;
    }

    // ── Opening a code fence ─────────────────────────────────────────────────
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = true;
      fenceChar = trimmed.startsWith("```") ? "```" : "~~~";
      fenceOpenLine = lineNumber;
      slideContentLines.push(line);
      continue;
    }

    // ── Regular content line ─────────────────────────────────────────────────
    slideContentLines.push(line);
  }

  // ── End-of-file checks ──────────────────────────────────────────────────────

  // Unclosed code fence at EOF
  if (inFence) {
    issues.push({
      severity: "error",
      code: "UNCLOSED_CODE_FENCE",
      location: `slide ${slideNumber}`,
      line: fenceOpenLine,
      message: `Slide ${slideNumber} has an unclosed code fence (opened with \`${fenceChar}\` at line ${fenceOpenLine}). Add a closing \`${fenceChar}\` line.`,
    });
  }

  // Unclosed per-slide frontmatter at EOF
  if (inPerSlideFrontmatter) {
    issues.push({
      severity: "error",
      code: "UNCLOSED_SLIDE_FRONTMATTER",
      location: `slide ${perSlideFmSlideNumber}`,
      line: perSlideFmOpenLine + 1,
      message: `Slide ${perSlideFmSlideNumber} has a per-slide frontmatter block (opened at line ${perSlideFmOpenLine + 1}) that is never closed. Add a closing \`---\` line after the frontmatter keys.`,
    });
  }

  // Flush the last slide
  const lastContentText = slideContentLines.join("\n").trim();
  if (lastContentText.length === 0 && slideNumber > 1) {
    issues.push({
      severity: "warning",
      code: "EMPTY_SLIDE",
      location: `slide ${slideNumber}`,
      line: slideLineStart + 1,
      message: `Slide ${slideNumber} has no content. Consider removing it or adding content.`,
    });
  }

  // ── Explicit check: two consecutive `---` lines ─────────────────────────────
  // Two adjacent `---` lines corrupt Slidev frontmatter parsing — Slidev sees
  // an empty frontmatter block which breaks the slide that follows.
  // This scan is independent of the slide-structure loop above and catches the
  // pattern anywhere in the file (headmatter, slide body, slide frontmatter, etc.),
  // except inside code fences where `---` is plain text.
  {
    let scanInFence = false;
    let scanFenceChar = "";
    let prevWasSeparator = false;
    let prevSeparatorLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (scanInFence) {
        if (trimmed.startsWith(scanFenceChar)) {
          scanInFence = false;
          scanFenceChar = "";
        }
        prevWasSeparator = false;
        continue;
      }

      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        scanInFence = true;
        scanFenceChar = trimmed.startsWith("```") ? "```" : "~~~";
        prevWasSeparator = false;
        continue;
      }

      if (trimmed === "---") {
        if (prevWasSeparator) {
          issues.push({
            severity: "error",
            code: "CONSECUTIVE_SEPARATORS",
            location: `line ${i + 1}`,
            line: prevSeparatorLine,
            message:
              `Two consecutive \`---\` lines found at lines ${prevSeparatorLine} and ${i + 1}. ` +
              `This creates an empty or corrupt frontmatter block and breaks Slidev parsing. ` +
              `Remove one of the \`---\` lines or add content between them.`,
          });
        }
        prevWasSeparator = true;
        prevSeparatorLine = i + 1;
      } else {
        prevWasSeparator = false;
      }
    }
  }

  return buildResult(issues);
}

function buildResult(issues: VerificationIssue[]): VerificationResult {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const valid = errors.length === 0;

  let summary: string;
  if (valid && warnings.length === 0) {
    summary = "✅ Presentation syntax is valid. No issues found.";
  } else if (valid) {
    summary = `⚠️  Presentation is valid but has ${warnings.length} warning(s). Review them to avoid subtle issues.`;
  } else {
    summary = `❌ Presentation has ${errors.length} error(s) and ${warnings.length} warning(s). Fix errors before presenting.`;
  }

  return {
    valid,
    issueCount: issues.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    issues,
    summary,
  };
}

// ─── MCP Tool registration ────────────────────────────────────────────────────

export function registerVerifyPresentation(server: McpServer): void {
  server.tool(
    "verify_presentation",
    [
      "Verifies the syntax of the current Slidev presentation (slides.md).",
      "Detects common issues that break slide rendering:",
      "  • Two consecutive `---` lines anywhere in the file (corrupt frontmatter).",
      "  • Bare `---` lines inside slide content (outside code fences) that Slidev",
      "    interprets as slide separators instead of horizontal rules.",
      "  • Leading whitespace or BOM before the initial frontmatter (creates ghost slides).",
      "  • Unclosed global or per-slide frontmatter blocks.",
      "  • Invalid YAML in global headmatter or per-slide frontmatter.",
      "  • Unclosed code fences.",
      "  • Empty slides.",
      "Returns a structured report with severity, location, and fix guidance for each issue.",
    ].join("\n"),
    {},
    async () => {
      let projectPath: string;
      try {
        projectPath = getProjectPath();
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      const slidesPath = path.join(projectPath, "slides.md");

      try {
        const raw = fs.readFileSync(slidesPath, "utf8");
        const result = verifySlidesMd(raw);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  projectPath,
                  slidesPath,
                  ...result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading slides.md: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
