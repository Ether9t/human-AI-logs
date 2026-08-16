#!/usr/bin/env bash

set -euo pipefail

echo "Installing experiment logger extension..."

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VSIX_PATH="${REPO_ROOT}/extensions/notebook-edit-tracker-0.0.1.vsix"

if [ ! -f "${VSIX_PATH}" ]; then
    echo "ERROR: VSIX file not found:"
    echo "${VSIX_PATH}"
    exit 1
fi

for i in {1..20}; do
    if command -v code >/dev/null 2>&1; then
        break
    fi

    echo "Waiting for VS Code CLI..."
    sleep 1
done

if ! command -v code >/dev/null 2>&1; then
    echo "ERROR: VS Code CLI is not available."
    exit 1
fi

code --install-extension \
    "${VSIX_PATH}" \
    --force

echo "Experiment logger extension installation command completed."