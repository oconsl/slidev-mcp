import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerInitPresentation } from "./tools/init-presentation.js";
import { registerAddSlide } from "./tools/add-slide.js";
import { registerUpdateSlide } from "./tools/update-slide.js";
import { registerExportPresentation } from "./tools/export-presentation.js";
import { registerListSlides } from "./tools/list-slides.js";
import { registerDeleteSlide } from "./tools/delete-slide.js";
import { registerSetTheme } from "./tools/set-theme.js";
import { registerSetStyle } from "./tools/set-style.js";
import { registerSetSlideTransition } from "./tools/set-slide-transition.js";
import { registerAddDiagram } from "./tools/add-diagram.js";
import { registerVerifyPresentation } from "./tools/verify-presentation.js";

/**
 * Registers all Slidev MCP tools on the given server instance.
 * This is the sole place where tool names are bound to handlers.
 */
export function registerTools(server: McpServer): void {
  registerInitPresentation(server);
  registerAddSlide(server);
  registerUpdateSlide(server);
  registerExportPresentation(server);
  registerListSlides(server);
  registerDeleteSlide(server);
  // New tools
  registerSetTheme(server);
  registerSetStyle(server);
  registerSetSlideTransition(server);
  registerAddDiagram(server);
  registerVerifyPresentation(server);
}
