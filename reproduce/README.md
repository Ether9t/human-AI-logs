# Visualiation

The visualization component is located in: `reproduce/`

This module provides a browser-based interface for replaying sessions.

## Start Local Server

Navigate to the reproduction directory: `cd reproduce`

Start a local web: `npm run dev`

Then open a browser and visit: `http://localhost:5173`

---

## Collect Data

1. Download and add the plug-in in VSCode
2. Install Entire.io

`brew tap entireio/tap`

`brew install --cask entire`

3. Install SpecStory

`brew tap specstoryai/tap`

`brew install specstory`

4. Enable Entire

`cd <repo>`

`entire enable --agent claude-code`

5. Run Claude Code through SpecStory

`specstory run claude`

6. Run Claude in CLI

`claude`

---

## Load a Session

1. Put all data in: `reproduce/data/{dataset_name}/`
2. Add `{dataset_name}` in: `reproduce/data/index.json`

Data should at least contain: 

1. `full.jsonl`
2. `notebook_changes.jsonl`