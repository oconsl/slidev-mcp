import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import { resolveProject } from "../state.js";
import {
  parsePresentationDocument,
  type PresentationDiagnostic,
} from "../lib/presentation-document.js";
import { spawnAsync } from "../lib/shell.js";
import { summarizeOutput, toolError, toolSuccess } from "../lib/tool-response.js";

export interface VerificationIssue {
  severity: "error" | "warning";
  code: string;
  location: string;
  line?: number;
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

const VerifyPresentationSchema = z.object({
  level: z.enum(["syntax", "render", "full"]).optional().default("syntax"),
});

export function verifySlidesMd(raw: string): VerificationResult {
  const document = parsePresentationDocument(raw);
  return buildResult(document.diagnostics);
}

function buildResult(issues: PresentationDiagnostic[]): VerificationResult {
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

export function registerVerifyPresentation(server: McpServer): void {
  server.tool(
    "verify_presentation",
    "Verifies the current Slidev presentation. Syntax mode parses slides.md; render/full also run a Slidev build check when available.",
    VerifyPresentationSchema.shape,
    async (params) => {
      let project;
      try {
        project = resolveProject();
      } catch (err) {
        return toolError("PROJECT_NOT_FOUND", (err as Error).message);
      }

      try {
        const raw = fs.readFileSync(project.slidesPath, "utf8");
        const syntax = verifySlidesMd(raw);
        const payload: Record<string, unknown> = {
          projectPath: project.projectPath,
          slidesPath: project.slidesPath,
          level: params.level,
          ...syntax,
        };

        if ((params.level === "render" || params.level === "full") && syntax.valid) {
          const result = await spawnAsync(
            "npx",
            ["slidev", "build", "--out", ".slidev-mcp-verify"],
            { cwd: project.projectPath, timeoutMs: 120000 }
          );
          payload.render = {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: summarizeOutput(result.stdout),
            stderr: summarizeOutput(result.stderr),
          };
        }

        return toolSuccess(payload);
      } catch (err) {
        return toolError("VERIFY_FAILED", (err as Error).message);
      }
    }
  );
}
