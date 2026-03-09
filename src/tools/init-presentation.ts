import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { setProjectPath } from "../state.js";
import { spawnAsync } from "../lib/shell.js";
import { validateProjectName } from "../lib/validator.js";
import {
  DEFAULT_THEME,
  DEFAULT_COLOR_SCHEMA,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_TRANSITION,
  DEFAULT_GLOBAL_STYLE_CSS,
} from "../lib/defaults.js";
import { parse } from "../lib/slides-parser.js";

const InitPresentationSchema = z.object({
  project_name: z.string().min(1),
  title: z.string().min(1),
  theme: z.string().optional(),
});

/**
 * Builds the initial slides.md content with global frontmatter and two starter slides.
 * The first slide uses `cover` layout (matching the preferred presentation style).
 */
function buildInitialSlidesmd(title: string, theme?: string): string {
  const resolvedTheme = theme ?? DEFAULT_THEME;

  return [
    `---`,
    `title: "${title.replace(/"/g, '\\"')}"`,
    `theme: ${resolvedTheme}`,
    `colorSchema: ${DEFAULT_COLOR_SCHEMA}`,
    `aspectRatio: "${DEFAULT_ASPECT_RATIO}"`,
    `transition: ${DEFAULT_TRANSITION}`,
    `layout: cover`,
    `class: text-center`,
    `background: https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1920&q=80`,
    `---`,
    ``,
    `# ${title}`,
    ``,
    `---`,
    ``,
    `# Slide 2`,
    ``,
    `Add your content here`,
    ``,
  ].join("\n");
}

/**
 * Builds the package.json content for a new Slidev project.
 */
function buildPackageJson(projectName: string, theme?: string): string {
  const resolvedTheme = theme ?? DEFAULT_THEME;
  const deps: Record<string, string> = {
    "@slidev/cli": "^0.50.0",
    "@slidev/theme-default": "latest",
  };

  if (resolvedTheme !== "default") {
    deps[`@slidev/theme-${resolvedTheme}`] = "latest";
  }

  return JSON.stringify(
    {
      name: projectName,
      version: "0.0.1",
      private: true,
      scripts: {
        dev: "slidev",
        build: "slidev build",
        export: "slidev export",
      },
      dependencies: deps,
    },
    null,
    2
  );
}

export function registerInitPresentation(server: McpServer): void {
  server.tool(
    "init_presentation",
    "Initialize a new Slidev presentation project. Creates the project directory, installs dependencies, and generates a slides.md file.",
    InitPresentationSchema.shape,
    async (params) => {
      const { project_name, title, theme } = params;
      const resolvedTheme = theme ?? DEFAULT_THEME;

      // Validate project name
      try {
        validateProjectName(project_name);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }

      const workspaceRoot = process.cwd();
      const projectDir = path.resolve(workspaceRoot, project_name);

      // Check for existing directory — attach to it if it already has a slides.md
      if (fs.existsSync(projectDir)) {
        const existingSlidesPath = path.join(projectDir, "slides.md");
        if (fs.existsSync(existingSlidesPath)) {
          // Attach to the existing Slidev project without modifying anything
          setProjectPath(projectDir);
          const slideCount = (() => {
            try {
              const raw = fs.readFileSync(existingSlidesPath, "utf8");
              return parse(raw).slides.length;
            } catch {
              return 0;
            }
          })();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  projectPath: projectDir,
                  attached: true,
                  slideCount,
                  message: `Attached to existing Slidev project at ${projectDir}`,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Error: Directory "${project_name}" already exists at ${projectDir} but contains no slides.md. ` +
                `Remove or rename the directory, or point to an existing Slidev project.`,
            },
          ],
          isError: true,
        };
      }

      try {
        // Create project directory
        fs.mkdirSync(projectDir, { recursive: true });

        // Write package.json
        fs.writeFileSync(
          path.join(projectDir, "package.json"),
          buildPackageJson(project_name, theme),
          "utf8"
        );

        // Write slides.md
        fs.writeFileSync(
          path.join(projectDir, "slides.md"),
          buildInitialSlidesmd(title, resolvedTheme),
          "utf8"
        );

        // Write default global style file (dark minimal palette)
        fs.writeFileSync(
          path.join(projectDir, "style.css"),
          DEFAULT_GLOBAL_STYLE_CSS,
          "utf8"
        );

        // Run npm install
        process.stderr.write(
          `[slidev-mcp] Running npm install in ${projectDir}...\n`
        );
        const result = await spawnAsync("npm", ["install"], {
          cwd: projectDir,
        });

        if (result.exitCode !== 0) {
          // Clean up on failure
          fs.rmSync(projectDir, { recursive: true, force: true });
          return {
            content: [
              {
                type: "text",
                text: `Error: npm install failed.\n\nstderr:\n${result.stderr}`,
              },
            ],
            isError: true,
          };
        }

        // Set the project path in state
        setProjectPath(projectDir);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                projectPath: projectDir,
                slideCount: 2,
                theme: resolvedTheme,
                styleFile: path.join(projectDir, "style.css"),
                message: `Presentation "${title}" initialized at ${projectDir}`,
              }),
            },
          ],
        };
      } catch (err) {
        // Clean up partial directory on unexpected error
        if (fs.existsSync(projectDir)) {
          fs.rmSync(projectDir, { recursive: true, force: true });
        }
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
