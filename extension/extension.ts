import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Global state tracking
let isEnabled = true;
let statusBarItem: vscode.StatusBarItem;

/**
 * Extension entry point. Each listener is registered through its own function so
 * individual modules can be toggled on/off easily for testing.
 */
export function activate(context: vscode.ExtensionContext) {
    // 1. Register the toggle command
    context.subscriptions.push(
        vscode.commands.registerCommand('notebookLogger.toggle', () => {
            isEnabled = !isEnabled;
            updateStatusBar();
            vscode.window.showInformationMessage(`Notebook Logger is now ${isEnabled ? 'ENABLED' : 'DISABLED'}.`);
        })
    );

    // 2. Create and show the Status Bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'notebookLogger.toggle';
    context.subscriptions.push(statusBarItem);
    updateStatusBar();

    // 3. Register listeners
    registerNotebookStructureListener(context);
    registerCellContentListener(context);
}

/** Updates the visual state of the Status Bar item based on the active state. */
function updateStatusBar() {
    if (isEnabled) {
        statusBarItem.text = `$(record) Logger: ON`;
        statusBarItem.tooltip = `Click to disable notebook logging`;
        statusBarItem.backgroundColor = undefined; 
    } else {
        statusBarItem.text = `$(circle-slash) Logger: OFF`;
        statusBarItem.tooltip = `Click to enable notebook logging`;
        // Highlights the status bar button amber/yellow to denote it's paused
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    statusBarItem.show();
}

export function deactivate() {}

// --------------------------------------------------------------------------
// Shared helpers
// --------------------------------------------------------------------------

/** Concise, chronological millisecond epoch timestamp. */
function now(): number {
    return Date.now();
}

/** Short cell identifier, taken strictly from the cell uri fragment (e.g. `ch4~00002`). */
function cellId(uri: vscode.Uri): string {
    return uri.fragment;
}

/** Map CellKind enum to the `code` / `markup` token. */
function cellType(kind: vscode.NotebookCellKind): 'code' | 'markup' {
    return kind === vscode.NotebookCellKind.Code ? 'code' : 'markup';
}

/** Resolve the on-disk log file path for a notebook, suffixed by the given log kind. */
function logFilePath(notebookUri: vscode.Uri, suffix: string): string | undefined {
    if (notebookUri.scheme !== 'file') return undefined;
    const dir = path.dirname(notebookUri.fsPath);
    const base = path.basename(notebookUri.fsPath, path.extname(notebookUri.fsPath));
    return path.join(dir, `${base}_${suffix}.json`);
}

// --------------------------------------------------------------------------
// Debounce buffer: per-log-type history of the last few records. A record whose
// content (timestamp excluded) still sits in the buffer is muted, suppressing
// duplicate logs from rapid repeat events.
// --------------------------------------------------------------------------

const BUFFER_SIZE = 5;
/** filePath -> ring buffer of recent record signatures (timestamp stripped). */
const logBuffers = new Map<string, string[]>();

/** Signature of a record excluding its `timeStamp`, used for duplicate detection. */
function recordSignature(record: unknown): string {
    if (record && typeof record === 'object') {
        const { timeStamp, ...rest } = record as Record<string, unknown>;
        return JSON.stringify(rest);
    }
    return JSON.stringify(record);
}

/** Append a single record as one JSON line; creates the file if absent. */
function appendRecord(filePath: string | undefined, record: unknown): void {
    if (!filePath) return;

    // Mute if an identical record (ignoring timestamp) is still in the buffer.
    const signature = recordSignature(record);
    const buffer = logBuffers.get(filePath) ?? [];
    if (buffer.includes(signature)) return;

    buffer.push(signature);
    if (buffer.length > BUFFER_SIZE) buffer.shift();
    logBuffers.set(filePath, buffer);

    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
}

function logStructure(notebookUri: vscode.Uri, record: unknown): void {
    appendRecord(logFilePath(notebookUri, 'structure_changes'), record);
}

function logContent(notebookUri: vscode.Uri, record: unknown): void {
    appendRecord(logFilePath(notebookUri, 'content_changes'), record);
}

/** * Minimized snapshot of cell runtime outputs.
 * Correctly handles plaintext, rich HTML/JSON tables, and binary images.
 */
function snapshotOutputs(cell: vscode.NotebookCell): unknown[] {
    const out: unknown[] = [];
    for (const o of cell.outputs) {
        for (const item of o.items) {
            const isImage = item.mime.startsWith('image/') && !item.mime.includes('svg');
            out.push({
                mime: item.mime,
                data: Buffer.from(item.data).toString(isImage ? 'base64' : 'utf8')
            });
        }
    }
    return out;
}

// --------------------------------------------------------------------------
// Listener 1: structural notebook changes
// --------------------------------------------------------------------------

/**
 * Monitors structural variations and classifies them into the structural
 * tokens: insert, delete, move, language_change, execute.
 */
function registerNotebookStructureListener(context: vscode.ExtensionContext) {
    // State cache tracking the last recorded outputs to debounce identical rapid streams
    const lastExecutionCache = new Map<string, { timestamp: number; outputsJson: string }>();

    context.subscriptions.push(
        vscode.workspace.onDidChangeNotebookDocument(e => {
            // Early exit if logging is disabled
            if (!isEnabled) return;

            const notebookUri = e.notebook.uri;

            // A move surfaces as a removal and an addition in *separate* contentChanges
            // entries of the same event, so the move-matching fragment sets must span
            // the whole event rather than a single change.
            const addedFragments = new Set(
                e.contentChanges.flatMap(c => c.addedCells.map(cell => cellId(cell.document.uri)))
            );
            const removedFragments = new Set(
                e.contentChanges.flatMap(c => c.removedCells.map(cell => cellId(cell.document.uri)))
            );

            // A language change surfaces (like a move) as a paired removal + addition, but
            // the cell keeps its text content while its language id changes. So instead of
            // matching on uri we map content text -> set of language ids seen on each side,
            // event-wide, and treat a content match across sides with differing language as
            // a language change.
            const langsByContent = (cells: readonly vscode.NotebookCell[]) => {
                const map = new Map<string, Set<string>>();
                for (const cell of cells) {
                    const text = cell.document.getText();
                    const langs = map.get(text) ?? map.set(text, new Set()).get(text)!;
                    langs.add(cell.document.languageId);
                }
                return map;
            };
            const addedLangs = langsByContent(e.contentChanges.flatMap(c => c.addedCells));
            const removedLangs = langsByContent(e.contentChanges.flatMap(c => c.removedCells));
            /** True if `counterpart` holds a same-content cell whose language differs. */
            const isLanguageChange = (counterpart: Map<string, Set<string>>, cell: vscode.NotebookCell) => {
                const langs = counterpart.get(cell.document.getText());
                return !!langs && [...langs].some(l => l !== cell.document.languageId);
            };

            for (const change of e.contentChanges) {
                const added = change.addedCells;
                const removed = change.removedCells;
                const start = change.range.start;

                // 1. Process Removals
                removed.forEach((cell, i) => {
                    const isMove = addedFragments.has(cellId(cell.document.uri));
                    if (!isMove && !isLanguageChange(addedLangs, cell)) {
                        logStructure(notebookUri, {
                            timeStamp: now(),
                            cellUri: cellId(cell.document.uri),
                            cellIndex: start + i,
                            changeType: 'delete',
                            cellType: cellType(cell.kind),
                            executeOutput: null,
                        });
                    }
                });

                // 2. Process Additions
                added.forEach((cell, i) => {
                    // A language change keeps content but swaps language, and may even reuse
                    // the cell uri, so it is checked before move (a move keeps its language).
                    const isLangChange = isLanguageChange(removedLangs, cell);
                    const isMove = !isLangChange && removedFragments.has(cellId(cell.document.uri));
                    const changeType = isLangChange ? 'language_change' : isMove ? 'move' : 'insert';

                    logStructure(notebookUri, {
                        timeStamp: now(),
                        cellUri: cellId(cell.document.uri),
                        cellIndex: start + i,
                        changeType,
                        cellType: cellType(cell.kind),
                        executeOutput: null,
                    });

                    // Trigger dual-log routine for text contents only on new insertions
                    if (changeType === 'insert') {
                        const text = cell.document.getText();
                        if (text.length > 0) {
                            logContent(notebookUri, {
                                timeStamp: now(),
                                cellUri: cellId(cell.document.uri),
                                contentChanges: [
                                    {
                                        range: {
                                            start: { line: 0, character: 0 },
                                            end: { line: 0, character: 0 },
                                        },
                                        rangeOffset: 0,
                                        rangeLength: 0,
                                        text,
                                    },
                                ],
                            });
                        }
                    }
                });
            }

            // Execution / output updates surface through cellChanges.
            for (const cc of e.cellChanges) {
                if (cc.executionSummary !== undefined || cc.outputs !== undefined) {
                    const cellUriStr = cellId(cc.cell.document.uri);
                    const currentOutputs = snapshotOutputs(cc.cell);
                    if (currentOutputs.length === 0) {
                        continue;
                    }
                    const currentOutputsJson = JSON.stringify(currentOutputs);
                    const cacheEntry = lastExecutionCache.get(cellUriStr);

                    if (cacheEntry && (now() - cacheEntry.timestamp < 1000) && cacheEntry.outputsJson === currentOutputsJson) {
                        continue;
                    }
                    lastExecutionCache.set(cellUriStr, { timestamp: now(), outputsJson: currentOutputsJson });

                    logStructure(notebookUri, {
                        timeStamp: now(),
                        cellUri: cellUriStr,
                        cellIndex: cc.cell.index,
                        changeType: 'execute',
                        cellType: cellType(cc.cell.kind),
                        executeOutput: currentOutputs,
                    });
                }
            }
        })
    );
}

// --------------------------------------------------------------------------
// Listener 2: granular cell text edits
// --------------------------------------------------------------------------

/**
 * Captures rapid text edits inside individual cell editors and streams them to
 * the content change log.
 */
function registerCellContentListener(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            // Early exit if logging is disabled
            if (!isEnabled) return;

            const uri = e.document.uri;

            // Filter: only cell-scoped documents are of interest.
            if (uri.scheme !== 'vscode-notebook-cell') return;

            const parent = vscode.workspace.notebookDocuments.find(nb =>
                nb.getCells().some(cell => cell.document.uri.toString() === uri.toString())
            );
            if (!parent) return;

            logContent(parent.uri, {
                timeStamp: now(),
                cellUri: cellId(uri),
                contentChanges: e.contentChanges.map(c => ({
                    range: {
                        start: { line: c.range.start.line, character: c.range.start.character },
                        end: { line: c.range.end.line, character: c.range.end.character },
                    },
                    rangeOffset: c.rangeOffset,
                    rangeLength: c.rangeLength,
                    text: c.text,
                })),
            });
        })
    );
}