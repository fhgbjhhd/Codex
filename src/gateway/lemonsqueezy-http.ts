import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "../infra/http-body.js";
import { safeEqualSecret } from "../security/secret-equal.js";
import { sendJson, sendMethodNotAllowed, sendUnauthorized } from "./http-common.js";
import { getHeader } from "./http-utils.js";

const LEMONSQUEEZY_CALLBACK_PATH = "/integrations/lemonsqueezy/webhook";
const DEFAULT_BODY_BYTES = 256 * 1024;
const NINETEEN_DOLLARS_IN_CENTS = 1900;

type LemonSqueezyOrderCreatedPayload = {
  meta?: {
    event_name?: unknown;
  };
  data?: {
    attributes?: {
      currency?: unknown;
      total?: unknown;
      total_usd?: unknown;
      user_email?: unknown;
    };
  };
};

type LemonSqueezyWebhookOptions = {
  secret?: string;
  maxBodyBytes?: number;
  log?: (message: string) => void;
};

function resolveWebhookSecret(opts?: LemonSqueezyWebhookOptions): string {
  return (opts?.secret ?? process.env.OPENCLAW_LEMONSQUEEZY_WEBHOOK_SECRET ?? "").trim();
}

function verifyLemonSqueezySignature(params: {
  rawBody: string;
  signature: string | undefined;
  secret: string;
}): boolean {
  const signature = params.signature?.trim() ?? "";
  if (!signature) {
    return false;
  }

  const expectedHex = createHmac("sha256", params.secret).update(params.rawBody).digest("hex");
  const expected = Buffer.from(expectedHex, "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

function isOrderCreated(req: IncomingMessage, payload: LemonSqueezyOrderCreatedPayload): boolean {
  const headerEvent = getHeader(req, "x-event-name")?.trim();
  if (headerEvent) {
    return safeEqualSecret(headerEvent, "order_created");
  }
  const metaEvent = typeof payload.meta?.event_name === "string" ? payload.meta.event_name : "";
  return safeEqualSecret(metaEvent, "order_created");
}

function isNineteenDollarOrder(payload: LemonSqueezyOrderCreatedPayload): boolean {
  const attributes = payload.data?.attributes;
  if (!attributes) {
    return false;
  }

  if (attributes.total_usd === NINETEEN_DOLLARS_IN_CENTS) {
    return true;
  }

  const currency = typeof attributes.currency === "string" ? attributes.currency : "";
  return (
    safeEqualSecret(currency.toUpperCase(), "USD") && attributes.total === NINETEEN_DOLLARS_IN_CENTS
  );
}

function resolveUserEmail(payload: LemonSqueezyOrderCreatedPayload): string {
  const email = payload.data?.attributes?.user_email;
  return typeof email === "string" && email.trim() ? email.trim() : "unknown";
}

export async function handleLemonSqueezyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts?: LemonSqueezyWebhookOptions,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== LEMONSQUEEZY_CALLBACK_PATH) {
    return false;
  }

  if (req.method !== "POST") {
    sendMethodNotAllowed(res, "POST");
    return true;
  }

  const secret = resolveWebhookSecret(opts);
  if (!secret) {
    sendJson(res, 503, {
      ok: false,
      error: "Lemon Squeezy webhook secret is not configured.",
    });
    return true;
  }

  let rawBody: string;
  try {
    rawBody = await readRequestBodyWithLimit(req, {
      maxBytes: opts?.maxBodyBytes ?? DEFAULT_BODY_BYTES,
    });
  } catch (error) {
    if (isRequestBodyLimitError(error)) {
      sendJson(res, error.statusCode, { ok: false, error: requestBodyErrorToText(error.code) });
      return true;
    }
    sendJson(res, 400, { ok: false, error: "Invalid request body" });
    return true;
  }

  if (
    !verifyLemonSqueezySignature({
      rawBody,
      signature: getHeader(req, "x-signature"),
      secret,
    })
  ) {
    sendUnauthorized(res);
    return true;
  }

  let payload: LemonSqueezyOrderCreatedPayload;
  try {
    payload = JSON.parse(rawBody) as LemonSqueezyOrderCreatedPayload;
  } catch {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return true;
  }

  if (isOrderCreated(req, payload) && isNineteenDollarOrder(payload)) {
    const log = opts?.log ?? console.log;
    log(`💰 收到孙总的备注：${resolveUserEmail(payload)}`);
  }

  sendJson(res, 200, { ok: true });
  return true;
}
