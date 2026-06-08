# Visualiation

The visualization component is located in: `reproduce/`

This module provides a browser-based interface for replaying sessions.

## Start Local Server

Navigate to the reproduction directory: `cd reproduce`

Start a local web: `npm run dev`

Then open a browser and visit: `http://localhost:5173`

## Collect Data

1. Download and add the plug-in in VSCode
2. Install Entire.io

    `brew tap entireio/tap`

    `brew install --cask entire`

3. Enable Entire

    `cd <repo>`

    `entire enable --agent claude-code`

4. Run Claude in CLI

    `claude`

## Load a Session

1. Put all data in: `reproduce/data/{dataset_name}/`
2. Add `{dataset_name}` in: `reproduce/data/index.json`

Data should at least contain: 

1. `full.jsonl`, from entire.io
2. `notebook_changes.jsonl`, from Notebook-Edit-Tracker

# notebook-edit-tracker

A VS Code extension that logs every structural and textual edit in Jupyter notebooks to JSONL files for replay and analysis.

## Installation

In VS Code: **Extensions** panel → `···` menu (top-right) → **Install from VSIX** → select the `.vsix` file.

Requires VS Code 1.80+.

## Usage

Open any `.ipynb` file — logging starts automatically. Two log files are written to the notebook's directory:

```
my_notebook_structure_changes.jsonl
my_notebook_content_changes.jsonl
```

## Toggle

A status bar item (bottom-right) shows the current state:

- `● Logger: ON` — actively logging
- `⊘ Logger: OFF` — paused, events discarded

Click it or run `notebookLogger.toggle` to switch. When off, nothing is written to disk.

## Output Data

### `structure_changes.jsonl`

One record per structural event: cell added, removed, moved, re-typed, or executed.

| Field | Description |
|---|---|
| `timeStamp` | Millisecond epoch |
| `cellUri` | Short cell ID from `uri.fragment` (e.g. `ch4~00002`) |
| `cellIndex` | Zero-based cell position at time of event |
| `changeType` | What happened to the cell (see below) |
| `cellType` | `code` or `markup` |
| `executeOutput` | Array of `{mime, data}` output snapshots on `execute`; `null` otherwise. Text/HTML encoded as UTF-8, binary images as base64. |

**`changeType` values**

| Value | Behavior |
|---|---|
| `insert` | A new cell was added to the notebook |
| `delete` | A cell was removed |
| `move` | A cell changed position — logged as a `delete` from the old index and an `insert` at the new index |
| `language_change` | A cell's language was switched (e.g. Python → Markdown). The cell keeps its content but gets a new `languageId` |
| `execute` | A cell was run and its outputs updated. Only logs if output has changed or >1000ms has passed since the last execution record for that cell |

```json
{
    "timeStamp":1716912000000,
    "cellUri":"ch4~00002",
    "cellIndex":2,
    "changeType":"insert",
    "cellType":"code",
    "executeOutput":null}
```

### `content_changes.jsonl`

One record per text edit — keystrokes, pastes, deletions, AI completions.

| Field | Description |
|---|---|
| `timeStamp` | Millisecond epoch |
| `cellUri` | Short cell ID |
| `contentChanges` | Array of text delta objects (see below) |

**Text delta fields**

| Field | Description |
|---|---|
| `range` | The region of text that was replaced — `start` and `end` as `{line, character}` positions within the cell. For a pure insertion, start and end are the same point. |
| `rangeOffset` | Character offset of `range.start` from the beginning of the cell document |
| `rangeLength` | Number of characters replaced. `0` means nothing was deleted — text was only inserted |
| `text` | The string inserted at this position. Empty string means a pure deletion |

```json
{
    "timeStamp":1716912000000,
    "cellUri":"ch4~00002",
    "contentChanges":[{
        "range":{
            "start":{"line":0,"character":0},
            "end":{"line":0,"character":0}
        },
        "rangeOffset":0,
        "rangeLength":0,
        "text":"import pandas as pd"
    }]
}
```
