/**
 * Code-fence-aware Slidev slides.md parser/serializer.
 *
 * Important Slidev behavior:
 * - The initial frontmatter block (--- ... --- at the start of file) is both
 *   global config and slide 1 config context.
 * - The file must start exactly with `---` at line 1, column 1.
 * - Leading whitespace/BOM before that first frontmatter can create ghost slides.
 */

export interface Slide {
  /** Raw per-slide YAML frontmatter string (without the --- delimiters), if present */
  frontmatter?: string;
  /** The slide body content (without per-slide frontmatter) */
  content: string;
}

export interface ParsedPresentation {
  /** The global frontmatter block (without --- delimiters) */
  headmatter: string;
  /** Individual slides, in order */
  slides: Slide[];
}

/**
 * Parses raw slides.md content into headmatter + slides.
 *
 * Primary mode (canonical Slidev):
 *   ---
 *   [global+slide1 headmatter]
 *   ---
 *   [slide 1 content]
 *   ---
 *   [slide 2 ...]
 *
 * Legacy fallback mode is kept for compatibility with non-canonical files.
 */
export function parse(raw: string): ParsedPresentation {
  const normalizedRaw = stripLeadingNoise(raw);
  const firstLine = normalizedRaw.split("\n", 1)[0] ?? "";

  // Canonical Slidev: initial fenced frontmatter at file start.
  if (isSeparatorLine(firstLine)) {
    return parseCanonical(normalizedRaw);
  }

  // Legacy fallback: headmatter is text before first separator.
  const rawBlocks = splitIntoBlocks(normalizedRaw);
  const headmatter = (rawBlocks[0] ?? "").trimEnd();
  const slideBlocks = mergeLegacySlideBlocks(rawBlocks.slice(1));
  const slides = slideBlocks
    .map((block) => parseLegacySlideBlock(block))
    .filter((slide) => slide.frontmatter !== undefined || slide.content.trim().length > 0);

  return { headmatter, slides };
}

function parseCanonical(raw: string): ParsedPresentation {
  const lines = raw.split("\n");

  // lines[0] is opening ---
  let closingFrontmatterIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (isSeparatorLine(lines[i])) {
      closingFrontmatterIdx = i;
      break;
    }
  }

  if (closingFrontmatterIdx === -1) {
    // Malformed file: treat all as empty/no slides rather than throwing.
    return { headmatter: "", slides: [] };
  }

  const headmatter = lines.slice(1, closingFrontmatterIdx).join("\n").trimEnd();
  const body = lines.slice(closingFrontmatterIdx + 1).join("\n");
  const slides = parseSlidesBody(body);

  return { headmatter, slides };
}

function parseSlidesBody(body: string): Slide[] {
  const lines = body.split("\n");
  const slides: Slide[] = [];
  let i = 0;

  while (i < lines.length) {
    // Skip blank lines between slides.
    while (i < lines.length && lines[i].trim() === "") {
      i++;
    }

    if (i >= lines.length) break;

    let frontmatter: string | undefined;

    // A `---` at the start of a slide context is either:
    //   (a) a per-slide frontmatter opener  →  --- YAML --- content
    //   (b) a plain slide separator with no frontmatter  →  --- content
    //
    // Distinguish via lookahead: peek ahead to see whether what follows is
    // YAML key-value pairs terminated by a closing ---.  If so, treat as (a).
    // Otherwise treat as (b) and simply skip the separator.
    if (isSeparatorLine(lines[i])) {
      let j = i + 1;
      const fmLines: string[] = [];
      while (j < lines.length && !isSeparatorLine(lines[j])) {
        fmLines.push(lines[j]);
        j++;
      }
      const hasClosing = j < lines.length && isSeparatorLine(lines[j]);
      const fmText = fmLines.join("\n").trim();
      // Looks like frontmatter when there is a closing --- and the block
      // contains at least one YAML key: value line.
      const looksLikeFrontmatter =
        hasClosing &&
        fmText.length > 0 &&
        /^\w[\w-]*\s*:/m.test(fmText);

      if (looksLikeFrontmatter) {
        frontmatter = fmText;
        i = j + 1; // advance past opening ---, fm lines, and closing ---
      } else {
        // Plain separator — skip the --- and proceed to content collection.
        i++;
      }
    }

    const contentLines: string[] = [];
    let insideFence = false;
    let fenceChar = "";

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!insideFence) {
        if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
          insideFence = true;
          fenceChar = trimmed.startsWith("```") ? "```" : "~~~";
          contentLines.push(line);
          i++;
          continue;
        }

        // A bare --- outside a code fence ends this slide's content.
        // Do NOT consume it here — the next outer-loop iteration will
        // examine it as the potential opener of the next slide's frontmatter.
        if (isSeparatorLine(line)) {
          break;
        }

        contentLines.push(line);
        i++;
      } else {
        if (trimmed.startsWith(fenceChar)) {
          insideFence = false;
          fenceChar = "";
        }
        contentLines.push(line);
        i++;
      }
    }

    const content = contentLines.join("\n").trim();
    if (frontmatter !== undefined || content.length > 0) {
      slides.push(frontmatter !== undefined ? { frontmatter, content } : { content });
    }

    // Do NOT advance i here. The --- that ended the content loop (if any)
    // is left for the next outer-loop iteration to inspect as a potential
    // frontmatter opener or plain separator for the upcoming slide.
  }

  return slides;
}

function isSeparatorLine(line: string): boolean {
  return line.trim() === "---";
}

function stripLeadingNoise(raw: string): string {
  // Remove UTF-8 BOM first.
  let normalized = raw.replace(/^\uFEFF/, "");

  // Remove leading spaces/newlines before first top-level frontmatter opener.
  normalized = normalized.replace(/^[\t\r\n ]+(?=---(?:\r?\n|$))/, "");

  return normalized;
}

/**
 * Splits content on `---` separators, ignoring separators inside code fences.
 * Legacy helper used for non-canonical input fallback.
 */
function splitIntoBlocks(raw: string): string[] {
  const lines = raw.split("\n");
  const blocks: string[] = [];
  let currentBlock: string[] = [];

  let insideFence = false;
  let fenceChar = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (!insideFence) {
      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        insideFence = true;
        fenceChar = trimmed.startsWith("```") ? "```" : "~~~";
        currentBlock.push(line);
        continue;
      }

      if (trimmed === "---") {
        blocks.push(currentBlock.join("\n"));
        currentBlock = [];
        continue;
      }

      currentBlock.push(line);
    } else {
      if (trimmed.startsWith(fenceChar)) {
        insideFence = false;
        fenceChar = "";
      }
      currentBlock.push(line);
    }
  }

  // Always push the last block
  blocks.push(currentBlock.join("\n"));

  return blocks;
}

/**
 * Legacy merge logic for old parser format where per-slide frontmatter and
 * content may end up split into adjacent blocks.
 */
function mergeLegacySlideBlocks(blocks: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];
    const trimmed = block.trim();

    if (i + 1 < blocks.length && isPureFrontmatter(trimmed)) {
      const contentBlock = blocks[i + 1];
      result.push(`\0FM\0${trimmed}\0CONTENT\0${contentBlock.trimStart()}`);
      i += 2;
    } else {
      result.push(block);
      i++;
    }
  }

  return result;
}

/**
 * Returns true if block looks like YAML frontmatter for legacy parsing.
 */
function isPureFrontmatter(block: string): boolean {
  if (!block || block.trim().length === 0) return false;

  const lines = block.trim().split("\n");

  // Must have at least one yaml key: value line
  const hasYamlKey = lines.some((l) => /^\s*\w[\w-]*\s*:/.test(l));
  if (!hasYamlKey) return false;

  // Must not have markdown content markers
  const hasMarkdown = lines.some((l) => {
    const t = l.trim();
    return (
      t.startsWith("#") ||
      t.startsWith("- ") ||
      t.startsWith("* ") ||
      t.startsWith("```") ||
      t.startsWith("~~~") ||
      t.startsWith("|") ||
      t.startsWith("> ")
    );
  });

  return !hasMarkdown;
}

/**
 * Parses a single legacy slide block into frontmatter + content.
 */
function parseLegacySlideBlock(block: string): Slide {
  if (block.startsWith("\0FM\0")) {
    const fmEnd = block.indexOf("\0CONTENT\0");
    if (fmEnd !== -1) {
      const frontmatter = block.slice("\0FM\0".length, fmEnd);
      const content = block.slice(fmEnd + "\0CONTENT\0".length);
      return { frontmatter, content };
    }
  }

  const content = block.trimStart();
  return { content };
}

/**
 * Serializes a ParsedPresentation back to a slides.md string.
 * Produces canonical output with `---` separators between blocks.
 *
 * Output format:
 *   [headmatter]
 *   ---
 *   [slide1 content or frontmatter---content]
 *   ---
 *   [slide2 ...]
 */
export function serialize(parsed: ParsedPresentation): string {
  const headmatter = parsed.headmatter.trim();

  const slideTexts = parsed.slides.map((slide) => {
    // Guard: remove any bare `---` lines from content (outside code fences).
    // Such lines act as slide separators in Slidev and would corrupt the output.
    const content = stripBareSeparatorsFromContent(slide.content);
    const fm = slide.frontmatter?.trim();

    if (fm && fm.length > 0) {
      return content.length > 0 ? `---\n${fm}\n---\n${content}` : `---\n${fm}\n---`;
    }

    return content;
  });

  let output = "---\n";
  if (headmatter.length > 0) {
    output += `${headmatter}\n`;
  }
  output += "---";

  if (slideTexts.length > 0) {
    output += `\n${slideTexts.join("\n---\n")}`;
  }

  output += "\n";

  // Final guard: never emit BOM or leading whitespace before first `---`.
  return stripLeadingNoise(output);
}

/**
 * Removes ALL bare `---` lines from slide body content, outside of code fences.
 *
 * In Slidev, `---` inside slide content (outside fences) is treated as a slide
 * separator, not as a markdown horizontal rule. Any such line breaks the
 * presentation structure. This function sanitizes the content by removing them.
 *
 * Lines inside ``` or ~~~ code fences are left untouched.
 */
function stripBareSeparatorsFromContent(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let insideFence = false;
  let fenceChar = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (insideFence) {
      result.push(line);
      if (trimmed.startsWith(fenceChar)) {
        insideFence = false;
        fenceChar = "";
      }
      continue;
    }

    // Detect opening fence
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      insideFence = true;
      fenceChar = trimmed.startsWith("```") ? "```" : "~~~";
      result.push(line);
      continue;
    }

    // Drop bare --- outside fences — they act as slide separators in Slidev
    if (trimmed === "---") {
      continue;
    }

    result.push(line);
  }

  return result.join("\n").trim();
}

/**
 * Parses a raw slide content string (as provided by the user/AI) into a Slide object.
 *
 * Handles two formats:
 *   1. Plain content: "# My Slide\n\nSome text"
 *   2. With embedded frontmatter: "---\nlayout: cover\n---\n# My Slide"
 *
 * This prevents duplicate `---` separators when content already embeds frontmatter.
 * Any bare `---` lines in the body (outside code fences) are removed, since they
 * would be treated as slide separators by Slidev and break the presentation.
 */
export function parseSlideInput(rawInput: string): Slide {
  const trimmed = rawInput.trimStart();

  // Detect embedded frontmatter: starts with ---\n, has a closing ---
  if (trimmed.startsWith("---\n") || trimmed.startsWith("---\r\n")) {
    const lines = trimmed.split("\n");
    // Find the closing --- (first --- after line 0)
    let closingIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        closingIdx = i;
        break;
      }
    }

    if (closingIdx !== -1) {
      const frontmatter = lines.slice(1, closingIdx).join("\n").trim();
      const body = stripBareSeparatorsFromContent(
        lines.slice(closingIdx + 1).join("\n")
      );
      return { frontmatter, content: body };
    }
  }

  // No embedded frontmatter — sanitize bare --- from content
  return { content: stripBareSeparatorsFromContent(trimmed) };
}

/**
 * Updates or inserts a single key in a YAML headmatter string.
 *
 * Rules:
 * - If the key already exists, its value is replaced in-place.
 * - If the key does not exist, it is appended.
 * - Value is serialized as a plain YAML scalar (quoted if it contains special chars).
 *
 * @param headmatter  Raw headmatter text (without --- delimiters)
 * @param key         YAML key to set (e.g. "theme", "title")
 * @param value       New value (string). Pass null to remove the key.
 * @returns Updated headmatter string
 */
export function updateHeadmatterKey(
  headmatter: string,
  key: string,
  value: string | null
): string {
  const lines = headmatter.split("\n");
  const keyPattern = new RegExp(`^(\\s*)${escapeRegex(key)}\\s*:.*$`);

  let found = false;
  const updated: string[] = [];

  for (const line of lines) {
    if (keyPattern.test(line)) {
      found = true;
      if (value !== null) {
        // Replace in-place with properly formatted value
        updated.push(`${key}: ${yamlScalar(value)}`);
      }
      // If value is null, skip (removes the key)
    } else {
      updated.push(line);
    }
  }

  if (!found && value !== null) {
    // Append new key at end (before any trailing empty lines)
    updated.push(`${key}: ${yamlScalar(value)}`);
  }

  return updated.join("\n");
}

/** Escapes special regex characters in a string */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Serializes a value as a YAML scalar.
 * Quotes the string if it contains characters that need quoting in YAML.
 */
function yamlScalar(value: string): string {
  // Quote if value contains YAML-special characters or is empty
  const needsQuoting = /[:#\[\]{},>|&*!'"@`%]/.test(value) || value.trim() !== value || value === "";
  if (needsQuoting) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
