#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const defaults = {
  skuPath: path.join(os.homedir(), ".openclaw", "workspace", "products", "sku_01_final.md"),
  outPath: path.join(process.cwd(), ".artifacts", "sku01-deepseek-compare.md"),
  sampleSize: 12,
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com",
  provider: "deepseek",
  dryRun: false,
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--sku":
        options.skuPath = argv[++index];
        break;
      case "--out":
        options.outPath = argv[++index];
        break;
      case "--sample-size":
        options.sampleSize = Number(argv[++index]);
        break;
      case "--model":
        options.model = argv[++index];
        break;
      case "--base-url":
        options.baseUrl = argv[++index];
        break;
      case "--provider":
        options.provider = argv[++index];
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/sku01-deepseek-compare.mjs [--sku <path>] [--out <path>] [--sample-size <n>] [--model <id>] [--base-url <url>] [--provider <deepseek|synthetic>] [--dry-run]

Environment:
  DEEPSEEK_API_KEY    Preferred for direct DeepSeek V3.2 comparison
  SYNTHETIC_API_KEY   Optional fallback when using --provider synthetic

Examples:
  node scripts/sku01-deepseek-compare.mjs --dry-run
  DEEPSEEK_API_KEY=sk-... node scripts/sku01-deepseek-compare.mjs --sample-size 12
  SYNTHETIC_API_KEY=sk-... node scripts/sku01-deepseek-compare.mjs --provider synthetic --model hf:deepseek-ai/DeepSeek-V3.2`);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/giu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

function metricSummary(text) {
  const tokens = tokenize(text);
  const unique = new Set(tokens);
  return {
    words: tokens.length,
    uniqueWords: unique.size,
    lexicalRatio: tokens.length ? Number((unique.size / tokens.length).toFixed(3)) : 0,
  };
}

function parsePrompts(markdown) {
  const lines = markdown.split(/\r?\n/u);
  let section = "Uncategorized";
  const prompts = [];
  for (const line of lines) {
    const sectionMatch = /^##\s+(.+)$/u.exec(line.trim());
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const promptMatch = /^(\d+)\.\s+Prompt\s+\d+:\s+(.+)$/u.exec(line.trim());
    if (promptMatch) {
      prompts.push({
        lineNumber: Number(promptMatch[1]),
        section,
        prompt: promptMatch[2].trim(),
      });
    }
  }
  return prompts;
}

function selectSample(prompts, sampleSize) {
  const selected = [];
  const seenSections = new Set();
  for (const prompt of prompts) {
    if (selected.length >= sampleSize) {
      break;
    }
    if (seenSections.has(prompt.section)) {
      continue;
    }
    selected.push(prompt);
    seenSections.add(prompt.section);
  }
  if (selected.length >= sampleSize) {
    return selected.slice(0, sampleSize);
  }
  const step = Math.max(1, Math.floor(prompts.length / Math.max(sampleSize - selected.length, 1)));
  for (let index = 0; index < prompts.length && selected.length < sampleSize; index += step) {
    const candidate = prompts[index];
    if (selected.some((entry) => entry.lineNumber === candidate.lineNumber)) {
      continue;
    }
    selected.push(candidate);
  }
  return selected.slice(0, sampleSize);
}

async function askDeepSeek(options, sample) {
  const prompt = [
    "You are improving a prompt pack for operators and consultants.",
    "Take the source prompt and rewrite it into a stronger, more specific, more immediately useful execution prompt.",
    "Keep the same business intent, but remove generic repetition.",
    "Return strict JSON with keys: improved_prompt, why_better, quality_delta.",
    `Section: ${sample.section}`,
    `Source prompt: ${sample.prompt}`,
  ].join("\n");
  if (options.provider === "synthetic") {
    const apiKey = process.env.SYNTHETIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Missing SYNTHETIC_API_KEY.");
    }
    const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/v1/messages`, {
      signal: AbortSignal.timeout(45_000),
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 1200,
        temperature: 0.3,
        system:
          "Rewrite prompts for practical AI workflow execution. Prefer concrete inputs, decision rules, constraints, and output formats.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`DeepSeek request failed (${response.status}): ${JSON.stringify(body)}`);
    }
    const text = Array.isArray(body.content)
      ? body.content
          .filter((item) => item?.type === "text")
          .map((item) => item.text)
          .join("\n")
      : "";
    const cleaned = text
      .replace(/^```json\s*/u, "")
      .replace(/\s*```$/u, "")
      .trim();
    return JSON.parse(cleaned);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY.");
  }
  const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
    signal: AbortSignal.timeout(45_000),
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Rewrite prompts for practical AI workflow execution. Prefer concrete inputs, decision rules, constraints, and output formats. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`DeepSeek request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  const text = body.choices?.[0]?.message?.content ?? "";
  const cleaned = text
    .replace(/^```json\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
  return JSON.parse(cleaned);
}

function renderReport(options, status, sample, rows) {
  const header = [
    "# SKU 01 DeepSeek V3.2 Comparison",
    "",
    `- Source file: ${options.skuPath}`,
    `- Sample size: ${sample.length}`,
    `- Provider: ${options.provider}`,
    `- Model: ${options.model}`,
    `- Status: ${status}`,
    "",
  ];
  const summary = rows.length
    ? [
        "## Summary",
        "",
        `- Compared prompts: ${rows.length}`,
        `- Avg original words: ${average(rows.map((row) => row.before.words))}`,
        `- Avg rewritten words: ${average(rows.map((row) => row.after.words))}`,
        `- Avg lexical ratio delta: ${average(
          rows.map((row) => row.after.lexicalRatio - row.before.lexicalRatio),
          3,
        )}`,
        "",
      ]
    : [];
  const details = ["## Samples", ""];
  if (rows.length === 0) {
    details.push(
      "- No live model output yet. Extraction is ready; provide `SYNTHETIC_API_KEY` to run the comparison.",
    );
  } else {
    for (const row of rows) {
      details.push(`### ${row.lineNumber}. ${row.section}`);
      details.push("");
      details.push(`- Original words: ${row.before.words}`);
      details.push(`- Rewritten words: ${row.after.words}`);
      details.push(`- Original lexical ratio: ${row.before.lexicalRatio}`);
      details.push(`- Rewritten lexical ratio: ${row.after.lexicalRatio}`);
      details.push(`- Quality delta: ${row.qualityDelta}`);
      details.push("");
      details.push("**Original**");
      details.push("");
      details.push(row.original);
      details.push("");
      details.push("**DeepSeek rewrite**");
      details.push("");
      details.push(row.rewrite);
      details.push("");
      details.push("**Why better**");
      details.push("");
      details.push(row.whyBetter);
      details.push("");
    }
  }
  return [...header, ...summary, ...details].join("\n");
}

function average(values, digits = 1) {
  if (!values.length) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(digits));
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = await fs.readFile(options.skuPath, "utf8");
  const prompts = parsePrompts(markdown);
  const sample = selectSample(prompts, options.sampleSize);
  const hasKey =
    options.provider === "synthetic"
      ? Boolean(process.env.SYNTHETIC_API_KEY?.trim())
      : Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  if (options.dryRun || !hasKey) {
    const missingLabel =
      options.provider === "synthetic" ? "SYNTHETIC_API_KEY" : "DEEPSEEK_API_KEY";
    const report = renderReport(
      options,
      hasKey ? "dry-run" : `blocked: missing ${missingLabel}`,
      sample,
      [],
    );
    await ensureDir(options.outPath);
    await fs.writeFile(options.outPath, `${report}\n`, "utf8");
    console.log(
      JSON.stringify(
        {
          status: hasKey ? "dry-run" : "blocked",
          sampleCount: sample.length,
          out: options.outPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  const rows = [];
  for (const [index, item] of sample.entries()) {
    console.log(`Comparing sample ${index + 1}/${sample.length}: ${item.section}`);
    const result = await askDeepSeek(options, item);
    rows.push({
      lineNumber: item.lineNumber,
      section: item.section,
      original: item.prompt,
      rewrite: result.improved_prompt,
      whyBetter: result.why_better,
      qualityDelta: result.quality_delta,
      before: metricSummary(item.prompt),
      after: metricSummary(result.improved_prompt),
    });
  }
  const report = renderReport(options, "completed", sample, rows);
  await ensureDir(options.outPath);
  await fs.writeFile(options.outPath, `${report}\n`, "utf8");
  console.log(
    JSON.stringify(
      { status: "completed", sampleCount: sample.length, out: options.outPath },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
