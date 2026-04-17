#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const defaults = {
  compareOut: path.join(process.cwd(), ".artifacts", "sku01-deepseek-compare.md"),
  polishOut: path.join(process.cwd(), ".artifacts", "sku01-dual-route.md"),
  summaryOut: path.join(process.cwd(), ".artifacts", "sku01-production-summary.md"),
  sampleSize: 12,
  deepseekModel: "deepseek-chat",
  polishModel: "gpt-4o",
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--compare-out":
        options.compareOut = argv[++index];
        break;
      case "--polish-out":
        options.polishOut = argv[++index];
        break;
      case "--summary-out":
        options.summaryOut = argv[++index];
        break;
      case "--sample-size":
        options.sampleSize = Number(argv[++index]);
        break;
      case "--deepseek-model":
        options.deepseekModel = argv[++index];
        break;
      case "--polish-model":
        options.polishModel = argv[++index];
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: node scripts/sku01-production-pipeline.mjs [--sample-size <n>] [--compare-out <path>] [--polish-out <path>] [--summary-out <path>] [--deepseek-model <id>] [--polish-model <id>]",
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${scriptPath} exited with code ${code}`));
    });
  });
}

function extractNumber(markdown, label) {
  const match = new RegExp(`- ${label}:\\s*([0-9.]+)`, "u").exec(markdown);
  return match ? Number(match[1]) : null;
}

async function buildSummary(options) {
  const compare = await fs.readFile(options.compareOut, "utf8");
  const polish = await fs.readFile(options.polishOut, "utf8");
  const compareWords = extractNumber(compare, "Avg rewritten words");
  const styleScore = extractNumber(polish, "Avg style score");
  const logicScore = extractNumber(polish, "Avg logic score");
  const summary = [
    "# SKU 01 Production Pipeline Summary",
    "",
    `- DeepSeek compare report: ${options.compareOut}`,
    `- Dual-route polish report: ${options.polishOut}`,
    `- Sample size: ${options.sampleSize}`,
    "",
    "## Outcome",
    "",
    `- DeepSeek average rewritten words: ${compareWords ?? "n/a"}`,
    `- Dual-route average style score: ${styleScore ?? "n/a"}`,
    `- Dual-route average logic score: ${logicScore ?? "n/a"}`,
    "",
    "## Recommendation",
    "",
    styleScore !== null && logicScore !== null && styleScore >= 85 && logicScore >= 85
      ? "- Production-ready split: DeepSeek for structure, premium model for CyberFlow tone."
      : "- Keep the split in testing. The current style/logic threshold is not high enough for premium surfaces.",
    compareWords !== null && compareWords > 110
      ? "- DeepSeek expands prompts aggressively. Keep the polish pass to compress output before publishing."
      : "- DeepSeek output is already compact enough for some internal-only flows.",
    "",
  ].join("\n");
  await ensureDir(options.summaryOut);
  await fs.writeFile(options.summaryOut, `${summary}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await runNodeScript(path.join(process.cwd(), "scripts", "sku01-deepseek-compare.mjs"), [
    "--sample-size",
    String(options.sampleSize),
    "--out",
    options.compareOut,
    "--model",
    options.deepseekModel,
  ]);
  await runNodeScript(path.join(process.cwd(), "scripts", "sku01-dual-route-polish.mjs"), [
    "--input",
    options.compareOut,
    "--output",
    options.polishOut,
    "--model",
    options.polishModel,
  ]);
  await buildSummary(options);
  console.log(
    JSON.stringify(
      {
        status: "completed",
        compareOut: options.compareOut,
        polishOut: options.polishOut,
        summaryOut: options.summaryOut,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
