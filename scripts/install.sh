#!/usr/bin/env bash
# =============================================================================
#  slidev-mcp — Interactive MCP installer
#  Registers slidev-mcp in the config of common AI agents
# =============================================================================
set -euo pipefail

# ── Colors & Symbols ──────────────────────────────────────────────────────────
if [ -t 1 ] && command -v tput &>/dev/null && tput colors &>/dev/null 2>&1; then
  BOLD=$(tput bold);  RESET=$(tput sgr0)
  RED=$(tput setaf 1); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
  BLUE=$(tput setaf 4); CYAN=$(tput setaf 6); DIM=$(tput dim)
else
  BOLD=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; DIM=""
fi
OK="${GREEN}✔${RESET}"; WARN="${YELLOW}⚠${RESET}"; ERR="${RED}✖${RESET}"; INFO="${CYAN}ℹ${RESET}"

# ── Helpers ───────────────────────────────────────────────────────────────────
print_header() {
  echo ""
  echo "${BOLD}${BLUE}╔══════════════════════════════════════════════════╗${RESET}"
  echo "${BOLD}${BLUE}║          slidev-mcp  ·  MCP Installer            ║${RESET}"
  echo "${BOLD}${BLUE}╚══════════════════════════════════════════════════╝${RESET}"
  echo ""
}

print_step() { echo "  ${BOLD}${CYAN}▶${RESET} $1"; }
print_ok()   { echo "  ${OK}  $1"; }
print_warn() { echo "  ${WARN}  ${YELLOW}$1${RESET}"; }
print_err()  { echo "  ${ERR}  ${RED}$1${RESET}"; }
print_info() { echo "  ${INFO}  ${DIM}$1${RESET}"; }

confirm() {
  local prompt="${1:-Continue?}"
  printf "  ${BOLD}%s${RESET} [Y/n] " "$prompt"
  read -r reply
  [[ "${reply:-y}" =~ ^[Yy]$ ]]
}

require_cmd() {
  command -v "$1" &>/dev/null || { print_err "Required command not found: $1"; return 1; }
}

# ── Detect install mode ────────────────────────────────────────────────────────
# Prefer the built dist if we are inside the cloned repo, otherwise use npx.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$REPO_ROOT/dist/index.js" ]]; then
  MCP_COMMAND="node"
  MCP_ARGS="[\"node\", \"$REPO_ROOT/dist/index.js\"]"
  MCP_ARGS_LIST=("node" "$REPO_ROOT/dist/index.js")
  MCP_MODE="local (built dist)"
else
  MCP_COMMAND="npx"
  MCP_ARGS="[\"npx\", \"-y\", \"slidev-mcp\"]"
  MCP_ARGS_LIST=("npx" "-y" "slidev-mcp")
  MCP_MODE="npx (package registry)"
fi

# ── JSON helpers (pure bash, no jq required) ──────────────────────────────────
# Minimal JSON manipulation using Python (available on all relevant platforms)
_python() { python3 "$@" 2>/dev/null || python "$@" 2>/dev/null; }

json_set_mcp_opencode() {
  # Sets .mcp["slidev-mcp"] = { command: [...], enabled: true, type: "local" }
  local file="$1"
  local args_json="$2"
  _python - "$file" "$args_json" <<'PYEOF'
import sys, json, os

file = sys.argv[1]
args_json = sys.argv[2]

try:
    with open(file) as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}

data.setdefault("mcp", {})
data["mcp"]["slidev-mcp"] = {
    "command": json.loads(args_json),
    "enabled": True,
    "type": "local"
}

with open(file, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("ok")
PYEOF
}

json_set_mcp_generic() {
  # Sets .mcpServers["slidev-mcp"] = { command, args: [...] }
  local file="$1"
  local command="$2"
  local args_json="$3"   # JSON array of additional args
  _python - "$file" "$command" "$args_json" <<'PYEOF'
import sys, json, os

file = sys.argv[1]
command = sys.argv[2]
args = json.loads(sys.argv[3])

try:
    with open(file) as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}

data.setdefault("mcpServers", {})
data["mcpServers"]["slidev-mcp"] = {
    "command": command,
    "args": args
}

with open(file, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("ok")
PYEOF
}

# Extract command/args for mcpServers format from MCP_ARGS_LIST
# MCP_ARGS_LIST = ("npx" "-y" "slidev-mcp") → command="npx", args=["-y","slidev-mcp"]
#                 ("node" "/path/dist/index.js") → command="node", args=["/path/..."]
GENERIC_COMMAND="${MCP_ARGS_LIST[0]}"
GENERIC_ARGS_JSON=$(printf '%s\n' "${MCP_ARGS_LIST[@]:1}" | _python - <<'PYEOF'
import sys, json
lines = [l.rstrip('\n') for l in sys.stdin.readlines()]
print(json.dumps(lines))
PYEOF
)

# ── Agent installers ───────────────────────────────────────────────────────────

install_opencode() {
  print_step "Installing for ${BOLD}Opencode${RESET}"

  # Resolve config file: project-local opencode.json takes precedence,
  # then ~/.config/opencode/opencode.json (global)
  local targets=()
  local scope_choice

  echo ""
  echo "    Select configuration scope for Opencode:"
  echo "    ${BOLD}1)${RESET} Global  — ~/.config/opencode/opencode.json"
  echo "    ${BOLD}2)${RESET} Project — ./opencode.json (current directory)"
  echo "    ${BOLD}3)${RESET} Both"
  printf "    Choice [1]: "
  read -r scope_choice
  scope_choice="${scope_choice:-1}"

  case "$scope_choice" in
    1) targets=("$HOME/.config/opencode/opencode.json") ;;
    2) targets=("$(pwd)/opencode.json") ;;
    3) targets=("$HOME/.config/opencode/opencode.json" "$(pwd)/opencode.json") ;;
    *) print_warn "Invalid choice, defaulting to global."; targets=("$HOME/.config/opencode/opencode.json") ;;
  esac

  for cfg in "${targets[@]}"; do
    mkdir -p "$(dirname "$cfg")"
    local result
    result=$(json_set_mcp_opencode "$cfg" "$MCP_ARGS" 2>&1) || true
    if [[ "$result" == "ok" ]]; then
      print_ok "Registered in ${BOLD}$cfg${RESET}"
    else
      print_err "Failed to write $cfg: $result"
    fi
  done
}

install_claude_code() {
  print_step "Installing for ${BOLD}Claude Code${RESET} (claude CLI)"

  if ! command -v claude &>/dev/null; then
    print_warn "claude CLI not found in PATH. Skipping automatic registration."
    print_info "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code"
    print_info "Then run manually:"
    if [[ "${MCP_ARGS_LIST[0]}" == "npx" ]]; then
      print_info "  claude mcp add slidev-mcp -- npx -y slidev-mcp"
    else
      print_info "  claude mcp add slidev-mcp -- node $REPO_ROOT/dist/index.js"
    fi
    return
  fi

  echo ""
  echo "    Select configuration scope for Claude Code:"
  echo "    ${BOLD}1)${RESET} User   (global, all projects)"
  echo "    ${BOLD}2)${RESET} Local  (current machine, all projects)"
  echo "    ${BOLD}3)${RESET} Project (.mcp.json in current directory)"
  printf "    Choice [1]: "
  read -r scope_choice
  scope_choice="${scope_choice:-1}"

  local scope_flag
  case "$scope_choice" in
    1) scope_flag="--scope user" ;;
    2) scope_flag="--scope local" ;;
    3) scope_flag="--scope project" ;;
    *) print_warn "Invalid, defaulting to user."; scope_flag="--scope user" ;;
  esac

  # Build the command array for claude mcp add
  local cmd_args=()
  if [[ "${MCP_ARGS_LIST[0]}" == "npx" ]]; then
    cmd_args=("npx" "-y" "slidev-mcp")
  else
    cmd_args=("node" "$REPO_ROOT/dist/index.js")
  fi

  # Remove existing entry silently to avoid duplicate errors
  claude mcp remove slidev-mcp $scope_flag 2>/dev/null || true

  if claude mcp add $scope_flag slidev-mcp -- "${cmd_args[@]}" 2>&1; then
    print_ok "Registered via claude CLI ($scope_flag)"
  else
    print_err "claude mcp add failed. Try manually:"
    print_info "  claude mcp add $scope_flag slidev-mcp -- ${cmd_args[*]}"
  fi
}

install_cursor() {
  print_step "Installing for ${BOLD}Cursor${RESET}"

  # Cursor uses ~/.cursor/mcp.json (global) or .cursor/mcp.json (project)
  echo ""
  echo "    Select configuration scope for Cursor:"
  echo "    ${BOLD}1)${RESET} Global  — ~/.cursor/mcp.json"
  echo "    ${BOLD}2)${RESET} Project — .cursor/mcp.json (current directory)"
  printf "    Choice [1]: "
  read -r scope_choice
  scope_choice="${scope_choice:-1}"

  local cfg
  case "$scope_choice" in
    1) cfg="$HOME/.cursor/mcp.json" ;;
    2) cfg="$(pwd)/.cursor/mcp.json" ;;
    *) print_warn "Invalid, defaulting to global."; cfg="$HOME/.cursor/mcp.json" ;;
  esac

  mkdir -p "$(dirname "$cfg")"
  local result
  result=$(json_set_mcp_generic "$cfg" "$GENERIC_COMMAND" "$GENERIC_ARGS_JSON" 2>&1) || true
  if [[ "$result" == "ok" ]]; then
    print_ok "Registered in ${BOLD}$cfg${RESET}"
    print_info "Restart Cursor to load the new MCP server."
  else
    print_err "Failed to write $cfg: $result"
  fi
}

install_windsurf() {
  print_step "Installing for ${BOLD}Windsurf${RESET}"

  # Windsurf uses ~/.codeium/windsurf/mcp_config.json (global)
  local cfg="$HOME/.codeium/windsurf/mcp_config.json"

  mkdir -p "$(dirname "$cfg")"
  local result
  result=$(json_set_mcp_generic "$cfg" "$GENERIC_COMMAND" "$GENERIC_ARGS_JSON" 2>&1) || true
  if [[ "$result" == "ok" ]]; then
    print_ok "Registered in ${BOLD}$cfg${RESET}"
    print_info "Restart Windsurf and reload MCP servers from Settings → MCP."
  else
    print_err "Failed to write $cfg: $result"
  fi
}

install_claude_desktop() {
  print_step "Installing for ${BOLD}Claude Desktop${RESET}"

  local cfg
  case "$OSTYPE" in
    darwin*) cfg="$HOME/Library/Application Support/Claude/claude_desktop_config.json" ;;
    msys*|cygwin*|win32*) cfg="$APPDATA/Claude/claude_desktop_config.json" ;;
    *) cfg="$HOME/.config/Claude/claude_desktop_config.json" ;;
  esac

  mkdir -p "$(dirname "$cfg")"
  local result
  result=$(json_set_mcp_generic "$cfg" "$GENERIC_COMMAND" "$GENERIC_ARGS_JSON" 2>&1) || true
  if [[ "$result" == "ok" ]]; then
    print_ok "Registered in ${BOLD}$cfg${RESET}"
    print_info "Restart Claude Desktop to load the new MCP server."
  else
    print_err "Failed to write $cfg: $result"
  fi
}

install_zed() {
  print_step "Installing for ${BOLD}Zed${RESET}"

  # Zed uses settings.json with "context_servers" key
  local cfg="$HOME/.config/zed/settings.json"

  if ! _python - "$cfg" "$GENERIC_COMMAND" "$GENERIC_ARGS_JSON" <<'PYEOF'
import sys, json, os

file = sys.argv[1]
command = sys.argv[2]
args = json.loads(sys.argv[3])

try:
    with open(file) as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}

data.setdefault("context_servers", {})
data["context_servers"]["slidev-mcp"] = {
    "command": {
        "path": command,
        "args": args
    },
    "settings": {}
}

os.makedirs(os.path.dirname(file), exist_ok=True)
with open(file, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print("ok")
PYEOF
  then
    print_err "Failed to write Zed config."
    return
  fi
  print_ok "Registered in ${BOLD}$cfg${RESET}"
  print_info "Reload Zed settings (cmd+shift+p → 'zed: reload configuration')."
}

# ── Agent menu ─────────────────────────────────────────────────────────────────
show_menu() {
  echo ""
  echo "  ${BOLD}Select agents to configure:${RESET}"
  echo ""
  echo "    ${BOLD}1)${RESET}  Opencode"
  echo "    ${BOLD}2)${RESET}  Claude Code  (claude CLI)"
  echo "    ${BOLD}3)${RESET}  Cursor"
  echo "    ${BOLD}4)${RESET}  Windsurf"
  echo "    ${BOLD}5)${RESET}  Claude Desktop"
  echo "    ${BOLD}6)${RESET}  Zed"
  echo "    ${BOLD}a)${RESET}  All of the above"
  echo "    ${BOLD}q)${RESET}  Quit"
  echo ""
  printf "  Enter choices (e.g. ${BOLD}1 3${RESET} or ${BOLD}a${RESET}): "
}

run_selection() {
  local choices=("$@")
  local all=false
  for c in "${choices[@]}"; do [[ "$c" == "a" ]] && all=true; done

  echo ""
  if $all || [[ " ${choices[*]} " == *" 1 "* ]]; then install_opencode;       echo ""; fi
  if $all || [[ " ${choices[*]} " == *" 2 "* ]]; then install_claude_code;    echo ""; fi
  if $all || [[ " ${choices[*]} " == *" 3 "* ]]; then install_cursor;         echo ""; fi
  if $all || [[ " ${choices[*]} " == *" 4 "* ]]; then install_windsurf;       echo ""; fi
  if $all || [[ " ${choices[*]} " == *" 5 "* ]]; then install_claude_desktop; echo ""; fi
  if $all || [[ " ${choices[*]} " == *" 6 "* ]]; then install_zed;            echo ""; fi
}

# ── Build check ───────────────────────────────────────────────────────────────
check_build() {
  if [[ -f "$REPO_ROOT/dist/index.js" ]]; then
    return 0
  fi
  print_warn "dist/index.js not found — the project has not been built yet."
  if confirm "Build now? (npm run build)"; then
    print_step "Building..."
    ( cd "$REPO_ROOT" && npm run build ) && print_ok "Build successful." || {
      print_err "Build failed. Falling back to npx."
    }
    # Re-detect after build attempt
    if [[ -f "$REPO_ROOT/dist/index.js" ]]; then
      MCP_COMMAND="node"
      MCP_ARGS="[\"node\", \"$REPO_ROOT/dist/index.js\"]"
      MCP_ARGS_LIST=("node" "$REPO_ROOT/dist/index.js")
      MCP_MODE="local (built dist)"
      GENERIC_COMMAND="node"
      GENERIC_ARGS_JSON="[\"$REPO_ROOT/dist/index.js\"]"
    fi
  fi
}

# ── Dependency check ──────────────────────────────────────────────────────────
check_deps() {
  if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
    print_err "Python 3 is required for JSON manipulation but was not found."
    print_info "Install Python 3: https://www.python.org/downloads/"
    exit 1
  fi
  if ! command -v node &>/dev/null; then
    print_warn "Node.js not found in PATH. Slidev and slidev-mcp require Node ≥ 18."
    print_info "Install Node: https://nodejs.org"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  print_header

  echo "  ${BOLD}Install mode:${RESET} $MCP_MODE"
  if [[ "$MCP_MODE" == local* ]]; then
    echo "  ${BOLD}Server path:${RESET}  $REPO_ROOT/dist/index.js"
  fi
  echo ""

  check_deps
  check_build

  echo ""
  echo "  ${DIM}The installer will add the following MCP entry to each selected agent:${RESET}"
  echo "  ${DIM}  command: ${MCP_ARGS}${RESET}"

  show_menu
  read -r -a CHOICES

  if [[ "${CHOICES[0]:-}" == "q" ]]; then
    echo ""; echo "  Aborted."; exit 0
  fi

  run_selection "${CHOICES[@]}"

  echo ""
  echo "  ${BOLD}${GREEN}Done!${RESET} slidev-mcp has been configured."
  echo ""
  echo "  ${DIM}Restart your agent / reload its MCP configuration to activate the tools.${RESET}"
  echo ""
}

main "$@"
