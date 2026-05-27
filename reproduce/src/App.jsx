import React, { useEffect, useMemo, useState } from "react";
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

function normalizeNotebookChanges(changesJsonl) {
  return changesJsonl
    .map((item, index) => ({
      id: item.id || `change-${index}`,
      kind: "notebook",
      timestamp: item.timestamp || item.time || item.created_at || item.createdAt,
      changeType: item.changeType || item.type || item.action || "CHUNK_INSERT",
      cellId: item.cellId || item.cell_id || `cell-${item.cellIndex ?? index}`,
      cellIndex: item.cellIndex ?? item.cell_index ?? index,
      content: item.content || item.text || item.source || item.code || "",
    }))
    .filter((item) => item.timestamp || item.content);
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

function buildReplaySteps(chat, notebookChanges) {
  const items = [
    ...chat.map((message, order) => ({ ...message, kind: "chat", order })),
    ...notebookChanges.map((change, order) => ({ ...change, kind: "notebook", order })),
  ].sort((a, b) => {
    const at = new Date(a.timestamp || a.time || 0).getTime();
    const bt = new Date(b.timestamp || b.time || 0).getTime();
    return at - bt;
  });

  const cells = [];
  const cellMap = new Map();
  const messages = [];
  const steps = [];

  const ensureCell = (change) => {
    const id = change.cellId;
    if (!cellMap.has(id)) {
      const cell = {
        id,
        index: change.cellIndex ?? cells.length,
        content: "",
      };
      cellMap.set(id, cell);
      cells.push(cell);
      cells.sort((a, b) => a.index - b.index);
    }
    return cellMap.get(id);
  };

  let sequenceIndex = 0;
  let currentChatTurnIndex = null;
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
      sequenceIndex += 1;

      const activeCell = cellMap.get(item.cellId);

      if (activeCell) {
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

      cells: cells
        .map((cell, index) => ({
          ...cell,
          viewIndex: index,
        }))
        .filter((cell) => cell.content.trim()),

      messages: messages.map((message) => ({ ...message })),
    });
  };

  for (const item of items) {
    if (item.kind === "chat") {
      messages.push(item);
      pushStep(item, item.role === "user" ? "User prompt" : "AI response");
      continue;
    }

    const cell = ensureCell(item);
    const type = String(item.changeType).toUpperCase();

    if (type.includes("DELETE")) {
      cell.content = "";
    } else if (type.includes("REPLACE")) {
      cell.content = item.content || "";
    } else {
      cell.content += item.content || "";
    }

    pushStep(item, type.replaceAll("_", " "));
  }

  return steps;
}

function CodeCell({ cell, active }) {
  return (
    <div className={`code-cell ${active ? "is-active" : ""}`}>

      <div className="code-badge-row">
        <div className="event-badge-list">
          {(cell.sequenceNumbers || []).map((number) => (
            <span key={number} className="event-badge">
              #{number}
            </span>
          ))}
        </div>
      </div>

      <div className="cell-prompt">
        In [{cell.viewIndex + 1}]
      </div>

      <pre className="code-pre">
        <code>{cell.content}</code>
      </pre>
    </div>
  );
}

function ChatMessage({ message, active }) {
  return (
    <div className={`chat-message ${message.role} ${active ? "is-active" : ""}`}>
      <div className="chat-role">{message.role === "user" ? "User" : "AI"}</div>
      <div className="chat-bubble">
        <div className="event-badge-list">
          {(message.sequenceNumbers || []).map((number) => (
            <span key={number} className="event-badge">
              #{number}
            </span>
          ))}
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
        const [fullText, changesText] = await Promise.all([
          readText(`${base}/full.jsonl`),
          readText(`${base}/notebook_changes.jsonl`),
        ]);

        if (cancelled) return;

        setChat(normalizeChat(parseJsonl(fullText)));
        setChanges(normalizeNotebookChanges(parseJsonl(changesText)));
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
  const SPEED_OPTIONS = [10, 50, 100];
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
          </header>

          <div className="session-identifier">
            {status === "loading" && "Loading Data/..."}
            {status === "ready" && `${dataset} · ${stepIndex + 1}/${Math.max(steps.length, 1)} · ${currentStep.label}`}
            {status === "error" && `Error: ${error}`}
          </div>
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
                    <CodeCell
                      key={cell.id}
                      cell={cell}
                      active={cell.id === currentStep.activeCellId}
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