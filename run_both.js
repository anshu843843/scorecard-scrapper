#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const path = require("path");

const processes = [];
let shuttingDown = false;

function startProcess(name, script) {
  const child = spawn(process.execPath, [path.join(__dirname, script)], {
    stdio: "inherit",
    env: process.env,
  });

  processes.push(child);

  child.on("exit", (code, signal) => {
    const reason =
      signal ? `signal=${signal}` : `code=${code === null ? "null" : code}`;
    process.stderr.write(`[runner] ${name} exited ${reason}\n`);

    if (!shuttingDown) {
      shuttingDown = true;
      for (const proc of processes) {
        if (proc !== child && !proc.killed) {
          proc.kill("SIGTERM");
        }
      }
      process.exitCode = code === 0 ? 0 : code || 1;
    }
  });

  child.on("error", (err) => {
    process.stderr.write(`[runner] failed to start ${name}: ${err.message}\n`);
    if (!shuttingDown) {
      shuttingDown = true;
      for (const proc of processes) {
        if (proc !== child && !proc.killed) {
          proc.kill("SIGTERM");
        }
      }
      process.exitCode = 1;
    }
  });

  return child;
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startProcess("worker", "scorecard_flow.js");
startProcess("server", "score_server.js");
