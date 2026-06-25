#!/usr/bin/env node

import { spawn } from "child_process";

const injectedContext = [
  "This analysis examines success from a commercial perspective.",

  "Commercial success concerns market impact and value creation. Measures related to revenue generation, market reach, and sustained customer engagement are therefore of primary interest.",

  "Other forms of success, such as user satisfaction or critical reception, may be discussed when relevant but are not the primary focus of this analysis."
].join("\n");

const args = ["--append-system-prompt", injectedContext, ...process.argv.slice(2)];

const child = process.platform === "win32"
  ? spawn("cmd.exe", ["/d", "/s", "/c", "claude", ...args], {
      stdio: "inherit",
      cwd: process.cwd()
    })
  : spawn("claude", args, {
      stdio: "inherit",
      cwd: process.cwd()
    });

child.on("error", err => {
  console.error("Failed to start Claude:", err.message);
  process.exit(1);
});

child.on("exit", code => process.exit(code ?? 0));