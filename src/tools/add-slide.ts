import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { getProjectPath } from "../state.js";
import { parse, serialize, parseSlideInput } from "../lib/slides-parser.js";
import { validateSlideContent } from "../lib/validator.js";
import { DARK_SAFE_CLASSES_GUIDE, applyLayoutDefaults } from "../lib/defaults.js";

const AddSlideSchema = z.object({
  content: z.string().min(1).describe(
    "Full slide content in Markdown. May include an embedded per-slide frontmatter block at the " +
      "top (e.g. '---\\nlayout: center\\nclass: text-center\\n---\\n# Title'). " +
      "When including a 'class' field in the frontmatter with Tailwind/UnoCSS utility classes, " +
      "follow the base-style protection rule:\n\n" +
      DARK_SAFE_CLASSES_GUIDE
  ),
  layout: z.string().optional(),
  index: z.number().int().positive().optional(),
});

export function registerAddSlide(server: McpServer): void {
  server.tool(
    "add_slide",
    "Add a new slide to the current presentation. Optionally specify a layout and an insertion index (1-based). If index is omitted, the slide is appended at the end.",
    AddSlideSchema.shape,
    async (params) => {
      const { content, layout, index } = params;

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

      // Validate slide content
      try {
        validateSlideContent(content);
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

        // Parse the content input — handles both plain content and embedded frontmatter.
        // If the AI passes "---\nlayout: cover\n---\n# Title", parseSlideInput extracts
        // the frontmatter correctly, preventing duplicate --- separators in the output.
        const parsedSlide = parseSlideInput(content);

        // The `layout` parameter takes precedence over any embedded frontmatter layout.
        // If layout is provided, override/set it in the frontmatter.
        let newSlide = parsedSlide;
        if (layout) {
          const existingFm = parsedSlide.frontmatter ?? "";
          // Replace or prepend layout key in frontmatter
          const fmLines = existingFm
            .split("\n")
            .filter((l) => !l.trimStart().startsWith("layout:"))
            .filter((l) => l.trim().length > 0);
          fmLines.unshift(`layout: ${layout}`);
          newSlide = { frontmatter: fmLines.join("\n"), content: parsedSlide.content };
        }

        // Apply layout-conditional defaults (e.g. two-cols → class: mx-2)
        newSlide = {
          ...newSlide,
          frontmatter: applyLayoutDefaults(newSlide.frontmatter),
        };

        if (index === undefined) {
          // Append at the end
          presentation.slides.push(newSlide);
        } else {
          // Validate index bounds (1-based, allow inserting at last+1 = append)
          if (index < 1) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: index must be 1 or greater. Got ${index}.`,
                },
              ],
              isError: true,
            };
          }
          if (index > presentation.slides.length + 1) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Index ${index} is out of range. Presentation has ${presentation.slides.length} slides.`,
                },
              ],
              isError: true,
            };
          }
          // Insert at 0-based position (index - 1)
          presentation.slides.splice(index - 1, 0, newSlide);
        }

        fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

        const finalIndex = index ?? presentation.slides.length;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                slideCount: presentation.slides.length,
                insertedAt: finalIndex,
                message: `Slide added at position ${finalIndex}. Presentation now has ${presentation.slides.length} slides.`,
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
