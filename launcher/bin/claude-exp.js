#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

/*
 * ============================================================================
 * Configuration
 * ============================================================================
 */

const DEFAULT_CLAUDE_COMMAND = "exp-claude";
const ALLOWED_TASKS = new Set(["1", "2", "3", "4"]);

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
 * Validation
 * ============================================================================
 */

function validateTaskFiles(taskDirectory) {
  if (!fs.existsSync(taskDirectory)) {
    throw new Error(`Task directory does not exist:\n${taskDirectory}`);
  }

  const taskStats = fs.statSync(taskDirectory);

  if (!taskStats.isDirectory()) {
    throw new Error(`Task path is not a directory:\n${taskDirectory}`);
  }

  const chatPath = path.join(taskDirectory, "chat.md");

  if (!fs.existsSync(chatPath)) {
    throw new Error(`chat.md was not found:\n${chatPath}`);
  }

  const chatStats = fs.statSync(chatPath);

  if (!chatStats.isFile()) {
    throw new Error(`chat.md is not a file:\n${chatPath}`);
  }

  return {
    chatPath
  };
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
    console.log(style("USER", ANSI.blue, ANSI.bold));
  } else {
    console.log(style("Agent", ANSI.green, ANSI.bold));
  }

  printHorizontalLine();

  console.log();
  console.log(message.content.trim());
}

function renderHistory(markdown, taskNumber, taskDirectory) {
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
  } else {
    for (const message of messages) {
      renderMessage(message);
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

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(
      style(
        "Press ENTER to continue to Claude...",
        ANSI.yellow,
        ANSI.bold
      ),
      () => {
        rl.close();
        resolve();
      }
    );
  });
}

/*
 * ============================================================================
 * Claude launcher
 * ============================================================================
 */

function launchClaude(taskDirectory) {
  const command =
    process.env.CLAUDE_EXP_COMMAND || DEFAULT_CLAUDE_COMMAND;

  console.log();
  console.log(
    style(`Launching ${command}...`, ANSI.green, ANSI.bold)
  );
  console.log(
    style(`Working directory: ${taskDirectory}`, ANSI.gray)
  );
  console.log();
  const child = spawn(command, [], {
    cwd: taskDirectory,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env
    }
  });

  child.on("error", (error) => {
    console.error();
    console.error(
      style("Failed to start Claude.", ANSI.red, ANSI.bold)
    );
    console.error(error.message);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(
        style(`Claude stopped because of signal: ${signal}`, ANSI.red)
      );
      process.exit(1);
    }

    process.exit(code ?? 0);
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
    const { chatPath } = validateTaskFiles(taskDirectory);

    const chatMarkdown = fs.readFileSync(chatPath, "utf8");

    renderHistory(chatMarkdown, taskNumber, taskDirectory);

    await waitForEnter();
    launchClaude(taskDirectory);
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