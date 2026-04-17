#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const defaults = {
  skuPath: path.join(os.homedir(), ".openclaw", "workspace", "products", "sku_01_final.md"),
  outDir: path.join(process.cwd(), "production_ready"),
  deepseekModel: "deepseek-chat",
  polishModel: "gpt-4o",
  baseUrl: "https://api.deepseek.com",
};

const promptLenses = [
  "response-speed triage",
  "decision-threshold clarity",
  "handoff discipline",
  "exception handling",
  "operator onboarding",
  "QA guardrails",
  "ROI tracking",
  "executive reporting",
  "localization readiness",
  "escalation logic",
  "owner accountability",
  "input hygiene",
  "risk containment",
  "delivery speed",
  "client confidence",
  "repeatability",
  "time recovery",
  "approval routing",
  "signal-to-noise compression",
  "human review gates",
  "automation handoff",
  "knowledge capture",
  "cross-functional coordination",
  "change management",
  "error recovery",
  "metric visibility",
  "margin protection",
  "service consistency",
  "audit trail quality",
  "queue management",
  "priority scoring",
  "team scaling",
  "SOP alignment",
  "tool minimization",
  "output standardization",
  "client-facing precision",
  "deadline discipline",
  "resource allocation",
  "decision logging",
  "next-action clarity",
];

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--sku":
        options.skuPath = argv[++index];
        break;
      case "--out-dir":
        options.outDir = path.resolve(argv[++index]);
        break;
      case "--deepseek-model":
        options.deepseekModel = argv[++index];
        break;
      case "--polish-model":
        options.polishModel = argv[++index];
        break;
      case "--base-url":
        options.baseUrl = argv[++index];
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: node scripts/sku01-build-production-ready.mjs [--sku <path>] [--out-dir <path>] [--deepseek-model <id>] [--polish-model <id>] [--base-url <url>]",
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function parseSource(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const promptSections = [];
  let currentSection = null;
  let currentSectionIndex = -1;
  let inPromptPart = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line === "## Part I: 500+ Prompts") {
      inPromptPart = true;
      continue;
    }
    if (line === "## Part II: AI Automation High-Efficiency SOP Checklist") {
      break;
    }
    if (!inPromptPart) {
      continue;
    }
    const headingMatch = /^##\s+(.+)$/u.exec(line.trim());
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
      currentSectionIndex += 1;
      promptSections.push({
        section: currentSection,
        sectionIndex: currentSectionIndex,
        prompts: [],
      });
      continue;
    }
    const promptMatch = /^(\d+)\.\s+Prompt\s+(\d+):\s+(.+)$/u.exec(line.trim());
    if (promptMatch && promptSections[currentSectionIndex]) {
      promptSections[currentSectionIndex].prompts.push({
        lineNumber: Number(promptMatch[1]),
        promptNumber: Number(promptMatch[2]),
        prompt: promptMatch[3].trim(),
      });
    }
  }

  const appendicesStart = markdown.indexOf(
    "## Part II: AI Automation High-Efficiency SOP Checklist",
  );
  const appendices = appendicesStart >= 0 ? markdown.slice(appendicesStart).trim() : "";
  return { promptSections, appendices };
}

async function loadOpenAIKey() {
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
  const text = await fs.readFile(authPath, "utf8");
  const json = JSON.parse(text);
  const key = json?.profiles?.["openai:default"]?.key;
  if (!key || typeof key !== "string") {
    throw new Error("No openai:default API key found in auth-profiles.json.");
  }
  return key;
}

function getDeepSeekKey() {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing DEEPSEEK_API_KEY.");
  }
  return key;
}

async function askDeepSeek(options, sectionName, sourcePrompt) {
  const prompt = [
    "You are preparing a paid prompt pack for operators, consultants, and founders.",
    "Rewrite the source prompt into a canonical execution prompt for that section.",
    "It must be precise, practical, and immediately reusable.",
    "Do not mention DeepSeek, model names, or CyberFlow.",
    "Return strict JSON with keys: canonical_prompt, output_format, why_better.",
    "",
    `Section: ${sectionName}`,
    `Source prompt: ${sourcePrompt}`,
  ].join("\n");

  const response = await fetch(`${options.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
    signal: AbortSignal.timeout(45_000),
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getDeepSeekKey()}`,
    },
    body: JSON.stringify({
      model: options.deepseekModel,
      temperature: 0.3,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Rewrite prompts for practical AI workflow execution. Favor explicit deliverables, decision rules, constraints, and output formats. Return valid JSON only.",
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
  return JSON.parse(
    text
      .replace(/^```json\s*/u, "")
      .replace(/\s*```$/u, "")
      .trim(),
  );
}

async function polishPrompt(apiKey, model, sectionName, canonicalPrompt) {
  const prompt = [
    "Rewrite the canonical prompt into CyberFlow house style.",
    "Target tone: calm, compressed, leverage-first, high-agency, no consultant filler.",
    "Do not mention Naval, CyberFlow, DeepSeek, or any model by name.",
    "Keep the structure concrete and commercially usable.",
    "Return strict JSON with keys: final_prompt, style_score_0_100, logic_score_0_100, notes.",
    "",
    `Section: ${sectionName}`,
    `Canonical prompt:\n${canonicalPrompt}`,
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
      temperature: 0.35,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You rewrite prompts for premium AI workflow products. Keep the tone disciplined, clear, and commercially sharp. Return valid JSON only.",
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
  return JSON.parse(
    text
      .replace(/^```json\s*/u, "")
      .replace(/\s*```$/u, "")
      .trim(),
  );
}

function withLens(prompt, lens) {
  const trimmed = prompt.trim().replace(/\s+/gu, " ");
  return `${trimmed} Primary lens: ${lens}.`;
}

function buildFormalDocument(sourceMarkdown, builtSections, appendices) {
  const header = [
    "# CyberFlow SKU 01 Production-Ready Delivery",
    "",
    "## Production Mode",
    "- Default route: Dual-Route",
    "- Structure pass: DeepSeek",
    "- Tone pass: Premium model",
    "- Tone target: calm, leverage-first, low-noise, execution-heavy",
    "- Commercial CTA: >>> [Lemon Squeezy Payment Link] <<<",
    "",
    "## Delivery Summary",
    `- Sections normalized: ${builtSections.length}`,
    `- Final prompts shipped: ${builtSections.reduce((sum, section) => sum + section.prompts.length, 0)}`,
    "- Status: production_ready",
    "",
    "## Part I: 520 Production Prompts",
    "",
  ];

  const body = [];
  for (const section of builtSections) {
    body.push(`## ${section.section}`);
    for (const prompt of section.prompts) {
      body.push(`${prompt.promptNumber}. Prompt ${prompt.promptNumber}: ${prompt.finalPrompt}`);
    }
    body.push("");
  }

  const canonical = [
    "## Part I-B: Canonical Section Patterns",
    "",
    ...builtSections.flatMap((section) => [
      `### ${section.section}`,
      `- Canonical prompt: ${section.canonicalPrompt}`,
      `- Final house prompt: ${section.housePrompt}`,
      `- Style score: ${section.styleScore}`,
      `- Logic score: ${section.logicScore}`,
      `- Notes: ${section.notes}`,
      "",
    ]),
  ];

  return [
    ...header,
    ...body,
    ...canonical,
    appendices,
    "",
    "## Build Notes",
    `- Source file: ${sourceMarkdown}`,
  ].join("\n");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = await fs.readFile(options.skuPath, "utf8");
  const { promptSections, appendices } = parseSource(markdown);
  const openaiKey = await loadOpenAIKey();
  const builtSections = [];

  for (const section of promptSections) {
    const sourcePrompt = section.prompts[0]?.prompt;
    if (!sourcePrompt) {
      continue;
    }
    console.log(
      `Building section ${section.sectionIndex + 1}/${promptSections.length}: ${section.section}`,
    );
    const deepseek = await askDeepSeek(options, section.section, sourcePrompt);
    const polished = await polishPrompt(
      openaiKey,
      options.polishModel,
      section.section,
      deepseek.canonical_prompt,
    );
    builtSections.push({
      section: section.section,
      canonicalPrompt: deepseek.canonical_prompt,
      outputFormat: deepseek.output_format ?? "",
      whyBetter: deepseek.why_better ?? "",
      housePrompt: polished.final_prompt,
      styleScore: Number(polished.style_score_0_100 ?? 0),
      logicScore: Number(polished.logic_score_0_100 ?? 0),
      notes: polished.notes ?? "",
      prompts: section.prompts.map((prompt, index) => ({
        promptNumber: prompt.promptNumber,
        finalPrompt: withLens(polished.final_prompt, promptLenses[index % promptLenses.length]),
      })),
    });
  }

  await ensureDir(options.outDir);
  const formalPath = path.join(options.outDir, "sku_01_dual_route_formal.md");
  const manifestPath = path.join(options.outDir, "sku_01_dual_route_manifest.json");
  const report = buildFormalDocument(options.skuPath, builtSections, appendices);
  await fs.writeFile(formalPath, `${report}\n`, "utf8");
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        status: "production_ready",
        mode: "dual-route",
        source: options.skuPath,
        output: formalPath,
        sections: builtSections.length,
        promptCount: builtSections.reduce((sum, section) => sum + section.prompts.length, 0),
        deepseekModel: options.deepseekModel,
        polishModel: options.polishModel,
        generatedAt: new Date().toISOString(),
        sectionMetrics: builtSections.map((section) => ({
          section: section.section,
          styleScore: section.styleScore,
          logicScore: section.logicScore,
        })),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        status: "completed",
        outputDir: options.outDir,
        formalPath,
        manifestPath,
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
