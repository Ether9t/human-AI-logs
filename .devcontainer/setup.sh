#!/usr/bin/env bash

set -e

echo "Setting up experiment environment..."

sudo apt-get update
sudo apt-get install -y jq

npm install -g @anthropic-ai/claude-code

cd /workspaces/human-AI-logs/launcher

npm install
npm link

cd /workspaces/human-AI-logs

pip install -r requirements.txt

echo "Experiment environment ready."