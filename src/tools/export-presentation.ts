import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { resolveProject } from "../state.js";
import { safePath } from "../lib/validator.js";
import { spawnAsync } from "../lib/shell.js";
import { summarizeOutput, toolError, toolSuccess, logInfo } from "../lib/tool-response.js";
import { verifySlidesMd } from "./verify-presentation.js";

const ExportPresentationSchema = z.object({
  format: z.enum(["pdf", "spa", "png"]),
  output: z.string().optional(),
  timeout_ms: z.number().int().positive().optional().default(300000),
  slides: z.string().optional(),
  with_clicks: z.boolean().optional().default(false),
  dry_run: z.boolean().optional().default(false),
  skip_verify: z.boolean().optional().default(false),
});

export function registerExportPresentation(server: McpServer): void {
  server.tool(
    "export_presentation",
    "Export the current presentation to PDF, PNG, or SPA. Supports custom output paths inside the project, dry-run, timeout, slide range, and syntax verification.",
    ExportPresentationSchema.shape,
    async (params) => {
      let project;
      try {
        project = resolveProject();
      } catch (err) {
        return toolError("PROJECT_NOT_FOUND", (err as Error).message);
      }

      try {
        if (!params.skip_verify) {
          const raw = fs.readFileSync(project.slidesPath, "utf8");
          const verification = verifySlidesMd(raw);
          if (!verification.valid) {
            return toolError(
              "VERIFY_FAILED",
              "Presentation has syntax errors. Fix them or pass skip_verify: true.",
              verification
            );
          }
        }

        const outputPath = resolveOutputPath(
          project.projectPath,
          params.format,
          params.output
        );
        const args = buildExportArgs(params.format, outputPath, {
          slides: params.slides,
          withClicks: params.with_clicks,
        });

        if (params.dry_run) {
          return toolSuccess({
            format: params.format,
            outputPath,
            command: "npx",
            args,
            dryRun: true,
          });
        }

        logInfo(`Exporting presentation as "${params.format}" in ${project.projectPath}...`);
        const result = await spawnAsync("npx", args, {
          cwd: project.projectPath,
          timeoutMs: params.timeout_ms,
        });

        if (result.exitCode !== 0) {
          return toolError("SLIDEV_EXPORT_FAILED", "Slidev CLI export failed.", {
            exitCode: result.exitCode,
            stdout: summarizeOutput(result.stdout),
            stderr: summarizeOutput(result.stderr),
          });
        }

        if (!fs.existsSync(outputPath)) {
          return toolError(
            "OUTPUT_NOT_FOUND",
            `Export completed but output was not found at ${outputPath}.`,
            { stdout: summarizeOutput(result.stdout), stderr: summarizeOutput(result.stderr) }
          );
        }

        return toolSuccess({
          format: params.format,
          outputPath,
          stdout: summarizeOutput(result.stdout),
          stderr: summarizeOutput(result.stderr),
          message: `Presentation exported as ${params.format.toUpperCase()} to: ${outputPath}`,
        });
      } catch (err) {
        return toolError("EXPORT_FAILED", (err as Error).message);
      }
    }
  );
}

function resolveOutputPath(
  projectPath: string,
  format: "pdf" | "spa" | "png",
  output?: string
): string {
  if (output && output.trim().length > 0) {
    return safePath(projectPath, output);
  }

  if (format === "spa") return path.join(projectPath, "dist");
  return path.join(projectPath, format === "pdf" ? "slides-export.pdf" : "slides-export.png");
}

function buildExportArgs(
  format: "pdf" | "spa" | "png",
  outputPath: string,
  options: { slides?: string; withClicks?: boolean }
): string[] {
  if (format === "spa") {
    return ["slidev", "build", "--out", outputPath];
  }

  const args = ["slidev", "export", "--format", format, "--output", outputPath];
  if (options.slides) args.push("--range", options.slides);
  if (options.withClicks) args.push("--with-clicks");
  return args;
}
