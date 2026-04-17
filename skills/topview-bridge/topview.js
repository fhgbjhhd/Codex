#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bundledVenvPython = "/tmp/topview-venv/bin/python";
const python =
  process.env.PYTHON || (fs.existsSync(bundledVenvPython) ? bundledVenvPython : "python3");
const script = path.join(__dirname, "topview.py");

const child = spawn(python, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error(`[topview] failed to launch ${python}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
