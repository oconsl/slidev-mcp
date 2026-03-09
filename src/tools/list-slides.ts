import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs";
import path from "node:path";
import { getProjectPath } from "../state.js";
import { parse } from "../lib/slides-parser.js";

export function registerListSlides(server: McpServer): void {
  server.tool(
    "list_slides",
    "List all slides in the current presentation. Returns each slide's number, a content preview, and whether it has per-slide frontmatter.",
    {},
    async () => {
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

      const slidesPath = path.join(projectPath, "slides.md");

      try {
        const raw = fs.readFileSync(slidesPath, "utf8");
        const presentation = parse(raw);

        const slidesSummary = presentation.slides.map((slide, idx) => {
          // Produce a short preview (first non-empty line of content, max 80 chars)
          const firstLine =
            slide.content
              .split("\n")
              .map((l) => l.trim())
              .find((l) => l.length > 0) ?? "(empty)";

          const preview =
            firstLine.length > 80
              ? firstLine.slice(0, 77) + "..."
              : firstLine;

          return {
            slide_number: idx + 1,
            preview,
            has_frontmatter: slide.frontmatter !== undefined,
            frontmatter: slide.frontmatter ?? null,
          };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                projectPath,
                headmatter: presentation.headmatter.trim(),
                slideCount: presentation.slides.length,
                slides: slidesSummary,
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
