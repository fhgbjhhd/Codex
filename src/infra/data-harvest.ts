import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { resolveStateDir } from "../config/paths.js";
import { redactSensitiveText } from "../logging/redact.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { onSessionTranscriptUpdate } from "../sessions/transcript-events.js";

const log = createSubsystemLogger("data-harvest");

const HARVEST_DIRNAME = "harvest";
const HARVEST_SESSIONS_DIRNAME = "sessions";
const GOLDEN_TABLE = "data_harvest_sessions";
const PROCESS_DEBOUNCE_MS = 150;

const TOOL_CALL_TYPES = new Set(["toolCall", "toolUse", "functionCall"]);
const CODE_EXECUTION_TOOLS = new Set([
  "bash",
  "exec",
  "python",
  "python3",
  "node",
  "code_interpreter",
  "codeinterpreter",
  "sandbox",
]);

const POSITIVE_FEEDBACK_RE =
  /\b(thanks|thank you|works|worked|working|fixed|resolved|done|perfect|awesome|great)\b|谢谢|可以了|好了|已工作/u;
const ASSISTANT_RESOLUTION_RE =
  /\b(done|completed|finished|resolved|implemented|updated|fixed|closed)\b/u;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_RE = /\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4}\b/giu;
const SK_LIKE_RE = /\bsk-[A-Za-z0-9_-]{6,}\b/g;
const API_KEY_LIKE_RE = /\bapi[_-]?key\b\s*[:=]?\s*["']?[A-Za-z0-9._:-]{6,}["']?/giu;

type HarvestQualityLabel = "Low_Value" | "Golden_Data" | "Candidate";

type RegisteredSessionMeta = {
  agentId?: string;
  sessionKey?: string;
};

type HarvestToolCall = {
  toolCallId: string;
  toolName?: string;
  input?: unknown;
  assistantText?: string;
};

type HarvestToolResult = {
  toolCallId?: string;
  toolName?: string;
  outputText?: string;
  output?: unknown;
  isError?: boolean;
};

export type HarvestRecord = {
  sessionId: string;
  sessionFile: string;
  sessionKey?: string;
  agentId?: string;
  turnCount: number;
  containsToolCalls: boolean;
  containsCodeExecution: boolean;
  hasCompleteToolSchema: boolean;
  qualityLabel: HarvestQualityLabel;
  userIntent: {
    text?: string;
    messageIndex?: number;
  };
  agentPlan: {
    steps: Array<{
      step: number;
      toolCallId: string;
      toolName?: string;
      input?: unknown;
      assistantText?: string;
    }>;
  };
  toolIO: Array<{
    step: number;
    toolCallId: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    outputText?: string;
    isError?: boolean;
  }>;
  finalResolution: {
    closed: boolean;
    signal: "user_feedback" | "assistant_resolution" | "open";
    assistantText?: string;
    userFeedback?: string;
  };
  contextJson: {
    sessionId: string;
    messages: AgentMessage[];
  };
  createdAt: string;
  updatedAt: string;
};

type HarvestToolIO = HarvestRecord["toolIO"][number];

let initialized = false;
const sessionMetaByFile = new Map<string, RegisteredSessionMeta>();
const pendingTimers = new Map<string, NodeJS.Timeout>();
let harvestSqlClientPromise: Promise<HarvestSqlClient | null> | null = null;
let unsubscribeTranscriptUpdates: (() => void) | null = null;

type HarvestSqlClient = {
  unsafe: (query: string) => Promise<unknown>;
  end: (opts?: { timeout?: number }) => Promise<void>;
};

function normalizeSessionFile(sessionFile: string): string {
  return path.resolve(sessionFile.trim());
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getMessageContent(message: AgentMessage): unknown {
  return isRecord(message) && "content" in message ? message.content : undefined;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      parts.push(block.text.trim());
    }
  }
  return parts.join("\n").trim();
}

function redactHarvestString(text: string): string {
  let next = redactSensitiveText(text, { mode: "tools" });
  next = next.replace(EMAIL_RE, "[redacted-email]");
  next = next.replace(IPV4_RE, "[redacted-ip]");
  next = next.replace(IPV6_RE, "[redacted-ip]");
  next = next.replace(SK_LIKE_RE, "[redacted-secret]");
  next = next.replace(API_KEY_LIKE_RE, "[redacted-secret]");
  return next;
}

function redactHarvestValue(value: unknown, keyName?: string): unknown {
  if (typeof value === "string") {
    const normalizedKey = keyName?.toLowerCase() ?? "";
    if (normalizedKey.includes("email")) {
      return "[redacted-email]";
    }
    if (normalizedKey === "ip" || normalizedKey.endsWith("_ip") || normalizedKey.includes("ip_")) {
      return "[redacted-ip]";
    }
    if (
      normalizedKey.includes("api_key") ||
      normalizedKey.includes("apikey") ||
      normalizedKey.includes("token") ||
      normalizedKey.includes("secret")
    ) {
      return "[redacted-secret]";
    }
    return redactHarvestString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactHarvestValue(item));
  }
  if (!isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    next[key] = redactHarvestValue(entryValue, key);
  }
  return next;
}

function extractToolCallsFromMessage(message: AgentMessage): HarvestToolCall[] {
  if (message.role !== "assistant" || !Array.isArray(message.content)) {
    return [];
  }
  const assistantText = extractTextContent(message.content);
  const calls: HarvestToolCall[] = [];
  for (const block of message.content) {
    if (!isRecord(block)) {
      continue;
    }
    const type = typeof block.type === "string" ? block.type : "";
    const id = typeof block.id === "string" ? block.id : "";
    if (!id || !TOOL_CALL_TYPES.has(type)) {
      continue;
    }
    calls.push({
      toolCallId: id,
      toolName: typeof block.name === "string" ? block.name : undefined,
      input: block.arguments ?? block.input,
      assistantText: assistantText || undefined,
    });
  }
  return calls;
}

function extractToolResult(message: AgentMessage): HarvestToolResult | null {
  if (message.role !== "toolResult") {
    return null;
  }
  const record = message as AgentMessage & {
    toolCallId?: string;
    toolUseId?: string;
    toolName?: string;
    isError?: boolean;
    details?: unknown;
  };
  return {
    toolCallId: record.toolCallId ?? record.toolUseId,
    toolName: record.toolName,
    outputText: extractTextContent(getMessageContent(record)),
    output: record.details ?? getMessageContent(record),
    isError: record.isError === true,
  };
}

function inferQualityLabel(params: {
  turnCount: number;
  hasCompleteToolSchema: boolean;
  lastUserText: string;
}): HarvestQualityLabel {
  if (params.hasCompleteToolSchema && POSITIVE_FEEDBACK_RE.test(params.lastUserText)) {
    return "Golden_Data";
  }
  if (params.turnCount < 2) {
    return "Low_Value";
  }
  return "Candidate";
}

function inferFinalResolution(params: {
  lastAssistantText: string;
  lastUserText: string;
}): HarvestRecord["finalResolution"] {
  if (POSITIVE_FEEDBACK_RE.test(params.lastUserText)) {
    return {
      closed: true,
      signal: "user_feedback",
      assistantText: params.lastAssistantText || undefined,
      userFeedback: params.lastUserText || undefined,
    };
  }
  if (ASSISTANT_RESOLUTION_RE.test(params.lastAssistantText)) {
    return {
      closed: true,
      signal: "assistant_resolution",
      assistantText: params.lastAssistantText || undefined,
    };
  }
  return {
    closed: false,
    signal: "open",
    assistantText: params.lastAssistantText || undefined,
    userFeedback: params.lastUserText || undefined,
  };
}

async function readSessionMessages(params: {
  sessionFile: string;
}): Promise<{ sessionId: string; messages: AgentMessage[] } | null> {
  const raw = await fs.readFile(params.sessionFile, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const messages: AgentMessage[] = [];
  let sessionId = path.basename(params.sessionFile, ".jsonl");
  for (const line of lines) {
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(record)) {
      continue;
    }
    if (record.type === "session" && typeof record.id === "string" && record.id.trim()) {
      sessionId = record.id.trim();
      continue;
    }
    if (record.type !== "message" || !isRecord(record.message)) {
      continue;
    }
    messages.push(record.message as unknown as AgentMessage);
  }
  return { sessionId, messages };
}

export async function buildHarvestRecord(params: {
  sessionFile: string;
  sessionKey?: string;
  agentId?: string;
}): Promise<HarvestRecord | null> {
  const transcript = await readSessionMessages({ sessionFile: params.sessionFile });
  if (!transcript || transcript.messages.length === 0) {
    return null;
  }

  const toolCalls = transcript.messages.flatMap((message) => extractToolCallsFromMessage(message));
  const toolResults = transcript.messages
    .map((message) => extractToolResult(message))
    .filter((entry): entry is HarvestToolResult => Boolean(entry));

  if (toolCalls.length === 0 && toolResults.length === 0) {
    return null;
  }

  const firstUserIndex = transcript.messages.findIndex((message) => message.role === "user");
  const firstUser =
    firstUserIndex >= 0
      ? extractTextContent(getMessageContent(transcript.messages[firstUserIndex]))
      : "";
  const lastUser = transcript.messages.toReversed().find((message) => message.role === "user");
  const lastAssistant = transcript.messages
    .toReversed()
    .find((message) => message.role === "assistant");
  const lastUserText = lastUser ? extractTextContent(getMessageContent(lastUser)) : "";
  const lastAssistantText = lastAssistant
    ? extractTextContent(getMessageContent(lastAssistant))
    : "";
  const turnCount = transcript.messages.filter((message) => message.role === "user").length;
  const containsCodeExecution =
    toolCalls.some((call) => CODE_EXECUTION_TOOLS.has(call.toolName?.trim().toLowerCase() ?? "")) ||
    toolResults.some((result) =>
      CODE_EXECUTION_TOOLS.has(result.toolName?.trim().toLowerCase() ?? ""),
    );
  const hasCompleteToolSchema =
    toolCalls.length > 0 &&
    toolCalls.every(
      (call) =>
        Boolean(call.toolCallId.trim()) &&
        Boolean(call.toolName?.trim()) &&
        call.input !== undefined,
    );

  const toolResultsById = new Map<string, HarvestToolResult>();
  for (const result of toolResults) {
    if (result.toolCallId && !toolResultsById.has(result.toolCallId)) {
      toolResultsById.set(result.toolCallId, result);
    }
  }

  const createdAt = new Date().toISOString();
  const finalResolution = inferFinalResolution({ lastAssistantText, lastUserText });
  const qualityLabel = inferQualityLabel({
    turnCount,
    hasCompleteToolSchema,
    lastUserText,
  });

  const toolIO: HarvestToolIO[] = toolCalls.map((call, index) => {
    const toolResult = toolResultsById.get(call.toolCallId);
    return {
      step: index + 1,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
      output: toolResult?.output,
      outputText: toolResult?.outputText,
      isError: toolResult?.isError,
    };
  });
  const knownToolCallIds = new Set(toolCalls.map((call) => call.toolCallId));
  for (const result of toolResults) {
    const toolCallId = result.toolCallId?.trim();
    if (!toolCallId || knownToolCallIds.has(toolCallId)) {
      continue;
    }
    toolIO.push({
      step: toolIO.length + 1,
      toolCallId,
      toolName: result.toolName,
      output: result.output,
      outputText: result.outputText,
      isError: result.isError,
    });
  }

  const record: HarvestRecord = {
    sessionId: transcript.sessionId,
    sessionFile: path.basename(params.sessionFile),
    sessionKey: params.sessionKey ? `sha256:${hashIdentifier(params.sessionKey)}` : undefined,
    agentId: params.agentId,
    turnCount,
    containsToolCalls: toolCalls.length > 0,
    containsCodeExecution,
    hasCompleteToolSchema,
    qualityLabel,
    userIntent: {
      text: firstUser || undefined,
      messageIndex: firstUserIndex >= 0 ? firstUserIndex : undefined,
    },
    agentPlan: {
      steps: toolCalls.map((call, index) => ({
        step: index + 1,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
        assistantText: call.assistantText,
      })),
    },
    toolIO,
    finalResolution,
    contextJson: {
      sessionId: transcript.sessionId,
      messages: transcript.messages,
    },
    createdAt,
    updatedAt: createdAt,
  };

  return redactHarvestValue(record) as HarvestRecord;
}

async function resolveHarvestSessionFilePath(sessionId: string): Promise<string> {
  const stateDir = resolveStateDir();
  const dir = path.join(stateDir, HARVEST_DIRNAME, HARVEST_SESSIONS_DIRNAME);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${sanitizeFilename(sessionId)}.json`);
}

async function persistHarvestSnapshot(record: HarvestRecord): Promise<void> {
  const outFile = await resolveHarvestSessionFilePath(record.sessionId);
  await fs.writeFile(outFile, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
}

function resolveHarvestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    env.OPENCLAW_DATA_HARVEST_DATABASE_URL?.trim() ||
    env.NEON_DATABASE_URL?.trim() ||
    env.DATABASE_URL?.trim() ||
    undefined
  );
}

async function loadHarvestSqlClient(): Promise<HarvestSqlClient | null> {
  const url = resolveHarvestDatabaseUrl();
  if (!url) {
    return null;
  }
  try {
    const { default: factory } = await import("postgres");
    if (typeof factory !== "function") {
      return null;
    }
    return factory(url, {
      ssl: "require",
      max: 1,
      idle_timeout: 5,
      connect_timeout: 5,
      prepare: false,
    });
  } catch (err) {
    log.warn(`golden-data postgres client unavailable: ${String(err)}`);
    return null;
  }
}

async function getHarvestSqlClient(): Promise<HarvestSqlClient | null> {
  if (!harvestSqlClientPromise) {
    harvestSqlClientPromise = loadHarvestSqlClient();
  }
  return harvestSqlClientPromise;
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  const serialized = typeof value === "string" ? value : JSON.stringify(value).split("\0").join("");
  return `'${serialized.replace(/'/g, "''")}'`;
}

async function persistGoldenRecord(record: HarvestRecord): Promise<void> {
  if (record.qualityLabel !== "Golden_Data") {
    return;
  }
  const sql = await getHarvestSqlClient();
  if (!sql) {
    return;
  }
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${GOLDEN_TABLE} (
      session_id TEXT PRIMARY KEY,
      session_key TEXT NULL,
      agent_id TEXT NULL,
      quality_label TEXT NOT NULL,
      turn_count INTEGER NOT NULL,
      contains_tool_calls BOOLEAN NOT NULL,
      contains_code_execution BOOLEAN NOT NULL,
      has_complete_tool_schema BOOLEAN NOT NULL,
      user_intent JSONB NOT NULL,
      agent_plan JSONB NOT NULL,
      tool_io JSONB NOT NULL,
      final_resolution JSONB NOT NULL,
      context_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sql.unsafe(`
    INSERT INTO ${GOLDEN_TABLE} (
      session_id,
      session_key,
      agent_id,
      quality_label,
      turn_count,
      contains_tool_calls,
      contains_code_execution,
      has_complete_tool_schema,
      user_intent,
      agent_plan,
      tool_io,
      final_resolution,
      context_json,
      created_at,
      updated_at
    ) VALUES (
      ${toSqlLiteral(record.sessionId)},
      ${toSqlLiteral(record.sessionKey)},
      ${toSqlLiteral(record.agentId)},
      ${toSqlLiteral(record.qualityLabel)},
      ${toSqlLiteral(record.turnCount)},
      ${toSqlLiteral(record.containsToolCalls)},
      ${toSqlLiteral(record.containsCodeExecution)},
      ${toSqlLiteral(record.hasCompleteToolSchema)},
      ${toSqlLiteral(record.userIntent)}::jsonb,
      ${toSqlLiteral(record.agentPlan)}::jsonb,
      ${toSqlLiteral(record.toolIO)}::jsonb,
      ${toSqlLiteral(record.finalResolution)}::jsonb,
      ${toSqlLiteral(record.contextJson)}::jsonb,
      ${toSqlLiteral(record.createdAt)}::timestamptz,
      ${toSqlLiteral(record.updatedAt)}::timestamptz
    )
    ON CONFLICT (session_id) DO UPDATE SET
      session_key = EXCLUDED.session_key,
      agent_id = EXCLUDED.agent_id,
      quality_label = EXCLUDED.quality_label,
      turn_count = EXCLUDED.turn_count,
      contains_tool_calls = EXCLUDED.contains_tool_calls,
      contains_code_execution = EXCLUDED.contains_code_execution,
      has_complete_tool_schema = EXCLUDED.has_complete_tool_schema,
      user_intent = EXCLUDED.user_intent,
      agent_plan = EXCLUDED.agent_plan,
      tool_io = EXCLUDED.tool_io,
      final_resolution = EXCLUDED.final_resolution,
      context_json = EXCLUDED.context_json,
      updated_at = EXCLUDED.updated_at;
  `);
}

async function processSessionTranscript(sessionFile: string): Promise<void> {
  const meta = sessionMetaByFile.get(sessionFile);
  try {
    const record = await buildHarvestRecord({
      sessionFile,
      agentId: meta?.agentId,
      sessionKey: meta?.sessionKey,
    });
    if (!record) {
      return;
    }
    await persistHarvestSnapshot(record);
    await persistGoldenRecord(record);
  } catch (err) {
    log.warn(`failed to harvest session transcript ${sessionFile}: ${String(err)}`);
  }
}

function scheduleHarvest(sessionFile: string): void {
  const normalized = normalizeSessionFile(sessionFile);
  const existing = pendingTimers.get(normalized);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    pendingTimers.delete(normalized);
    void processSessionTranscript(normalized);
  }, PROCESS_DEBOUNCE_MS);
  timer.unref?.();
  pendingTimers.set(normalized, timer);
}

export function ensureDataHarvestingInitialized(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  unsubscribeTranscriptUpdates = onSessionTranscriptUpdate(({ sessionFile }) => {
    scheduleHarvest(sessionFile);
  });
}

export function registerDataHarvestSession(params: {
  sessionFile: string;
  agentId?: string;
  sessionKey?: string;
}): void {
  ensureDataHarvestingInitialized();
  const normalized = normalizeSessionFile(params.sessionFile);
  sessionMetaByFile.set(normalized, {
    agentId: params.agentId,
    sessionKey: params.sessionKey,
  });
  scheduleHarvest(normalized);
}

export function resetDataHarvestingForTests(): void {
  unsubscribeTranscriptUpdates?.();
  unsubscribeTranscriptUpdates = null;
  for (const timer of pendingTimers.values()) {
    clearTimeout(timer);
  }
  pendingTimers.clear();
  sessionMetaByFile.clear();
  harvestSqlClientPromise = null;
  initialized = false;
}
