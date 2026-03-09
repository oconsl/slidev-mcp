import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./server.js";

/**
 * Entry point for the Slidev MCP server.
 *
 * IMPORTANT: All debug/log output goes to process.stderr.
 * process.stdout is reserved exclusively for the MCP SDK's JSON-RPC transport.
 */

async function main() {
  const server = new McpServer({
    name: "slidev-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  // Lazy import transport to avoid issues if SDK internals change
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );

  const transport = new StdioServerTransport();

  process.on("uncaughtException", (err) => {
    process.stderr.write(`[slidev-mcp] Uncaught exception: ${err.message}\n`);
  });

  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`[slidev-mcp] Unhandled rejection: ${String(reason)}\n`);
  });

  await server.connect(transport);
  process.stderr.write("[slidev-mcp] Server started and listening on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[slidev-mcp] Fatal error: ${err.message}\n`);
  process.exit(1);
});
