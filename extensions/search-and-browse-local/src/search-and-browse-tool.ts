import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { stringEnum } from "../../../src/agents/schema/typebox.js";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

const execFile = promisify(execFileCb);

const ACTIONS = ["browse", "read_x_profile", "search_text"] as const;

type PluginConfig = {
  chromeHost?: string;
  chromePort?: number;
  serverPort?: number;
  defaultHandle?: string;
  defaultWaitMs?: number;
  defaultMaxChars?: number;
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function resolveScriptPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../scripts/search-and-browse-server.mjs");
}

async function runScript(args: string[]) {
  const scriptPath = resolveScriptPath();
  const { stdout, stderr } = await execFile(process.execPath, [scriptPath, ...args], {
    timeout: 45_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const text = stdout.trim();
  if (!text) {
    throw new Error(stderr.trim() || "search-and-browse script returned empty output");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`search-and-browse script returned invalid JSON: ${text}`);
  }
}

export function createSearchAndBrowseTool(api: OpenClawPluginApi) {
  return {
    name: "search_and_browse",
    label: "Search And Browse",
    description:
      "Use local Chrome DevTools on port 9222 to open rendered pages, read X profile content, and search within extracted page text.",
    parameters: Type.Object({
      action: stringEnum(ACTIONS, {
        description: "browse, read_x_profile, or search_text",
      }),
      url: Type.Optional(Type.String({ description: "Rendered page URL to browse." })),
      handle: Type.Optional(Type.String({ description: "X handle, defaulting to dankoe." })),
      query: Type.Optional(Type.String({ description: "Search query for extracted page text." })),
      waitMs: Type.Optional(
        Type.Number({ description: "Post-navigation wait time in milliseconds." }),
      ),
      maxChars: Type.Optional(Type.Number({ description: "Maximum extracted text length." })),
      includeHtml: Type.Optional(
        Type.Boolean({ description: "Include truncated page HTML in the result." }),
      ),
      keepTab: Type.Optional(
        Type.Boolean({ description: "Keep the Chrome tab open after extraction." }),
      ),
      chromeHost: Type.Optional(Type.String({ description: "Chrome debug host." })),
      chromePort: Type.Optional(Type.Number({ description: "Chrome debug port." })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const cfg = (api.pluginConfig ?? {}) as PluginConfig;
      const action = readString(params.action) ?? "read_x_profile";
      const handle = readString(params.handle) ?? readString(cfg.defaultHandle) ?? "dankoe";
      const url = readString(params.url);
      const query = readString(params.query);
      const waitMs = readNumber(params.waitMs) ?? readNumber(cfg.defaultWaitMs) ?? 4000;
      const maxChars = readNumber(params.maxChars) ?? readNumber(cfg.defaultMaxChars) ?? 30000;
      const chromeHost = readString(params.chromeHost) ?? readString(cfg.chromeHost) ?? "127.0.0.1";
      const chromePort = readNumber(params.chromePort) ?? readNumber(cfg.chromePort) ?? 9222;
      const includeHtml = readBoolean(params.includeHtml) ?? false;
      const keepTab = readBoolean(params.keepTab) ?? false;

      const args = [
        "oneshot",
        "--mode",
        action,
        "--chrome-host",
        chromeHost,
        "--chrome-port",
        String(chromePort),
        "--wait-ms",
        String(waitMs),
        "--max-chars",
        String(maxChars),
      ];
      if (url) {
        args.push("--url", url);
      }
      if (handle) {
        args.push("--handle", handle);
      }
      if (query) {
        args.push("--query", query);
      }
      if (includeHtml) {
        args.push("--include-html");
      }
      if (keepTab) {
        args.push("--keep-tab");
      }

      const result = await runScript(args);
      return jsonResult(result);
    },
  };
}
