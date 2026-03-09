import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { getProjectPath } from "../state.js";
import { spawnAsync } from "../lib/shell.js";

const ExportPresentationSchema = z.object({
  format: z.enum(["pdf", "spa", "png"]),
});

export function registerExportPresentation(server: McpServer): void {
  server.tool(
    "export_presentation",
    "Export the current presentation to a static format. Supported formats: 'pdf' (requires playwright-chromium), 'png' (requires playwright-chromium), 'spa' (static web app via slidev build).",
    ExportPresentationSchema.shape,
    async (params) => {
      const { format } = params;

      // Get current project path
      let projectPath: string;
      try {
        projectPath = getProjectPath();
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      process.stderr.write(
        `[slidev-mcp] Exporting presentation as "${format}" in ${projectPath}...\n`
      );

      try {
        let result;
        let outputPath: string;

        if (format === "spa") {
          // SPA uses `slidev build`, NOT `slidev export`
          const outDir = path.join(projectPath, "dist");
          result = await spawnAsync(
            "npx",
            ["slidev", "build", "--out", outDir],
            { cwd: projectPath }
          );
          outputPath = outDir;
        } else {
          // pdf / png use `slidev export --format <format>`
          const outFile = path.join(
            projectPath,
            format === "pdf" ? "slides-export.pdf" : "slides-export.png"
          );
          result = await spawnAsync(
            "npx",
            ["slidev", "export", "--format", format, "--output", outFile],
            { cwd: projectPath }
          );
          outputPath = outFile;
        }

        if (result.exitCode !== 0) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Slidev CLI exited with code ${result.exitCode}.\n\nstderr:\n${result.stderr}`,
              },
            ],
            isError: true,
          };
        }

        // Verify output exists
        if (!fs.existsSync(outputPath)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Export completed but output not found at: ${outputPath}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                format,
                outputPath,
                message: `Presentation exported as ${format.toUpperCase()} to: ${outputPath}`,
              }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
