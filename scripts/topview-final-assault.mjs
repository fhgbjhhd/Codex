#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const home = os.homedir();
const defaultOutputDir = path.join(home, ".openclaw", "workspace", "final_assault");
const defaultQueuePath = path.join(defaultOutputDir, "queue.json");
const defaultStatePath = path.join(defaultOutputDir, "queue-state.json");
const defaultSpacingSeconds = 60;
const defaultRetrySeconds = 60;

const whaleJobs = [
  {
    id: "naval",
    handle: "@naval",
    name: "Naval Ravikant",
    market: "US",
    angle: "sovereignty through calm AI workflow architecture",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by public Naval-style themes: sovereignty, leverage, calm decision systems, and modern AI protocols. Do not depict the real person or imply endorsement. Show elegant operating dashboards, protocol maps, and workflow architecture.",
  },
  {
    id: "justin-welsh",
    handle: "@justinw",
    name: "Justin Welsh",
    market: "US",
    angle: "solo-operator leverage and workflow standardization",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by solo-operator themes: leverage, standardized workflows, distribution systems, and reduced admin drag. Do not depict the real person or imply endorsement. Show clean operating layers, async workflows, and sales systems.",
  },
  {
    id: "greg-isenberg",
    handle: "@gregisenberg",
    name: "Greg Isenberg",
    market: "US",
    angle: "community growth systems and AI-assisted audience ops",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by public community-builder themes: audience flywheels, AI-assisted moderation, insight loops, and creator-business systems. Do not depict the real person or imply endorsement. Show community dashboards, growth maps, and idea pipelines.",
  },
  {
    id: "pieter-levels",
    handle: "@levelsio",
    name: "Pieter Levels",
    market: "US",
    angle: "indie product speed and lean technical automation",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by indie-maker themes: shipping fast, automating repetitive ops, lightweight stacks, and founder throughput. Do not depict the real person or imply endorsement. Show deployment monitors, product metrics, and founder dashboards.",
  },
  {
    id: "sahil-lavingia",
    handle: "@shl",
    name: "Sahil Lavingia",
    market: "US",
    angle: "minimal operating systems for creative commerce",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by minimalist commerce themes: simple systems, creator monetization, and disciplined product operations. Do not depict the real person or imply endorsement. Show streamlined commerce rails, checkout data, and creator ops dashboards.",
  },
  {
    id: "jack-butcher",
    handle: "@jackbutcher",
    name: "Jack Butcher",
    market: "US",
    angle: "visual clarity translated into AI operating leverage",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by visual-clarity themes: simple value diagrams, crisp design systems, and AI-enabled brand operations. Do not depict the real person or imply endorsement. Show motion graphics, clean grids, and content systems.",
  },
  {
    id: "ali-abdaal",
    handle: "@aliabdaal",
    name: "Ali Abdaal",
    market: "US",
    angle: "productivity systems upgraded into AI workflows",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by productivity and creator-education themes: reducing tool fatigue, upgrading workflows, and turning advice into execution systems. Do not depict the real person or imply endorsement. Show study dashboards, scheduling systems, and automation lanes.",
  },
  {
    id: "codie-sanchez",
    handle: "@codie_sanchez",
    name: "Codie Sanchez",
    market: "US",
    angle: "operational rigor for cashflow businesses and advisory ops",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by cashflow-business themes: process rigor, operator dashboards, and AI-assisted back-office systems. Do not depict the real person or imply endorsement. Show acquisition funnels, ops dashboards, and workflow automation.",
  },
  {
    id: "nick-huber",
    handle: "@sweatystartup",
    name: "Nick Huber",
    market: "US",
    angle: "service-business efficiency and delegation systems",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by service-business operator themes: delegation, SOPs, field ops, and margin protection through automation. Do not depict the real person or imply endorsement. Show service dashboards, routing maps, and SOP systems.",
  },
  {
    id: "andrew-chen",
    handle: "@andrewchen",
    name: "Andrew Chen",
    market: "US",
    angle: "venture-pattern recognition and AI adoption signals",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by venture-analysis themes: network effects, AI demand signals, and adoption strategy. Do not depict the real person or imply endorsement. Show portfolio maps, growth charts, and market signal dashboards.",
  },
  {
    id: "iman-gadzhi",
    handle: "@GadzhiIman",
    name: "Iman Gadzhi",
    market: "ME",
    angle: "agency-scale automation and premium client operations",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by agency-scale themes: premium delivery systems, client ops automation, and executive reporting. Do not depict the real person or imply endorsement. Show agency dashboards, lead routing, and delivery automation.",
  },
  {
    id: "alex-hormozi",
    handle: "@AlexHormozi",
    name: "Alex Hormozi",
    market: "US",
    angle: "scale, throughput, and AI-assisted sales systems",
    prompt:
      "Create a premium black-and-gold CyberFlow AI advisory clip inspired by scale and offer-ops themes: sales throughput, execution cadence, and AI-assisted growth systems. Do not depict the real person or imply endorsement. Show pipeline dashboards, team scoreboards, and revenue systems.",
  },
];

function usage() {
  console.log(`Usage:
  node scripts/topview-final-assault.mjs seed [--queue <path>] [--force]
  node scripts/topview-final-assault.mjs run [--queue <path>] [--state <path>] [--spacing-seconds <n>] [--retry-seconds <n>] [--model <name>] [--duration <n>] [--resolution <n>] [--aspect-ratio <ratio>] [--sound <on|off>]`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(command ? 0 : 1);
  }
  const options = {
    command,
    queue: defaultQueuePath,
    state: defaultStatePath,
    spacingSeconds: defaultSpacingSeconds,
    retrySeconds: defaultRetrySeconds,
    model: "Standard",
    duration: 5,
    resolution: 720,
    aspectRatio: "16:9",
    sound: "off",
    force: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    switch (token) {
      case "--queue":
        options.queue = rest[++index];
        break;
      case "--state":
        options.state = rest[++index];
        break;
      case "--spacing-seconds":
        options.spacingSeconds = Number(rest[++index]);
        break;
      case "--retry-seconds":
        options.retrySeconds = Number(rest[++index]);
        break;
      case "--model":
        options.model = rest[++index];
        break;
      case "--duration":
        options.duration = Number(rest[++index]);
        break;
      case "--resolution":
        options.resolution = Number(rest[++index]);
        break;
      case "--aspect-ratio":
        options.aspectRatio = rest[++index];
        break;
      case "--sound":
        options.sound = rest[++index];
        break;
      case "--force":
        options.force = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function appendLog(statePath, line) {
  const logPath = statePath.replace(/\.json$/u, ".log");
  await ensureDir(logPath);
  await fs.appendFile(logPath, `${nowIso()} ${line}\n`, "utf8");
}

function findBridgeEntrypoint() {
  const candidates = [
    path.join(home, ".openclaw", "workspace", "skills", "topview", "topview.js"),
    path.join(process.cwd(), "skills", "topview-bridge", "topview.js"),
  ];
  const entrypoint = candidates.find((candidate) => existsSync(candidate));
  if (!entrypoint) {
    throw new Error("TopView bridge entrypoint was not found.");
  }
  return entrypoint;
}

function runBridge(args) {
  const entrypoint = findBridgeEntrypoint();
  return new Promise((resolve, reject) => {
    const child = spawn("node", [entrypoint, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `Bridge exited with code ${code}`));
    });
  });
}

function parseBridgeJson(output) {
  return JSON.parse(output.stdout.trim());
}

function isRetriableError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return [
    "overdue balance",
    "credits have been refunded",
    "rate limit",
    "429",
    "too many requests",
    "timed out",
    "econnreset",
    "service unavailable",
  ].some((needle) => text.includes(needle));
}

function buildInitialState(queue) {
  return {
    createdAt: nowIso(),
    updatedAt: nowIso(),
    queuePath: "",
    spacingSeconds: defaultSpacingSeconds,
    retrySeconds: defaultRetrySeconds,
    nextIndexToSubmit: 0,
    queue: queue.jobs.map((job) => ({
      ...job,
      taskId: null,
      submittedAt: null,
      status: "pending",
      videoUrls: [],
      editLinks: [],
      error: null,
      attempts: 0,
    })),
  };
}

async function saveState(statePath, state) {
  state.updatedAt = nowIso();
  await writeJson(statePath, state);
}

async function seedQueue(queuePath, force = false) {
  const queue = {
    version: 1,
    generatedAt: nowIso(),
    jobs: whaleJobs,
  };
  if (!force) {
    try {
      await fs.access(queuePath);
      throw new Error(`Queue already exists at ${queuePath}. Use --force to overwrite it.`);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }
  await writeJson(queuePath, queue);
  console.log(`Seeded queue with ${queue.jobs.length} jobs at ${queuePath}`);
}

async function submitJob(job, options) {
  const output = await runBridge([
    "submit_task",
    "--render_prompt",
    job.prompt,
    "--model",
    options.model,
    "--aspect-ratio",
    options.aspectRatio,
    "--resolution",
    String(options.resolution),
    "--duration",
    String(options.duration),
    "--count",
    "1",
    "--sound",
    options.sound,
  ]);
  return parseBridgeJson(output);
}

async function queryJobStatus(taskId) {
  const output = await runBridge(["get_task_status", "--task-id", taskId]);
  return parseBridgeJson(output);
}

async function retryLoop(label, task, options, statePath) {
  for (;;) {
    try {
      return await task();
    } catch (error) {
      if (!isRetriableError(error)) {
        throw error;
      }
      const message = String(error.message || error);
      console.log(`[retry] ${label}: ${message}`);
      await appendLog(statePath, `[retry] ${label}: ${message}`);
      await sleep(options.retrySeconds * 1000);
    }
  }
}

async function waitForFirstTaskToMove(state, options, statePath) {
  const first = state.queue[0];
  if (!first?.taskId) {
    throw new Error("First queue item has no task ID.");
  }
  for (;;) {
    const status = await retryLoop(
      `${first.id}:status`,
      () => queryJobStatus(first.taskId),
      options,
      statePath,
    );
    first.status = status.status;
    first.videoUrls = status.video_urls ?? [];
    first.editLinks = status.edit_links ?? [];
    first.error = null;
    await saveState(statePath, state);
    await appendLog(statePath, `[status] ${first.id}: ${first.status}`);
    if (["init", "running", "success"].includes(first.status)) {
      return;
    }
    await sleep(15_000);
  }
}

async function runQueue(options) {
  const queue = await readJson(options.queue, null);
  if (!queue) {
    throw new Error(`Queue not found at ${options.queue}. Run seed first.`);
  }
  const state = (await readJson(options.state, null)) ?? buildInitialState(queue);
  state.queuePath = options.queue;
  state.spacingSeconds = options.spacingSeconds;
  state.retrySeconds = options.retrySeconds;
  await saveState(options.state, state);

  for (let index = state.nextIndexToSubmit; index < state.queue.length; index += 1) {
    const job = state.queue[index];
    const result = await retryLoop(
      `${job.id}:submit`,
      () => submitJob(job, options),
      options,
      options.state,
    );
    job.taskId = result.task_id;
    job.submittedAt = nowIso();
    job.status = index === 0 ? "submitted" : "queued";
    job.error = null;
    job.attempts += 1;
    state.nextIndexToSubmit = index + 1;
    await saveState(options.state, state);
    await appendLog(options.state, `[submit] ${job.id}: ${job.taskId}`);
    console.log(`Submitted ${job.id} (${job.handle}) -> ${job.taskId}`);

    if (index === 0) {
      await waitForFirstTaskToMove(state, options, options.state);
    }

    if (index < state.queue.length - 1) {
      await sleep(options.spacingSeconds * 1000);
    }
  }

  console.log(`All ${state.queue.length} jobs were submitted. State saved to ${options.state}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "seed") {
    await seedQueue(options.queue, options.force);
    return;
  }
  if (options.command === "run") {
    await runQueue(options);
    return;
  }
  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
