#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NOTE_FILE="$SCRIPT_DIR/exp-claude.md"

if ! command -v claude >/dev/null 2>&1; then
  echo "Error: 'claude' command not found in PATH."
  echo "Install Claude CLI first, then retry."
  exit 1
fi

if [[ ! -f "$NOTE_FILE" ]]; then
  echo "Error: note file not found at $NOTE_FILE"
  exit 1
fi

NOTE="$(cat "$NOTE_FILE")"

cd "$PROJECT_ROOT"

claude --append-system-prompt "
Project context:

$NOTE
"
