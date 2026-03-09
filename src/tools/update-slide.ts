import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { getProjectPath } from "../state.js";
import { parse, serialize, parseSlideInput } from "../lib/slides-parser.js";
import { validateSlideContent } from "../lib/validator.js";
import { DARK_SAFE_CLASSES_GUIDE, applyLayoutDefaults } from "../lib/defaults.js";

const UpdateSlideSchema = z.object({
  slide_number: z.number().int().min(1),
  new_content: z.string().min(1).describe(
    "Full replacement content for the slide in Markdown. May include an embedded per-slide " +
      "frontmatter block at the top (e.g. '---\\nlayout: center\\nclass: text-center\\n---\\n# Title'). " +
      "Replaces the entire slide including any existing per-slide frontmatter. " +
      "When including a 'class' field in the frontmatter with Tailwind/UnoCSS utility classes, " +
      "follow the base-style protection rule:\n\n" +
      DARK_SAFE_CLASSES_GUIDE
  ),
});

export function registerUpdateSlide(server: McpServer): void {
  server.tool(
    "update_slide",
    "Replace the content of an existing slide (1-based slide number). The global frontmatter is not counted. Replaces the entire slide content including any existing per-slide frontmatter.",
    UpdateSlideSchema.shape,
    async (params) => {
      const { slide_number, new_content } = params;

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

      // Validate new content
      try {
        validateSlideContent(new_content);
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

        // Validate slide_number bounds (1-based)
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

        // Parse new_content — handles plain content or embedded ---frontmatter--- format
        const parsedSlide = parseSlideInput(new_content);

        // Apply layout-conditional defaults (e.g. two-cols → class: mx-2)
        const updatedSlide = {
          ...parsedSlide,
          frontmatter: applyLayoutDefaults(parsedSlide.frontmatter),
        };

        // Replace the targeted slide (0-based index internally)
        presentation.slides[slide_number - 1] = updatedSlide;

        fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                slideNumber: slide_number,
                message: `Slide ${slide_number} updated successfully.`,
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
