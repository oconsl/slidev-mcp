import {
  parsePresentationDocument,
  parseSlideText,
  serializePresentation,
  type ParsedPresentation,
  type Slide,
} from "./presentation-document.js";

export type { ParsedPresentation, PresentationDiagnostic, PresentationDocument, Slide } from "./presentation-document.js";
export { parsePresentationDocument };

export function parse(raw: string): ParsedPresentation {
  const document = parsePresentationDocument(raw);
  return {
    headmatter: document.headmatter,
    slides: document.slides,
  };
}

export function serialize(parsed: ParsedPresentation): string {
  return serializePresentation(parsed);
}

export function parseSlideInput(rawInput: string): Slide {
  return parseSlideText(rawInput);
}

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
        updated.push(`${key}: ${yamlScalar(value)}`);
      }
    } else {
      updated.push(line);
    }
  }

  if (!found && value !== null) {
    updated.push(`${key}: ${yamlScalar(value)}`);
  }

  return updated.join("\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function yamlScalar(value: string): string {
  const needsQuoting =
    /[:#\[\]{},>|&*!'"@`%]/.test(value) ||
    value.trim() !== value ||
    value === "";
  if (needsQuoting) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
