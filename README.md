# slidev-mcp

`slidev-mcp` is a Model Context Protocol (MCP) server for creating and editing [Slidev](https://sli.dev/) presentations from AI clients.

It exposes tools to initialize presentations, add/update/delete slides, apply themes and styles, add Mermaid diagrams, configure transitions, and export output files.

## Transport and MCP usage

- Transport: **STDIO** (`@modelcontextprotocol/sdk/server/stdio`)
- Intended usage: configure your MCP client to launch the `slidev-mcp` command.
- Output behavior: the server reserves `stdout` for MCP JSON-RPC traffic and writes logs/errors to `stderr`.

---

## Installation

### Option A — Interactive installer (recommended)

Clone the repository and run the installer script. It presents a TUI menu to register the MCP server in one or more agents automatically:

```bash
git clone https://github.com/your-org/slidev-mcp.git
cd slidev-mcp
npm install && npm run build
bash scripts/install.sh
```

The installer will:

1. Detect whether to use the local build (`node dist/index.js`) or fall back to `npx slidev-mcp`.
2. Offer a menu to choose which agents to configure (Opencode, Claude Code, Cursor, Windsurf, Claude Desktop, Zed).
3. Ask for the configuration scope (global or project-level) when applicable.
4. Patch the appropriate JSON config file in-place — preserving all existing settings.

```
╔══════════════════════════════════════════════════╗
║          slidev-mcp  ·  MCP Installer            ║
╚══════════════════════════════════════════════════╝

  Install mode: local (built dist)
  Server path:  /your/path/slidev-mcp/dist/index.js

  Select agents to configure:

    1)  Opencode
    2)  Claude Code  (claude CLI)
    3)  Cursor
    4)  Windsurf
    5)  Claude Desktop
    6)  Zed
    a)  All of the above
    q)  Quit

  Enter choices (e.g. 1 3 or a):
```

---

### Option B — npx (no install)

Use directly via `npx` without cloning the repo. Point your agent to:

```bash
npx -y slidev-mcp
```

---

### Option C — Manual configuration

Add the following entry to your agent's MCP config file.

#### Opencode — `~/.config/opencode/opencode.json` or `./opencode.json`

```json
{
  "mcp": {
    "slidev-mcp": {
      "command": ["npx", "-y", "slidev-mcp"],
      "enabled": true,
      "type": "local"
    }
  }
}
```

#### Claude Code (claude CLI)

```bash
# Global (all projects)
claude mcp add --scope user slidev-mcp -- npx -y slidev-mcp

# Or: local build
claude mcp add --scope user slidev-mcp -- node /path/to/slidev-mcp/dist/index.js
```

#### Cursor — `~/.cursor/mcp.json` or `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "slidev-mcp": {
      "command": "npx",
      "args": ["-y", "slidev-mcp"]
    }
  }
}
```

#### Windsurf — `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "slidev-mcp": {
      "command": "npx",
      "args": ["-y", "slidev-mcp"]
    }
  }
}
```

#### Claude Desktop — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "slidev-mcp": {
      "command": "npx",
      "args": ["-y", "slidev-mcp"]
    }
  }
}
```

Windows path: `%APPDATA%\Claude\claude_desktop_config.json`

#### Zed — `~/.config/zed/settings.json`

```json
{
  "context_servers": {
    "slidev-mcp": {
      "command": {
        "path": "npx",
        "args": ["-y", "slidev-mcp"]
      },
      "settings": {}
    }
  }
}
```

---

## Local development

```bash
npm install
npm run build
node dist/index.js        # production
npm run dev               # TypeScript watch mode
```

---

## Tools summary

The server registers these MCP tools:

| Tool | Description |
|---|---|
| `init_presentation` | Create a new Slidev project, scaffold `slides.md`, install deps |
| `add_slide` | Append or insert a slide at a given index |
| `update_slide` | Replace the content of an existing slide |
| `delete_slide` | Remove a slide (the last slide cannot be deleted) |
| `list_slides` | Inspect slide list, previews, and frontmatter presence |
| `set_theme` | Update Slidev theme and optionally install theme package |
| `set_style` | Apply global CSS, per-slide style blocks, or UnoCSS classes |
| `set_slide_transition` | Configure transitions, `v-click` reveals, and `v-motion` animations |
| `add_diagram` | Insert Mermaid diagrams as slide content |
| `export_presentation` | Export as `pdf`, `png`, or `spa` static build |
| `verify_presentation` | Validate `slides.md` syntax and detect common rendering issues |

If behavior details differ between versions, use `src/tools/*.ts` as the source of truth.

---

## Configuration

This server operates in the process working directory (`process.cwd()`).

- It auto-discovers a Slidev project if `slides.md` exists in the current directory or one immediate subdirectory.
- `init_presentation` can also create and attach a new project directory.
- No environment variables are required. See `.env.example` for the intentionally empty env template.

---

## Security notes

- Keep this MCP server scoped to trusted local workspaces.
- Do not expose the process to untrusted prompts with filesystem access expectations.
- Some tools execute local commands (`npm`, `npx slidev`) in project directories.
- Avoid running with elevated privileges.
- Review `SECURITY.md` for reporting and operational guidance.

---

## Contributing

Contributions are welcome. Please read `CONTRIBUTING.md` for setup, validation commands, and pull request expectations.

## License

MIT. See `LICENSE`.
