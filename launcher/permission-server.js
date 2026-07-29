#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const IPC_DIRECTORY =
    process.env.CLAUDE_EXP_PERMISSION_DIR;

if (!IPC_DIRECTORY) {
    process.stderr.write(
        "CLAUDE_EXP_PERMISSION_DIR is not set.\n"
    );
    process.exit(1);
}

const REQUEST_PATH = path.join(
    IPC_DIRECTORY,
    "request.json"
);

const RESPONSE_PATH = path.join(
    IPC_DIRECTORY,
    "response.json"
);

/*
 * ============================================================================
 * Utilities
 * ============================================================================
 */

function sleep(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

async function removeIfExists(filePath) {
    try {
        await fsp.unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
}

/*
 * ============================================================================
 * Permission request
 * ============================================================================
 */

async function requestPermission(args) {
    await fsp.mkdir(
        IPC_DIRECTORY,
        {
            recursive: true
        }
    );

    await removeIfExists(
        REQUEST_PATH
    );

    await removeIfExists(
        RESPONSE_PATH
    );

    const requestId =
        `${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;

    const request = {
        id: requestId,

        toolName:
            args.tool_name,

        input:
            args.input || {}
    };

    await fsp.writeFile(
        REQUEST_PATH,
        JSON.stringify(
            request,
            null,
            2
        ),
        "utf8"
    );

    /*
     * Wait for prototype-chat.js
     * to write the decision.
     */
    while (true) {
        await sleep(100);

        if (
            !fs.existsSync(
                RESPONSE_PATH
            )
        ) {
            continue;
        }

        let response;

        try {
            response =
                JSON.parse(
                    await fsp.readFile(
                        RESPONSE_PATH,
                        "utf8"
                    )
                );
        } catch {
            continue;
        }

        if (
            response.id !==
            requestId
        ) {
            continue;
        }

        await removeIfExists(
            REQUEST_PATH
        );

        await removeIfExists(
            RESPONSE_PATH
        );

        if (
            response.behavior ===
            "allow"
        ) {
            return {
                behavior: "allow",

                updatedInput:
                    response.updatedInput ||
                    args.input ||
                    {}
            };
        }

        return {
            behavior: "deny",

            message:
                "User denied this action."
        };
    }
}

/*
 * ============================================================================
 * Minimal MCP stdio server
 * ============================================================================
 */

function send(message) {
    process.stdout.write(
        JSON.stringify(message) +
        "\n"
    );
}

async function handleMessage(message) {
    /*
     * MCP initialize
     */
    if (
        message.method ===
        "initialize"
    ) {
        send({
            jsonrpc: "2.0",
            id: message.id,

            result: {
                protocolVersion:
                    message.params
                        ?.protocolVersion ||
                    "2025-06-18",

                capabilities: {
                    tools: {}
                },

                serverInfo: {
                    name:
                        "experiment-permission",

                    version: "0.1.0"
                }
            }
        });

        return;
    }

    /*
     * Notification after initialization.
     */
    if (
        message.method ===
        "notifications/initialized"
    ) {
        return;
    }

    /*
     * Tool discovery.
     */
    if (
        message.method ===
        "tools/list"
    ) {
        send({
            jsonrpc: "2.0",
            id: message.id,

            result: {
                tools: [
                    {
                        name:
                            "approval_prompt",

                        description:
                            "Ask the experiment participant whether a Claude Code tool invocation should be allowed.",

                        inputSchema: {
                            type: "object",

                            properties: {
                                tool_name: {
                                    type: "string"
                                },

                                input: {
                                    type: "object"
                                }
                            },

                            required: [
                                "tool_name",
                                "input"
                            ],

                            additionalProperties:
                                true
                        }
                    }
                ]
            }
        });

        return;
    }

    /*
     * Permission request.
     */
    if (
        message.method ===
        "tools/call"
    ) {
        const toolName =
            message.params?.name;

        if (
            toolName !==
            "approval_prompt"
        ) {
            send({
                jsonrpc: "2.0",
                id: message.id,

                error: {
                    code: -32601,
                    message:
                        `Unknown tool: ${toolName}`
                }
            });

            return;
        }

        try {
            const decision =
                await requestPermission(
                    message.params
                        ?.arguments || {}
                );

            /*
             * Claude Code expects the
             * permission payload as
             * JSON-stringified text.
             */
            send({
                jsonrpc: "2.0",
                id: message.id,

                result: {
                    content: [
                        {
                            type: "text",

                            text:
                                JSON.stringify(
                                    decision
                                )
                        }
                    ]
                }
            });
        } catch (error) {
            send({
                jsonrpc: "2.0",
                id: message.id,

                error: {
                    code: -32603,
                    message:
                        error.message
                }
            });
        }

        return;
    }

    /*
     * Unknown requests.
     */
    if (
        message.id !==
        undefined
    ) {
        send({
            jsonrpc: "2.0",
            id: message.id,

            error: {
                code: -32601,
                message:
                    `Unsupported method: ${message.method}`
            }
        });
    }
}

/*
 * ============================================================================
 * Read JSON-RPC lines
 * ============================================================================
 */

let buffer = "";

process.stdin.setEncoding(
    "utf8"
);

process.stdin.on(
    "data",
    chunk => {
        buffer += chunk;

        while (true) {
            const newlineIndex =
                buffer.indexOf("\n");

            if (
                newlineIndex === -1
            ) {
                break;
            }

            const line =
                buffer
                    .slice(
                        0,
                        newlineIndex
                    )
                    .trim();

            buffer =
                buffer.slice(
                    newlineIndex + 1
                );

            if (!line) {
                continue;
            }

            let message;

            try {
                message =
                    JSON.parse(line);
            } catch {
                continue;
            }

            handleMessage(
                message
            ).catch(error => {
                process.stderr.write(
                    `${error.stack || error}\n`
                );
            });
        }
    }
);