#!/usr/bin/env node

import http from "node:http";
import process from "node:process";

const DEFAULT_CHROME_HOST = "127.0.0.1";
const DEFAULT_CHROME_PORT = 9222;
const DEFAULT_SERVER_HOST = "127.0.0.1";
const DEFAULT_SERVER_PORT = 8787;
const DEFAULT_HANDLE = "dankoe";
const DEFAULT_WAIT_MS = 4000;
const DEFAULT_MAX_CHARS = 30000;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function trimString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function json(status, payload) {
  return JSON.stringify(payload, null, 2);
}

function buildChromeBaseUrl(host, port) {
  return `http://${host}:${port}`;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}${text ? `: ${text}` : ""}`);
  }
  return await res.json();
}

async function fetchText(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}${text ? `: ${text}` : ""}`);
  }
  return await res.text();
}

function clip(text, maxChars) {
  const raw = typeof text === "string" ? text : "";
  if (raw.length <= maxChars) {
    return raw;
  }
  return `${raw.slice(0, maxChars)}\n...[truncated ${raw.length - maxChars} chars]`;
}

function buildXUrl(handle) {
  const clean = handle.replace(/^@+/, "").trim();
  if (!clean) {
    throw new Error("handle required");
  }
  return `https://x.com/${clean}`;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    if (this.ws) {
      return;
    }
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    const opened = createDeferred();
    const failed = (err) => {
      opened.reject(err instanceof Error ? err : new Error(String(err)));
    };
    ws.addEventListener("open", () => opened.resolve());
    ws.addEventListener("error", (evt) => failed(evt.error ?? new Error("WebSocket error")));
    ws.addEventListener("message", async (evt) => {
      const text =
        typeof evt.data === "string"
          ? evt.data
          : evt.data instanceof ArrayBuffer
            ? Buffer.from(evt.data).toString("utf8")
            : typeof evt.data?.text === "function"
              ? await evt.data.text()
              : String(evt.data ?? "");
      const payload = JSON.parse(text);
      if (payload.id) {
        const pending = this.pending.get(payload.id);
        if (!pending) {
          return;
        }
        this.pending.delete(payload.id);
        if (payload.error) {
          pending.reject(new Error(payload.error.message || "CDP error"));
          return;
        }
        pending.resolve(payload.result ?? {});
        return;
      }
      if (!payload.method) {
        return;
      }
      const listeners = this.listeners.get(payload.method) ?? [];
      for (const listener of listeners) {
        listener(payload.params ?? {});
      }
    });
    await opened.promise;
  }

  async send(method, params = {}) {
    await this.connect();
    const id = this.nextId++;
    const deferred = createDeferred();
    this.pending.set(id, deferred);
    this.ws.send(JSON.stringify({ id, method, params }));
    return await deferred.promise;
  }

  waitFor(method, timeoutMs = 15000) {
    const deferred = createDeferred();
    const listeners = this.listeners.get(method) ?? [];
    const handler = (params) => {
      clearTimeout(timer);
      this.listeners.set(
        method,
        (this.listeners.get(method) ?? []).filter((item) => item !== handler),
      );
      deferred.resolve(params);
    };
    const timer = setTimeout(() => {
      this.listeners.set(
        method,
        (this.listeners.get(method) ?? []).filter((item) => item !== handler),
      );
      deferred.reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    listeners.push(handler);
    this.listeners.set(method, listeners);
    return deferred.promise;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }
}

async function getChromeVersion(baseUrl) {
  return await fetchJson(`${baseUrl}/json/version`);
}

async function listTargets(baseUrl) {
  const targets = await fetchJson(`${baseUrl}/json/list`);
  return Array.isArray(targets) ? targets : [];
}

async function createTarget(baseUrl, url) {
  const encoded = encodeURIComponent(url);
  const attempts = [
    { method: "PUT", url: `${baseUrl}/json/new?${encoded}` },
    { method: "GET", url: `${baseUrl}/json/new?${encoded}` },
  ];
  for (const attempt of attempts) {
    try {
      return await fetchJson(attempt.url, { method: attempt.method });
    } catch {
      // try next
    }
  }
  throw new Error(`Failed to create Chrome target for ${url}`);
}

async function closeTarget(baseUrl, targetId) {
  const urls = [
    `${baseUrl}/json/close/${targetId}`,
    `${baseUrl}/json/close/${encodeURIComponent(targetId)}`,
  ];
  for (const url of urls) {
    try {
      await fetchText(url);
      return;
    } catch {
      // try next
    }
  }
}

async function resolveTarget(baseUrl, url) {
  const targets = await listTargets(baseUrl);
  const existing = targets.find(
    (target) =>
      target?.type === "page" &&
      typeof target.url === "string" &&
      target.url.startsWith(url) &&
      typeof target.webSocketDebuggerUrl === "string",
  );
  if (existing) {
    return { target: existing, created: false };
  }
  const created = await createTarget(baseUrl, url);
  if (!created?.webSocketDebuggerUrl) {
    throw new Error("Chrome target missing webSocketDebuggerUrl");
  }
  return { target: created, created: true };
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildExtractExpression() {
  return `(() => {
    const read = (selector) => {
      const el = document.querySelector(selector);
      return el && typeof el.innerText === "string" ? el.innerText.trim() : null;
    };
    const posts = Array.from(document.querySelectorAll('article'))
      .slice(0, 8)
      .map((node) => (node && typeof node.innerText === 'string' ? node.innerText.trim() : ''))
      .filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      profileName: read('[data-testid="UserName"]'),
      bio: read('[data-testid="UserDescription"]'),
      text: document.body && typeof document.body.innerText === 'string' ? document.body.innerText.trim() : '',
      posts,
      html: document.documentElement ? document.documentElement.outerHTML : ''
    };
  })()`;
}

function searchLines(text, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.toLowerCase().includes(normalized))
    .slice(0, 20);
}

async function browsePage(options) {
  const chromeHost = trimString(options.chromeHost, DEFAULT_CHROME_HOST);
  const chromePort = toInt(options.chromePort, DEFAULT_CHROME_PORT);
  const waitMs = toInt(options.waitMs, DEFAULT_WAIT_MS);
  const maxChars = toInt(options.maxChars, DEFAULT_MAX_CHARS);
  const includeHtml = toBool(options.includeHtml, false);
  const keepTab = toBool(options.keepTab, false);
  const url = trimString(options.url);

  if (!url) {
    throw new Error("url required");
  }

  const baseUrl = buildChromeBaseUrl(chromeHost, chromePort);
  const version = await getChromeVersion(baseUrl);
  const { target, created } = await resolveTarget(baseUrl, url);
  const client = new CdpClient(target.webSocketDebuggerUrl);

  try {
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    if (target.url !== url) {
      const loadEvent = client.waitFor("Page.loadEventFired", Math.max(waitMs + 10000, 15000));
      await client.send("Page.navigate", { url });
      await loadEvent.catch(() => null);
    }
    await delay(waitMs);
    const result = await client.send("Runtime.evaluate", {
      expression: buildExtractExpression(),
      returnByValue: true,
      awaitPromise: true,
    });
    const value = result?.result?.value;
    if (!value || typeof value !== "object") {
      throw new Error("Chrome returned no page payload");
    }

    const page = {
      url: trimString(value.url, url),
      title: trimString(value.title),
      profileName: trimString(value.profileName) || null,
      bio: trimString(value.bio) || null,
      text: clip(trimString(value.text), maxChars),
      posts: Array.isArray(value.posts)
        ? value.posts.map((item) => clip(trimString(item), 2000)).filter(Boolean)
        : [],
    };

    if (includeHtml) {
      page.html = clip(trimString(value.html), Math.min(maxChars * 2, 200000));
    }

    return {
      ok: true,
      chrome: {
        host: chromeHost,
        port: chromePort,
        browser: trimString(version.Browser),
        userAgent: trimString(version["User-Agent"]),
      },
      target: {
        id: trimString(target.id),
        created,
      },
      page,
    };
  } finally {
    client.close();
    if (created && !keepTab && target?.id) {
      await closeTarget(baseUrl, target.id).catch(() => null);
    }
  }
}

async function readXProfile(options) {
  const handle = trimString(options.handle, DEFAULT_HANDLE);
  const url = trimString(options.url, buildXUrl(handle));
  return await browsePage({ ...options, url });
}

async function searchText(options) {
  const query = trimString(options.query);
  if (!query) {
    throw new Error("query required");
  }
  const base = trimString(options.url) ? await browsePage(options) : await readXProfile(options);
  return {
    ...base,
    search: {
      query,
      matches: searchLines(base.page?.text ?? "", query),
    },
  };
}

async function runAction(action, options) {
  if (action === "browse") {
    return await browsePage(options);
  }
  if (action === "read_x_profile") {
    return await readXProfile(options);
  }
  if (action === "search_text") {
    return await searchText(options);
  }
  throw new Error(`Unknown action: ${action}`);
}

function writeHttpJson(res, statusCode, payload) {
  const body = json(statusCode, payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    return {};
  }
  return JSON.parse(body);
}

async function startServer(options) {
  const listenHost = trimString(options["listen-host"], DEFAULT_SERVER_HOST);
  const listenPort = toInt(options["listen-port"], DEFAULT_SERVER_PORT);

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", `http://${listenHost}:${listenPort}`);

      if (method === "GET" && url.pathname === "/health") {
        const chrome = await getChromeVersion(
          buildChromeBaseUrl(
            trimString(options["chrome-host"], DEFAULT_CHROME_HOST),
            toInt(options["chrome-port"], DEFAULT_CHROME_PORT),
          ),
        );
        writeHttpJson(res, 200, { ok: true, chrome });
        return;
      }

      if (method === "POST" && ["/browse", "/read-x-profile", "/search"].includes(url.pathname)) {
        const body = await readRequestJson(req);
        const merged = {
          ...options,
          ...body,
          chromeHost: body.chromeHost ?? options["chrome-host"],
          chromePort: body.chromePort ?? options["chrome-port"],
          waitMs: body.waitMs ?? options["wait-ms"],
          maxChars: body.maxChars ?? options["max-chars"],
          includeHtml: body.includeHtml ?? options["include-html"],
          keepTab: body.keepTab ?? options["keep-tab"],
        };
        const action =
          url.pathname === "/browse"
            ? "browse"
            : url.pathname === "/read-x-profile"
              ? "read_x_profile"
              : "search_text";
        const payload = await runAction(action, merged);
        writeHttpJson(res, 200, payload);
        return;
      }

      writeHttpJson(res, 404, { ok: false, error: `Unknown route ${method} ${url.pathname}` });
    } catch (error) {
      writeHttpJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, listenHost, resolve);
  });

  process.stdout.write(
    json(200, {
      ok: true,
      mode: "serve",
      server: {
        host: listenHost,
        port: listenPort,
      },
      chrome: {
        host: trimString(options["chrome-host"], DEFAULT_CHROME_HOST),
        port: toInt(options["chrome-port"], DEFAULT_CHROME_PORT),
      },
    }) + "\n",
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "oneshot";
  const action = trimString(args.mode, "read_x_profile");

  if (command === "serve") {
    await startServer(args);
    return;
  }

  if (command === "oneshot") {
    try {
      const payload = await runAction(action, {
        chromeHost: args["chrome-host"],
        chromePort: args["chrome-port"],
        url: args.url,
        handle: args.handle,
        query: args.query,
        waitMs: args["wait-ms"],
        maxChars: args["max-chars"],
        includeHtml: args["include-html"],
        keepTab: args["keep-tab"],
      });
      process.stdout.write(json(200, payload) + "\n");
      return;
    } catch (error) {
      process.stderr.write(
        json(500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }) + "\n",
      );
      process.exitCode = 1;
      return;
    }
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(
    json(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }) + "\n",
  );
  process.exitCode = 1;
});
