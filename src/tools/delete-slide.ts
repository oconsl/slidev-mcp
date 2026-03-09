import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { getProjectPath } from "../state.js";
import { parse, serialize } from "../lib/slides-parser.js";

const DeleteSlideSchema = z.object({
  slide_number: z.number().int().min(1),
});

export function registerDeleteSlide(server: McpServer): void {
  server.tool(
    "delete_slide",
    "Delete a slide from the current presentation by its 1-based slide number. The global headmatter is not counted. Cannot delete the last remaining slide.",
    DeleteSlideSchema.shape,
    async (params) => {
      const { slide_number } = params;

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

        // Validate bounds (1-based)
        if (slide_number < 1) {
          return {
            content: [
              {
                type: "text",
                text: `Error: slide_number must be 1 or greater.`,
              },
            ],
            isError: true,
          };
        }

        if (slide_number > presentation.slides.length) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Slide ${slide_number} does not exist. Presentation has ${presentation.slides.length} slides.`,
              },
            ],
            isError: true,
          };
        }

        // Prevent deleting the last slide
        if (presentation.slides.length === 1) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Cannot delete the last remaining slide. A presentation must have at least one slide.`,
              },
            ],
            isError: true,
          };
        }

        // Remove the slide at 0-based index
        presentation.slides.splice(slide_number - 1, 1);

        fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                deletedSlide: slide_number,
                slideCount: presentation.slides.length,
                message: `Slide ${slide_number} deleted. Presentation now has ${presentation.slides.length} slides.`,
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
