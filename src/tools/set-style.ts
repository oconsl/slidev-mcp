import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { getProjectPath } from "../state.js";
import { parse, serialize, updateHeadmatterKey } from "../lib/slides-parser.js";
import { DEFAULT_GLOBAL_STYLE_CSS, DARK_SAFE_CLASSES_GUIDE } from "../lib/defaults.js";

/**
 * Tool: set_style
 *
 * Manages CSS styling for a Slidev presentation. Supports three modes:
 *
 * 1. "global"  — Writes/replaces content in `style.css` (root of project).
 *                Slidev automatically imports this file as global CSS.
 *                Reference: https://sli.dev/custom/directory-structure#style
 *
 * 2. "slide"   — Adds/replaces a `<style>` block at the end of a specific slide's content.
 *                Styles are scoped to that slide unless `scoped: false` is set.
 *                Reference: https://sli.dev/features/slide-scope-style
 *
 * 3. "unocss"  — Adds a `css` property to the global headmatter for inline UnoCSS/Windi config.
 *                Also supports adding UnoCSS utility classes via the `class` frontmatter field.
 *                Reference: https://sli.dev/custom/config-unocss
 */
const SetStyleSchema = z.object({
  mode: z
    .enum(["global", "slide", "unocss"])
    .describe(
      "Styling mode:\n" +
        "  'global'  — Write CSS to style.css (auto-imported by Slidev for all slides).\n" +
        "  'slide'   — Add/replace a <style> block inside a specific slide.\n" +
        "  'unocss'  — Add UnoCSS/Windi utility classes to a slide's frontmatter (class field)."
    ),
  css: z
    .string()
    .optional()
    .describe(
      "CSS content to apply. Required for 'global' and 'slide' modes.\n" +
        "For 'global': full CSS stylesheet (e.g. 'body { font-family: sans-serif; }').\n" +
        "For 'slide': CSS rules to inject in a <style> block (e.g. 'h1 { color: red; }').\n" +
        "For 'unocss': not used — use the 'classes' field instead.\n" +
        "If mode='global' and css is omitted, a default minimal dark style is applied."
    ),
  slide_number: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Target slide number (1-based) for 'slide' and 'unocss' modes. " +
        "Not used for 'global' mode."
    ),
  scoped: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "For 'slide' mode: whether styles are scoped to the slide (true) or global (false). " +
        "Scoped styles use <style scoped>, unscoped use <style>. Defaults to true."
    ),
  classes: z
    .string()
    .optional()
    .describe(
      "For 'unocss' mode: space-separated UnoCSS/TailwindCSS utility classes to add to the slide's " +
        "'class' frontmatter field (e.g. 'text-center flex items-center'). " +
        "These merge with any existing classes on the slide.\n\n" +
        "Follow the base-style protection rule:\n\n" +
        DARK_SAFE_CLASSES_GUIDE
    ),
  append: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "For 'global' mode: if true, appends CSS to existing style.css instead of replacing it. " +
        "Defaults to false (replace)."
    ),
});

export function registerSetStyle(server: McpServer): void {
  server.tool(
    "set_style",
    "Manage CSS styling for the Slidev presentation. Supports three modes: " +
      "'global' (writes to style.css, applied to all slides), " +
      "'slide' (injects a <style> block into a specific slide), and " +
      "'unocss' (adds UnoCSS/TailwindCSS utility classes to a slide's frontmatter). " +
      "Reference: https://sli.dev/custom/directory-structure#style",
    SetStyleSchema.shape,
    async (params) => {
      const { mode, css, slide_number, scoped, classes, append } = params;

      let projectPath: string;
      try {
        projectPath = getProjectPath();
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      try {
        // ── MODE: global ──────────────────────────────────────────────────────
        if (mode === "global") {
          const resolvedCss =
            css && css.trim().length > 0 ? css.trim() : DEFAULT_GLOBAL_STYLE_CSS.trim();

          const stylePath = path.join(projectPath, "style.css");
          let finalCss: string;

          if (append && fs.existsSync(stylePath)) {
            const existing = fs.readFileSync(stylePath, "utf8");
            finalCss = existing.trimEnd() + "\n\n" + resolvedCss + "\n";
          } else {
            finalCss = resolvedCss + "\n";
          }

          fs.writeFileSync(stylePath, finalCss, "utf8");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "global",
                  file: stylePath,
                  action: append ? "appended" : "replaced",
                  usedDefault: !(css && css.trim().length > 0),
                  message: `Global styles ${append ? "appended to" : "written to"} ${stylePath}. Slidev auto-imports this file.`,
                }),
              },
            ],
          };
        }

        // ── MODE: slide ───────────────────────────────────────────────────────
        if (mode === "slide") {
          if (!css || css.trim().length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: 'css' is required for mode 'slide'.`,
                },
              ],
              isError: true,
            };
          }
          if (!slide_number) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: 'slide_number' is required for mode 'slide'.`,
                },
              ],
              isError: true,
            };
          }

          const slidesPath = path.join(projectPath, "slides.md");
          const raw = fs.readFileSync(slidesPath, "utf8");
          const presentation = parse(raw);

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

          const slide = presentation.slides[slide_number - 1];
          const styleTag = scoped ? `<style scoped>` : `<style>`;
          const styleBlock = `\n\n${styleTag}\n${css.trim()}\n</style>`;

          // Remove existing <style> block if present, then append new one
          const contentWithoutStyle = slide.content
            .replace(/<style(?:\s+scoped)?\s*>[\s\S]*?<\/style>\s*/gi, "")
            .trimEnd();

          slide.content = contentWithoutStyle + styleBlock;
          presentation.slides[slide_number - 1] = slide;

          fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "slide",
                  slideNumber: slide_number,
                  scoped,
                  message: `<style${scoped ? " scoped" : ""}> block added to slide ${slide_number}.`,
                }),
              },
            ],
          };
        }

        // ── MODE: unocss ──────────────────────────────────────────────────────
        if (mode === "unocss") {
          if (!classes || classes.trim().length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: 'classes' is required for mode 'unocss'.`,
                },
              ],
              isError: true,
            };
          }
          if (!slide_number) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: 'slide_number' is required for mode 'unocss'.`,
                },
              ],
              isError: true,
            };
          }

          const slidesPath = path.join(projectPath, "slides.md");
          const raw = fs.readFileSync(slidesPath, "utf8");
          const presentation = parse(raw);

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

          const slide = presentation.slides[slide_number - 1];
          const newClasses = classes.trim();

          // Merge with existing classes if any
          let existingClasses = "";
          if (slide.frontmatter) {
            const classMatch = slide.frontmatter.match(/^class\s*:\s*(.+)$/m);
            if (classMatch) {
              existingClasses = classMatch[1].trim().replace(/^["']|["']$/g, "");
            }
          }

          const mergedClasses = existingClasses
            ? `${existingClasses} ${newClasses}`
            : newClasses;

          // Update frontmatter with new class value
          const updatedFm = updateHeadmatterKey(
            slide.frontmatter ?? "",
            "class",
            mergedClasses
          );
          slide.frontmatter = updatedFm;
          presentation.slides[slide_number - 1] = slide;

          fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "unocss",
                  slideNumber: slide_number,
                  classes: mergedClasses,
                  message: `UnoCSS classes "${mergedClasses}" applied to slide ${slide_number} frontmatter.`,
                }),
              },
            ],
          };
        }

        return {
          content: [
            { type: "text", text: `Error: Unknown mode "${mode}".` },
          ],
          isError: true,
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
