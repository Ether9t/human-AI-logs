#!/usr/bin/env bash

set -u

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

INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$INSTALLER_DIR/.." && pwd)"
LAUNCHER_DIR="$PROJECT_ROOT/launcher"
STATE_FILE="$INSTALLER_DIR/.mac-setup-state"

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

if [[ -f "$STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
fi

if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi

CODE_CLI=""
if command_exists code; then
    CODE_CLI="$(command -v code)"
elif [[ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]]; then
    CODE_CLI="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
elif [[ -x "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]]; then
    CODE_CLI="$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
fi

clear || true

printf "\n\033[33m====================================================\033[0m\n"
printf "\033[33m Human-AI Experiment Environment Uninstaller (macOS)\033[0m\n"
printf "\033[33m====================================================\033[0m\n"

printf "\nThis uninstaller removes experiment-specific configuration.\n"
printf "It preserves project source files, tasks, .git, and .specstory history unless asked.\n\n"

read -r -p "Continue? [y/N] " ANSWER
if [[ ! "$ANSWER" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    printf "Uninstall cancelled.\n"
    exit 0
fi

# ============================================================================
# Entire repository integration
# ============================================================================

write_step "Disabling Entire for this repository"

if command_exists entire && [[ -d "$PROJECT_ROOT/.git" ]]; then
    (
        cd "$PROJECT_ROOT" || exit 1
        entire disable
    ) && write_success "Entire disabled for this repository." \
      || write_warning "Entire could not be disabled automatically."
else
    write_warning "Entire CLI or Git repository not found; skipping."
fi

# ============================================================================
# claude-exp launcher
# ============================================================================

write_step "Removing claude-exp launcher"

if command_exists npm && [[ -d "$LAUNCHER_DIR" ]]; then
    (
        cd "$LAUNCHER_DIR" || exit 1
        npm unlink --global
    ) && write_success "claude-exp npm link removed." \
      || write_warning "npm unlink did not complete cleanly."
else
    write_warning "npm or launcher directory unavailable; skipping."
fi

# ============================================================================
# Lore skill
# ============================================================================

write_step "Removing SpecStory Lore skill"

if command_exists npx; then
    npx --yes skills remove lore --agent '*' -y \
        && write_success "Lore skill removed from detected agents." \
        || write_warning "Lore was not removed automatically; it may not be installed."
else
    write_warning "npx is unavailable; skipping Lore removal."
fi

# ============================================================================
# VS Code extensions
# ============================================================================

write_step "Removing VS Code experiment extensions"

if [[ -n "$CODE_CLI" ]]; then
    if "$CODE_CLI" --list-extensions | grep -Fxqi "SpecStory.specstory-vscode"; then
        "$CODE_CLI" --uninstall-extension "SpecStory.specstory-vscode" \
            && write_success "SpecStory VS Code extension removed." \
            || write_warning "SpecStory extension could not be removed."
    else
        write_success "SpecStory VS Code extension is not installed."
    fi

    if [[ -n "${NOTEBOOK_EXTENSION_ID:-}" ]] && \
       "$CODE_CLI" --list-extensions | grep -Fxqi "$NOTEBOOK_EXTENSION_ID"; then
        "$CODE_CLI" --uninstall-extension "$NOTEBOOK_EXTENSION_ID" \
            && write_success "Notebook Edit Tracker removed." \
            || write_warning "Notebook Edit Tracker could not be removed."
    else
        write_warning "Notebook Edit Tracker extension ID was not recorded; it was left unchanged."
    fi
else
    write_warning "VS Code CLI is unavailable; extensions were left unchanged."
fi

# ============================================================================
# Anthropic API key
# ============================================================================

write_step "Removing saved Anthropic API key"

for rc in "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc"; do
    [[ -f "$rc" ]] || continue
    python3 - "$rc" <<'PY'
import pathlib, sys

p = pathlib.Path(sys.argv[1])
text = p.read_text()
start = "# >>> human-ai-experiment ANTHROPIC_API_KEY >>>"
end = "# <<< human-ai-experiment ANTHROPIC_API_KEY <<<"

if start in text and end in text:
    prefix = text.split(start, 1)[0].rstrip()
    suffix = text.split(end, 1)[1].lstrip("\n")
    new = prefix + ("\n" if prefix and suffix else "") + suffix
    p.write_text(new.rstrip() + ("\n" if new.strip() else ""))
PY
done

unset ANTHROPIC_API_KEY || true
write_success "Experiment ANTHROPIC_API_KEY shell configuration removed."

# ============================================================================
# Optional history deletion
# ============================================================================

if [[ -d "$PROJECT_ROOT/.specstory" ]]; then
    printf "\n"
    read -r -p "Delete .specstory history from this project? [y/N] " DELETE_HISTORY
    if [[ "$DELETE_HISTORY" =~ ^[Yy]([Ee][Ss])?$ ]]; then
        rm -rf "$PROJECT_ROOT/.specstory"
        write_success ".specstory history deleted."
    else
        write_success ".specstory history preserved."
    fi
fi

# ============================================================================
# Components installed by setup.sh
# ============================================================================

printf "\nThe following package removals are optional. Only say yes if this experiment\n"
printf "machine does not need the component for anything else.\n"

if [[ "$SETUP_INSTALLED_CLAUDE" == "1" ]] && command_exists npm; then
    read -r -p "Uninstall Claude Code installed by setup.sh? [y/N] " A
    if [[ "$A" =~ ^[Yy]([Ee][Ss])?$ ]]; then
        npm uninstall --global @anthropic-ai/claude-code
        write_success "Claude Code removed."
    fi
fi

if [[ "$SETUP_INSTALLED_SPECSTORY" == "1" ]] && command_exists brew; then
    read -r -p "Uninstall SpecStory CLI installed by setup.sh? [y/N] " A
    if [[ "$A" =~ ^[Yy]([Ee][Ss])?$ ]]; then
        brew uninstall specstory
        write_success "SpecStory CLI removed."
    fi
fi

if [[ "$SETUP_INSTALLED_ENTIRE" == "1" ]] && command_exists brew; then
    read -r -p "Uninstall Entire CLI installed by setup.sh? [y/N] " A
    if [[ "$A" =~ ^[Yy]([Ee][Ss])?$ ]]; then
        brew uninstall --cask entire
        write_success "Entire CLI removed."
    fi
fi

if [[ "$SETUP_INSTALLED_VSCODE" == "1" ]] && command_exists brew; then
    read -r -p "Uninstall VS Code installed by setup.sh? [y/N] " A
    if [[ "$A" =~ ^[Yy]([Ee][Ss])?$ ]]; then
        brew uninstall --cask visual-studio-code
        write_success "Visual Studio Code removed."
    fi
fi

if [[ "$SETUP_INSTALLED_NODE" == "1" ]] && command_exists brew; then
    read -r -p "Uninstall Node.js installed by setup.sh? [y/N] " A
    if [[ "$A" =~ ^[Yy]([Ee][Ss])?$ ]]; then
        brew uninstall node
        write_success "Node.js removed."
    fi
fi

if [[ "$SETUP_INSTALLED_GIT" == "1" ]] && command_exists brew; then
    read -r -p "Uninstall Homebrew Git installed by setup.sh? [y/N] " A
    if [[ "$A" =~ ^[Yy]([Ee][Ss])?$ ]]; then
        brew uninstall git
        write_success "Homebrew Git removed."
    fi
fi

# Homebrew itself is intentionally never removed automatically.

rm -f "$STATE_FILE"

printf "\n\033[32m====================================================\033[0m\n"
printf "\033[32m Uninstall completed\033[0m\n"
printf "\033[32m====================================================\033[0m\n"
printf "\nHomebrew itself was preserved.\n"
printf "Project source files, tasks, and .git were preserved.\n\n"