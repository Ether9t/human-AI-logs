import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import createPlotlyComponentModule from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

const GROUP_COLORS = [
  "#7c3aed", "#2563eb", "#059669", "#dc2626",
  "#d97706", "#0891b2", "#be185d", "#4f46e5",
];

function getGroupColor(groupId) {
  if (!groupId) return "#999";
  return GROUP_COLORS[(groupId - 1) % GROUP_COLORS.length];
}

const createPlotlyComponent =
  createPlotlyComponentModule.default || createPlotlyComponentModule;

const Plot = createPlotlyComponent(Plotly);
import "./App.css";

const DATA_ROOT = "/data";
const DEFAULT_DATASET = "";

function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to read ${path}`);
  return res.text();
}

async function readJson(path) {
  const text = await readText(path);
  return JSON.parse(text);
}

async function discoverDatasets() {
  try {
    const list = await readJson(`${DATA_ROOT}/index.json`);
    return Array.isArray(list) && list.length ? list : [DEFAULT_DATASET];
  } catch {
    return [DEFAULT_DATASET];
  }
}

function extractMessageText(content) {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if (part.type === "text") return part.text || "";
        return "";
      })
      .filter(Boolean)
      .join("");
  }

  if (content && typeof content === "object") {
    return content.text || content.thinking || JSON.stringify(content, null, 2);
  }

  return "";
}

function normalizeChat(fullJsonl) {
  return fullJsonl
    .map((item, index) => {
      const role =
        item.role ||
        item.type ||
        item.speaker ||
        item.message?.role ||
        item.author?.role;

      const rawContent =
        item.content ??
        item.message?.content ??
        item.text ??
        item.message ??
        item.prompt ??
        item.response ??
        "";

      const text = extractMessageText(rawContent);
      const time =
        item.timestamp ||
        item.time ||
        item.created_at ||
        item.createdAt ||
        item.message?.timestamp;

      if (!role || !text.trim()) return null;

      const roleText = String(role).toLowerCase();
      const normalizedRole =
        roleText.includes("user") || roleText.includes("human")
          ? "user"
          : "assistant";

      return {
        id: item.id || item.uuid || `chat-${index}`,
        role: normalizedRole,
        text,
        time,
      };
    })
    .filter(Boolean);
}

function normalizeNotebookStructureChanges(structureJsonl) {
  return structureJsonl
    .map((item, index) => {
      const timestamp =
        item.timestamp ||
        item.time ||
        item.created_at ||
        item.createdAt ||
        item.timeStamp;

      const cellId =
        item.cellUri ||
        item.cellId ||
        item.cell_id ||
        `cell-${item.cellIndex ?? index}`;

      return {
        id: item.id || `${cellId}-${item.changeType || "structure"}-${index}`,
        kind: "notebook",
        source: "structure",
        timestamp,
        changeType: item.changeType || "structure",
        cellId,
        cellIndex: item.cellIndex ?? item.cell_index,
        cellType: item.cellType || item.cell_type,
        executeOutput: item.executeOutput || null,
      };
    })
    .filter((item) => item.timestamp && item.cellId);
}

function applyContentChanges(text, contentChanges = []) {
  let nextText = String(text || "");

  const changes = [...contentChanges].sort((a, b) => {
    const ao = a.rangeOffset ?? 0;
    const bo = b.rangeOffset ?? 0;
    return bo - ao;
  });

  for (const change of changes) {
    const offset = change.rangeOffset ?? 0;
    const length = change.rangeLength ?? 0;
    const insertText = change.text ?? "";

    nextText =
      nextText.slice(0, offset) +
      insertText +
      nextText.slice(offset + length);
  }

  return nextText;
}

function normalizeNotebookContentChanges(changesJsonl) {
  return changesJsonl
    .map((item, index) => {
      const timestamp =
        item.timestamp ||
        item.time ||
        item.created_at ||
        item.createdAt ||
        item.timeStamp;

      const cellId =
        item.cellUri ||
        item.cellId ||
        item.cell_id ||
        `cell-${item.cellIndex ?? index}`;

      return {
        id: item.id || `${cellId}-content-${index}`,
        kind: "notebook",
        source: "content",
        timestamp,
        cellId,
        cellIndex: item.cellIndex ?? item.cell_index,
        contentChanges: item.contentChanges || [],
      };
    })
    .filter((item) => item.timestamp && item.cellId);
}

function formatTime(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getTimeMs(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}


function buildReplaySteps(chat, notebookChanges) {
  const items = [
    ...chat.map((message, order) => ({ ...message, kind: "chat", order })),
    ...notebookChanges.map((change, order) => ({
      ...change,
      kind: "notebook",
      order,
    })),
  ].sort((a, b) => {
    const at = getTimeMs(a.timestamp || a.time);
    const bt = getTimeMs(b.timestamp || b.time);
    return at - bt;
  });

  const chatTurnWindows = [];
  let activeGroupId = 0;
  let activeUserTime = null;

  for (const item of items) {
    if (item.kind !== "chat") continue;

    if (item.role === "user") {
      activeGroupId += 1;
      activeUserTime = item.time || item.timestamp;
      item.groupId = activeGroupId;

      const previousWindow = chatTurnWindows[chatTurnWindows.length - 1];
      if (previousWindow && !previousWindow.endMs) {
        previousWindow.endMs = getTimeMs(activeUserTime);
      }
    }

    if (item.role === "assistant") {
      if (activeGroupId === 0) activeGroupId += 1;

      const assistantTime = item.time || item.timestamp;
      item.groupId = activeGroupId;

      chatTurnWindows.push({
        groupId: activeGroupId,
        userTime: activeUserTime,
        assistantTime,
        startMs: getTimeMs(assistantTime || activeUserTime),
        endMs: null,
      });
    }
  }

  function findGroupForNotebookChange(change) {
    const changeMs = getTimeMs(change.timestamp || change.time);
    if (!changeMs) return null;

    const candidates = chatTurnWindows
      .filter((turn) => {
        const startMs = turn.startMs || 0;
        const endMs = turn.endMs || Number.POSITIVE_INFINITY;

        return startMs > 0 && startMs <= changeMs && changeMs < endMs;
      })
      .sort((a, b) => b.startMs - a.startMs);

    return candidates[0]?.groupId || null;
  }

  const cells = [];
  const cellMap = new Map();
  const messages = [];
  const steps = [];
  let userEditId = 0;
  const deletedCellByIndex = new Map();

  const ensureCell = (change) => {
    const id = change.cellId;

    if (!cellMap.has(id)) {
      const cell = {
        id,
        cellIds: [],
        index: change.cellIndex ?? Number.MAX_SAFE_INTEGER,
        cellType: change.cellType || "unknown",
        content: "",
        output: null,
        deleted: false,

        lineage: {
          origin: null,
          edits: [],
        },

        touchedGroupIds: [],
      };

      cellMap.set(id, cell);
      cells.push(cell);
    }

    const cell = cellMap.get(id);
    if (change.cellId && !cell.cellIds.includes(change.cellId)) {
      cell.cellIds.push(change.cellId);
    }

    if (change.source === "structure" && change.cellIndex != null) {
      cell.index = change.cellIndex;
    }

    if (change.source === "structure" && change.cellType) {
      cell.cellType = change.cellType;
    }

    return cell;
  };

  const addTouchedGroup = (cell, groupId) => {
    if (!groupId) return;

    cell.touchedGroupIds = Array.from(
      new Set([...(cell.touchedGroupIds || []), groupId])
    );
  };

  const addLineageEvent = (cell, event) => {
    const allEvents = [
      ...(cell.lineage.origin ? [cell.lineage.origin] : []),
      ...cell.lineage.edits,
    ];

    const exists = allEvents.some((e) => e.id === event.id);

    if (exists) return;

    if (!cell.lineage.origin) {
      cell.lineage.origin = {
        ...event,
        type: event.actor === "ai" ? "origin-ai" : "origin-user",
        label:
          event.actor === "ai"
            ? `Origin AI #${event.groupId}`
            : `Origin User #${event.userEditId}`,
      };
    } else {
      cell.lineage.edits.push({
        ...event,
        type: event.actor === "ai" ? "ai-edit" : "user-edit",
        label:
          event.actor === "ai"
            ? `AI Edit #${event.groupId}`
            : `User Edit #${event.userEditId}`,
      });
    }

    if (event.groupId) {
      addTouchedGroup(cell, event.groupId);
    }
  };

  let sequenceIndex = 0;
  let currentChatTurnIndex = null;
  let lastNotebookCellId = null;

  const pushStep = (item, label) => {
    if (item.kind === "chat") {
      if (item.role === "user") {
        sequenceIndex += 1;
        currentChatTurnIndex = sequenceIndex;
      }

      if (item.role === "assistant" && currentChatTurnIndex == null) {
        sequenceIndex += 1;
        currentChatTurnIndex = sequenceIndex;
      }

      messages[messages.length - 1].sequenceNumbers = [currentChatTurnIndex];
    }

    if (item.kind === "notebook") {
      const isReenteringBlock = item.cellId !== lastNotebookCellId;

      if (isReenteringBlock) {
        sequenceIndex += 1;
        lastNotebookCellId = item.cellId;
      }

      const activeCell = cellMap.get(item.cellId);

      if (activeCell && isReenteringBlock) {
        activeCell.sequenceNumbers = [
          ...(activeCell.sequenceNumbers || []),
          sequenceIndex,
        ];
      }
    }

    steps.push({
      sequenceIndex,
      label,
      time: item.timestamp || item.time,
      activeCellId: item.cellId || null,
      activeMessageId: item.kind === "chat" ? item.id : null,

      cells: [...cells]
        .filter((cell) => !cell.deleted)
        .sort((a, b) => {
          const ai = a.index;
          const bi = b.index;

          if (ai !== bi) return ai - bi;

          return String(a.id).localeCompare(String(b.id));
        })
        .map((cell) => ({
          ...cell,
          cellIds: [...(cell.cellIds || [])],
          lineage: {
            origin: cell.lineage?.origin
              ? { ...cell.lineage.origin }
              : null,

            edits: [...(cell.lineage?.edits || [])],
          },
          touchedGroupIds: [...(cell.touchedGroupIds || [])],
          sequenceNumbers: [...(cell.sequenceNumbers || [])],
          output: Array.isArray(cell.output)
            ? cell.output.map((out) => ({ ...out }))
            : cell.output,
        })),

      messages: messages.map((message) => ({
        ...message,
        sequenceNumbers: [...(message.sequenceNumbers || [])],
      })),
    });
  };

  for (const item of items) {
    if (item.kind === "chat") {
      messages.push(item);
      pushStep(item, item.role === "user" ? "User prompt" : "AI response");
      continue;
    }

    const cell = ensureCell(item);
    const matchedGroupId = findGroupForNotebookChange(item);
    const type = String(item.changeType || "").toUpperCase();

    if (item.source === "content") {
      const beforeContent = cell.content || "";
      const afterContent = applyContentChanges(
        cell.content,
        item.contentChanges || []
      );

      const changed = beforeContent !== afterContent;
      cell.content = afterContent;

      if (!changed) {
        pushStep(item, "CONTENT NOOP");
        continue;
      }

      const isCreation = !cell.lineage.origin;

      if (matchedGroupId) {
        addLineageEvent(cell, {
          id: item.id,
          actor: "ai",
          groupId: matchedGroupId,
          userEditId: null,
          timestamp: item.timestamp || item.time,
        });
      } else {
        userEditId += 1;

        addLineageEvent(cell, {
          id: item.id,
          actor: "user",
          groupId: null,
          userEditId,
          timestamp: item.timestamp || item.time,
        });
      }

      pushStep(item, isCreation ? "CREATE CONTENT" : "CONTENT EDIT");
      continue;
    }

    if (type.includes("DELETE")) {
      cell.deleted = true;

      if (item.cellIndex != null) {
        deletedCellByIndex.set(String(item.cellIndex), cell);
      }
    } else if (type.includes("INSERT")) {
      if (item.cellIndex != null) {
        const previousCell = deletedCellByIndex.get(String(item.cellIndex));

        if (
          previousCell &&
          previousCell.id !== cell.id &&
          previousCell.lineage?.origin &&
          !cell.lineage?.origin
        ) {
          cell.lineage = {
            origin: previousCell.lineage.origin
              ? { ...previousCell.lineage.origin }
              : null,
            edits: [...(previousCell.lineage.edits || [])],
          };

          cell.touchedGroupIds = [...(previousCell.touchedGroupIds || [])];
        }

        deletedCellByIndex.delete(String(item.cellIndex));
      }

      cell.deleted = false;
    } else if (type.includes("EXECUTE")) {
      cell.deleted = false;
      cell.output = item.executeOutput || item.output || null;
    } else if (type.includes("OUTPUT")) {
      cell.output = item.executeOutput || item.output || null;
    }

    pushStep(item, type.replaceAll("_", " ") || "STRUCTURE");
  }

  return steps;
}

function NotebookOutput({ output }) {
  const outputs = Array.isArray(output) ? output : output ? [output] : [];

  if (!outputs.length) return null;

  return (
    <>
      {outputs.map((out, index) => {
        if (!out) return null;

        if (out.mime === "image/png") {
          return (
            <img
              key={index}
              className="output-image"
              src={`data:image/png;base64,${out.data}`}
              alt="notebook output"
            />
          );
        }

        if (out.mime === "text/html") {
          return (
            <div
              key={index}
              className="output html-output"
              dangerouslySetInnerHTML={{ __html: out.data }}
            />
          );
        }

        if (out.mime === "text/plain") {
          return (
            <pre key={index} className="output-text">
              {out.data}
            </pre>
          );
        }

        if (out.mime === "application/vnd.plotly.v1+json") {
          const fig =
            typeof out.data === "string" ? JSON.parse(out.data) : out.data;

          return (
            <div key={index} className="output plotly-output">
              <Plot
                data={fig.data || []}
                layout={{
                  ...(fig.layout || {}),
                  autosize: true,
                  height: 420,
                }}
                config={{
                  responsive: true,
                  displayModeBar: false,
                }}
                useResizeHandler
                style={{
                  width: "100%",
                  height: "420px",
                }}
              />
            </div>
          );
        }

        return (
          <pre key={index} className="output-text">
            {typeof out.data === "string"
              ? out.data
              : JSON.stringify(out.data, null, 2)}
          </pre>
        );
      })}
    </>
  );
}

function NotebookCell({ cell, active, selectedGroupId, onSelectGroup }) {
  const isMarkdown = cell.cellType === "markup" || cell.cellType === "markdown";

  const lineageEvents = [
    cell.lineage?.origin,
    ...(cell.lineage?.edits || []),
  ].filter(Boolean);

  const touchedGroupIds = cell.touchedGroupIds || [];
  const isGroupSelected =
    selectedGroupId && touchedGroupIds.includes(selectedGroupId);

  const selectedColor = selectedGroupId
    ? getGroupColor(selectedGroupId)
    : null;

  return (
    <div
      className={[
        "code-cell",
        isMarkdown ? "markdown-cell" : "",
        active ? "is-active" : "",
        isGroupSelected ? "is-group-selected" : "",
        selectedGroupId && !isGroupSelected ? "is-group-dimmed" : "",
      ].join(" ")}
      style={
        selectedColor
          ? { "--selected-group-color": selectedColor }
          : undefined
      }
    >
      <div className="code-badge-row">
        <div className="event-badge-list">
          {lineageEvents.map((event, index) => {
            const color = event.groupId
              ? getGroupColor(event.groupId)
              : "#6b7280";

            return (
              <button
                key={event.id || index}
                type="button"
                className={`event-badge ${event.groupId ? "clickable" : "user-edit"
                  }`}
                style={{ background: color }}
                onClick={(e) => {
                  e.stopPropagation();

                  if (event.groupId) {
                    onSelectGroup(event.groupId);
                  }
                }}
              >
                {event.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cell-prompt">
        {isMarkdown ? "MD" : `In [${cell.index + 1}]`}
      </div>

      {isMarkdown ? (
        <div className="markdown-content">
          <ReactMarkdown>{cell.content}</ReactMarkdown>
        </div>
      ) : (
        <pre className="code-pre">
          <code>{cell.content}</code>
        </pre>
      )}

      <NotebookOutput output={cell.output} />
    </div>
  );
}

function ChatMessage({ message, active, selectedGroupId, onSelectGroup }) {
  const groupId = message.groupId;
  const groupColor = getGroupColor(groupId);

  const isGroupSelected = selectedGroupId && selectedGroupId === groupId;

  return (
    <div
      className={[
        "chat-message",
        message.role,
        active ? "is-active" : "",
        isGroupSelected ? "is-group-selected" : "",
        selectedGroupId && !isGroupSelected ? "is-group-dimmed" : "",
      ].join(" ")}
      data-group-id={groupId || ""}
      style={{ "--group-color": groupColor }}
    >
      <div className="chat-role">{message.role === "user" ? "User" : "AI"}</div>

      <div className="chat-bubble">
        <div className="event-badge-list">
          {groupId && (
            <button
              type="button"
              className="event-badge clickable"
              style={{ background: groupColor }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectGroup(groupId);
              }}
            >
              #{groupId}
            </button>
          )}
        </div>

        <div className="chat-time">{formatTime(message.time)}</div>
        <div className="chat-text">{message.text}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [datasets, setDatasets] = useState([DEFAULT_DATASET]);
  const [dataset, setDataset] = useState(DEFAULT_DATASET);
  const [chat, setChat] = useState([]);
  const [changes, setChanges] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const handleSelectGroup = (groupId) => {
    setSelectedGroupId((current) => (current === groupId ? null : groupId));
  };

  useEffect(() => {
    discoverDatasets().then((names) => {
      setDatasets(names);
      setDataset(names[0]);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDataset() {
      setStatus("loading");
      setError("");
      setStepIndex(0);

      try {
        const base = `${DATA_ROOT}/${encodeURIComponent(dataset)}`;
        const [fullText, contentChangesText, structureChangesText] =
          await Promise.all([
            readText(`${base}/full.jsonl`),
            readText(`${base}/notebook_content_changes.jsonl`),
            readText(`${base}/notebook_structure_changes.jsonl`),
          ]);

        if (cancelled) return;

        setChat(normalizeChat(parseJsonl(fullText)));
        setChanges([
          ...normalizeNotebookContentChanges(parseJsonl(contentChangesText)),
          ...normalizeNotebookStructureChanges(parseJsonl(structureChangesText)),
        ]);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setStatus("error");
      }
    }

    if (dataset) loadDataset();
    return () => {
      cancelled = true;
    };
  }, [dataset]);

  const steps = useMemo(() => buildReplaySteps(chat, changes), [chat, changes]);
  const currentStep = steps[stepIndex] || {
    cells: [],
    messages: [],
    label: "No data",
  };
  const progressRatio = steps.length <= 1 ? 0 : (stepIndex / (steps.length - 1)) * 100;
  const SPEED_OPTIONS = [5, 10, 20];
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(10);
  useEffect(() => {
    if (!isPlaying || steps.length <= 1) return;
    const delay = 1000 / playbackSpeed;
    const timer = setInterval(() => {
      setStepIndex((value) => {
        if (value >= steps.length - 1) {
          setIsPlaying(false);
          return value;
        }
        return value + 1;
      });
    }, delay);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, steps.length]);

  return (
    <div className="App">
      <div className="container">
        <main className="main-panel">
          <header className="header-row">
            <div className="dataset-picker">
              <label htmlFor="dataset">Dataset</label>
              <select
                id="dataset"
                value={dataset}
                onChange={(event) => setDataset(event.target.value)}
              >
                {datasets.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="session-identifier">
              {status === "loading" && "Loading Data/..."}
              {status === "ready" && `${dataset} · ${stepIndex + 1}/${Math.max(steps.length, 1)} · ${currentStep.label}`}
              {status === "error" && `Error: ${error}`}
            </div>
          </header>
          <section className="playback-row">
            <div className="playback-panel">
              <div className="playback-controls">
                <button
                  type="button"
                  className="play-button"
                  onClick={() => setIsPlaying((value) => !value)}
                  aria-label="Play or pause"
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>
              </div>

              <div className="speed-controls">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={`speed-pill ${playbackSpeed === speed ? "selected" : ""}`}
                    onClick={() => setPlaybackSpeed(speed)}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>

            <div className="progress-container">
              <input
                className="progress-slider"
                style={{ "--progress-ratio": `${progressRatio}%` }}
                type="range"
                min="0"
                max={Math.max(0, steps.length - 1)}
                value={stepIndex}
                onChange={(event) => setStepIndex(Number(event.target.value))}
              />
              <span className="progress-label">{Math.round(progressRatio)}%</span>
            </div>
          </section>
          <section className="display-box">
            <section className="replay-panel notebook-panel">
              <div className="section-title">Notebook</div>
              <div className="panel-scroll notebook-scroll">
                {currentStep.cells.length ? (
                  currentStep.cells.map((cell) => (
                    <NotebookCell
                      key={cell.id}
                      cell={cell}
                      active={cell.id === currentStep.activeCellId}
                      selectedGroupId={selectedGroupId}
                      onSelectGroup={handleSelectGroup}
                    />
                  ))
                ) : (
                  <div className="empty-state">No Code Blocks</div>
                )}
              </div>
            </section>

            <section className="replay-panel chat-panel">
              <div className="section-title">AI Chat</div>
              <div className="panel-scroll chat-scroll">
                {currentStep.messages.length ? (
                  currentStep.messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      active={message.id === currentStep.activeMessageId}
                      selectedGroupId={selectedGroupId}
                      onSelectGroup={handleSelectGroup}
                    />
                  ))
                ) : (
                  <div className="empty-state">No AI Interactions</div>
                )}
              </div>
            </section>
          </section>
        </main>
      </div>
    </div>
  );
}