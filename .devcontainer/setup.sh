#!/usr/bin/env bash

set -euo pipefail

echo "Setting up experiment environment..."

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${REPO_ROOT}/data/shop"

sudo apt-get update
sudo apt-get install -y jq

npm install -g @anthropic-ai/claude-code

cd "${REPO_ROOT}/launcher"
npm install
npm link

cd "${REPO_ROOT}"
pip install -r requirements.txt

echo "Checking Kaggle dataset..."

if [ ! -d "${DATA_DIR}" ] || [ -z "$(find "${DATA_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
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

echo "Experiment environment ready."