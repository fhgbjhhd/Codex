import { GatewayRequestError, type GatewayBrowserClient } from "../gateway.ts";
import type { ConfigSchemaResponse, ConfigSnapshot, ConfigUiHints } from "../types.ts";
import type { JsonSchema } from "../views/config-form.shared.ts";
import { coerceFormValues } from "./config/form-coerce.ts";
import {
  cloneConfigObject,
  removePathValue,
  serializeConfigForm,
  setPathValue,
} from "./config/form-utils.ts";

const UPDATE_RUN_MIN_INTERVAL_MS = 10_000;

export type ConfigState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  applySessionKey: string;
  configLoading: boolean;
  configRaw: string;
  configRawOriginal: string;
  configValid: boolean | null;
  configIssues: unknown[];
  configSaving: boolean;
  configApplying: boolean;
  updateRunning: boolean;
  updateRetryUntilMs: number | null;
  updateRetryTimer: number | null;
  configSnapshot: ConfigSnapshot | null;
  configSchema: unknown;
  configSchemaVersion: string | null;
  configSchemaLoading: boolean;
  configUiHints: ConfigUiHints;
  configForm: Record<string, unknown> | null;
  configFormOriginal: Record<string, unknown> | null;
  configFormDirty: boolean;
  configFormMode: "form" | "raw";
  configSearchQuery: string;
  configActiveSection: string | null;
  configActiveSubsection: string | null;
  lastError: string | null;
};

export async function loadConfig(state: ConfigState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.configLoading = true;
  state.lastError = null;
  try {
    const res = await state.client.request<ConfigSnapshot>("config.get", {});
    applyConfigSnapshot(state, res);
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.configLoading = false;
  }
}

export async function loadConfigSchema(state: ConfigState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.configSchemaLoading) {
    return;
  }
  state.configSchemaLoading = true;
  try {
    const res = await state.client.request<ConfigSchemaResponse>("config.schema", {});
    applyConfigSchema(state, res);
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.configSchemaLoading = false;
  }
}

export function applyConfigSchema(state: ConfigState, res: ConfigSchemaResponse) {
  state.configSchema = res.schema ?? null;
  state.configUiHints = res.uiHints ?? {};
  state.configSchemaVersion = res.version ?? null;
}

export function applyConfigSnapshot(state: ConfigState, snapshot: ConfigSnapshot) {
  state.configSnapshot = snapshot;
  const rawFromSnapshot =
    typeof snapshot.raw === "string"
      ? snapshot.raw
      : snapshot.config && typeof snapshot.config === "object"
        ? serializeConfigForm(snapshot.config)
        : state.configRaw;
  if (!state.configFormDirty || state.configFormMode === "raw") {
    state.configRaw = rawFromSnapshot;
  } else if (state.configForm) {
    state.configRaw = serializeConfigForm(state.configForm);
  } else {
    state.configRaw = rawFromSnapshot;
  }
  state.configValid = typeof snapshot.valid === "boolean" ? snapshot.valid : null;
  state.configIssues = Array.isArray(snapshot.issues) ? snapshot.issues : [];

  if (!state.configFormDirty) {
    state.configForm = cloneConfigObject(snapshot.config ?? {});
    state.configFormOriginal = cloneConfigObject(snapshot.config ?? {});
    state.configRawOriginal = rawFromSnapshot;
  }
}

function asJsonSchema(value: unknown): JsonSchema | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonSchema;
}

/**
 * Serialize the form state for submission to `config.set` / `config.apply`.
 *
 * HTML `<input>` elements produce string `.value` properties, so numeric and
 * boolean config fields can leak into `configForm` as strings.  We coerce
 * them back to their schema-defined types before JSON serialization so the
 * gateway's Zod validation always sees correctly typed values.
 */
function serializeFormForSubmit(state: ConfigState): string {
  if (state.configFormMode !== "form" || !state.configForm) {
    return state.configRaw;
  }
  const schema = asJsonSchema(state.configSchema);
  const form = schema
    ? (coerceFormValues(state.configForm, schema) as Record<string, unknown>)
    : state.configForm;
  return serializeConfigForm(form);
}

export async function saveConfig(state: ConfigState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.configSaving = true;
  state.lastError = null;
  try {
    const raw = serializeFormForSubmit(state);
    const baseHash = state.configSnapshot?.hash;
    if (!baseHash) {
      state.lastError = "Config hash missing; reload and retry.";
      return;
    }
    await state.client.request("config.set", { raw, baseHash });
    state.configFormDirty = false;
    await loadConfig(state);
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.configSaving = false;
  }
}

export async function applyConfig(state: ConfigState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.configApplying = true;
  state.lastError = null;
  try {
    const raw = serializeFormForSubmit(state);
    const baseHash = state.configSnapshot?.hash;
    if (!baseHash) {
      state.lastError = "Config hash missing; reload and retry.";
      return;
    }
    await state.client.request("config.apply", {
      raw,
      baseHash,
      sessionKey: state.applySessionKey,
    });
    state.configFormDirty = false;
    await loadConfig(state);
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.configApplying = false;
  }
}

export async function runUpdate(state: ConfigState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.updateRetryUntilMs && state.updateRetryUntilMs > Date.now()) {
    const retryInSeconds = Math.max(1, Math.ceil((state.updateRetryUntilMs - Date.now()) / 1000));
    state.lastError = `Update cooling down. Retry in ${retryInSeconds}s.`;
    return;
  }
  state.updateRunning = true;
  state.lastError = null;
  try {
    const response = await state.client.request<{
      result?: { status?: string; reason?: string };
    }>("update.run", {
      sessionKey: state.applySessionKey,
    });
    const status = response?.result?.status;
    const reason = response?.result?.reason;
    if (status === "skipped" && reason === "dirty") {
      state.lastError =
        "Update skipped: the running checkout has local changes. Clean the worktree or use the package-manager upgrade path.";
    } else if (status === "skipped") {
      state.lastError = `Update skipped: ${reason ?? "preflight conditions were not met"}.`;
    } else if (status === "error") {
      state.lastError = `Update failed: ${reason ?? "unknown error"}.`;
    } else {
      scheduleUpdateCooldown(state, UPDATE_RUN_MIN_INTERVAL_MS);
    }
    if (status === "skipped" || status === "error") {
      scheduleUpdateCooldown(state, UPDATE_RUN_MIN_INTERVAL_MS);
    }
  } catch (err) {
    if (err instanceof GatewayRequestError) {
      const retryAfterMs = extractRetryAfterMs(err.details);
      if (retryAfterMs != null) {
        scheduleUpdateCooldown(state, Math.max(retryAfterMs, UPDATE_RUN_MIN_INTERVAL_MS));
        state.lastError = `Update rate-limited by gateway control-plane budget. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`;
      } else {
        scheduleUpdateCooldown(state, UPDATE_RUN_MIN_INTERVAL_MS);
        state.lastError = err.message;
      }
    } else {
      scheduleUpdateCooldown(state, UPDATE_RUN_MIN_INTERVAL_MS);
      state.lastError = String(err);
    }
  } finally {
    state.updateRunning = false;
  }
}

function scheduleUpdateCooldown(state: ConfigState, delayMs: number) {
  const nextRetryUntilMs = Date.now() + Math.max(0, Math.floor(delayMs));
  if (state.updateRetryUntilMs && state.updateRetryUntilMs >= nextRetryUntilMs) {
    return;
  }
  state.updateRetryUntilMs = nextRetryUntilMs;
  if (state.updateRetryTimer !== null) {
    clearTimeout(state.updateRetryTimer);
  }
  state.updateRetryTimer = window.setTimeout(
    () => {
      state.updateRetryUntilMs = null;
      state.updateRetryTimer = null;
    },
    Math.max(0, nextRetryUntilMs - Date.now()) + 50,
  );
}

function extractRetryAfterMs(details: unknown): number | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const retryAfterMs = (details as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? retryAfterMs
    : null;
}

export function updateConfigFormValue(
  state: ConfigState,
  path: Array<string | number>,
  value: unknown,
) {
  const base = cloneConfigObject(state.configForm ?? state.configSnapshot?.config ?? {});
  setPathValue(base, path, value);
  state.configForm = base;
  state.configFormDirty = true;
  if (state.configFormMode === "form") {
    state.configRaw = serializeConfigForm(base);
  }
}

export function removeConfigFormValue(state: ConfigState, path: Array<string | number>) {
  const base = cloneConfigObject(state.configForm ?? state.configSnapshot?.config ?? {});
  removePathValue(base, path);
  state.configForm = base;
  state.configFormDirty = true;
  if (state.configFormMode === "form") {
    state.configRaw = serializeConfigForm(base);
  }
}
