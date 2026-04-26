import yaml from "js-yaml";

export interface Slide {
  frontmatter?: string;
  content: string;
}

export interface ParsedPresentation {
  headmatter: string;
  slides: Slide[];
}

export interface PresentationDiagnostic {
  severity: "error" | "warning";
  code: string;
  location: string;
  line?: number;
  message: string;
}

export interface SlideSource {
  startLine: number;
  endLine: number;
  frontmatterStartLine?: number;
}

export interface PresentationDocument extends ParsedPresentation {
  diagnostics: PresentationDiagnostic[];
  sourceMap: {
    headmatterStartLine?: number;
    headmatterEndLine?: number;
    slides: SlideSource[];
  };
  normalizedRaw: string;
}

interface Block {
  text: string;
  startLine: number;
  endLine: number;
}

export function parsePresentationDocument(raw: string): PresentationDocument {
  const diagnostics: PresentationDiagnostic[] = [];
  const normalizedRaw = normalizeInput(raw, diagnostics);
  const lines = normalizedRaw.split("\n");

  if (lines[0]?.trim() !== "---") {
    diagnostics.push({
      severity: "error",
      code: "MISSING_HEADMATTER",
      location: "global",
      line: 1,
      message:
        "File does not start with `---`. A Slidev presentation must begin with a global frontmatter block.",
    });
    return parseLegacy(normalizedRaw, diagnostics);
  }

  let closingHeadmatterIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (isSeparatorLine(lines[i])) {
      closingHeadmatterIdx = i;
      break;
    }
  }

  if (closingHeadmatterIdx === -1) {
    diagnostics.push({
      severity: "error",
      code: "UNCLOSED_HEADMATTER",
      location: "headmatter",
      line: 1,
      message:
        "Global frontmatter block is never closed. Add a `---` line before the first slide.",
    });
    return emptyDocument(normalizedRaw, diagnostics);
  }

  const headmatter = lines.slice(1, closingHeadmatterIdx).join("\n").trimEnd();
  validateYaml(headmatter, diagnostics, "INVALID_HEADMATTER_YAML", "headmatter", 2);

  const bodyLines = lines.slice(closingHeadmatterIdx + 1);
  const split = splitBlocks(bodyLines, closingHeadmatterIdx + 2, diagnostics);
  const { slides, sourceMap } = blocksToSlides(split.blocks, diagnostics);

  return {
    headmatter,
    slides,
    diagnostics,
    sourceMap: {
      headmatterStartLine: 1,
      headmatterEndLine: closingHeadmatterIdx + 1,
      slides: sourceMap,
    },
    normalizedRaw,
  };
}

export function serializePresentation(parsed: ParsedPresentation): string {
  const headmatter = parsed.headmatter.trim();
  const renderedSlides = parsed.slides.map(renderSlide);

  let output = "---\n";
  if (headmatter) output += `${headmatter}\n`;
  output += "---";

  if (renderedSlides.length > 0) {
    output += `\n${renderedSlides[0]}`;
    for (let i = 1; i < renderedSlides.length; i++) {
      const rendered = renderedSlides[i];
      output += rendered.startsWith("---") ? `\n${rendered}` : `\n---\n${rendered}`;
    }
  }

  return `${output.trimEnd()}\n`;
}

export function parseSlideText(rawInput: string): Slide {
  const trimmed = rawInput.replace(/^\uFEFF/, "").trimStart();

  if (trimmed.startsWith("---\n") || trimmed.startsWith("---\r\n")) {
    const lines = trimmed.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    let closingIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (isSeparatorLine(lines[i])) {
        closingIdx = i;
        break;
      }
    }

    if (closingIdx !== -1) {
      const frontmatter = lines.slice(1, closingIdx).join("\n").trim();
      validateSlideFrontmatterOrThrow(frontmatter);
      const content = ensureNoAmbiguousSeparators(
        lines.slice(closingIdx + 1).join("\n").trim()
      );
      return { frontmatter, content };
    }
  }

  return { content: ensureNoAmbiguousSeparators(trimmed.trim()) };
}

function normalizeInput(raw: string, diagnostics: PresentationDiagnostic[]): string {
  let normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (normalized.startsWith("\uFEFF")) {
    diagnostics.push({
      severity: "error",
      code: "LEADING_BOM",
      location: "global",
      line: 1,
      message:
        "File starts with a UTF-8 BOM. Slidev requires `---` at line 1, column 1.",
    });
    normalized = normalized.replace(/^\uFEFF/, "");
  }

  if (/^[\t\n ]+---(?:\n|$)/.test(normalized)) {
    diagnostics.push({
      severity: "error",
      code: "LEADING_WHITESPACE",
      location: "global",
      line: 1,
      message:
        "File has whitespace or blank lines before the initial `---`, which can create ghost slides.",
    });
    normalized = normalized.replace(/^[\t\n ]+(?=---(?:\n|$))/, "");
  }

  return normalized;
}

function splitBlocks(
  lines: string[],
  firstLineNumber: number,
  diagnostics: PresentationDiagnostic[]
): { blocks: Block[] } {
  const blocks: Block[] = [];
  let current: string[] = [];
  let currentStartLine = firstLineNumber;
  let inFence = false;
  let fenceChar = "";
  let fenceOpenLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = firstLineNumber + i;
    const trimmed = line.trim();

    if (inFence) {
      current.push(line);
      if (trimmed.startsWith(fenceChar)) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = true;
      fenceChar = trimmed.startsWith("```") ? "```" : "~~~";
      fenceOpenLine = lineNumber;
      current.push(line);
      continue;
    }

    if (isSeparatorLine(line)) {
      blocks.push({
        text: current.join("\n"),
        startLine: currentStartLine,
        endLine: Math.max(currentStartLine, lineNumber - 1),
      });
      current = [];
      currentStartLine = lineNumber + 1;
      continue;
    }

    current.push(line);
  }

  if (inFence) {
    diagnostics.push({
      severity: "error",
      code: "UNCLOSED_CODE_FENCE",
      location: "global",
      line: fenceOpenLine,
      message: `A code fence opened at line ${fenceOpenLine} is never closed.`,
    });
  }

  blocks.push({
    text: current.join("\n"),
    startLine: currentStartLine,
    endLine: currentStartLine + Math.max(0, current.length - 1),
  });

  return { blocks };
}

function blocksToSlides(
  blocks: Block[],
  diagnostics: PresentationDiagnostic[]
): { slides: Slide[]; sourceMap: SlideSource[] } {
  const slides: Slide[] = [];
  const sourceMap: SlideSource[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.text.trim().length === 0) {
      const frontmatterBlock = blocks[i + 1];
      const contentBlock = blocks[i + 2];

      if (frontmatterBlock && contentBlock && looksLikeFrontmatter(frontmatterBlock.text)) {
        const frontmatter = frontmatterBlock.text.trim();
        validateYaml(
          frontmatter,
          diagnostics,
          "INVALID_SLIDE_FRONTMATTER_YAML",
          `slide ${slides.length + 1}`,
          frontmatterBlock.startLine
        );
        slides.push({ frontmatter, content: contentBlock.text.trim() });
        sourceMap.push({
          startLine: block.startLine,
          endLine: contentBlock.endLine,
          frontmatterStartLine: frontmatterBlock.startLine,
        });
        i += 3;
        continue;
      }

      if (slides.length === 0) {
        i++;
        continue;
      }

      if (i < blocks.length - 1) {
        diagnostics.push({
          severity: "error",
          code: "CONSECUTIVE_SEPARATORS",
          location: `line ${block.startLine}`,
          line: block.startLine,
          message:
            "Two consecutive `---` separators were found without valid per-slide frontmatter after the second separator.",
        });
        diagnostics.push({
          severity: "warning",
          code: "EMPTY_SLIDE",
          location: `slide ${slides.length + 1}`,
          line: block.startLine,
          message: `Slide ${slides.length + 1} has no content.`,
        });
      }
      i++;
      continue;
    }

    if (looksLikeFrontmatter(block.text) && blocks[i + 1]) {
      const contentBlock = blocks[i + 1];
      const frontmatter = block.text.trim();
      validateYaml(
        frontmatter,
        diagnostics,
        "INVALID_SLIDE_FRONTMATTER_YAML",
        `slide ${slides.length + 1}`,
        block.startLine
      );
      slides.push({ frontmatter, content: contentBlock.text.trim() });
      sourceMap.push({
        startLine: block.startLine,
        endLine: contentBlock.endLine,
        frontmatterStartLine: block.startLine,
      });
      i += 2;
      continue;
    }

    slides.push({ content: block.text.trim() });
    sourceMap.push({ startLine: block.startLine, endLine: block.endLine });
    i++;
  }

  return { slides, sourceMap };
}

function parseLegacy(
  raw: string,
  diagnostics: PresentationDiagnostic[]
): PresentationDocument {
  const split = splitBlocks(raw.split("\n"), 1, diagnostics);
  const first = split.blocks[0];
  const remaining = split.blocks.slice(1);
  const { slides, sourceMap } = blocksToSlides(remaining, diagnostics);
  return {
    headmatter: first?.text.trimEnd() ?? "",
    slides,
    diagnostics,
    sourceMap: { slides: sourceMap },
    normalizedRaw: raw,
  };
}

function emptyDocument(
  normalizedRaw: string,
  diagnostics: PresentationDiagnostic[]
): PresentationDocument {
  return {
    headmatter: "",
    slides: [],
    diagnostics,
    sourceMap: { slides: [] },
    normalizedRaw,
  };
}

function renderSlide(slide: Slide): string {
  const content = ensureNoAmbiguousSeparators(slide.content).trim();
  const frontmatter = slide.frontmatter?.trim();

  if (frontmatter) {
    validateSlideFrontmatterOrThrow(frontmatter);
    return content ? `---\n${frontmatter}\n---\n${content}` : `---\n${frontmatter}\n---`;
  }

  return content;
}

function ensureNoAmbiguousSeparators(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let inFence = false;
  let fenceChar = "";

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (inFence) {
      if (trimmed.startsWith(fenceChar)) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = true;
      fenceChar = trimmed.startsWith("```") ? "```" : "~~~";
      continue;
    }

    if (isSeparatorLine(lines[i])) {
      throw new Error(
        `Slide content contains a bare '---' separator at content line ${i + 1}. Use a code fence or remove it.`
      );
    }
  }

  return lines.join("\n");
}

function looksLikeFrontmatter(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!/^\s*[\w-]+\s*:/m.test(trimmed)) return false;

  try {
    const parsed = yaml.load(trimmed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return true;
  }
}

function validateYaml(
  text: string,
  diagnostics: PresentationDiagnostic[],
  code: string,
  location: string,
  line?: number
): void {
  try {
    yaml.load(text);
  } catch (err) {
    diagnostics.push({
      severity: "error",
      code,
      location,
      line,
      message: `${location} contains invalid YAML: ${(err as Error).message}`,
    });
  }
}

function validateSlideFrontmatterOrThrow(frontmatter: string): void {
  try {
    yaml.load(frontmatter);
  } catch (err) {
    throw new Error(`Invalid YAML frontmatter: ${(err as Error).message}`);
  }
}

function isSeparatorLine(line: string): boolean {
  return line.trim() === "---";
}
