import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { getProjectPath } from "../state.js";
import { parse, serialize, updateHeadmatterKey } from "../lib/slides-parser.js";
import { spawnAsync } from "../lib/shell.js";
import { DEFAULT_THEME, DEFAULT_COLOR_SCHEMA } from "../lib/defaults.js";

/**
 * Known built-in Slidev themes (non-exhaustive — community themes can also be used).
 * Reference: https://sli.dev/themes/gallery
 */
const BUILTIN_THEMES = [
  "default",
  "seriph",
  "bricks",
  "shibainu",
  "apple-basic",
  "eloc",
  "neversink",
  "penguin",
  "purplin",
  "geist",
  "dracula",
];

const SetThemeSchema = z.object({
  theme: z
    .string()
    .min(1)
    .default(DEFAULT_THEME)
    .describe(
      "Theme name to apply. Can be a built-in Slidev theme (e.g. 'default', 'seriph', 'apple-basic') " +
        "or any npm package name (e.g. 'slidev-theme-eloc'). " +
        "Built-in themes are prefixed automatically: 'seriph' → '@slidev/theme-seriph'. " +
        "Pass a full package name (starting with '@' or 'slidev-theme-') to use community themes. " +
        `If omitted, defaults to '${DEFAULT_THEME}'.`
    ),
  install: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Whether to run npm install to install the theme package. Defaults to true. " +
        "Set to false if you know the theme is already installed."
    ),
});

/**
 * Resolves a short theme name to its npm package name.
 * Examples:
 *   "default"      → "@slidev/theme-default"
 *   "seriph"       → "@slidev/theme-seriph"
 *   "@slidev/theme-seriph"     → "@slidev/theme-seriph"  (already full)
 *   "slidev-theme-eloc"        → "slidev-theme-eloc"     (already full)
 */
function resolveThemePackage(theme: string): { packageName: string; themeValue: string } {
  // Already a full scoped package
  if (theme.startsWith("@") || theme.startsWith("slidev-theme-")) {
    return { packageName: theme, themeValue: theme };
  }
  // Built-in Slidev theme — use short name in slides.md, full name for install
  return {
    packageName: `@slidev/theme-${theme}`,
    themeValue: theme,
  };
}

export function registerSetTheme(server: McpServer): void {
  server.tool(
    "set_theme",
    "Change the theme of the current Slidev presentation. Updates the global frontmatter and optionally installs the theme npm package. " +
      "Supports all built-in Slidev themes (default, seriph, apple-basic, etc.) and community themes.",
    SetThemeSchema.shape,
    async (params) => {
      const { theme, install } = params;

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
      const { packageName, themeValue } = resolveThemePackage(theme);

      try {
        // 1. Update slides.md headmatter
        const raw = fs.readFileSync(slidesPath, "utf8");
        const presentation = parse(raw);

        presentation.headmatter = updateHeadmatterKey(
          presentation.headmatter,
          "theme",
          themeValue
        );

        // Always enforce dark color schema when setting a theme
        presentation.headmatter = updateHeadmatterKey(
          presentation.headmatter,
          "colorSchema",
          DEFAULT_COLOR_SCHEMA
        );

        fs.writeFileSync(slidesPath, serialize(presentation), "utf8");

        // 2. Update package.json dependencies
        const packageJsonPath = path.join(projectPath, "package.json");
        if (fs.existsSync(packageJsonPath)) {
          const pkgRaw = fs.readFileSync(packageJsonPath, "utf8");
          const pkg = JSON.parse(pkgRaw) as {
            dependencies?: Record<string, string>;
          };

          if (!pkg.dependencies) {
            pkg.dependencies = {};
          }

          // Remove any existing @slidev/theme-* entries
          for (const key of Object.keys(pkg.dependencies)) {
            if (key.startsWith("@slidev/theme-") || key.startsWith("slidev-theme-")) {
              delete pkg.dependencies[key];
            }
          }

          // Add new theme
          pkg.dependencies[packageName] = "latest";

          fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
        }

        // 3. Optionally run npm install
        let installOutput = "";
        if (install) {
          process.stderr.write(`[slidev-mcp] Installing theme ${packageName}...\n`);
          const result = await spawnAsync("npm", ["install", packageName], {
            cwd: projectPath,
          });

          if (result.exitCode !== 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    theme: themeValue,
                    packageName,
                    error: `npm install failed for ${packageName}.\n${result.stderr}`,
                    note: "slides.md was updated but npm install failed. Run 'npm install' manually.",
                  }),
                },
              ],
              isError: true,
            };
          }
          installOutput = result.stdout.trim();
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                theme: themeValue,
                colorSchema: DEFAULT_COLOR_SCHEMA,
                packageName,
                installed: install,
                message: `Theme set to "${themeValue}" (${packageName}), colorSchema forced to "${DEFAULT_COLOR_SCHEMA}"${install ? ". Package installed." : ". Skipped npm install."}`,
                ...(installOutput ? { installOutput } : {}),
                availableBuiltinThemes: BUILTIN_THEMES,
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
