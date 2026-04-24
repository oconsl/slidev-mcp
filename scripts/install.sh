#!/usr/bin/env bash
# =============================================================================
#  slidev-mcp - Interactive MCP installer
#  Registers slidev-mcp in OpenCode, Claude Code, Antigravity, and Codex.
# =============================================================================
set -euo pipefail

SERVER_NAME="slidev-mcp"
NPM_PACKAGE="slidev-mcp"

# --- Chalk-like colors --------------------------------------------------------
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  RESET=$'\033[0m'
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  ITALIC=$'\033[3m'
  RED=$'\033[38;2;255;85;85m'
  GREEN=$'\033[38;2;80;250;123m'
  YELLOW=$'\033[38;2;241;250;140m'
  BLUE=$'\033[38;2;98;114;164m'
  MAGENTA=$'\033[38;2;255;121;198m'
  CYAN=$'\033[38;2;139;233;253m'
  ORANGE=$'\033[38;2;255;184;108m'
else
  RESET=""; BOLD=""; DIM=""; ITALIC=""
  RED=""; GREEN=""; YELLOW=""; BLUE=""; MAGENTA=""; CYAN=""; ORANGE=""
fi

OK="${GREEN}ok${RESET}"
WARN="${YELLOW}warn${RESET}"
ERR="${RED}err${RESET}"
INFO="${CYAN}info${RESET}"

print_header() {
  echo ""
  echo "  ${BOLD}${MAGENTA}slidev-mcp${RESET} ${DIM}interactive installer${RESET}"
  echo "  ${DIM}Configure MCP once, then get back to making slides.${RESET}"
  echo ""
}

print_step() { echo "  ${BOLD}${CYAN}>${RESET} $1"; }
print_ok() { echo "  ${OK}  $1"; }
print_warn() { echo "  ${WARN}  ${YELLOW}$1${RESET}"; }
print_err() { echo "  ${ERR}  ${RED}$1${RESET}"; }
print_info() { echo "  ${INFO}  ${DIM}$1${RESET}"; }

confirm() {
  local prompt="${1:-Continue?}"
  local reply
  printf "  ${BOLD}%s${RESET} ${DIM}[Y/n]${RESET} " "$prompt"
  read -r reply
  [[ "${reply:-y}" =~ ^[Yy]$ ]]
}

pause() {
  echo ""
  printf "  ${DIM}Press Enter to continue...${RESET} "
  read -r _
}

require_python() {
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    print_err "Python is required to update JSON/TOML config files."
    print_info "Install Python 3, then run this installer again."
    exit 1
  fi
}

run_python() {
  "$PYTHON_BIN" "$@"
}

json_array() {
  run_python - "$@" <<'PY'
import json
import sys
print(json.dumps(sys.argv[1:]))
PY
}

shell_join() {
  printf '%q ' "$@"
}

# --- Paths and runtime mode ---------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

detect_runtime() {
  if [[ -f "$REPO_ROOT/dist/index.js" ]]; then
    MCP_MODE="local build"
    MCP_COMMAND="node"
    MCP_ARGS=("$REPO_ROOT/dist/index.js")
    OPENCODE_COMMAND=("node" "$REPO_ROOT/dist/index.js")
  else
    MCP_MODE="npm package"
    MCP_COMMAND="npx"
    MCP_ARGS=("-y" "$NPM_PACKAGE")
    OPENCODE_COMMAND=("npx" "-y" "$NPM_PACKAGE")
  fi

  MCP_ARGS_JSON="$(json_array "${MCP_ARGS[@]}")"
  OPENCODE_COMMAND_JSON="$(json_array "${OPENCODE_COMMAND[@]}")"
}

read_package_version() {
  run_python - "$REPO_ROOT/package.json" <<'PY' 2>/dev/null || true
import json
import sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        print(json.load(f).get("version", "unknown"))
except Exception:
    print("unknown")
PY
}

latest_npm_version() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "unknown"
    return
  fi
  npm view "$NPM_PACKAGE" version --silent </dev/null 2>/dev/null || echo "unknown"
}

version_status_label() {
  LOCAL_VERSION="$(read_package_version)"
  LATEST_VERSION="$(latest_npm_version)"

  if [[ "$LOCAL_VERSION" == "unknown" || "$LATEST_VERSION" == "unknown" ]]; then
    UPDATE_STATUS="${YELLOW}status unknown${RESET}"
  elif [[ "$LOCAL_VERSION" == "$LATEST_VERSION" ]]; then
    UPDATE_STATUS="${GREEN}up to date v$LOCAL_VERSION${RESET}"
  else
    UPDATE_STATUS="${ORANGE}update available v$LOCAL_VERSION -> v$LATEST_VERSION${RESET}"
  fi
}

check_deps() {
  require_python

  if ! command -v node >/dev/null 2>&1; then
    print_warn "Node.js was not found in PATH. slidev-mcp requires Node >= 18."
  fi

  if ! command -v npm >/dev/null 2>&1; then
    print_warn "npm was not found in PATH. Updates and npx mode may not work."
  fi
}

check_build() {
  if [[ -f "$REPO_ROOT/dist/index.js" ]]; then
    return
  fi

  print_warn "dist/index.js was not found, so the installer will use npx."
  if command -v npm >/dev/null 2>&1 && confirm "Build local dist now?"; then
    print_step "Running npm run build"
    if (cd "$REPO_ROOT" && npm run build); then
      print_ok "Build complete."
      detect_runtime
    else
      print_warn "Build failed. Continuing with npx mode."
    fi
  fi
}

# --- Config writers -----------------------------------------------------------
write_opencode_config() {
  local file="$1"
  run_python - "$file" "$OPENCODE_COMMAND_JSON" <<'PY'
import json
import os
import sys

path = sys.argv[1]
command = json.loads(sys.argv[2])

try:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}

data.setdefault("$schema", "https://opencode.ai/config.json")
data.setdefault("mcp", {})
data["mcp"]["slidev-mcp"] = {
    "type": "local",
    "command": command,
    "enabled": True,
}

os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

write_mcpservers_config() {
  local file="$1"
  run_python - "$file" "$MCP_COMMAND" "$MCP_ARGS_JSON" <<'PY'
import json
import os
import sys

path = sys.argv[1]
command = sys.argv[2]
args = json.loads(sys.argv[3])

try:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}

data.setdefault("mcpServers", {})
data["mcpServers"]["slidev-mcp"] = {
    "command": command,
    "args": args,
}

os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

write_codex_config() {
  local file="$1"
  run_python - "$file" "$MCP_COMMAND" "$MCP_ARGS_JSON" <<'PY'
import json
import os
import re
import sys

path = sys.argv[1]
command = sys.argv[2]
args = json.loads(sys.argv[3])
table = "mcp_servers.slidev-mcp"
header = f"[{table}]"
block = "\n".join([
    header,
    'command = ' + json.dumps(command),
    'args = ' + json.dumps(args),
    'type = "stdio"',
    "",
])

try:
    with open(path, encoding="utf-8") as f:
        original = f.read()
except FileNotFoundError:
    original = ""

pattern = re.compile(
    r"(?ms)^\[mcp_servers\.slidev-mcp\]\s*.*?(?=^\[[^\]]+\]\s*$|\Z)"
)

if pattern.search(original):
    updated = pattern.sub(block, original).rstrip() + "\n"
else:
    sep = "\n\n" if original.strip() else ""
    updated = original.rstrip() + sep + block

os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
    f.write(updated)
PY
}

# --- Installers ---------------------------------------------------------------
choose_scope() {
  local title="$1"
  local global_path="$2"
  local project_path="$3"
  local choice

  echo ""
  echo "    ${BOLD}$title scope${RESET}"
  echo "    ${BOLD}1)${RESET} Global   ${DIM}$global_path${RESET}"
  echo "    ${BOLD}2)${RESET} Project  ${DIM}$project_path${RESET}"
  echo "    ${BOLD}3)${RESET} Both"
  printf "    Choice ${DIM}[1]${RESET}: "
  read -r choice
  choice="${choice:-1}"

  case "$choice" in
    1) SELECTED_TARGETS=("$global_path") ;;
    2) SELECTED_TARGETS=("$project_path") ;;
    3) SELECTED_TARGETS=("$global_path" "$project_path") ;;
    *) print_warn "Invalid choice. Using global scope."; SELECTED_TARGETS=("$global_path") ;;
  esac
}

install_opencode() {
  print_step "Configuring ${BOLD}OpenCode${RESET}"
  choose_scope "OpenCode" "$HOME/.config/opencode/opencode.json" "$(pwd)/opencode.json"

  for cfg in "${SELECTED_TARGETS[@]}"; do
    if write_opencode_config "$cfg"; then
      print_ok "Registered in ${BOLD}$cfg${RESET}"
    else
      print_err "Could not write $cfg"
    fi
  done
}

install_claude_code() {
  print_step "Configuring ${BOLD}Claude Code${RESET}"

  if ! command -v claude >/dev/null 2>&1; then
    print_warn "claude CLI was not found in PATH."
    print_info "Manual command:"
    print_info "claude mcp add --scope user $SERVER_NAME -- $(shell_join "$MCP_COMMAND" "${MCP_ARGS[@]}")"
    return
  fi

  local choice scope_flag
  echo ""
  echo "    ${BOLD}Claude Code scope${RESET}"
  echo "    ${BOLD}1)${RESET} User     ${DIM}global, all projects${RESET}"
  echo "    ${BOLD}2)${RESET} Local    ${DIM}this machine${RESET}"
  echo "    ${BOLD}3)${RESET} Project  ${DIM}.mcp.json in current directory${RESET}"
  printf "    Choice ${DIM}[1]${RESET}: "
  read -r choice
  choice="${choice:-1}"

  case "$choice" in
    1) scope_flag="--scope user" ;;
    2) scope_flag="--scope local" ;;
    3) scope_flag="--scope project" ;;
    *) print_warn "Invalid choice. Using user scope."; scope_flag="--scope user" ;;
  esac

  claude mcp remove "$SERVER_NAME" $scope_flag >/dev/null 2>&1 || true

  if claude mcp add $scope_flag "$SERVER_NAME" -- "$MCP_COMMAND" "${MCP_ARGS[@]}"; then
    print_ok "Registered via claude CLI (${scope_flag})."
  else
    print_err "claude mcp add failed."
    print_info "Manual command:"
    print_info "claude mcp add $scope_flag $SERVER_NAME -- $(shell_join "$MCP_COMMAND" "${MCP_ARGS[@]}")"
  fi
}

antigravity_config_path() {
  echo "$HOME/.gemini/antigravity/mcp_config.json"
}

install_antigravity() {
  print_step "Configuring ${BOLD}Antigravity${RESET}"
  local cfg
  cfg="$(antigravity_config_path)"

  if write_mcpservers_config "$cfg"; then
    print_ok "Registered in ${BOLD}$cfg${RESET}"
    print_info "In Antigravity, refresh MCP servers if the tool list does not update."
  else
    print_err "Could not write $cfg"
  fi
}

install_codex() {
  print_step "Configuring ${BOLD}Codex${RESET}"
  choose_scope "Codex" "${CODEX_HOME:-$HOME/.codex}/config.toml" "$(pwd)/.codex/config.toml"

  for cfg in "${SELECTED_TARGETS[@]}"; do
    if write_codex_config "$cfg"; then
      print_ok "Registered in ${BOLD}$cfg${RESET}"
    else
      print_err "Could not write $cfg"
    fi
  done
}

# --- Update ------------------------------------------------------------------
update_project() {
  print_step "Updating ${BOLD}slidev-mcp${RESET}"

  if ! command -v git >/dev/null 2>&1; then
    print_err "git was not found in PATH."
    return
  fi

  if ! git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    print_warn "This installer is not running inside a git checkout."
    print_info "Use npm/npx mode, or update the source manually."
    return
  fi

  if ! command -v npm >/dev/null 2>&1; then
    print_err "npm is required to install dependencies and rebuild."
    return
  fi

  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]]; then
    print_warn "The repository has uncommitted changes."
    if ! confirm "Continue with git pull --ff-only anyway?"; then
      print_info "Update cancelled."
      return
    fi
  fi

  print_step "Pulling latest source"
  git -C "$REPO_ROOT" pull --ff-only

  print_step "Installing dependencies"
  (cd "$REPO_ROOT" && npm install)

  print_step "Building dist"
  (cd "$REPO_ROOT" && npm run build)

  detect_runtime
  version_status_label
  print_ok "Update complete. Current status: $UPDATE_STATUS"
}

# --- Menu ---------------------------------------------------------------------
show_status_card() {
  echo "  ${BOLD}Runtime${RESET}"
  echo "    mode:    ${CYAN}$MCP_MODE${RESET}"
  echo "    command: ${DIM}$(shell_join "$MCP_COMMAND" "${MCP_ARGS[@]}")${RESET}"
  echo "    version: $UPDATE_STATUS"
  echo ""
}

show_menu() {
  echo "  ${BOLD}Choose what to configure${RESET}"
  echo ""
  echo "    ${BOLD}${CYAN}1)${RESET} OpenCode"
  echo "    ${BOLD}${CYAN}2)${RESET} Claude Code"
  echo "    ${BOLD}${CYAN}3)${RESET} Antigravity"
  echo "    ${BOLD}${CYAN}4)${RESET} Codex"
  echo "    ${BOLD}${MAGENTA}a)${RESET} All four"
  echo "    ${BOLD}${ORANGE}u)${RESET} Update slidev-mcp ${DIM}[$UPDATE_STATUS${DIM}]${RESET}"
  echo "    ${BOLD}q)${RESET} Quit"
  echo ""
  printf "  Selection ${DIM}[1 2 3 4, a, u, q]${RESET}: "
}

run_selection() {
  local choices=("$@")
  local all=false
  local ran=false

  for choice in "${choices[@]}"; do
    [[ "$choice" == "a" ]] && all=true
  done

  echo ""
  if $all || [[ " ${choices[*]} " == *" 1 "* ]]; then install_opencode; echo ""; ran=true; fi
  if $all || [[ " ${choices[*]} " == *" 2 "* ]]; then install_claude_code; echo ""; ran=true; fi
  if $all || [[ " ${choices[*]} " == *" 3 "* ]]; then install_antigravity; echo ""; ran=true; fi
  if $all || [[ " ${choices[*]} " == *" 4 "* ]]; then install_codex; echo ""; ran=true; fi
  if [[ " ${choices[*]} " == *" u "* ]]; then update_project; echo ""; ran=true; fi

  if [[ "$ran" == false ]]; then
    print_warn "No valid option selected."
  fi
}

main() {
  check_deps
  detect_runtime
  check_build
  version_status_label

  print_header
  show_status_card
  show_menu

  local choices=()
  if ! read -r -a choices; then
    choices=("q")
  fi

  if [[ "${choices[0]:-}" == "q" ]]; then
    echo ""
    print_info "Cancelled."
    exit 0
  fi

  run_selection "${choices[@]}"

  echo "  ${BOLD}${GREEN}Done.${RESET} ${DIM}Restart or refresh your agent to load the MCP server.${RESET}"
  echo ""
}

main "$@"
