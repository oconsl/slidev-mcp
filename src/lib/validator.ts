import path from "node:path";
import yaml from "js-yaml";

/**
 * Ensures the resolved path stays within baseDir.
 * Throws if a path traversal attempt is detected.
 * Returns the resolved absolute path on success.
 */
export function safePath(baseDir: string, targetPath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, targetPath);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error(
      `Path traversal attempt detected: "${targetPath}" escapes project root "${resolvedBase}"`
    );
  }

  return resolvedTarget;
}

/**
 * Validates that the per-slide frontmatter portion of slide content is valid YAML.
 * If the content starts with a frontmatter block (--- ... ---), parses it with js-yaml.
 * Throws a descriptive Error on malformed YAML.
 */
export function validateSlideContent(content: string): void {
  const trimmed = content.trimStart();

  if (!trimmed.startsWith("---")) {
    // No frontmatter — nothing to validate
    return;
  }

  const lines = trimmed.split("\n");
  // Find the closing ---
  let closingIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIdx = i;
      break;
    }
  }

  if (closingIdx === -1) {
    // Opening --- but no closing --- found; treat as no frontmatter
    return;
  }

  const frontmatterStr = lines.slice(1, closingIdx).join("\n");

  try {
    yaml.load(frontmatterStr);
  } catch (err) {
    const yamlErr = err as Error;
    throw new Error(`Invalid YAML frontmatter: ${yamlErr.message}`);
  }
}

/**
 * Validates that a project name is safe to use as a directory name.
 * Rejects empty strings, whitespace-only, and path-traversal characters.
 */
export function validateProjectName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error("Project name must not be empty.");
  }

  const invalidChars = /[/\\:*?"<>|]/;
  if (invalidChars.test(name)) {
    throw new Error(
      `Project name "${name}" contains invalid characters. Avoid: / \\ : * ? " < > |`
    );
  }

  if (name.includes("..")) {
    throw new Error(
      `Project name "${name}" contains path traversal sequence "..".`
    );
  }
}
