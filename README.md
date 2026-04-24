# slidev-mcp

**Create, edit, validate, and export Slidev presentations from your AI agent.**

`slidev-mcp` is a local [Model Context Protocol](https://modelcontextprotocol.io/) server for [Slidev](https://sli.dev/). It gives supported AI clients a focused toolkit for building real presentation projects: initialize decks, add and update slides, apply themes and styles, insert Mermaid diagrams, verify the deck, and export final assets.

## Why It Exists

Slide decks are usually iterative: draft, restructure, style, verify, export, repeat. `slidev-mcp` turns that workflow into MCP tools your agent can call directly inside a trusted local workspace.

## Highlights

- **Built for Slidev**: works with `slides.md`, themes, transitions, Mermaid diagrams, and Slidev exports.
- **Local-first**: runs over STDIO and operates in the current workspace.
- **Agent-ready**: installer support for OpenCode, Claude Code, Antigravity, and Codex.
- **Safe output behavior**: keeps `stdout` reserved for MCP JSON-RPC and sends logs/errors to `stderr`.
- **No required environment variables**: install, configure, and start using it.

## Requirements

- Node.js `>=18`
- npm
- Python 3, used by the installer to patch JSON/TOML config files

## Quick Start

Clone, install, build, and run the interactive installer:

```bash
git clone <repo-url> slidev-mcp
cd slidev-mcp
npm install
npm run build
bash scripts/install.sh
```

The installer detects whether it can use the local build:

```bash
node /path/to/slidev-mcp/dist/index.js
```

If `dist/index.js` is missing, it falls back to:

```bash
npx -y slidev-mcp
```

## Interactive Installer

Run:

```bash
bash scripts/install.sh
```

The installer can configure:

- OpenCode
- Claude Code
- Antigravity
- Codex

It also includes an **Update** option. The menu shows whether the local package appears up to date, has an update available, or could not determine the status.

```text
slidev-mcp interactive installer
Configure MCP once, then get back to making slides.

Runtime
  mode:    local build
  command: node /path/to/slidev-mcp/dist/index.js
  version: update available v0.1.0 -> v0.3.2

Choose what to configure

  1) OpenCode
  2) Claude Code
  3) Antigravity
  4) Codex
  a) All four
  u) Update slidev-mcp [update available v0.1.0 -> v0.3.2]
  q) Quit
```

When updating from a git checkout, the installer runs:

```bash
git pull --ff-only
npm install
npm run build
```

If the working tree has uncommitted changes, it asks before pulling.

## Manual Configuration

Use manual configuration when you prefer to edit client config files yourself or cannot run the installer.

### OpenCode

Config paths:

- Global: `~/.config/opencode/opencode.json`
- Project: `./opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "slidev-mcp": {
      "type": "local",
      "command": ["npx", "-y", "slidev-mcp"],
      "enabled": true
    }
  }
}
```

### Claude Code

Use the Claude CLI:

```bash
claude mcp add --scope user slidev-mcp -- npx -y slidev-mcp
```

For a local build:

```bash
claude mcp add --scope user slidev-mcp -- node /path/to/slidev-mcp/dist/index.js
```

Supported scopes are `user`, `local`, and `project`.

### Antigravity

Config path:

```text
~/.gemini/antigravity/mcp_config.json
```

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

### Codex

Config paths:

- Global: `~/.codex/config.toml`
- Project: `.codex/config.toml`

```toml
[mcp_servers.slidev-mcp]
command = "npx"
args = ["-y", "slidev-mcp"]
type = "stdio"
```

For a local build:

```toml
[mcp_servers.slidev-mcp]
command = "node"
args = ["/path/to/slidev-mcp/dist/index.js"]
type = "stdio"
```

## MCP Tools

| Tool | What it does |
|---|---|
| `init_presentation` | Create a Slidev project, scaffold `slides.md`, and install dependencies |
| `add_slide` | Append or insert a slide |
| `update_slide` | Replace the content of an existing slide |
| `delete_slide` | Delete a slide, while protecting the last slide |
| `list_slides` | Inspect slide order, previews, and frontmatter |
| `set_theme` | Change the Slidev theme and optionally install the theme package |
| `set_style` | Apply global CSS, per-slide style blocks, or UnoCSS classes |
| `set_slide_transition` | Configure transitions, `v-click` reveals, and `v-motion` animations |
| `add_diagram` | Insert Mermaid diagrams |
| `export_presentation` | Export to PDF, PNG, or a static SPA build |
| `verify_presentation` | Validate `slides.md` and flag common rendering issues |

If behavior differs between documentation and code, treat `src/tools/*.ts` as the source of truth.

## Runtime Behavior

- Transport: STDIO via `@modelcontextprotocol/sdk/server/stdio`
- Working directory: `process.cwd()`
- Project discovery: finds `slides.md` in the current directory or one immediate child directory
- Logging: writes logs and errors to `stderr`
- MCP protocol output: writes JSON-RPC traffic to `stdout`

## Local Development

```bash
npm install
npm run build
npm run typecheck
node dist/index.js
```

For development without building:

```bash
npm run dev
```

## Security

Run this server only in trusted local workspaces. Some tools execute local commands such as `npm` and `npx slidev` inside the active project directory. Avoid elevated privileges, review generated files before publishing, and see [SECURITY.md](SECURITY.md) for reporting and operational guidance.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, validation, and pull request guidance.

## License

MIT. See [LICENSE](LICENSE).
