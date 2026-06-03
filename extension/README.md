# notebook-edit-tracker

This extension tracks notebook edit behaviors inside VS Code to enable edit process visualization and user behavior pattern analysis.

---

## VS Code API Architecture & Event Tree Structure

The extension hooks into the VS Code API to capture both structural notebook modifications and granular text edits within cells.

```text
[VS Code Workspace Events]
├── vscode.workspace.onDidChangeNotebookDocument
│    └── NotebookDocumentChangeEvent
│         ├── notebook (NotebookDocument: uri, notebookType, version)
│         ├── metadata (Changed notebook-level metadata)
│         ├── cellChanges (Array of cell-level structure/metadata changes)
│         └── contentChanges (Array of NotebookCellTextModelDelta)
│              ├── start (Index where the change started)
│              ├── deletedCount (Number of deleted cells)
│              └── insertedCells (Array of NotebookCell)
│                   ├── index (Position of the cell)
│                   ├── kind (CellKind: Markup or Code)
│                   ├── document (TextDocument reference for the cell)
│                   └── metadata (Cell-level configuration/outputs)
│
└── vscode.workspace.onDidChangeTextDocument
     └── TextDocumentChangeEvent
          ├── document (TextDocument)
          │    ├── uri (URI object)
          │    │    └── scheme: 'vscode-notebook-cell'
          │    │         └── [Resolved to Parent Notebook URI]
          │    ├── languageId (e.g., 'python', 'markdown')
          │    ├── version (Monotonically increasing version number)
          │    ├── isDirty (Boolean tracking unsaved changes)
          │    └── lineCount (Total number of lines in the document)
          ├── contentChanges (Array of TextDocumentContentChangeEvent)
          │    ├── range (Range object: start line/character to end line/character)
          │    ├── rangeOffset (Character offset from the start of the document)
          │    ├── rangeLength (Length of the text that was replaced)
          │    └── text (The actual string text that was inserted or typed)
          └── reason (Undo/Redo reason if applicable)
```

---

## Toolchain & JSONL Writing Pipeline

To ensure zero interface lag during high-frequency typing, the extension uses a non-blocking JSON Lines (JSONL) writing pipeline equipped with a sliding ring buffer to suppress duplicate events.

```text
[API Event Captured]
│
▼
[Global Enabled State Check]
    └── Discards events immediately if tracker is toggled OFF
│
▼
[Debounce Buffer Check]
    └── Strips timeStamp -> Evaluates signature against last 5 records
│
▼
[fs.appendFileSync]
    └── Appends atomic string + '\n' directly to local disk
```

---

## Easy Toggle Listener Module

Each listener is structured cleanly as its own initialization function called during extension activation.

A global runtime state (`isEnabled`) can be toggled using a dedicated command or the status bar item.

### Controls

- **Command:** `notebookLogger.toggle`
- **Status Bar Item:**
  - `$(record) Logger: ON`
  - `$(circle-slash) Logger: OFF`

---

## Event Data Processing for Cleaner Logs

This tracker logs simplified notebook structural changes to:

- `{notebookname}_structure_changes.json`
- `{notebookname}_content_changes.json`

Both files append records as newline-delimited JSON (JSONL) with millisecond epoch timestamps for seamless timeline recreation.

### Log Role Demarcation

#### `structure_changes` tracks:

- `insert`
- `delete`
- `move`
- `language_change`
- `execute`

#### `content_changes` tracks:

- All granular cell text modifications

If a listener detects a newly inserted cell that already contains content, it triggers a dual-log routine that writes to both logs simultaneously.

---

## Simplified Structure Change Log

### `timeStamp`

Concise millisecond epoch timestamp.

Example:

```text
1716912000000
```

### `cellUri`

Short cell identifier derived from `uri.fragment`.

Example:

```text
ch4~00002
```

### `cellIndex`

Zero-indexed position of the cell at the time of modification.

### `changeType`

Structural action token:

- `insert`
- `delete`
- `move`
- `language_change`
- `execute`

### `cellType`

Mapped from `CellKind`:

- `code`
- `markup`

### `executeOutput`

Array of minimized runtime output snapshots containing:

- exact `mime` type
- serialized payload data

Supports:

- base64 for binary images
- utf8 for raw text and HTML

Only populated during `execute`; otherwise `null`.

---

## Simplified Content Change Log

### `timeStamp`

Same millisecond timestamp format used by structure logs for timeline alignment.

### `cellUri`

Short identifier matching `uri.fragment`.

### `contentChanges`

Streamlined array of minimized text delta objects:

- `range`
  - `start`
  - `end`
- `rangeOffset`
- `rangeLength`
- `text`

---

## NotebookDocumentChangeEvent Listener Behavior

This listener evaluates `NotebookDocumentChangeEvent.contentChanges` and cell metadata states on the event level to classify structural adjustments.

### 1. Structural Event Classification Logic

#### `delete`

Triggered when a cell is removed from the notebook array, provided it is not matched as a `move` or `language_change`.

#### `insert`

Triggered when a brand new cell is initialized into the notebook array.

#### `move`

Identified across event-wide changes when an added cell's underlying `uri.fragment` matches a removed cell's `uri.fragment`.

#### `language_change`

Triggered when a cell swaps its code language environment.

Example:

```text
Python -> Markdown
```

Detected when an added cell's raw text matches a removed cell's raw text but their `languageId` values differ.

#### `execute`

Triggered when `cellChanges` updates execution summaries or cell outputs.

##### Muting / Debouncing Rule

Evaluates the output array against a running cache.

Captures outputs only if:

- outputs are non-empty
- outputs differ from the cached signature
- or the event occurs more than 1000ms after the last recorded output state

---

### 2. Handling Non-Empty Insertions (Dual-Log Routine)

When a cell is inserted, the listener inspects its text contents via:

```ts
cell.document.getText()
```

If the cell already contains content (for example after undo operations, AI generation, or duplication blocks):

1. Write an `insert` record to `{notebookname}_structure_changes.json`
2. Map a mock `TextDocumentChangeEvent` and stream it to `{notebookname}_content_changes.json`

#### Mock Conversion Mapping

```text
range.start  = { line: 0, character: 0 }
range.end    = { line: 0, character: 0 }
rangeOffset  = 0
rangeLength  = 0
text         = cell.document.getText()
```

---

### 3. State Model Assertions

#### Insert

Adds a `cellUri` at target `cellIndex`.

Replay shifts subsequent items downward by `+1`.

#### Delete

Removes the `cellUri` at target `cellIndex`.

Replay shifts subsequent items upward by `-1`.

#### Move

Handled as an atomic:

1. delete-from-source
2. insert-at-destination

---

## TextDocumentChangeEvent Listener Behavior

Captures keypresses, edits, and text structural modifications within cell-scoped instances.

```text
[User Types/Pastes Code]
            │
            ▼
TextDocumentChangeEvent Fired
            │
            ▼
Verify 'uri.scheme'
=== 'vscode-notebook-cell'
            │
            ▼
Resolve Parent Notebook Document
            │
            ▼
Log atomic payload directly to:
{notebookname}_content_changes.json
```

### Filter

Proceeds only if the document context matches a valid notebook cell ecosystem:

```ts
uri.scheme === 'vscode-notebook-cell'
```

### Extraction & Payload Packaging

Extracts the short unique ID from `uri.fragment`, resolves the parent notebook filename, and maps the structure cleanly into JSONL records.

```json
{
  "timeStamp": 1716912000000,
  "cellUri": "ch4~00002",
  "contentChanges": [
    {
      "range": {
        "start": {
          "line": 0,
          "character": 0
        },
        "end": {
          "line": 0,
          "character": 0
        }
      },
      "rangeOffset": 0,
      "rangeLength": 0,
      "text": "import pandas as pd"
    }
  ]
}
```

---

## Minor Simplifications

- Use `uri.fragment` as the canonical cell identifier for compact records
- Use concise millisecond timestamps to keep high-frequency logs lightweight and readable
- Automatic ring buffer caching suppresses redundant JSON logs during high-frequency API events