#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const https = require("node:https");

/*
 * ============================================================================
 * Configuration
 * ============================================================================
 */

const GITHUB_OWNER = "Ether9t";
const GITHUB_REPOSITORY = "human-AI-logs";
const GITHUB_BRANCH = "experiment-assets";
const DEFAULT_CLAUDE_COMMAND = "claude";
const ALLOWED_TASKS = new Set(["1", "2", "3", "4"]);
const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdaCvdUWmtRe63B_qdVQ4mgnF6up7fLhG5evbR4IrcIVPF4oA/viewform";

/*
 * ============================================================================
 * ANSI terminal formatting
 * ============================================================================
 */

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m"
};

function style(text, ...codes) {
  return `${codes.join("")}${text}${ANSI.reset}`;
}

/*
 * ============================================================================
 * Paths
 * ============================================================================
 */

/**
 * claude-exp-launcher/
 * ├─ bin/
 * │  └─ claude-exp.js
 * └─ tasks/
 */
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function getTaskDirectory(taskNumber) {
  return path.join(PROJECT_ROOT, "tasks", `task ${taskNumber}`);
}

/*
 * ============================================================================
 * Argument handling
 * ============================================================================
 */

function printUsage() {
  console.log(`
${style("Usage", ANSI.bold)}

  claude-exp <task-number>

${style("Examples", ANSI.bold)}

  claude-exp 1
  claude-exp 2
  claude-exp 3
  claude-exp 4
`);
}

function getTaskNumber() {
  const taskNumber = process.argv[2];

  if (!taskNumber) {
    console.error(
      style("Error: A task number is required.", ANSI.red, ANSI.bold)
    );
    printUsage();
    process.exit(1);
  }

  if (!ALLOWED_TASKS.has(taskNumber)) {
    console.error(
      style(
        `Error: Task "${taskNumber}" is not available.`,
        ANSI.red,
        ANSI.bold
      )
    );
    printUsage();
    process.exit(1);
  }

  return taskNumber;
}

/*
 * ============================================================================
 * Chat parsing
 * ============================================================================
 */

function parseChatMarkdown(markdown) {
  const rolePattern =
    /<!--\s*role\s*:\s*(user|assistant)\s*-->\s*([\s\S]*?)(?=<!--\s*role\s*:\s*(?:user|assistant)\s*-->|$)/gi;

  const messages = [];
  let match;

  while ((match = rolePattern.exec(markdown)) !== null) {
    const role = match[1].toLowerCase();
    const content = match[2].trim();

    if (content) {
      messages.push({
        role,
        content
      });
    }
  }

  return messages;
}

/*
 * ============================================================================
 * Chat rendering
 * ============================================================================
 */

function printHorizontalLine(character = "─", width = 72) {
  console.log(style(character.repeat(width), ANSI.gray));
}

function renderMessage(message) {
  console.log();

  if (message.role === "user") {
    console.log(
      style(
        `❯ ${message.content.trim()}`,
        ANSI.bold
      )
    );
  } else {
    const lines = message.content.trim().split("\n");

    console.log(
      `${style("●", ANSI.bold)} ${lines[0]}`
    );

    if (lines.length > 1) {
      console.log();

      for (const line of lines.slice(1)) {
        console.log(`  ${line}`);
      }
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function renderHistory(markdown, taskNumber, taskDirectory) {
  console.clear();

  const width = 72;

  console.log(style("═".repeat(width), ANSI.cyan));
  console.log(
    style(
      "PREVIOUS AGENT SESSION".padStart(
        Math.floor((width + "PREVIOUS AGENT SESSION".length) / 2)
      ),
      ANSI.cyan,
      ANSI.bold
    )
  );
  console.log(style("═".repeat(width), ANSI.cyan));

  console.log();
  console.log(
    `${style("Task:", ANSI.bold)} ${taskNumber}`
  );
  console.log(
    `${style("Workspace:", ANSI.bold)} ${taskDirectory}`
  );

  const messages = parseChatMarkdown(markdown);

  if (messages.length === 0) {
    console.log();
    console.log(markdown.trim());

    console.log();
    await waitForEnter("Press ENTER to continue...");
  } else {
    renderMessage(messages[0]);

    console.log();
    await waitForEnter("Press ENTER to continue...");

    for (const message of messages.slice(1)) {
      renderMessage(message);
      await sleep(500);
    }
  }

  console.log();
  console.log(style("═".repeat(width), ANSI.cyan));
  console.log();
}

/*
 * ============================================================================
 * User input
 * ============================================================================
 */

function waitForEnter(
  prompt = "Press ENTER to continue..."
) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(
      style(prompt, ANSI.yellow, ANSI.bold),
      () => {
        rl.close();
        resolve();
      }
    );
  });
}

async function getClaudeSessionFiles(taskDirectory) {
  const claudeProjectsRoot = path.join(
    os.homedir(),
    ".claude",
    "projects"
  );

  const projectSlug = taskDirectory.replace(
    /[^a-zA-Z0-9]/g,
    "-"
  );

  const sourceDirectory = path.join(
    claudeProjectsRoot,
    projectSlug
  );

  try {
    const entries = await fsp.readdir(
      sourceDirectory,
      {
        withFileTypes: true
      }
    );

    return {
      sourceDirectory,
      files: new Set(
        entries
          .filter(
            entry =>
              entry.isFile() &&
              entry.name.endsWith(".jsonl")
          )
          .map(entry => entry.name)
      )
    };
  } catch {
    return {
      sourceDirectory,
      files: new Set()
    };
  }
}

async function saveNewClaudeLogs(
  taskNumber,
  taskDirectory,
  filesBefore
) {
  const {
    sourceDirectory,
    files: filesAfter
  } = await getClaudeSessionFiles(
    taskDirectory
  );

  const newFiles = [
    ...filesAfter
  ].filter(
    fileName =>
      !filesBefore.has(fileName)
  );

  if (newFiles.length === 0) {
    console.log();
    console.log(
      style(
        `No new Claude session file found for task ${taskNumber}.`,
        ANSI.yellow
      )
    );
    return;
  }

  const logsDirectory = path.join(
    PROJECT_ROOT,
    "logs",
    `task-${taskNumber}`
  );

  await fsp.mkdir(
    logsDirectory,
    {
      recursive: true
    }
  );

  for (const fileName of newFiles) {
    const sourcePath = path.join(
      sourceDirectory,
      fileName
    );

    const destinationPath = path.join(
      logsDirectory,
      fileName
    );

    await fsp.copyFile(
      sourcePath,
      destinationPath
    );
  }

  console.log();
  console.log(
    style(
      `Saved ${newFiles.length} new Claude session file(s) to logs/task-${taskNumber}/`,
      ANSI.green
    )
  );
}

/*
 * ============================================================================
 * Claude launcher
 * ============================================================================
 */

function launchClaude(taskDirectory) {
  return new Promise((resolve, reject) => {
    const command =
      process.env.CLAUDE_EXP_COMMAND ||
      DEFAULT_CLAUDE_COMMAND;

    console.log();
    console.log(
      style(
        `Launching ${command}...`,
        ANSI.green,
        ANSI.bold
      )
    );

    console.log(
      style(
        `Working directory: ${taskDirectory}`,
        ANSI.gray
      )
    );

    console.log();

    const child = spawn(command, [], {
      cwd: taskDirectory,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,

        ANTHROPIC_MODEL: "anthropic.claude-sonnet-5",

        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1"
      }
    });

    child.once("error", (error) => {
      reject(
        new Error(
          `Failed to start Claude: ${error.message}`
        )
      );
    });

    child.once("close", (code, signal) => {
      console.log();
      console.log(
        style(
          "Claude process has closed.",
          ANSI.gray
        )
      );

      if (signal) {
        reject(
          new Error(
            `Claude was terminated by signal: ${signal}`
          )
        );
        return;
      }

      resolve(code ?? 0);
    });
  });
}

/*
 * ============================================================================
 * Download
 * ============================================================================
 */

function downloadText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Request failed (${response.statusCode})\n${url}`
            )
          );
          return;
        }

        let data = "";

        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          resolve(data);
        });
      })
      .on("error", reject);
  });
}

function downloadBinary(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Request failed (${response.statusCode})\n${url}`
            )
          );
          return;
        }

        const chunks = [];

        response.on("data", (chunk) => {
          chunks.push(chunk);
        });

        response.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
      })
      .on("error", reject);
  });
}

function getChatUrl(taskNumber) {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/${GITHUB_BRANCH}/task%20${taskNumber}/chat.md`;
}

function getNotebookUrl(taskNumber) {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/${GITHUB_BRANCH}/task%20${taskNumber}/notebook.ipynb`;
}

async function fetchChatMarkdown(taskNumber) {
  console.log(style("Downloading chat history...", ANSI.gray));

  return await downloadText(getChatUrl(taskNumber));
}

async function downloadNotebook(taskNumber, taskDirectory) {
  const notebookPath = path.join(
    taskDirectory,
    "notebook.ipynb"
  );

  if (fs.existsSync(notebookPath)) {
    console.log(style("Notebook already exists.", ANSI.gray));
    return;
  }
  console.log(style("Downloading notebook...", ANSI.gray));

  fs.mkdirSync(taskDirectory, {
    recursive: true
  });

  const notebook = await downloadBinary(
    getNotebookUrl(taskNumber)
  );

  fs.writeFileSync(
    path.join(taskDirectory, "notebook.ipynb"),
    notebook
  );
}

function openUrl(url) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    if (process.platform === "win32") {
      command = "cmd";
      args = ["/c", "start", "", "chrome", url];
    } else if (process.platform === "darwin") {
      command = "open";
      args = ["-a", "Google Chrome", url];
    } else {
      command = "google-chrome";
      args = [url];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      shell: false
    });

    child.on("error", reject);

    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/*
 * ============================================================================
 * Main
 * ============================================================================
 */

async function main() {
  try {
    const taskNumber = getTaskNumber();
    const taskDirectory = getTaskDirectory(taskNumber);
    const chatMarkdown = await fetchChatMarkdown(taskNumber);

    await downloadNotebook(taskNumber, taskDirectory);
    await renderHistory(chatMarkdown, taskNumber, taskDirectory);
    await waitForEnter("Press ENTER to continue to Claude...");
    const {
      files: claudeFilesBefore
    } = await getClaudeSessionFiles(
      taskDirectory
    );

    await launchClaude(
      taskDirectory
    );

    await saveNewClaudeLogs(
      taskNumber,
      taskDirectory,
      claudeFilesBefore
    );

    console.log();
    console.log(
      style(
        "Claude session completed.",
        ANSI.green,
        ANSI.bold
      )
    );

    console.log();
    console.log(
      style(
        "Please complete the response form:",
        ANSI.cyan,
        ANSI.bold
      )
    );

    console.log();
    console.log(GOOGLE_FORM_URL);
    console.log();

    console.log(
      style(
        "Please complete and submit the current form section before starting the next task.",
        ANSI.yellow,
        ANSI.bold
      )
    );

    await waitForEnter(
      "After submitting the form, press ENTER to finish..."
    );
  } catch (error) {
    console.error();
    console.error(
      style("Unable to launch experiment task.", ANSI.red, ANSI.bold)
    );
    console.error(error.message);
    console.error();
    process.exit(1);
  }
}

main();