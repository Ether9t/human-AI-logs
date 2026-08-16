#!/usr/bin/env bash

set -euo pipefail

echo "=== [1/6] Starting setup ==="

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${REPO_ROOT}/data/shop"

echo "=== [2/6] Installing system dependencies ==="

sudo apt-get update
sudo apt-get install -y jq

echo "=== [3/6] Installing Claude Code ==="

npm install -g @anthropic-ai/claude-code

echo "=== [4/6] Installing launcher ==="

cd "${REPO_ROOT}/launcher"
npm install
npm link

echo "=== [5/6] Installing Python dependencies ==="

cd "${REPO_ROOT}"
python -m pip install -r requirements.txt

echo "=== [6/6] Checking Kaggle dataset ==="

if [ ! -d "${DATA_DIR}" ] || \
   [ -z "$(find "${DATA_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]; then

    mkdir -p "${DATA_DIR}"

    python <<PYTHON
import kagglehub

output_dir = r"${DATA_DIR}"

path = kagglehub.dataset_download(
    "psparks/instacart-market-basket-analysis",
    output_dir=output_dir,
)

print(f"Dataset downloaded to: {path}")
PYTHON

else
    echo "Dataset already exists at ${DATA_DIR}; skipping download."
fi

echo "=== Experiment environment ready ==="