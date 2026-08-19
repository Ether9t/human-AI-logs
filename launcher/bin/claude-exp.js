#!/usr/bin/env node

"use strict";

const { spawn } = require("node:child_process");
const readline = require("node:readline");
const path = require("node:path");
const https = require("node:https");
const fs = require("node:fs");

/*
 * ============================================================================
 * Configuration
 * ============================================================================
 */

const GITHUB_OWNER = "Ether9t";
const GITHUB_REPOSITORY = "human-AI-logs";
const GITHUB_BRANCH = "experiment-assets";

const MODEL =
    "us.anthropic.claude-sonnet-5";

const ALLOWED_CONDITIONS =
    new Set([
        "A1", "A2",
        "B1", "B2",
        "C1", "C2",
        "D1", "D2"
    ]);

const ALLOWED_TASKS =
    new Set([
        "1", "2", "3", "4"
    ]);

const PROJECT_ROOT =
    path.resolve(
        __dirname,
        "..",
        ".."
    );

const TASKS_ROOT =
    path.join(PROJECT_ROOT, "tasks");
const LOGS_ROOT =
    path.join(
        PROJECT_ROOT,
        "logs"
    );

const fsp =
    require("node:fs/promises");

const PERMISSION_DIRECTORY =
    path.join(
        PROJECT_ROOT,
        ".claude-exp-permission"
    );

const PERMISSION_REQUEST_PATH =
    path.join(
        PERMISSION_DIRECTORY,
        "request.json"
    );

const PERMISSION_RESPONSE_PATH =
    path.join(
        PERMISSION_DIRECTORY,
        "response.json"
    );

const PERMISSION_SERVER_PATH =
    path.resolve(
        __dirname,
        "..",
        "permission-server.js"
    );

const MCP_CONFIG_PATH =
    path.join(
        PERMISSION_DIRECTORY,
        "mcp.json"
    );

const CONDITION_MAP = {
    A1: [
        { assetFolder: "steam1", taskType: 1 },
        { assetFolder: "steam2", taskType: 2 },
        { assetFolder: "shopping1", taskType: 3 },
        { assetFolder: "shopping2", taskType: 4 }
    ],

    A2: [
        { assetFolder: "steam2", taskType: 1 },
        { assetFolder: "steam1", taskType: 2 },
        { assetFolder: "shopping2", taskType: 3 },
        { assetFolder: "shopping1", taskType: 4 }
    ],

    B1: [
        { assetFolder: "shopping1", taskType: 1 },
        { assetFolder: "shopping2", taskType: 2 },
        { assetFolder: "steam1", taskType: 3 },
        { assetFolder: "steam2", taskType: 4 }
    ],

    B2: [
        { assetFolder: "shopping2", taskType: 1 },
        { assetFolder: "shopping1", taskType: 2 },
        { assetFolder: "steam2", taskType: 3 },
        { assetFolder: "steam1", taskType: 4 }
    ],

    C1: [
        { assetFolder: "steam1", taskType: 3 },
        { assetFolder: "steam2", taskType: 4 },
        { assetFolder: "shopping1", taskType: 1 },
        { assetFolder: "shopping2", taskType: 2 }
    ],

    C2: [
        { assetFolder: "steam2", taskType: 3 },
        { assetFolder: "steam1", taskType: 4 },
        { assetFolder: "shopping2", taskType: 1 },
        { assetFolder: "shopping1", taskType: 2 }
    ],

    D1: [
        { assetFolder: "shopping1", taskType: 3 },
        { assetFolder: "shopping2", taskType: 4 },
        { assetFolder: "steam1", taskType: 1 },
        { assetFolder: "steam2", taskType: 2 }
    ],

    D2: [
        { assetFolder: "shopping2", taskType: 3 },
        { assetFolder: "shopping1", taskType: 4 },
        { assetFolder: "steam2", taskType: 1 },
        { assetFolder: "steam1", taskType: 2 }
    ]
};

function getClaudeConfigDirectory() {
    /*
     * Respect CLAUDE_CONFIG_DIR if we
     * explicitly set one in Codespaces.
     */
    if (
        process.env.CLAUDE_CONFIG_DIR
    ) {
        return path.resolve(
            process.env.CLAUDE_CONFIG_DIR
        );
    }

    /*
     * Default Claude Code config directory.
     */
    const homeDirectory =
        process.env.HOME ||
        process.env.USERPROFILE;

    if (!homeDirectory) {
        return null;
    }

    return path.join(
        homeDirectory,
        ".claude"
    );
}

async function findFileRecursive(
    directory,
    targetFileName
) {
    let entries;

    try {
        entries =
            await fsp.readdir(
                directory,
                {
                    withFileTypes: true
                }
            );
    } catch {
        return null;
    }

    for (const entry of entries) {
        const fullPath =
            path.join(
                directory,
                entry.name
            );

        if (
            entry.isFile() &&
            entry.name === targetFileName
        ) {
            return fullPath;
        }

        if (
            entry.isDirectory()
        ) {
            const result =
                await findFileRecursive(
                    fullPath,
                    targetFileName
                );

            if (result) {
                return result;
            }
        }
    }

    return null;
}

async function saveSessionLog(
    sessionId,
    condition,
    position
) {
    if (!sessionId) {
        throw new Error(
            "Claude session ID was not captured."
        );
    }

    if (!condition) {
        throw new Error(
            "Experiment condition was not provided."
        );
    }

    const claudeConfigDirectory =
        getClaudeConfigDirectory();

    if (!claudeConfigDirectory) {
        throw new Error(
            "Unable to locate Claude config directory."
        );
    }

    const projectsDirectory =
        path.join(
            claudeConfigDirectory,
            "projects"
        );

    const fileName =
        `${sessionId}.jsonl`;

    /*
     * Claude may need a moment to flush
     * the final session data after exit.
     */
    let sourcePath = null;

    for (
        let attempt = 0;
        attempt < 20;
        attempt++
    ) {
        sourcePath =
            await findFileRecursive(
                projectsDirectory,
                fileName
            );

        if (sourcePath) {
            break;
        }

        await sleep(100);
    }

    if (!sourcePath) {
        throw new Error(
            `Could not find Claude session log: ${fileName}`
        );
    }

    /*
     * Example:
     *
     * logs/
     * └── A1/
     *     └── task 1/
     *         └── <session-id>.jsonl
     */
    const taskLogDirectory =
        path.join(
            LOGS_ROOT,
            condition,
            `task ${position}`
        );

    await fsp.mkdir(
        taskLogDirectory,
        {
            recursive: true
        }
    );

    const destinationPath =
        path.join(
            taskLogDirectory,
            fileName
        );

    await fsp.copyFile(
        sourcePath,
        destinationPath
    );

    return destinationPath;
}

/*
 * ============================================================================
 * ANSI
 * ============================================================================
 */

const ANSI = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    gray: "\x1b[90m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    bgGray: "\x1b[48;5;238m",
    white: "\x1b[37m"
};

function style(text, ...codes) {
    return (
        `${codes.join("")}${text}${ANSI.reset}`
    );
}

/*
 * ============================================================================
 * Task
 * ============================================================================
 */

function getCondition() {
    const condition =
        (process.argv[2] || "")
            .toUpperCase();

    if (
        !ALLOWED_CONDITIONS.has(
            condition
        )
    ) {
        console.error(
            `Condition ${condition || "(missing)"} is not available.`
        );

        console.error(
            "Usage: claude-exp <condition> <position>"
        );

        console.error(
            "Example: claude-exp A1 1"
        );

        process.exit(1);
    }

    return condition;
}

function getPosition() {
    const position =
        process.argv[3] || "";

    if (
        !ALLOWED_TASKS.has(
            position
        )
    ) {
        console.error(
            `Task position ${position || "(missing)"} is not available.`
        );

        console.error(
            "Usage: claude-exp <condition> <position>"
        );

        console.error(
            "Example: claude-exp A1 1"
        );

        process.exit(1);
    }

    return position;
}

function getTaskDirectory(position) {
    return path.join(
        TASKS_ROOT,
        `task ${position}`
    );
}

/*
 * ============================================================================
 * Download chat.md
 * ============================================================================
 */

function downloadText(url) {
    return new Promise(
        (resolve, reject) => {
            https
                .get(url, response => {
                    if (
                        response.statusCode !== 200
                    ) {
                        reject(
                            new Error(
                                `Request failed (${response.statusCode})\n${url}`
                            )
                        );

                        return;
                    }

                    let data = "";

                    response.setEncoding("utf8");

                    response.on(
                        "data",
                        chunk => {
                            data += chunk;
                        }
                    );

                    response.on(
                        "end",
                        () => {
                            resolve(data);
                        }
                    );
                })
                .on("error", reject);
        }
    );
}

function getInstructionUrl() {
    return (
        `https://raw.githubusercontent.com/` +
        `${GITHUB_OWNER}/` +
        `${GITHUB_REPOSITORY}/` +
        `${GITHUB_BRANCH}/` +
        `instruction.md`
    );
}

function getChatUrl(
    assetFolder,
    taskType
) {
    return (
        `https://raw.githubusercontent.com/` +
        `${GITHUB_OWNER}/` +
        `${GITHUB_REPOSITORY}/` +
        `${GITHUB_BRANCH}/` +
        `${assetFolder}/` +
        `task%20${taskType}/chat.md`
    );
}

function getNotebookUrl(
    assetFolder,
    taskType
) {
    return (
        `https://raw.githubusercontent.com/` +
        `${GITHUB_OWNER}/` +
        `${GITHUB_REPOSITORY}/` +
        `${GITHUB_BRANCH}/` +
        `${assetFolder}/` +
        `task%20${taskType}/notebook.ipynb`
    );
}

function downloadBinary(url) {
    return new Promise(
        (resolve, reject) => {
            https
                .get(url, response => {
                    if (
                        response.statusCode !== 200
                    ) {
                        reject(
                            new Error(
                                `Request failed (${response.statusCode})\n${url}`
                            )
                        );

                        return;
                    }

                    const chunks = [];

                    response.on(
                        "data",
                        chunk => {
                            chunks.push(chunk);
                        }
                    );

                    response.on(
                        "end",
                        () => {
                            resolve(
                                Buffer.concat(
                                    chunks
                                )
                            );
                        }
                    );
                })
                .on(
                    "error",
                    reject
                );
        }
    );
}

async function downloadNotebook(
    assetFolder,
    taskType,
    taskDirectory
) {
    const notebookPath =
        path.join(
            taskDirectory,
            "notebook.ipynb"
        );

    await fsp.mkdir(
        taskDirectory,
        {
            recursive: true
        }
    );

    const notebook =
        await downloadBinary(
            getNotebookUrl(
                assetFolder,
                taskType
            )
        );

    await fsp.writeFile(
        notebookPath,
        notebook
    );
}

function openNotebook(
    taskDirectory
) {
    const notebookPath =
        path.resolve(
            taskDirectory,
            "notebook.ipynb"
        );

    return new Promise(resolve => {
        let command;
        let args;

        if (
            process.platform === "win32"
        ) {
            command =
                path.join(
                    process.env.LOCALAPPDATA,
                    "Programs",
                    "Microsoft VS Code",
                    "Code.exe"
                );

            args = [
                "--reuse-window",
                notebookPath
            ];
        } else {
            command = "code";
            args = [
                "--reuse-window",
                notebookPath
            ];
        }

        const child =
            spawn(
                command,
                args,
                {
                    detached: true,
                    stdio: "ignore",
                    shell: false
                }
            );

        child.once(
            "error",
            () => {
                resolve(false);
            }
        );

        child.once(
            "spawn",
            () => {
                child.unref();
                resolve(true);
            }
        );
    });
}

async function writeTaskClaudeInstructions(
    taskDirectory
) {
    const claudeMdPath =
        path.join(
            taskDirectory,
            "CLAUDE.md"
        );

    const content =
        await downloadText(
            getInstructionUrl()
        );

    await fsp.writeFile(
        claudeMdPath,
        content.trim() + "\n",
        "utf8"
    );
}

async function fetchChatMarkdown(
    assetFolder,
    taskType
) {
    return downloadText(
        getChatUrl(
            assetFolder,
            taskType
        )
    );
}

/*
 * ============================================================================
 * Parse prepared chat
 * ============================================================================
 */

function parseChatMarkdown(markdown) {
    const rolePattern =
        /<!--\s*role\s*:\s*(user|assistant)\s*-->\s*([\s\S]*?)(?=<!--\s*role\s*:\s*(?:user|assistant)\s*-->|$)/gi;

    const messages = [];

    let match;

    while (
        (match =
            rolePattern.exec(markdown)) !==
        null
    ) {
        const role =
            match[1].toLowerCase();

        const content =
            match[2].trim();

        if (!content) {
            continue;
        }

        messages.push({
            role,
            content
        });
    }

    return messages;
}

/*
 * ============================================================================
 * Shared renderer
 * ============================================================================
 */

function printUser(text) {
    console.log();

    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const prefix =
            i === 0
                ? "❯ "
                : "  ";

        console.log(
            style(
                `${prefix}${lines[i]}`,
                ANSI.bgGray,
                ANSI.white
            )
        );
    }
}

function printAssistantText(text) {
    const lines =
        text.trim().split("\n");

    if (lines.length === 0) {
        return;
    }

    console.log();

    process.stdout.write(
        `${style("●", ANSI.bold)} `
    );

    process.stdout.write(
        lines[0]
    );

    for (
        const line of lines.slice(1)
    ) {
        process.stdout.write(
            `\n  ${line}`
        );
    }

    process.stdout.write("\n");
}

function printToolCall(
    toolName,
    input
) {
    console.log();

    let detail = "";

    /*
     * Bash
     */
    if (toolName === "Bash") {
        detail =
            input?.description ||
            input?.command ||
            "";
    }

    /*
     * Read
     */
    else if (toolName === "Read") {
        const filePath =
            input?.file_path ||
            input?.path ||
            "";

        detail =
            filePath
                ? path.basename(filePath)
                : "";
    }

    /*
     * Edit
     */
    else if (
        toolName === "Edit" ||
        toolName === "Write"
    ) {
        const filePath =
            input?.file_path ||
            "";

        detail =
            filePath
                ? path.basename(filePath)
                : "";
    }

    /*
     * NotebookEdit
     */
    else if (
        toolName === "NotebookEdit"
    ) {
        const filePath =
            input?.notebook_path ||
            input?.file_path ||
            "";

        detail =
            filePath
                ? path.basename(filePath)
                : "";
    }

    /*
     * Glob / Grep
     */
    else if (
        toolName === "Glob" ||
        toolName === "Grep"
    ) {
        detail =
            input?.pattern ||
            "";
    }

    if (detail) {
        console.log(
            `${style("●", ANSI.bold)} ` +
            `${toolName}(${detail})`
        );
    } else {
        console.log(
            `${style("●", ANSI.bold)} ` +
            toolName
        );
    }
}

function printToolResult(
    content,
    isError = false
) {
    if (
        content === undefined ||
        content === null ||
        content === ""
    ) {
        return;
    }

    let text;

    if (
        typeof content === "string"
    ) {
        text = content;
    } else {
        text =
            JSON.stringify(
                content,
                null,
                2
            );
    }

    /*
     * Avoid dumping huge tool output.
     */
    const maxLength = 1000;

    if (
        text.length > maxLength
    ) {
        text =
            text.slice(
                0,
                maxLength
            ) +
            "\n…";
    }

    console.log();

    const prefix =
        isError
            ? style(
                "  ⎿ Error:",
                ANSI.red
            )
            : style(
                "  ⎿",
                ANSI.gray
            );

    const lines =
        text.split("\n");

    console.log(
        `${prefix} ${lines[0]}`
    );

    for (
        const line of lines.slice(1)
    ) {
        console.log(
            `    ${line}`
        );
    }
}

/*
 * ============================================================================
 * Prepared history
 * ============================================================================
 */

function waitForEnter(
    prompt =
        "Press ENTER to continue..."
) {
    return new Promise(resolve => {
        const rl =
            readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

        rl.question(
            style(
                prompt,
                ANSI.dim
            ),
            () => {
                rl.close();
                resolve();
            }
        );
    });
}

function createSpinner() {
    const frames = [
        "✶",
        "✸",
        "✹",
        "✺",
        "✹",
        "✷"
    ];

    let index = 0;
    let timer = null;
    let active = false;

    function render() {
        process.stdout.write(
            `\r${style(
                frames[index],
                ANSI.gray
            )} ${style(
                "Working…",
                ANSI.gray
            )}`
        );

        index =
            (index + 1) %
            frames.length;
    }

    return {
        start() {
            if (active) {
                return;
            }

            active = true;
            index = 0;

            process.stdout.write("\n");

            render();

            timer =
                setInterval(
                    render,
                    120
                );
        },

        stop() {
            if (!active) {
                return;
            }

            active = false;

            if (timer) {
                clearInterval(timer);
                timer = null;
            }

            /*
             * Erase spinner line.
             */
            process.stdout.write(
                "\r\x1b[2K"
            );
        }
    };
}

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(resolve, ms)
    );
}

async function renderPreparedHistory(
    markdown
) {
    const messages =
        parseChatMarkdown(markdown);

    if (messages.length === 0) {
        return;
    }

    /*
     * User message first.
     */
    const firstMessage =
        messages[0];

    if (
        firstMessage.role === "user"
    ) {
        printUser(
            firstMessage.content
        );

        console.log();

        await waitForEnter(
            "Press ENTER to send..."
        );
    }

    /*
     * Prepared assistant messages.
     */
    for (
        const message of
        messages.slice(1)
    ) {
        if (
            message.role ===
            "assistant"
        ) {
            printAssistantText(
                message.content
            );
        } else {
            printUser(
                message.content
            );
        }

        await sleep(400);
    }
}

/*
 * ============================================================================
 * Claude process
 * ============================================================================
 */

function validateBedrockEnvironment() {
    if (
        !process.env.AWS_BEARER_TOKEN_BEDROCK
    ) {
        throw new Error(
            "AWS_BEARER_TOKEN_BEDROCK is not set."
        );
    }

    if (
        !process.env.AWS_REGION
    ) {
        throw new Error(
            "AWS_REGION is not set."
        );
    }
}

function getClaudeExecutable() {
    if (
        process.platform === "win32"
    ) {
        return path.join(
            process.env.APPDATA,
            "npm",
            "node_modules",
            "@anthropic-ai",
            "claude-code",
            "bin",
            "claude.exe"
        );
    }

    return "claude";
}

function createClaudeProcess(
    taskDirectory
) {
    const args = [
        "-p",
        "",

        "--input-format",
        "stream-json",

        "--output-format",
        "stream-json",

        "--include-partial-messages",

        "--verbose",

        "--model",
        MODEL,

        "--mcp-config",
        MCP_CONFIG_PATH,

        "--permission-prompt-tool",
        "mcp__experiment_permission__approval_prompt"
    ];

    const command =
        getClaudeExecutable();

    return spawn(
        command,
        args,
        {
            cwd: taskDirectory,

            stdio: [
                "pipe",
                "pipe",
                "pipe"
            ],

            env: {
                ...process.env,
                CLAUDE_CODE_USE_BEDROCK:
                    "1",
                CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS:
                    "1",
                ANTHROPIC_API_KEY:
                    ""
            }
        }
    );
}

/*
 * ============================================================================
 * Send live user message
 * ============================================================================
 */

function sendUserMessage(
    child,
    text
) {
    const message = {
        type: "user",

        message: {
            role: "user",

            content: [
                {
                    type: "text",
                    text
                }
            ]
        }
    };

    child.stdin.write(
        JSON.stringify(message) +
        "\n"
    );
}

/*
 * ============================================================================
 * Live Claude renderer
 * ============================================================================
 */

function createRendererState() {
    return {
        turnFinished: false,
        streamingText: false,
        renderedTools:
            new Set(),
        toolById:
            new Map(),
        lineOpen: false,
        sessionId: null,
        initialized: false
    };
}

function finishOpenLine(state) {
    if (state.lineOpen) {
        process.stdout.write(
            "\n"
        );

        state.lineOpen = false;
    }
}

function handleStreamEvent(
    event,
    state,
    spinner
) {
    const apiEvent =
        event.event;

    if (!apiEvent) {
        return;
    }

    /*
     * Start assistant text.
     */
    if (
        apiEvent.type ===
        "content_block_start" &&
        apiEvent.content_block?.type ===
        "text"
    ) {
        spinner.stop();

        finishOpenLine(state);

        process.stdout.write(
            `\n${style("●", ANSI.bold)} `
        );

        state.streamingText =
            true;

        state.lineOpen =
            true;

        return;
    }

    /*
     * Stream assistant text.
     */
    if (
        apiEvent.type ===
        "content_block_delta" &&
        apiEvent.delta?.type ===
        "text_delta"
    ) {
        if (
            !state.streamingText
        ) {
            finishOpenLine(state);

            process.stdout.write(
                `\n${style("●", ANSI.bold)} `
            );

            state.streamingText =
                true;

            state.lineOpen =
                true;
        }

        process.stdout.write(
            apiEvent.delta.text
        );

        return;
    }
}

/*
 * ============================================================================
 * Full assistant event
 * ============================================================================
 */

function handleAssistantEvent(
    event,
    state,
    spinner
) {
    const content =
        event.message?.content;

    if (!Array.isArray(content)) {
        return;
    }

    for (const block of content) {
        if (block.type !== "tool_use") {
            continue;
        }

        state.toolById.set(
            block.id,
            {
                name: block.name,
                input: block.input || {}
            }
        );

        if (
            state.renderedTools.has(
                block.id
            )
        ) {
            continue;
        }
        spinner.stop();
        finishOpenLine(state);

        state.streamingText = false;
        if (
            block.name !==
            "AskUserQuestion"
        ) {
            printToolCall(
                block.name,
                block.input || {}
            );
        }

        state.renderedTools.add(
            block.id
        );
    }
}

/*
 * ============================================================================
 * Tool result event
 * ============================================================================
 */

function handleUserEvent(
    event,
    state,
    spinner
) {
    const content =
        event.message?.content;

    if (!Array.isArray(content)) {
        return;
    }

    for (const block of content) {
        if (
            block.type !==
            "tool_result"
        ) {
            continue;
        }

        finishOpenLine(state);
        state.streamingText = false;

        const tool =
            state.toolById.get(
                block.tool_use_id
            );

        if (
            tool?.name === "Read" &&
            !block.is_error
        ) {
            console.log();
            console.log(
                style(
                    "  ⎿ Read 1 file",
                    ANSI.gray
                )
            );

            spinner.start();

            continue;
        }

        printToolResult(
            block.content,
            Boolean(
                block.is_error
            )
        );
        spinner.start();
    }
}

function handleClaudeEvent(
    event,
    state,
    spinner
) {
    if (
        event.type === "system"
    ) {
        if (
            event.subtype === "init"
        ) {
            state.initialized =
                true;

            if (
                event.session_id
            ) {
                state.sessionId =
                    event.session_id;
            }
        }

        return;
    }

    if (
        event.type ===
        "stream_event"
    ) {
        handleStreamEvent(
            event,
            state,
            spinner
        );

        return;
    }

    if (
        event.type ===
        "assistant"
    ) {
        handleAssistantEvent(
            event,
            state,
            spinner
        );

        return;
    }

    if (
        event.type === "user"
    ) {
        handleUserEvent(
            event,
            state,
            spinner
        );

        return;
    }

    if (
        event.type === "result"
    ) {
        spinner.stop();

        finishOpenLine(state);

        state.streamingText =
            false;

        state.turnFinished =
            true;
    }
}

function askClaudeQuestion(
    request,
    inputReader
) {
    return new Promise(resolve => {
        const questions =
            request.input?.questions;

        if (
            !Array.isArray(questions) ||
            questions.length === 0
        ) {
            resolve({
                behavior: "deny"
            });

            return;
        }

        /*
         * First version:
         * support one single-select question.
         */
        const question =
            questions[0];

        const options =
            Array.isArray(
                question.options
            )
                ? question.options
                : [];

        console.log();

        if (
            question.header
        ) {
            console.log(
                `${style("●", ANSI.bold)} ` +
                question.header
            );

            console.log();
        }

        console.log(
            `  ${question.question}`
        );

        console.log();

        options.forEach(
            (option, index) => {
                console.log(
                    `  ${index + 1}. ${option.label}`
                );

                if (
                    option.description
                ) {
                    console.log(
                        style(
                            `     ${option.description}`,
                            ANSI.gray
                        )
                    );
                }

                console.log();
            }
        );

        inputReader.question(
            "❯ ",
            answer => {
                const index =
                    Number(
                        answer.trim()
                    ) - 1;

                if (
                    !Number.isInteger(index) ||
                    index < 0 ||
                    index >= options.length
                ) {
                    console.log(
                        style(
                            "Please select a valid option.",
                            ANSI.yellow
                        )
                    );

                    /*
                     * Ask the same question again.
                     */
                    resolve(
                        askClaudeQuestion(
                            request,
                            inputReader
                        )
                    );

                    return;
                }

                const selected =
                    options[index].label;

                resolve({
                    behavior: "allow",

                    updatedInput: {
                        ...request.input,

                        answers: {
                            [question.question]:
                                selected
                        }
                    }
                });
            }
        );
    });
}

/*
 * ============================================================================
 * Live chat loop
 * ============================================================================
 */

function runLiveChat(
    child,
    liveLogger
) {
    return new Promise(
        (resolve, reject) => {
            function handleSigint() {
                if (userRequestedExit) {
                    return;
                }

                userRequestedExit =
                    true;

                spinner.stop();

                console.log();
                console.log(
                    style(
                        "Ending session...",
                        ANSI.gray
                    )
                );

                inputReader.close();

                if (
                    !child.stdin.destroyed
                ) {
                    child.stdin.end();
                }
            }

            process.on(
                "SIGINT",
                handleSigint
            );
            let userRequestedExit = false;
            const state = createRendererState();

            const spinner = createSpinner();
            const outputReader =
                readline.createInterface({
                    input: child.stdout
                });

            const inputReader =
                readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
            let permissionActive = false;
            let lastPermissionId = null;
            async function askPermission(
                request
            ) {
                /*
                 * ------------------------------------------------------------
                 * AskUserQuestion
                 * ------------------------------------------------------------
                 */
                spinner.stop();
                if (
                    request.toolName ===
                    "AskUserQuestion"
                ) {
                    return await askClaudeQuestion(
                        request,
                        inputReader
                    );
                }

                /*
                 * ------------------------------------------------------------
                 * Normal tool permission
                 * ------------------------------------------------------------
                 */

                return await new Promise(resolve => {
                    console.log();

                    console.log(
                        "  This action requires approval."
                    );

                    console.log();
                    console.log(
                        "  1. Yes"
                    );
                    console.log(
                        "  2. No"
                    );
                    console.log();

                    inputReader.question(
                        "❯ ",
                        answer => {
                            const choice =
                                answer
                                    .trim()
                                    .toLowerCase();

                            resolve({
                                behavior:
                                    choice === "1" ||
                                        choice === "yes" ||
                                        choice === "y"
                                        ? "allow"
                                        : "deny"
                            });
                        }
                    );
                });
            }
            const permissionTimer =
                setInterval(
                    async () => {
                        if (
                            permissionActive
                        ) {
                            return;
                        }

                        const request =
                            await getPendingPermission();

                        if (!request) {
                            return;
                        }

                        if (
                            request.id ===
                            lastPermissionId
                        ) {
                            return;
                        }

                        lastPermissionId =
                            request.id;

                        permissionActive =
                            true;

                        try {
                            const decision =
                                await askPermission(
                                    request
                                );

                            await writePermissionDecision(
                                request,
                                decision
                            );
                        } finally {
                            permissionActive =
                                false;
                        }
                    },
                    100
                );

            /*
             * Claude stderr
             */
            child.stderr.on(
                "data",
                data => {
                    const text =
                        data
                            .toString()
                            .trim();

                    if (text) {
                        console.error(
                            style(
                                text,
                                ANSI.red
                            )
                        );
                    }
                }
            );

            /*
             * Claude JSON events
             */
            outputReader.on(
                "line",
                line => {
                    if (!line.trim()) {
                        return;
                    }

                    try {
                        const event =
                            JSON.parse(line);
                        liveLogger.append({
                            source: "claude",
                            event
                        });

                        handleClaudeEvent(
                            event,
                            state,
                            spinner
                        );
                    } catch {
                        console.error(
                            "\n[Non-JSON Claude output]"
                        );

                        console.error(
                            line
                        );
                    }
                }
            );

            /*
             * Ask participant.
             */
            function ask() {
                inputReader.question(
                    style(
                        "\n❯ ",
                        ANSI.bgGray,
                        ANSI.white
                    ),
                    answer => {
                        const text =
                            answer.trim();
                        process.stdout.write(
                            "\x1b[1A\x1b[2K\r"
                        );

                        console.log(
                            style(
                                `❯ ${text}`,
                                ANSI.bgGray,
                                ANSI.white
                            )
                        );

                        const normalized =
                            text.toLowerCase();

                        if (
                            normalized === "exit" ||
                            normalized === "quit" ||
                            normalized === "/exit" ||
                            normalized === "/quit"
                        ) {
                            userRequestedExit =
                                true;

                            spinner.stop();
                            inputReader.close();
                            child.stdin.end();
                            return;
                        }

                        if (!text) {
                            ask();
                            return;
                        }

                        state.turnFinished =
                            false;

                        state.streamingText =
                            false;

                        state.lineOpen =
                            false;

                        liveLogger.append({
                            source: "participant",
                            type: "user_message",
                            text
                        });

                        sendUserMessage(
                            child,
                            text
                        );

                        spinner.start();

                        waitForTurn();
                    }
                );
            }

            /*
             * Wait until result event.
             */
            function waitForTurn() {
                const timer =
                    setInterval(
                        () => {
                            if (
                                !state.turnFinished
                            ) {
                                return;
                            }

                            clearInterval(
                                timer
                            );

                            ask();
                        },
                        50
                    );
            }

            child.once(
                "error",
                error => {
                    spinner.stop();

                    liveLogger.append({
                        source: "launcher",
                        type: "process_error",
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });

                    clearInterval(
                        permissionTimer
                    );

                    process.removeListener(
                        "SIGINT",
                        handleSigint
                    );

                    inputReader.close();

                    reject(error);
                }
            );

            child.once(
                "close",
                (code, signal) => {
                    spinner.stop();
                    liveLogger.append({
                        source: "launcher",
                        type: "process_close",
                        code,
                        signal,
                        userRequestedExit,
                        timestamp: new Date().toISOString()
                    });

                    clearInterval(
                        permissionTimer
                    );

                    process.removeListener(
                        "SIGINT",
                        handleSigint
                    );

                    inputReader.close();
                    outputReader.close();
                    if (
                        !userRequestedExit &&
                        code !== 0 &&
                        code !== null
                    ) {
                        reject(
                            new Error(
                                `Claude exited with code ${code}.`
                            )
                        );

                        return;
                    }

                    resolve({
                        sessionId:
                            state.sessionId
                    });
                }
            );
            ask();
        }
    );
}

async function preparePermissionBridge() {
    await fsp.mkdir(
        PERMISSION_DIRECTORY,
        {
            recursive: true
        }
    );

    for (
        const filePath of [
            PERMISSION_REQUEST_PATH,
            PERMISSION_RESPONSE_PATH
        ]
    ) {
        try {
            await fsp.unlink(filePath);
        } catch (error) {
            if (
                error.code !== "ENOENT"
            ) {
                throw error;
            }
        }
    }

    const config = {
        mcpServers: {
            experiment_permission: {
                command:
                    process.execPath,

                args: [
                    PERMISSION_SERVER_PATH
                ],

                env: {
                    CLAUDE_EXP_PERMISSION_DIR:
                        PERMISSION_DIRECTORY
                }
            }
        }
    };

    await fsp.writeFile(
        MCP_CONFIG_PATH,
        JSON.stringify(
            config,
            null,
            2
        ),
        "utf8"
    );
}

async function getPendingPermission() {
    if (
        !fs.existsSync(
            PERMISSION_REQUEST_PATH
        )
    ) {
        return null;
    }

    try {
        return JSON.parse(
            await fsp.readFile(
                PERMISSION_REQUEST_PATH,
                "utf8"
            )
        );
    } catch {
        return null;
    }
}

async function writePermissionDecision(
    request,
    decision
) {
    await fsp.writeFile(
        PERMISSION_RESPONSE_PATH,

        JSON.stringify(
            {
                id: request.id,
                ...decision
            },
            null,
            2
        ),

        "utf8"
    );
}

function openUrl(url) {
    return new Promise(resolve => {
        let command;
        let args;

        if (
            process.platform === "win32"
        ) {
            command =
                process.env.ComSpec ||
                "cmd.exe";

            args = [
                "/d",
                "/s",
                "/c",
                `start "" "${url}"`
            ];
        } else if (
            process.platform === "darwin"
        ) {
            command = "open";
            args = [url];
        } else {
            /*
             * Codespaces / remote Linux:
             * don't assume a GUI browser exists.
             */
            console.log();
            console.log(
                "Please open the response form:"
            );
            console.log(url);

            resolve(false);
            return;
        }

        const child =
            spawn(
                command,
                args,
                {
                    detached: true,
                    stdio: "ignore",
                    shell: false
                }
            );

        child.once(
            "error",
            () => {
                console.log();
                console.log(
                    "Please open the response form:"
                );
                console.log(url);

                resolve(false);
            }
        );

        child.once(
            "spawn",
            () => {
                child.unref();
                resolve(true);
            }
        );
    });
}

function createLiveSessionLogger(
    condition,
    position
) {
    const directory =
        path.join(
            LOGS_ROOT,
            condition,
            `task ${position}`
        );

    fs.mkdirSync(
        directory,
        {
            recursive: true
        }
    );

    const timestamp =
        new Date()
            .toISOString()
            .replace(
                /[:.]/g,
                "-"
            );

    const filePath =
        path.join(
            directory,
            `live-${timestamp}.jsonl`
        );

    function append(entry) {
        try {
            fs.appendFileSync(
                filePath,
                JSON.stringify(entry) +
                "\n",
                "utf8"
            );
        } catch (error) {
            console.error(
                `Failed to save live log: ${error.message}`
            );
        }
    }

    return {
        filePath,
        append
    };
}

/*
 * ============================================================================
 * Main
 * ============================================================================
 */

async function main() {
    try {
        const condition =
            getCondition();

        const position =
            getPosition();

        /*
         * position here means
         * participant position 1–4.
         */
        const assignment =
            CONDITION_MAP[
            condition
            ][
            Number(position) - 1
            ];

        if (!assignment) {
            throw new Error(
                `No assignment found for ${condition}, position ${position}.`
            );
        }

        const assetFolder =
            assignment.assetFolder;

        const taskType =
            assignment.taskType;

        const taskDirectory =
            getTaskDirectory(
                position
            );

        /*
         * Download the correct prepared
         * conversation for this condition.
         */
        const chatMarkdown =
            await fetchChatMarkdown(
                assetFolder,
                taskType
            );

        console.clear();

        await renderPreparedHistory(
            chatMarkdown
        );

        await preparePermissionBridge();

        await downloadNotebook(
            assetFolder,
            taskType,
            taskDirectory
        );

        await writeTaskClaudeInstructions(
            taskDirectory
        );

        await openNotebook(
            taskDirectory
        );

        validateBedrockEnvironment();

        const liveLogger =
            createLiveSessionLogger(
                condition,
                position
            );

        const child =
            createClaudeProcess(
                taskDirectory
            );

        const session =
            await runLiveChat(
                child,
                liveLogger
            );

        await saveSessionLog(
            session.sessionId,
            condition,
            position
        );

        // await openUrl(
        //     GOOGLE_FORM_URL
        // );

        console.log();
    } catch (error) {
        console.error();

        console.error(
            style(
                error.message,
                ANSI.red
            )
        );

        process.exit(1);
    }
}

main();