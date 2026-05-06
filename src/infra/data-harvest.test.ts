import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import { withEnvAsync } from "../test-utils/env.js";
import {
  buildHarvestRecord,
  registerDataHarvestSession,
  resetDataHarvestingForTests,
} from "./data-harvest.js";

function createTranscriptLines(sessionId: string, messages: unknown[]): string {
  return [
    JSON.stringify({ type: "session", id: sessionId }),
    ...messages.map((message) => JSON.stringify({ type: "message", message })),
  ].join("\n");
}

async function writeTranscriptFile(
  sessionFile: string,
  sessionId: string,
  messages: unknown[],
): Promise<void> {
  await fs.mkdir(path.dirname(sessionFile), { recursive: true });
  await fs.writeFile(sessionFile, `${createTranscriptLines(sessionId, messages)}\n`, "utf-8");
}

describe("data harvest", () => {
  afterEach(() => {
    resetDataHarvestingForTests();
  });

  it("captures redacted golden data for tool-driven sessions", async () => {
    await withEnvAsync(
      {
        OPENCLAW_DATA_HARVEST_DATABASE_URL: undefined,
        NEON_DATABASE_URL: undefined,
        DATABASE_URL: undefined,
      },
      async () => {
        await withStateDirEnv("openclaw-harvest-", async ({ tempRoot }) => {
          const sessionFile = path.join(tempRoot, "sessions", "golden.jsonl");
          await writeTranscriptFile(sessionFile, "session-golden", [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Please inspect api.getcyberflow.ai. Email me at founder@getcyberflow.ai and use sk-secret123.",
                },
              ],
            },
            {
              role: "assistant",
              content: [
                { type: "text", text: "Plan: inspect config, run tool, summarize fix." },
                {
                  type: "toolCall",
                  id: "call_exec_1",
                  name: "exec",
                  arguments: { cmd: "curl https://127.0.0.1/health", api_key: "secret-value" },
                },
              ],
            },
            {
              role: "toolResult",
              toolCallId: "call_exec_1",
              toolName: "exec",
              content: [{ type: "text", text: "HTTP 200 from 127.0.0.1" }],
              details: {
                stdout: "ok",
                contact: "ops@getcyberflow.ai",
              },
              isError: false,
            },
            {
              role: "assistant",
              content: [{ type: "text", text: "Implemented and fixed. Please verify." }],
            },
            {
              role: "user",
              content: [{ type: "text", text: "Thanks, it worked." }],
            },
          ]);

          const record = await buildHarvestRecord({
            sessionFile,
            sessionKey: "tenant:secret",
            agentId: "agent-1",
          });

          expect(record).toBeTruthy();
          expect(record?.qualityLabel).toBe("Golden_Data");
          expect(record?.containsToolCalls).toBe(true);
          expect(record?.containsCodeExecution).toBe(true);
          expect(record?.hasCompleteToolSchema).toBe(true);
          expect(record?.turnCount).toBe(2);
          expect(record?.sessionKey).toMatch(/^sha256:/);
          expect(record?.userIntent.text).toContain("Please inspect api.getcyberflow.ai");
          expect(record?.userIntent.text).not.toContain("founder@getcyberflow.ai");
          expect(record?.agentPlan.steps).toEqual([
            expect.objectContaining({
              step: 1,
              toolCallId: "call_exec_1",
              toolName: "exec",
            }),
          ]);
          expect(record?.toolIO).toEqual([
            expect.objectContaining({
              step: 1,
              toolCallId: "call_exec_1",
              toolName: "exec",
              isError: false,
            }),
          ]);
          expect(JSON.stringify(record?.toolIO[0])).not.toContain("127.0.0.1");
          expect(JSON.stringify(record?.contextJson)).not.toContain("founder@getcyberflow.ai");
          expect(JSON.stringify(record?.contextJson)).not.toContain("sk-secret123");
          expect(JSON.stringify(record?.contextJson)).toContain("[redacted-email]");
          expect(JSON.stringify(record?.contextJson)).toContain("[redacted-secret]");
          expect(record?.finalResolution).toEqual(
            expect.objectContaining({
              closed: true,
              signal: "user_feedback",
            }),
          );
        });
      },
    );
  });

  it("marks short sessions as low value and retains orphan tool results", async () => {
    await withEnvAsync(
      {
        OPENCLAW_DATA_HARVEST_DATABASE_URL: undefined,
        NEON_DATABASE_URL: undefined,
        DATABASE_URL: undefined,
      },
      async () => {
        await withStateDirEnv("openclaw-harvest-", async ({ tempRoot }) => {
          const sessionFile = path.join(tempRoot, "sessions", "low-value.jsonl");
          await writeTranscriptFile(sessionFile, "session-low-value", [
            {
              role: "user",
              content: [
                { type: "text", text: "Run the code interpreter and tell me if it fails." },
              ],
            },
            {
              role: "toolResult",
              toolCallId: "call_orphan_1",
              toolName: "code_interpreter",
              content: [{ type: "text", text: "Traceback from 10.0.0.8" }],
              isError: true,
            },
          ]);

          const record = await buildHarvestRecord({ sessionFile });

          expect(record).toBeTruthy();
          expect(record?.qualityLabel).toBe("Low_Value");
          expect(record?.containsCodeExecution).toBe(true);
          expect(record?.toolIO).toEqual([
            expect.objectContaining({
              step: 1,
              toolCallId: "call_orphan_1",
              toolName: "code_interpreter",
              isError: true,
            }),
          ]);
          expect(JSON.stringify(record?.toolIO[0])).not.toContain("10.0.0.8");
        });
      },
    );
  });

  it("writes harvested snapshots into the state directory", async () => {
    await withEnvAsync(
      {
        OPENCLAW_DATA_HARVEST_DATABASE_URL: undefined,
        NEON_DATABASE_URL: undefined,
        DATABASE_URL: undefined,
      },
      async () => {
        await withStateDirEnv("openclaw-harvest-", async ({ stateDir, tempRoot }) => {
          const sessionFile = path.join(tempRoot, "sessions", "persisted.jsonl");
          await writeTranscriptFile(sessionFile, "session-persisted", [
            {
              role: "user",
              content: [{ type: "text", text: "Open the file and summarize it." }],
            },
            {
              role: "assistant",
              content: [
                {
                  type: "toolCall",
                  id: "call_read_1",
                  name: "read",
                  arguments: { path: "/tmp/config.json" },
                },
              ],
            },
            {
              role: "toolResult",
              toolCallId: "call_read_1",
              toolName: "read",
              content: [{ type: "text", text: '{"ok":true}' }],
              isError: false,
            },
          ]);

          registerDataHarvestSession({
            sessionFile,
            sessionKey: "session-persist",
            agentId: "agent-2",
          });

          await new Promise((resolve) => setTimeout(resolve, 250));

          const outFile = path.join(stateDir, "harvest", "sessions", "session-persisted.json");
          const contents = await fs.readFile(outFile, "utf-8");
          const parsed = JSON.parse(contents) as { sessionId: string; agentId?: string };
          expect(parsed.sessionId).toBe("session-persisted");
          expect(parsed.agentId).toBe("agent-2");
        });
      },
    );
  });
});
