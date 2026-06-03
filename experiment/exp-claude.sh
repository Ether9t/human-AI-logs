#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

NOTE="$(cat "$SCRIPT_DIR/exp-claude.md")"

cd "$PROJECT_ROOT"

claude --append-system-prompt "$(cat <<EOF
Project context:

$NOTE
EOF
)"