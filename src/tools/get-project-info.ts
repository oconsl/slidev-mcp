import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { resolveProject } from "../state.js";
import { parsePresentationDocument } from "../lib/presentation-document.js";
import { toolError, toolSuccess } from "../lib/tool-response.js";
import { verifySlidesMd } from "./verify-presentation.js";

export function registerGetProjectInfo(server: McpServer): void {
  server.tool(
    "get_project_info",
    "Return information about the active Slidev project, including paths, slide count, theme, package versions, and syntax verification status.",
    {},
    async () => {
      try {
        const project = resolveProject();
        const raw = fs.readFileSync(project.slidesPath, "utf8");
        const document = parsePresentationDocument(raw);
        const headmatter = (yaml.load(document.headmatter) ?? {}) as Record<string, unknown>;
        const packageJsonPath = path.join(project.projectPath, "package.json");
        const packageJson = fs.existsSync(packageJsonPath)
          ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
              scripts?: Record<string, string>;
            }
          : {};

        return toolSuccess({
          workspaceRoot: project.workspaceRoot,
          projectPath: project.projectPath,
          slidesPath: project.slidesPath,
          slideCount: document.slides.length,
          theme: typeof headmatter.theme === "string" ? headmatter.theme : null,
          title: typeof headmatter.title === "string" ? headmatter.title : null,
          packageVersions: {
            slidev:
              packageJson.dependencies?.["@slidev/cli"] ??
              packageJson.devDependencies?.["@slidev/cli"] ??
              null,
          },
          scripts: packageJson.scripts ?? {},
          verification: verifySlidesMd(raw),
        });
      } catch (err) {
        return toolError("PROJECT_INFO_FAILED", (err as Error).message);
      }
    }
  );
}
