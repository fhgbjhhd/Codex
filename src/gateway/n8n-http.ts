import type { IncomingMessage, ServerResponse } from "node:http";
import { safeEqualSecret } from "../security/secret-equal.js";
import {
  readJsonBodyOrError,
  sendJson,
  sendMethodNotAllowed,
  sendUnauthorized,
} from "./http-common.js";
import { getBearerToken, getHeader } from "./http-utils.js";
import {
  applyN8nStatusCallback,
  resolveN8nStatusToken,
  type N8nStatusCallbackPayload,
} from "./n8n-bridge.js";

const N8N_CALLBACK_PATH = "/integrations/n8n/callback";
const DEFAULT_BODY_BYTES = 256 * 1024;

function resolveCallbackToken(req: IncomingMessage) {
  const bearer = getBearerToken(req);
  if (bearer?.trim()) {
    return bearer.trim();
  }
  const header = getHeader(req, "x-openclaw-n8n-token");
  return header?.trim() || "";
}

export async function handleN8nHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== N8N_CALLBACK_PATH) {
    return false;
  }

  if (req.method !== "POST") {
    sendMethodNotAllowed(res, "POST");
    return true;
  }

  const expectedToken = resolveN8nStatusToken();
  if (!expectedToken) {
    sendJson(res, 503, {
      ok: false,
      error: "n8n callback token is not configured (OPENCLAW_N8N_STATUS_TOKEN).",
    });
    return true;
  }
  const suppliedToken = resolveCallbackToken(req);
  if (!safeEqualSecret(suppliedToken, expectedToken)) {
    sendUnauthorized(res);
    return true;
  }

  const body = await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES);
  if (body === undefined) {
    return true;
  }

  try {
    const run = await applyN8nStatusCallback((body ?? {}) as N8nStatusCallbackPayload);
    if (!run) {
      sendJson(res, 404, { ok: false, error: "bridge run not found" });
      return true;
    }
    sendJson(res, 200, { ok: true, run });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return true;
}
