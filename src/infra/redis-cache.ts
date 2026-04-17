import net from "node:net";
import tls from "node:tls";
import { isTruthyEnvValue, logAcceptedEnvOption } from "./env.js";

type RedisReply = string | number | null | { error: string };

type RedisCacheConfig = {
  url: string;
  tls: boolean;
  host: string;
  port: number;
  password?: string;
  db?: string;
  prefix: string;
  timeoutMs: number;
};

const DEFAULT_REDIS_PORT = 6379;
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_PREFIX = "openclaw:gateway";

let cachedConfig: RedisCacheConfig | null | undefined;

function resolveRedisCacheConfig(): RedisCacheConfig | null {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }
  if (isTruthyEnvValue(process.env.OPENCLAW_DISABLE_REDIS_CACHE)) {
    cachedConfig = null;
    return cachedConfig;
  }
  const rawUrl = process.env.OPENCLAW_GATEWAY_REDIS_URL?.trim();
  if (!rawUrl) {
    cachedConfig = null;
    return cachedConfig;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
      cachedConfig = null;
      return cachedConfig;
    }
    const dbPath = parsed.pathname.replace(/^\/+/, "").trim();
    cachedConfig = {
      url: rawUrl,
      tls: parsed.protocol === "rediss:",
      host: parsed.hostname || "127.0.0.1",
      port: parsed.port ? Number.parseInt(parsed.port, 10) : DEFAULT_REDIS_PORT,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db: dbPath || undefined,
      prefix: process.env.OPENCLAW_GATEWAY_REDIS_PREFIX?.trim() || DEFAULT_PREFIX,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };
    logAcceptedEnvOption({
      key: "OPENCLAW_GATEWAY_REDIS_URL",
      value: rawUrl,
      description: "Gateway Redis cache endpoint",
      redact: true,
    });
    if (cachedConfig.prefix !== DEFAULT_PREFIX) {
      logAcceptedEnvOption({
        key: "OPENCLAW_GATEWAY_REDIS_PREFIX",
        value: cachedConfig.prefix,
        description: "Gateway Redis cache key prefix",
      });
    }
    return cachedConfig;
  } catch {
    cachedConfig = null;
    return cachedConfig;
  }
}

function encodeCommand(args: string[]): Buffer {
  const chunks = [`*${args.length}\r\n`];
  for (const arg of args) {
    const value = String(arg);
    chunks.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
  }
  return Buffer.from(chunks.join(""), "utf8");
}

function parseRedisReply(
  buffer: Buffer,
  offset = 0,
): { value: RedisReply; nextOffset: number } | null {
  if (offset >= buffer.length) {
    return null;
  }
  const type = String.fromCharCode(buffer[offset] ?? 0);
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd === -1) {
    return null;
  }
  const line = buffer.toString("utf8", offset + 1, lineEnd);
  const next = lineEnd + 2;
  if (type === "+" || type === ":") {
    return {
      value: type === ":" ? Number.parseInt(line, 10) : line,
      nextOffset: next,
    };
  }
  if (type === "-") {
    return {
      value: { error: line || "redis error" },
      nextOffset: next,
    };
  }
  if (type === "$") {
    const length = Number.parseInt(line, 10);
    if (!Number.isFinite(length)) {
      return {
        value: { error: `invalid redis bulk length: ${line}` },
        nextOffset: next,
      };
    }
    if (length < 0) {
      return { value: null, nextOffset: next };
    }
    const end = next + length;
    if (buffer.length < end + 2) {
      return null;
    }
    return {
      value: buffer.toString("utf8", next, end),
      nextOffset: end + 2,
    };
  }
  return {
    value: { error: `unsupported redis reply type: ${type}` },
    nextOffset: next,
  };
}

async function sendRedisCommands(commands: string[][]): Promise<RedisReply[]> {
  const config = resolveRedisCacheConfig();
  if (!config) {
    return [];
  }
  const preparedCommands = [
    ...(config.password ? [["AUTH", config.password]] : []),
    ...(config.db ? [["SELECT", config.db]] : []),
    ...commands,
  ];
  const prefixCommandsCount = preparedCommands.length - commands.length;
  if (preparedCommands.length === 0) {
    return [];
  }

  const payload = Buffer.concat(preparedCommands.map((command) => encodeCommand(command)));

  return await new Promise<RedisReply[]>((resolve, reject) => {
    const socket = config.tls
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    let settled = false;
    let buffer = Buffer.alloc(0);
    let parsedOffset = 0;
    const replies: RedisReply[] = [];

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      fn();
    };

    socket.setTimeout(config.timeoutMs, () => {
      finish(() => reject(new Error("redis cache timeout")));
    });

    socket.on("error", (error) => {
      finish(() => reject(error));
    });

    socket.on("close", () => {
      if (settled) {
        return;
      }
      finish(() => reject(new Error("redis cache connection closed before response")));
    });

    socket.on("connect", () => {
      socket.write(payload);
    });

    socket.on("data", (chunk: Buffer) => {
      buffer =
        parsedOffset > 0
          ? Buffer.concat([buffer.subarray(parsedOffset), chunk])
          : Buffer.concat([buffer, chunk]);
      parsedOffset = 0;
      while (true) {
        const parsed = parseRedisReply(buffer, parsedOffset);
        if (!parsed) {
          break;
        }
        replies.push(parsed.value);
        parsedOffset = parsed.nextOffset;
        if (replies.length >= preparedCommands.length) {
          finish(() => resolve(replies.slice(prefixCommandsCount)));
          return;
        }
      }
    });
  });
}

function namespacedKey(key: string, config: RedisCacheConfig): string {
  return `${config.prefix}:${key}`;
}

export async function getRedisJson<T>(key: string): Promise<T | null> {
  const config = resolveRedisCacheConfig();
  if (!config) {
    return null;
  }
  try {
    const replies = await sendRedisCommands([["GET", namespacedKey(key, config)]]);
    const first = replies[0];
    if (typeof first !== "string") {
      return null;
    }
    return JSON.parse(first) as T;
  } catch {
    return null;
  }
}

export async function setRedisJson(key: string, value: unknown, ttlMs: number): Promise<void> {
  const config = resolveRedisCacheConfig();
  if (!config) {
    return;
  }
  try {
    await sendRedisCommands([
      [
        "PSETEX",
        namespacedKey(key, config),
        String(Math.max(1, Math.floor(ttlMs))),
        JSON.stringify(value),
      ],
    ]);
  } catch {
    // Cache failures are best-effort only.
  }
}

export const __testing = {
  resetRedisCacheConfig() {
    cachedConfig = undefined;
  },
};
