import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { getProjectPath } from "../state.js";
import { parse, serialize, updateHeadmatterKey } from "../lib/slides-parser.js";

/**
 * Tool: set_slide_transition
 *
 * Manages animations and transitions in a Slidev presentation.
 * Covers the full Slidev animation system:
 *
 * TRANSITIONS (between slides):
 *   - Set per-slide or global transition using Slidev built-ins or custom CSS names
 *   - Reference: https://sli.dev/guide/animations#slide-transitions
 *   - Built-ins: slide-left, slide-right, slide-up, slide-down, fade, zoom, none
 *   - Custom: any @unocss/transformer-directives or CSS animation class name
 *
 * CLICK ANIMATIONS (v-click / v-after / v-mark):
 *   - Inject v-click directives into slide content for click-to-reveal effects
 *   - Reference: https://sli.dev/guide/animations#click-animations
 *
 * V-MOTION:
 *   - Inject @vueuse/motion directives for enter/leave animations
 *   - Reference: https://sli.dev/guide/animations#motion
 *
 * GLOBAL TRANSITION:
 *   - Sets the default transition for ALL slides via global headmatter
 */

/** All built-in Slidev slide transitions */
const BUILTIN_TRANSITIONS = [
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "fade",
  "fade-out",
  "zoom",
  "none",
] as const;

/** All built-in v-click animation effects */
const CLICK_EFFECTS = [
  "fade-in",        // Default: element fades in on click
  "fade-out",       // Element fades out on click
  "highlight",      // Element is highlighted (v-mark)
  "strike-through", // Strike-through mark (v-mark)
  "underline",      // Underline mark (v-mark)
  "circle",         // Circle around element (v-mark)
  "box",            // Box around element (v-mark)
] as const;

const SetSlideTransitionSchema = z.object({
  mode: z
    .enum(["transition", "global-transition", "v-click", "v-motion"])
    .describe(
      "Animation mode:\n" +
        "  'transition'        — Set slide-to-slide transition for a specific slide.\n" +
        "  'global-transition' — Set the default transition for ALL slides (global headmatter).\n" +
        "  'v-click'           — Add click-to-reveal animations to elements in a slide's content.\n" +
        "  'v-motion'          — Add enter/leave motion animations to elements in a slide."
    ),

  // ── TRANSITION fields ───────────────────────────────────────────────────
  transition: z
    .string()
    .optional()
    .describe(
      "Transition name. Built-ins: slide-left, slide-right, slide-up, slide-down, fade, fade-out, zoom, none. " +
        "Can also be a custom CSS class name. " +
        "For forward/backward different transitions, use 'forward|backward' format " +
        "(e.g. 'slide-left|slide-right'). " +
        "Required for modes 'transition' and 'global-transition'."
    ),

  slide_number: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Target slide number (1-based). Required for modes 'transition', 'v-click', and 'v-motion'."
    ),

  // ── V-CLICK fields ──────────────────────────────────────────────────────
  click_content: z
    .string()
    .optional()
    .describe(
      "For 'v-click' mode: the slide's full new content with v-click/v-after/v-mark directives " +
        "already embedded as HTML attributes. " +
        "Example: '# Title\\n\\n<div v-click>Appears on click 1</div>\\n\\n<p v-click>Appears on click 2</p>\\n\\n<span v-mark.underline=\"3\">Underlined on click 3</span>'. " +
        "The tool replaces the slide content with this value. " +
        "If omitted, the tool appends v-click wrappers to each paragraph/heading in the slide."
    ),

  auto_wrap: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "For 'v-click' mode without click_content: if true, automatically wraps each " +
        "non-empty content block (paragraphs, headings after the first) in the slide " +
        "with sequential v-click directives. Useful for step-by-step reveals."
    ),

  // ── V-MOTION fields ─────────────────────────────────────────────────────
  motion_content: z
    .string()
    .optional()
    .describe(
      "For 'v-motion' mode: the slide's full new content with v-motion directives embedded. " +
        "Example: '<div v-motion :initial=\"{x: -80, opacity: 0}\" :enter=\"{x: 0, opacity: 1, transition: {delay: 200}}\">Hello</div>'. " +
        "Reference: https://sli.dev/guide/animations#motion"
    ),

  // ── Shared ──────────────────────────────────────────────────────────────
  click_count: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "For 'transition' mode: sets the number of clicks required before the slide advances. " +
        "Maps to the 'clicks' frontmatter field."
    ),
});

/** Wraps each non-title block in the slide content with sequential v-click */
function autoWrapWithVClick(content: string): string {
  const lines = content.split("\n");
  const resultLines: string[] = [];
  let clickIndex = 1;
  let inBlock = false;
  let blockLines: string[] = [];
  let isFirst = true;

  const flushBlock = () => {
    if (blockLines.length > 0) {
      const blockText = blockLines.join("\n").trim();
      if (blockText) {
        if (isFirst) {
          // First block (title/header) is always visible
          resultLines.push(...blockLines);
          isFirst = false;
        } else {
          resultLines.push(`<div v-click="${clickIndex}">`);
          resultLines.push(...blockLines);
          resultLines.push(`</div>`);
          clickIndex++;
        }
      }
      blockLines = [];
    }
    inBlock = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (inBlock) {
        flushBlock();
      }
      resultLines.push(line);
    } else {
      inBlock = true;
      blockLines.push(line);
    }
  }

  if (blockLines.length > 0) {
    flushBlock();
  }

  return resultLines.join("\n");
}

export function registerSetSlideTransition(server: McpServer): void {
  server.tool(
    "set_slide_transition",
    "Add transitions, click animations (v-click), and motion effects (v-motion) to Slidev slides. " +
      "Supports: slide transitions (per-slide or global), v-click step-by-step reveals, " +
      "v-mark highlights, and v-motion enter/leave animations. " +
      "Reference: https://sli.dev/guide/animations",
    SetSlideTransitionSchema.shape,
    async (params) => {
      const {
        mode,
        transition,
        slide_number,
        click_content,
        auto_wrap,
        motion_content,
        click_count,
      } = params;

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
        // ── MODE: global-transition ─────────────────────────────────────────
        if (mode === "global-transition") {
          if (!transition) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Error: 'transition' is required for mode 'global-transition'. ` +
                    `Available built-ins: ${BUILTIN_TRANSITIONS.join(", ")}`,
                },
              ],
              isError: true,
            };
          }

          const raw = fs.readFileSync(slidesPath, "utf8");
          const presentation = parse(raw);

          presentation.headmatter = updateHeadmatterKey(
            presentation.headmatter,
            "transition",
            transition
          );

          fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "global-transition",
                  transition,
                  message: `Global transition set to "${transition}" for all slides.`,
                  builtinTransitions: BUILTIN_TRANSITIONS,
                  tip: "Use 'forward|backward' format for different forward/backward transitions (e.g. 'slide-left|slide-right').",
                }),
              },
            ],
          };
        }

        // ── Remaining modes require slide_number ────────────────────────────
        if (!slide_number) {
          return {
            content: [
              {
                type: "text",
                text: `Error: 'slide_number' is required for mode '${mode}'.`,
              },
            ],
            isError: true,
          };
        }

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

        // ── MODE: transition ────────────────────────────────────────────────
        if (mode === "transition") {
          if (!transition) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Error: 'transition' is required for mode 'transition'. ` +
                    `Available built-ins: ${BUILTIN_TRANSITIONS.join(", ")}`,
                },
              ],
              isError: true,
            };
          }

          // Update/create frontmatter with transition (and optionally clicks)
          let fm = slide.frontmatter ?? "";
          fm = updateHeadmatterKey(fm, "transition", transition);

          if (click_count !== undefined) {
            fm = updateHeadmatterKey(fm, "clicks", String(click_count));
          }

          slide.frontmatter = fm;
          presentation.slides[slide_number - 1] = slide;
          fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "transition",
                  slideNumber: slide_number,
                  transition,
                  clicks: click_count ?? null,
                  message: `Transition "${transition}" set on slide ${slide_number}.`,
                  builtinTransitions: BUILTIN_TRANSITIONS,
                  tip: "Use 'forward|backward' format for directional transitions (e.g. 'slide-left|slide-right').",
                }),
              },
            ],
          };
        }

        // ── MODE: v-click ───────────────────────────────────────────────────
        if (mode === "v-click") {
          if (click_content) {
            // Replace slide content with provided v-click markup
            slide.content = click_content;
          } else if (auto_wrap) {
            // Auto-wrap existing content paragraphs with v-click
            slide.content = autoWrapWithVClick(slide.content);
          } else {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Error: For mode 'v-click', provide either 'click_content' (full slide content with v-click directives) ` +
                    `or set 'auto_wrap: true' to automatically wrap content blocks.\n\n` +
                    `v-click directive examples:\n` +
                    `  <div v-click>Appears on click 1</div>\n` +
                    `  <p v-click="2">Appears on click 2</p>\n` +
                    `  <span v-after>Appears after previous click</span>\n` +
                    `  <span v-mark.underline="3">Underline on click 3</span>\n` +
                    `  <span v-mark.circle="{ at: 4, color: 'red' }">Circle on click 4</span>\n\n` +
                    `v-mark effects: underline, circle, highlight, strike-through, box`,
                },
              ],
              isError: true,
            };
          }

          presentation.slides[slide_number - 1] = slide;
          fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "v-click",
                  slideNumber: slide_number,
                  method: click_content ? "manual-content" : "auto-wrap",
                  message: `v-click animations applied to slide ${slide_number}.`,
                  reference: "https://sli.dev/guide/animations#click-animations",
                  vClickExamples: [
                    "<div v-click>Appears on click 1</div>",
                    "<p v-click=\"2\">Appears on click 2 specifically</p>",
                    "<span v-after>Appears after previous click</span>",
                    "<span v-mark.underline=\"3\">Underlined on click 3</span>",
                    "<span v-mark.circle>Circled on next click</span>",
                    "<span v-mark=\"{ at: 4, type: 'highlight', color: '#ffd700' }\">Gold highlight</span>",
                  ],
                }),
              },
            ],
          };
        }

        // ── MODE: v-motion ──────────────────────────────────────────────────
        if (mode === "v-motion") {
          if (!motion_content) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Error: 'motion_content' is required for mode 'v-motion'.\n\n` +
                    `v-motion examples:\n` +
                    `  <div v-motion :initial="{x: -80, opacity: 0}" :enter="{x: 0, opacity: 1}">\n` +
                    `    Slides in from left\n` +
                    `  </div>\n\n` +
                    `  <div v-motion\n` +
                    `    :initial="{ y: 80, opacity: 0 }"\n` +
                    `    :enter="{ y: 0, opacity: 1, transition: { delay: 500, duration: 800 } }"\n` +
                    `    :leave="{ y: -80, opacity: 0 }">\n` +
                    `    Bounces in with delay\n` +
                    `  </div>\n\n` +
                    `Motion properties: x, y, scale, rotate, opacity, skewX, skewY\n` +
                    `Transition: delay (ms), duration (ms), type ('spring'|'tween')\n` +
                    `Reference: https://sli.dev/guide/animations#motion`,
                },
              ],
              isError: true,
            };
          }

          slide.content = motion_content;
          presentation.slides[slide_number - 1] = slide;
          fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "v-motion",
                  slideNumber: slide_number,
                  message: `v-motion animations applied to slide ${slide_number}.`,
                  reference: "https://sli.dev/guide/animations#motion",
                  vMotionExamples: [
                    '<div v-motion :initial="{x: -80, opacity: 0}" :enter="{x: 0, opacity: 1}">Slide in from left</div>',
                    '<div v-motion :initial="{scale: 0}" :enter="{scale: 1, transition: {type: \'spring\'}}">Spring scale in</div>',
                    '<div v-motion :initial="{y: 100, opacity: 0}" :enter="{y: 0, opacity: 1, transition: {delay: 300}}">Delayed fade up</div>',
                    '<img v-motion :initial="{rotate: -10, opacity: 0}" :enter="{rotate: 0, opacity: 1}">Rotates in</img>',
                  ],
                  motionProperties: {
                    initial: "Starting state (before animation)",
                    enter: "Animated-to state (on slide enter)",
                    leave: "Exit state (on slide leave)",
                    visible: "State when element is visible",
                    transitionKeys: ["delay", "duration", "type (spring|tween)", "ease"],
                    animatableProps: ["x", "y", "scale", "rotate", "opacity", "skewX", "skewY"],
                  },
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
