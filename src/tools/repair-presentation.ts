import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import { resolveProject } from "../state.js";
import { parsePresentationDocument, serializePresentation } from "../lib/presentation-document.js";
import { toolError, toolSuccess } from "../lib/tool-response.js";

const RepairPresentationSchema = z.object({
  dry_run: z.boolean().optional().default(false),
});

export function registerRepairPresentation(server: McpServer): void {
  server.tool(
    "repair_presentation",
    "Safely repair slides.md structure: remove BOM/leading whitespace and serialize the parsed presentation into canonical Slidev form. Never drops slide content silently.",
    RepairPresentationSchema.shape,
    async (params) => {
      try {
        const project = resolveProject();
        const raw = fs.readFileSync(project.slidesPath, "utf8");
        const before = parsePresentationDocument(raw);
        const repaired = serializePresentation({
          headmatter: before.headmatter,
          slides: before.slides,
        });
        const changed = repaired !== raw;

        if (!params.dry_run && changed) {
          fs.writeFileSync(project.slidesPath, repaired, "utf8");
        }

        const after = parsePresentationDocument(repaired);
        return toolSuccess({
          projectPath: project.projectPath,
          slidesPath: project.slidesPath,
          dryRun: params.dry_run,
          changed,
          beforeDiagnostics: before.diagnostics,
          afterDiagnostics: after.diagnostics,
          slideCount: after.slides.length,
        });
      } catch (err) {
        return toolError("REPAIR_FAILED", (err as Error).message);
      }
    }
  );
}
