#!/usr/bin/env bash

set -euo pipefail

# ============================================================================
# Helper functions
# ============================================================================

write_step() {
    printf "\n\033[36m==> %s\033[0m\n" "$1"
}

write_success() {
    printf "    \033[32m%s\033[0m\n" "$1"
}

write_warning() {
    printf "    \033[33m%s\033[0m\n" "$1"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

pause_for_enter() {
    printf "\nPress ENTER to continue"
    read -r _
}

# ============================================================================
# Paths
# ============================================================================

INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$INSTALLER_DIR/.." && pwd)"
LAUNCHER_DIR="$PROJECT_ROOT/launcher"
TASKS_DIR="$PROJECT_ROOT/tasks"
VSIX_PATH="$INSTALLER_DIR/notebook-edit-tracker-0.0.1.vsix"
STATE_FILE="$INSTALLER_DIR/.mac-setup-state"

# ============================================================================
# Homebrew / shell helpers
# ============================================================================

refresh_brew_path() {
    if [[ -x /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
}

resolve_code_cli() {
    if command_exists code; then
        CODE_CLI="$(command -v code)"
        return 0
    fi

    local candidates=(
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
        "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    )

    local candidate
    for candidate in "${candidates[@]}"; do
        if [[ -x "$candidate" ]]; then
            CODE_CLI="$candidate"
            return 0
        fi
    done

    return 1
}

shell_rc_file() {
    case "${SHELL:-/bin/zsh}" in
        */zsh)
            printf "%s/.zshrc" "$HOME"
            ;;
        */bash)
            if [[ -f "$HOME/.bash_profile" ]]; then
                printf "%s/.bash_profile" "$HOME"
            else
                printf "%s/.bashrc" "$HOME"
            fi
            ;;
        *)
            printf "%s/.zshrc" "$HOME"
            ;;
    esac
}

save_state() {
    cat > "$STATE_FILE" <<EOF
SETUP_INSTALLED_HOMEBREW=${SETUP_INSTALLED_HOMEBREW:-0}
SETUP_INSTALLED_GIT=${SETUP_INSTALLED_GIT:-0}
SETUP_INSTALLED_NODE=${SETUP_INSTALLED_NODE:-0}
SETUP_INSTALLED_VSCODE=${SETUP_INSTALLED_VSCODE:-0}
SETUP_INSTALLED_ENTIRE=${SETUP_INSTALLED_ENTIRE:-0}
SETUP_INSTALLED_CLAUDE=${SETUP_INSTALLED_CLAUDE:-0}
SETUP_INSTALLED_SPECSTORY=${SETUP_INSTALLED_SPECSTORY:-0}
SETUP_INSTALLED_SPECSTORY_EXTENSION=${SETUP_INSTALLED_SPECSTORY_EXTENSION:-0}
SETUP_INSTALLED_NOTEBOOK_EXTENSION=${SETUP_INSTALLED_NOTEBOOK_EXTENSION:-0}
NOTEBOOK_EXTENSION_ID=${NOTEBOOK_EXTENSION_ID:-}
EOF
}

# ============================================================================
# Header
# ============================================================================

clear || true

printf "\n\033[32m====================================================\033[0m\n"
printf "\033[32m Human-AI Experiment Environment Installer (macOS)\033[0m\n"
printf "\033[32m====================================================\033[0m\n"

printf "\nThis installer will configure:\n"
printf "  1. Homebrew\n"
printf "  2. Git\n"
printf "  3. Node.js and npm\n"
printf "  4. Entire CLI\n"
printf "  5. Claude Code\n"
printf "  6. SpecStory CLI\n"
printf "  7. SpecStory VS Code extension\n"
printf "  8. SpecStory Lore skill\n"
printf "  9. Anthropic API key\n"
printf " 10. Notebook Edit Tracker VS Code extension\n"
printf " 11. claude-exp launcher\n"
printf " 12. Entire integration for this repository\n"

pause_for_enter

# Defaults for uninstall state.
SETUP_INSTALLED_HOMEBREW=0
SETUP_INSTALLED_GIT=0
SETUP_INSTALLED_NODE=0
SETUP_INSTALLED_VSCODE=0
SETUP_INSTALLED_ENTIRE=0
SETUP_INSTALLED_CLAUDE=0
SETUP_INSTALLED_SPECSTORY=0
SETUP_INSTALLED_SPECSTORY_EXTENSION=0
SETUP_INSTALLED_NOTEBOOK_EXTENSION=0
NOTEBOOK_EXTENSION_ID=""

trap 'save_state >/dev/null 2>&1 || true' EXIT

# ============================================================================
# Validate platform and project files
# ============================================================================

write_step "Checking macOS and experiment files"

if [[ "$(uname -s)" != "Darwin" ]]; then
    printf "\n\033[31mThis installer is for macOS only.\033[0m\n"
    exit 1
fi

if [[ ! -d "$LAUNCHER_DIR" ]]; then
    printf "\n\033[31mLauncher directory not found: %s\033[0m\n" "$LAUNCHER_DIR"
    exit 1
fi

if [[ ! -f "$LAUNCHER_DIR/package.json" ]]; then
    printf "\n\033[31mpackage.json not found: %s/package.json\033[0m\n" "$LAUNCHER_DIR"
    exit 1
fi

if [[ ! -f "$VSIX_PATH" ]]; then
    printf "\n\033[31mVS Code extension not found: %s\033[0m\n" "$VSIX_PATH"
    exit 1
fi

mkdir -p "$TASKS_DIR"
write_success "Experiment files found."

# ============================================================================
# Homebrew
# ============================================================================

write_step "Installing Homebrew"
if [[ -n "${POSIXLY_CORRECT+x}" ]]; then
    write_warning "POSIXLY_CORRECT is set; unsetting it for Homebrew."
    unset POSIXLY_CORRECT
fi

refresh_brew_path

if ! command_exists brew; then
    env -u POSIXLY_CORRECT \
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    SETUP_INSTALLED_HOMEBREW=1
    refresh_brew_path
fi

if ! command_exists brew; then
    printf "\n\033[31mHomebrew installation completed, but brew is unavailable.\033[0m\n"
    exit 1
fi

write_success "Homebrew is available."
printf "    %s\n" "$(brew --version | head -n 1)"

# ============================================================================
# Git
# ============================================================================

write_step "Installing Git"

if ! command_exists git; then
    brew install git
    SETUP_INSTALLED_GIT=1
fi

if ! command_exists git; then
    printf "\n\033[31mGit installation failed.\033[0m\n"
    exit 1
fi

write_success "Git is available."
printf "    %s\n" "$(git --version)"

# ============================================================================
# Node.js and npm
# ============================================================================

write_step "Installing Node.js and npm"

if ! command_exists node || ! command_exists npm; then
    brew install node
    SETUP_INSTALLED_NODE=1
fi

if ! command_exists node || ! command_exists npm; then
    printf "\n\033[31mNode.js/npm installation failed.\033[0m\n"
    exit 1
fi

printf "    Node.js: %s\n" "$(node --version)"
printf "    npm:     %s\n" "$(npm --version)"
write_success "Node.js and npm are available."

# ============================================================================
# Visual Studio Code
# ============================================================================

write_step "Checking Visual Studio Code"

if ! resolve_code_cli; then
    brew install --cask visual-studio-code
    SETUP_INSTALLED_VSCODE=1

    if ! resolve_code_cli; then
        printf "\n\033[31mVS Code was installed, but its command-line tool could not be found.\033[0m\n"
        exit 1
    fi
fi

write_success "Visual Studio Code is available."
printf "    CLI: %s\n" "$CODE_CLI"

# ============================================================================
# Entire CLI
# ============================================================================

write_step "Installing Entire CLI"

if ! command_exists entire; then
    brew tap entireio/tap
    brew install --cask entire
    SETUP_INSTALLED_ENTIRE=1
fi

if ! command_exists entire; then
    printf "\n\033[31mEntire CLI was installed, but the entire command is unavailable.\033[0m\n"
    exit 1
fi

write_success "Entire CLI is available."
entire version

# ============================================================================
# Claude Code
# ============================================================================

write_step "Installing Claude Code"

if ! command_exists claude; then
    npm install --global @anthropic-ai/claude-code
    SETUP_INSTALLED_CLAUDE=1
else
    # Keep the experiment machine current when Claude Code already exists.
    npm install --global @anthropic-ai/claude-code
fi

if ! command_exists claude; then
    printf "\n\033[31mClaude Code was installed, but the claude command is unavailable.\033[0m\n"
    exit 1
fi

printf "    Claude Code: %s\n" "$(claude --version)"
write_success "Claude Code installed."

# ============================================================================
# SpecStory CLI
# ============================================================================

write_step "Installing SpecStory CLI"

if ! command_exists specstory; then
    brew tap specstoryai/tap

    # Current SpecStory docs recommend trusting the tap before installation.
    if brew help trust >/dev/null 2>&1; then
        brew trust specstoryai/tap || true
    fi

    brew update
    brew install specstory
    SETUP_INSTALLED_SPECSTORY=1
fi

if ! command_exists specstory; then
    printf "\n\033[31mSpecStory CLI installation failed.\033[0m\n"
    exit 1
fi

write_success "SpecStory CLI is available."
specstory version
specstory check || write_warning "SpecStory check reported a warning. Installation will continue."

# ============================================================================
# SpecStory VS Code extension
# ============================================================================

write_step "Installing SpecStory VS Code extension"

if "$CODE_CLI" --list-extensions | grep -Fxqi "SpecStory.specstory-vscode"; then
    write_success "SpecStory VS Code extension is already installed."
else
    "$CODE_CLI" --install-extension "SpecStory.specstory-vscode"
    SETUP_INSTALLED_SPECSTORY_EXTENSION=1
    write_success "SpecStory VS Code extension installed."
fi

# ============================================================================
# SpecStory Lore skill
# ============================================================================

write_step "Installing SpecStory Lore skill"

npx --yes skills add specstoryai/getspecstory --skill lore -y

if [[ $? -ne 0 ]]; then
    printf "\n\033[31mFailed to install the SpecStory Lore skill.\033[0m\n"
    exit 1
fi

write_success "SpecStory Lore skill installed."

# ============================================================================
# Anthropic API key
# ============================================================================

write_step "Configuring the experiment Anthropic API key"

printf "\nEnter the experiment Anthropic API key.\n"
printf "The characters will not be displayed while typing.\n\n"
read -r -s -p "Anthropic API Key: " API_KEY
printf "\n"

if [[ -z "${API_KEY// }" ]]; then
    printf "\n\033[31mThe Anthropic API key cannot be empty.\033[0m\n"
    exit 1
fi

if [[ "$API_KEY" != sk-* ]]; then
    write_warning "The entered value does not begin with 'sk-'."
    read -r -p "Continue with this key? Enter Y to continue: " CONTINUE_WITH_KEY
    if [[ ! "$CONTINUE_WITH_KEY" =~ ^[Yy]$ ]]; then
        printf "\n\033[31mAPI key configuration cancelled.\033[0m\n"
        exit 1
    fi
fi

RC_FILE="$(shell_rc_file)"
touch "$RC_FILE"

python3 - "$RC_FILE" "$API_KEY" <<'PY'
import pathlib, shlex, sys

rc = pathlib.Path(sys.argv[1])
key = sys.argv[2]
start = "# >>> human-ai-experiment ANTHROPIC_API_KEY >>>"
end = "# <<< human-ai-experiment ANTHROPIC_API_KEY <<<"
text = rc.read_text() if rc.exists() else ""

before = text
if start in text and end in text:
    prefix = text.split(start, 1)[0].rstrip()
    suffix = text.split(end, 1)[1].lstrip("\n")
    text = prefix + ("\n\n" if prefix else "") + suffix

block = f"{start}\nexport ANTHROPIC_API_KEY={shlex.quote(key)}\n{end}\n"
text = text.rstrip() + ("\n\n" if text.strip() else "") + block
rc.write_text(text)
PY

export ANTHROPIC_API_KEY="$API_KEY"
unset API_KEY

write_success "Anthropic API key configured in $RC_FILE."

# ============================================================================
# Notebook Edit Tracker VS Code extension
# ============================================================================

write_step "Installing Notebook Edit Tracker"

BEFORE_EXTENSIONS="$(mktemp)"
AFTER_EXTENSIONS="$(mktemp)"
"$CODE_CLI" --list-extensions | sort > "$BEFORE_EXTENSIONS"

"$CODE_CLI" --install-extension "$VSIX_PATH" --force

"$CODE_CLI" --list-extensions | sort > "$AFTER_EXTENSIONS"

NEW_EXTENSIONS="$(comm -13 "$BEFORE_EXTENSIONS" "$AFTER_EXTENSIONS" || true)"
rm -f "$BEFORE_EXTENSIONS" "$AFTER_EXTENSIONS"

if [[ -n "$NEW_EXTENSIONS" ]]; then
    NOTEBOOK_EXTENSION_ID="$(printf "%s\n" "$NEW_EXTENSIONS" | head -n 1)"
    SETUP_INSTALLED_NOTEBOOK_EXTENSION=1
    printf "    Extension ID: %s\n" "$NOTEBOOK_EXTENSION_ID"
fi

write_success "Notebook Edit Tracker installed."

# ============================================================================
# Experiment launcher
# ============================================================================

write_step "Installing the claude-exp launcher"

pushd "$LAUNCHER_DIR" >/dev/null
npm install
npm link
popd >/dev/null

NPM_GLOBAL_BIN="$(npm prefix -g)/bin"

export PATH="$NPM_GLOBAL_BIN:$PATH"

RC_FILE="$(shell_rc_file)"
touch "$RC_FILE"

PATH_BLOCK_START="# >>> human-ai-experiment npm PATH >>>"
PATH_BLOCK_END="# <<< human-ai-experiment npm PATH <<<"

if ! grep -Fq "$PATH_BLOCK_START" "$RC_FILE"; then
    {
        printf "\n%s\n" "$PATH_BLOCK_START"
        printf 'export PATH="%s:$PATH"\n' "$NPM_GLOBAL_BIN"
        printf "%s\n" "$PATH_BLOCK_END"
    } >> "$RC_FILE"
fi

if ! command_exists claude-exp; then
    write_warning "claude-exp was linked, but it is not visible on the current PATH."
    write_warning "Open a new Terminal or reload your shell configuration:"
    printf "    source %s\n" "$RC_FILE"
else
    write_success "claude-exp launcher installed."
    printf "    %s\n" "$(command -v claude-exp)"
fi

# ============================================================================
# Git repository initialization
# ============================================================================

write_step "Checking experiment Git repository"

if [[ ! -d "$PROJECT_ROOT/.git" ]]; then
    git -C "$PROJECT_ROOT" init
    write_success "Git repository initialized."
else
    write_success "Git repository already exists."
fi

# ============================================================================
# Entire initialization
# ============================================================================

write_step "Enabling Entire for Claude Code in this repository"

pushd "$PROJECT_ROOT" >/dev/null

# Current Entire CLI supports non-interactive agent selection.
if entire enable -y --agent claude-code; then
    write_success "Entire enabled for Claude Code."
else
    write_warning "Non-interactive enable failed; trying the standard enable command."
    entire enable
    write_success "Entire enabled."
fi

popd >/dev/null

# ============================================================================
# Final verification
# ============================================================================

write_step "Verifying installation"

MISSING=()

for cmd in git npm node entire claude specstory claude-exp; do
    if ! command_exists "$cmd"; then
        MISSING+=("$cmd")
    fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
    printf "\n\033[31mThe following commands are unavailable: %s\033[0m\n" "${MISSING[*]}"
    exit 1
fi

if ! "$CODE_CLI" --list-extensions | grep -Fxqi "SpecStory.specstory-vscode"; then
    printf "\n\033[31mThe SpecStory VS Code extension is unavailable.\033[0m\n"
    exit 1
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    printf "\n\033[31mThe Anthropic API key is unavailable in the current shell.\033[0m\n"
    exit 1
fi

save_state
trap - EXIT

# ============================================================================
# Success
# ============================================================================

printf "\n\033[32m====================================================\033[0m\n"
printf "\033[32m Installation completed successfully\033[0m\n"
printf "\033[32m====================================================\033[0m\n"

printf "\nInstalled and configured:\n"
printf "  - Homebrew\n"
printf "  - Git\n"
printf "  - Node.js and npm\n"
printf "  - Entire CLI\n"
printf "  - Claude Code\n"
printf "  - SpecStory CLI\n"
printf "  - SpecStory VS Code extension\n"
printf "  - SpecStory Lore skill\n"
printf "  - Experiment Anthropic API key\n"
printf "  - Notebook Edit Tracker\n"
printf "  - claude-exp launcher\n"
printf "  - Entire logging for Claude Code in this repository\n"

printf "\nYou can now start a task with:\n\n"
printf "    claude-exp 1\n\n"

printf "\033[90mSpecStory CLI is installed and can capture terminal Claude sessions with:\033[0m\n"
printf "\033[90m    specstory run claude\033[0m\n"
printf "\033[90mHistory is written under .specstory/history/ in the project.\033[0m\n"

printf "\nIMPORTANT: if the current launcher still starts 'claude' directly, claude-exp\n"
printf "will not automatically route through SpecStory until the launcher code is updated\n"
printf "to invoke 'specstory run claude'.\n"

printf "\nA newly opened Terminal will inherit the saved ANTHROPIC_API_KEY and npm PATH.\n"
printf "Restart VS Code once after first installation so newly installed extensions load.\n\n"