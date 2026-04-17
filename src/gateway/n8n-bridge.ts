import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_GATEWAY_PORT, resolveStateDir } from "../config/paths.js";

export type N8nStepStatus = "pending" | "running" | "success" | "error";
export type N8nRunStatus = "pending" | "running" | "success" | "error";

export type N8nTaskStep = {
  key: string;
  label: string;
  status: N8nStepStatus;
  detail?: string;
  updatedAtMs: number;
};

export type N8nTaskRun = {
  id: string;
  workflowKey: string;
  workflowLabel: string;
  sourceUrl?: string;
  region?: string;
  status: N8nRunStatus;
  createdAtMs: number;
  updatedAtMs: number;
  executionId?: string;
  error?: string;
  steps: N8nTaskStep[];
};

export type N8nBridgeStatus = {
  configured: boolean;
  webhookConfigured: boolean;
  callbackConfigured: boolean;
  callbackUrl: string;
  runsPath: string;
  workflowKey: "research-ingest";
  workflowLabel: string;
};

export type N8nTriggerParams = {
  sourceUrl: string;
  region: "US" | "MX" | "ME";
};

export type N8nStatusCallbackPayload = {
  bridgeRunId: string;
  workflowKey?: string;
  workflowLabel?: string;
  executionId?: string | number;
  status?: string;
  error?: string;
  stepKey?: string;
  stepLabel?: string;
  stepStatus?: string;
  stepDetail?: string;
  steps?: Array<{
    key?: string;
    label?: string;
    status?: string;
    detail?: string;
  }>;
};

const DEFAULT_WORKFLOW_KEY = "research-ingest";
const DEFAULT_WORKFLOW_LABEL = "Research -> Ingest";
const CALLBACK_PATH = "/integrations/n8n/callback";
const RUNS_FILENAME = "runs.json";
const MAX_RUNS = 100;
let writes = Promise.resolve();

function normalizeEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function resolveRunsPath() {
  const override = normalizeEnv(process.env.OPENCLAW_N8N_RUNS_PATH);
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveStateDir(), "n8n", RUNS_FILENAME);
}

function resolveCallbackBaseUrl() {
  return (
    normalizeEnv(process.env.OPENCLAW_N8N_CALLBACK_BASE_URL) ??
    `http://127.0.0.1:${process.env.OPENCLAW_GATEWAY_PORT ?? DEFAULT_GATEWAY_PORT}`
  );
}

export function resolveN8nBridgeStatus(): N8nBridgeStatus {
  const webhookUrl = normalizeEnv(process.env.OPENCLAW_N8N_WEBHOOK_RESEARCH_INGEST_URL);
  const callbackToken = normalizeEnv(process.env.OPENCLAW_N8N_STATUS_TOKEN);
  return {
    configured: Boolean(webhookUrl && callbackToken),
    webhookConfigured: Boolean(webhookUrl),
    callbackConfigured: Boolean(callbackToken),
    callbackUrl: new URL(CALLBACK_PATH, resolveCallbackBaseUrl()).toString(),
    runsPath: resolveRunsPath(),
    workflowKey: DEFAULT_WORKFLOW_KEY,
    workflowLabel: DEFAULT_WORKFLOW_LABEL,
  };
}

export function resolveN8nStatusToken() {
  return normalizeEnv(process.env.OPENCLAW_N8N_STATUS_TOKEN);
}

function normalizeStepStatus(value: string | undefined): N8nStepStatus {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "success" ||
    normalized === "ok" ||
    normalized === "completed" ||
    normalized === "done"
  ) {
    return "success";
  }
  if (normalized === "error" || normalized === "failed" || normalized === "failure") {
    return "error";
  }
  if (normalized === "running" || normalized === "active" || normalized === "in_progress") {
    return "running";
  }
  return "pending";
}

function normalizeRunStatus(value: string | undefined): N8nRunStatus | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "success" ||
    normalized === "ok" ||
    normalized === "completed" ||
    normalized === "done"
  ) {
    return "success";
  }
  if (normalized === "error" || normalized === "failed" || normalized === "failure") {
    return "error";
  }
  if (normalized === "running" || normalized === "active" || normalized === "in_progress") {
    return "running";
  }
  if (normalized === "pending" || normalized === "queued") {
    return "pending";
  }
  return null;
}

function baseSteps(nowMs: number): N8nTaskStep[] {
  return [
    { key: "dispatch", label: "Webhook dispatch", status: "pending", updatedAtMs: nowMs },
    { key: "research", label: "Research", status: "pending", updatedAtMs: nowMs },
    { key: "ingest", label: "Ingest", status: "pending", updatedAtMs: nowMs },
  ];
}

function computeRunStatus(run: Pick<N8nTaskRun, "steps" | "error">): N8nRunStatus {
  if (run.error || run.steps.some((step) => step.status === "error")) {
    return "error";
  }
  if (run.steps.length > 0 && run.steps.every((step) => step.status === "success")) {
    return "success";
  }
  if (run.steps.some((step) => step.status === "running" || step.status === "success")) {
    return "running";
  }
  return "pending";
}

async function readRuns(): Promise<N8nTaskRun[]> {
  const filePath = resolveRunsPath();
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is N8nTaskRun =>
      Boolean(entry && typeof entry === "object"),
    );
  } catch {
    return [];
  }
}

async function writeRuns(runs: N8nTaskRun[]) {
  const filePath = resolveRunsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(runs.slice(0, MAX_RUNS), null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function mutateRuns<T>(mutator: (runs: N8nTaskRun[]) => Promise<T> | T): Promise<T> {
  const previous = writes;
  let release = () => {};
  writes = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    const runs = await readRuns();
    const result = await mutator(runs);
    await writeRuns(runs);
    return result;
  } finally {
    release();
  }
}

function upsertStep(
  run: N8nTaskRun,
  step: {
    key?: string;
    label?: string;
    status?: string;
    detail?: string;
  },
) {
  const key =
    readString(step.key) ?? readString(step.label)?.toLowerCase().replace(/\s+/g, "-") ?? "step";
  const label = readString(step.label) ?? key;
  const nextStatus = normalizeStepStatus(step.status);
  const nextDetail = readString(step.detail);
  const nowMs = Date.now();
  const existing = run.steps.find((entry) => entry.key === key);
  if (existing) {
    existing.label = label;
    existing.status = nextStatus;
    existing.detail = nextDetail;
    existing.updatedAtMs = nowMs;
    return;
  }
  run.steps.push({
    key,
    label,
    status: nextStatus,
    detail: nextDetail,
    updatedAtMs: nowMs,
  });
}

export async function listN8nTaskRuns(limit = 20): Promise<N8nTaskRun[]> {
  const runs = await readRuns();
  return runs
    .toSorted((a, b) => b.updatedAtMs - a.updatedAtMs)
    .slice(0, Math.max(1, Math.min(limit, MAX_RUNS)));
}

export async function triggerResearchIngestRun(params: N8nTriggerParams): Promise<N8nTaskRun> {
  const status = resolveN8nBridgeStatus();
  const webhookUrl = normalizeEnv(process.env.OPENCLAW_N8N_WEBHOOK_RESEARCH_INGEST_URL);
  const callbackToken = resolveN8nStatusToken();
  if (!webhookUrl) {
    throw new Error("n8n webhook is not configured (OPENCLAW_N8N_WEBHOOK_RESEARCH_INGEST_URL).");
  }
  if (!callbackToken) {
    throw new Error("n8n callback token is not configured (OPENCLAW_N8N_STATUS_TOKEN).");
  }

  const nowMs = Date.now();
  const run: N8nTaskRun = {
    id: randomUUID(),
    workflowKey: status.workflowKey,
    workflowLabel: status.workflowLabel,
    sourceUrl: params.sourceUrl.trim(),
    region: params.region,
    status: "running",
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    steps: baseSteps(nowMs),
  };
  run.steps[0] = {
    key: "dispatch",
    label: "Webhook dispatch",
    status: "running",
    updatedAtMs: nowMs,
  };

  await mutateRuns(async (runs) => {
    runs.unshift(run);
  });

  let responseText = "";
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        bridgeRunId: run.id,
        sourceUrl: run.sourceUrl,
        region: run.region,
        callbackUrl: status.callbackUrl,
        callbackToken,
      }),
    });
    responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `n8n webhook failed (${response.status}): ${responseText || response.statusText}`,
      );
    }
    let parsed: { executionId?: unknown } | null = null;
    try {
      parsed = responseText ? (JSON.parse(responseText) as { executionId?: unknown }) : null;
    } catch {
      parsed = null;
    }
    await mutateRuns(async (runs) => {
      const target = runs.find((entry) => entry.id === run.id);
      if (!target) {
        return;
      }
      upsertStep(target, {
        key: "dispatch",
        label: "Webhook dispatch",
        status: "success",
        detail: "n8n workflow accepted the trigger.",
      });
      const executionId = parsed?.executionId;
      if (typeof executionId === "string" || typeof executionId === "number") {
        target.executionId = String(executionId);
      }
      target.updatedAtMs = Date.now();
      target.status = computeRunStatus(target);
    });
  } catch (error) {
    await mutateRuns(async (runs) => {
      const target = runs.find((entry) => entry.id === run.id);
      if (!target) {
        return;
      }
      target.error = error instanceof Error ? error.message : String(error);
      upsertStep(target, {
        key: "dispatch",
        label: "Webhook dispatch",
        status: "error",
        detail: target.error,
      });
      target.updatedAtMs = Date.now();
      target.status = "error";
    });
    throw error;
  }

  const [latest] = await listN8nTaskRuns(1);
  return latest ?? run;
}

export async function applyN8nStatusCallback(
  payload: N8nStatusCallbackPayload,
): Promise<N8nTaskRun | null> {
  const runId = readString((payload as { bridgeRunId?: unknown }).bridgeRunId);
  if (!runId) {
    throw new Error("bridgeRunId is required");
  }
  return await mutateRuns(async (runs) => {
    const target = runs.find((entry) => entry.id === runId);
    if (!target) {
      return null;
    }
    const workflowLabel = readString((payload as { workflowLabel?: unknown }).workflowLabel);
    if (workflowLabel) {
      target.workflowLabel = workflowLabel;
    }
    const workflowKey = readString((payload as { workflowKey?: unknown }).workflowKey);
    if (workflowKey) {
      target.workflowKey = workflowKey;
    }
    if (payload.executionId !== undefined && payload.executionId !== null) {
      target.executionId = String(payload.executionId);
    }
    if (payload.stepKey || payload.stepLabel || payload.stepStatus) {
      upsertStep(target, {
        key: payload.stepKey,
        label: payload.stepLabel,
        status: payload.stepStatus,
        detail: payload.stepDetail,
      });
    }
    if (Array.isArray(payload.steps)) {
      for (const step of payload.steps) {
        upsertStep(target, step);
      }
    }
    const nextRunStatus = normalizeRunStatus(payload.status);
    const error = readString((payload as { error?: unknown }).error);
    if (error) {
      target.error = error;
    }
    target.updatedAtMs = Date.now();
    target.status = nextRunStatus ?? computeRunStatus(target);
    return target;
  });
}
