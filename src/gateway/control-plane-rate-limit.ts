import type { GatewayClient } from "./server-methods/types.js";

const DEFAULT_CONTROL_PLANE_RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 60_000,
  label: "3 per 60s",
} as const;

const CONTROL_PLANE_RATE_LIMIT_BY_METHOD: Record<
  string,
  { maxRequests: number; windowMs: number; label: string }
> = {
  "update.run": {
    maxRequests: 1,
    windowMs: 10_000,
    label: "1 per 10s",
  },
};

type Bucket = {
  count: number;
  windowStartMs: number;
};

const controlPlaneBuckets = new Map<string, Bucket>();

function normalizePart(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

export function resolveControlPlaneRateLimitKey(client: GatewayClient | null): string {
  const deviceId = normalizePart(client?.connect?.device?.id, "unknown-device");
  const clientIp = normalizePart(client?.clientIp, "unknown-ip");
  if (deviceId === "unknown-device" && clientIp === "unknown-ip") {
    // Last-resort fallback: avoid cross-client contention when upstream identity is missing.
    const connId = normalizePart(client?.connId, "");
    if (connId) {
      return `${deviceId}|${clientIp}|conn=${connId}`;
    }
  }
  return `${deviceId}|${clientIp}`;
}

function resolveControlPlaneRateLimitWindow(method: string) {
  return CONTROL_PLANE_RATE_LIMIT_BY_METHOD[method] ?? DEFAULT_CONTROL_PLANE_RATE_LIMIT;
}

export function consumeControlPlaneWriteBudget(params: {
  client: GatewayClient | null;
  method: string;
  nowMs?: number;
}): {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
  key: string;
  limitLabel: string;
} {
  const nowMs = params.nowMs ?? Date.now();
  const limit = resolveControlPlaneRateLimitWindow(params.method);
  const key = `${params.method}|${resolveControlPlaneRateLimitKey(params.client)}`;
  const bucket = controlPlaneBuckets.get(key);

  if (!bucket || nowMs - bucket.windowStartMs >= limit.windowMs) {
    controlPlaneBuckets.set(key, {
      count: 1,
      windowStartMs: nowMs,
    });
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: limit.maxRequests - 1,
      key,
      limitLabel: limit.label,
    };
  }

  if (bucket.count >= limit.maxRequests) {
    const retryAfterMs = Math.max(0, bucket.windowStartMs + limit.windowMs - nowMs);
    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
      key,
      limitLabel: limit.label,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: Math.max(0, limit.maxRequests - bucket.count),
    key,
    limitLabel: limit.label,
  };
}

export const __testing = {
  resetControlPlaneRateLimitState() {
    controlPlaneBuckets.clear();
  },
};
