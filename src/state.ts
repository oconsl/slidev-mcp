/**
 * Module-level state for the current active Slidev project path.
 * This is set by init_presentation and read by all other tools.
 *
 * Auto-discovery: if no path has been set explicitly, getProjectPath()
 * will attempt to locate a valid Slidev project (slides.md) automatically:
 *   1. Check process.cwd() directly (the MCP server's working directory).
 *   2. Scan immediate subdirectories of process.cwd() for a slides.md.
 * This allows the MCP to work with existing Slidev projects without
 * requiring an explicit init_presentation call.
 */

import fs from "node:fs";
import path from "node:path";
import { safePath } from "./lib/validator.js";

let currentProjectPath: string | undefined;
const workspaceRoot = path.resolve(process.cwd());

export interface ProjectContext {
  workspaceRoot: string;
  projectPath: string;
  slidesPath: string;
}

/**
 * Tries to find a Slidev project (slides.md) starting from `dir`.
 * Returns the project directory path if found, or undefined.
 */
function discoverSlidevProject(dir: string): string | undefined {
  // 1. Check the directory itself
  if (fs.existsSync(path.join(dir, "slides.md"))) {
    return dir;
  }

  // 2. Check immediate subdirectories (one level deep)
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidate = path.join(dir, entry.name);
        if (fs.existsSync(path.join(candidate, "slides.md"))) {
          return candidate;
        }
      }
    }
  } catch {
    // If we can't read the directory, just return undefined
  }

  return undefined;
}

/**
 * Returns the current project path.
 *
 * Resolution order:
 *   1. Explicitly set path (via setProjectPath / init_presentation).
 *   2. Auto-discovered path from process.cwd() or its subdirectories.
 *
 * Throws only if no Slidev project can be found at all.
 */
export function getProjectPath(): string {
  if (currentProjectPath) {
    return safePath(workspaceRoot, path.relative(workspaceRoot, currentProjectPath));
  }

  const discovered = discoverSlidevProject(process.cwd());
  if (discovered) {
    // Cache it so we don't re-scan on every tool call
    currentProjectPath = safePath(workspaceRoot, path.relative(workspaceRoot, discovered));
    process.stderr.write(
      `[slidev-mcp] Auto-discovered Slidev project at: ${discovered}\n`
    );
    return currentProjectPath;
  }

  throw new Error(
    "No Slidev project found. Either run init_presentation to create a new one, " +
      "or make sure there is a slides.md file in the working directory (or a subdirectory)."
  );
}

/**
 * Sets the current project path. Called by init_presentation.
 */
export function setProjectPath(p: string): void {
  const resolved = path.resolve(p);
  currentProjectPath = safePath(workspaceRoot, path.relative(workspaceRoot, resolved));
}

export function resolveProject(): ProjectContext {
  const projectPath = getProjectPath();
  return {
    workspaceRoot,
    projectPath,
    slidesPath: safePath(projectPath, "slides.md"),
  };
}

export function getWorkspaceRoot(): string {
  return workspaceRoot;
}

/**
 * Resets the project path (for testing purposes).
 */
export function resetProjectPath(): void {
  currentProjectPath = undefined;
}
