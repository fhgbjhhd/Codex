#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const defaults = {
  input: path.join(process.cwd(), ".artifacts", "sku01-deepseek-compare.md"),
  output: path.join(process.cwd(), ".artifacts", "sku01-dual-route.md"),
  model: "gpt-4o",
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--input":
        options.input = argv[++index];
        break;
      case "--output":
        options.output = argv[++index];
        break;
      case "--model":
        options.model = argv[++index];
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: node scripts/sku01-dual-route-polish.mjs [--input <path>] [--output <path>] [--model <id>]",
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function metricSummary(text) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/giu, " ")
    .split(/\s+/u)
    .filter(Boolean);
  const unique = new Set(tokens);
  return {
    words: tokens.length,
    uniqueWords: unique.size,
    lexicalRatio: tokens.length ? Number((unique.size / tokens.length).toFixed(3)) : 0,
  };
}

function loadOpenAIKey() {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }
  const authPath = path.join(
    os.homedir(),
    ".openclaw",
    "agents",
    "main",
    "agent",
    "auth-profiles.json",
  );
  return fs
    .readFile(authPath, "utf8")
    .then((text) => JSON.parse(text))
    .then((json) => {
      const key = json?.profiles?.["openai:default"]?.key;
      if (!key || typeof key !== "string") {
        throw new Error("No openai:default API key found in auth-profiles.json.");
      }
      return key;
    });
}

function parseSections(markdown) {
  const sections = markdown.split("\n### ").slice(1);
  return sections.map((section) => {
    const [titleLine, ...restLines] = section.split("\n");
    const body = restLines.join("\n");
    const original = body.split("**Original**")[1]?.split("**DeepSeek rewrite**")[0]?.trim() ?? "";
    const deepseek =
      body.split("**DeepSeek rewrite**")[1]?.split("**Why better**")[0]?.trim() ?? "";
    const why = body.split("**Why better**")[1]?.trim() ?? "";
    return {
      title: titleLine.trim(),
      original,
      deepseek,
      why,
    };
  });
}

async function polishSample(apiKey, model, sample) {
  const prompt = [
    "Rewrite the DeepSeek draft into a CyberFlow house style prompt.",
    "Target voice: Naval-inspired, calm, compressed, high-agency, leverage-first, minimal noise.",
    "Keep the execution structure concrete.",
    "Reduce verbosity.",
    "Do not sound like a consultant template.",
    "Return strict JSON with keys: polished_prompt, style_score_0_100, logic_score_0_100, notes.",
    "",
    `Original prompt:\n${sample.original}`,
    "",
    `DeepSeek draft:\n${sample.deepseek}`,
  ].join("\n");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    signal: AbortSignal.timeout(45_000),
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You rewrite prompts for premium AI workflow products. Your style is concise, strategic, and clean. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI polish failed (${response.status}): ${JSON.stringify(body)}`);
  }
  const text = body.choices?.[0]?.message?.content ?? "";
  return JSON.parse(text);
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

function renderReport(options, rows) {
  const summary = [
    "# SKU 01 Dual Route Polish",
    "",
    `- Input: ${options.input}`,
    `- Output model: ${options.model}`,
    `- Samples: ${rows.length}`,
    "",
    "## Summary",
    "",
    `- Avg DeepSeek words: ${average(rows.map((row) => row.deepseekMetrics.words))}`,
    `- Avg polished words: ${average(rows.map((row) => row.polishedMetrics.words))}`,
    `- Avg style score: ${average(rows.map((row) => row.styleScore))}`,
    `- Avg logic score: ${average(rows.map((row) => row.logicScore))}`,
    `- Avg lexical ratio delta vs DeepSeek: ${average(
      rows.map((row) => row.polishedMetrics.lexicalRatio - row.deepseekMetrics.lexicalRatio),
      3,
    )}`,
    "",
    "## Verdict",
    "",
    average(rows.map((row) => row.styleScore)) >= 85
      ? "- The dual route closes the tone gap enough for premium-facing CyberFlow copy."
      : "- The dual route improves tone materially, but some samples still need hand-tuned polish for premium-facing copy.",
    average(rows.map((row) => row.logicScore)) >= 85
      ? "- Logic depth survives the second pass."
      : "- Logic depth degrades too much in the second pass.",
    "",
  ];
  const details = [];
  for (const row of rows) {
    details.push(`### ${row.title}`);
    details.push("");
    details.push(`- Style score: ${row.styleScore}`);
    details.push(`- Logic score: ${row.logicScore}`);
    details.push(`- DeepSeek words: ${row.deepseekMetrics.words}`);
    details.push(`- Polished words: ${row.polishedMetrics.words}`);
    details.push("");
    details.push("**DeepSeek draft**");
    details.push("");
    details.push(row.deepseek);
    details.push("");
    details.push("**Polished**");
    details.push("");
    details.push(row.polished);
    details.push("");
    details.push("**Notes**");
    details.push("");
    details.push(row.notes);
    details.push("");
  }
  return [...summary, ...details].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = await fs.readFile(options.input, "utf8");
  const sections = parseSections(markdown);
  const apiKey = await loadOpenAIKey();
  const rows = [];
  for (const [index, section] of sections.entries()) {
    console.log(`Polishing sample ${index + 1}/${sections.length}: ${section.title}`);
    const result = await polishSample(apiKey, options.model, section);
    rows.push({
      title: section.title,
      deepseek: section.deepseek,
      polished: result.polished_prompt,
      styleScore: Number(result.style_score_0_100 ?? 0),
      logicScore: Number(result.logic_score_0_100 ?? 0),
      notes: result.notes,
      deepseekMetrics: metricSummary(section.deepseek),
      polishedMetrics: metricSummary(result.polished_prompt),
    });
  }
  const report = renderReport(options, rows);
  await ensureDir(options.output);
  await fs.writeFile(options.output, `${report}\n`, "utf8");
  console.log(
    JSON.stringify(
      { status: "completed", output: options.output, sampleCount: rows.length },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
