import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { n8nHandlers } from "./n8n.js";

const bridgeMocks = vi.hoisted(() => ({
  listN8nTaskRuns: vi.fn(),
  resolveN8nBridgeStatus: vi.fn(),
  triggerResearchIngestRun: vi.fn(),
}));

vi.mock("../n8n-bridge.js", () => bridgeMocks);

function createRespond() {
  return vi.fn();
}

describe("n8n gateway methods", () => {
  beforeEach(() => {
    bridgeMocks.listN8nTaskRuns.mockReset();
    bridgeMocks.resolveN8nBridgeStatus.mockReset();
    bridgeMocks.triggerResearchIngestRun.mockReset();
  });

  it("returns the bridge status snapshot", async () => {
    const respond = createRespond();
    bridgeMocks.resolveN8nBridgeStatus.mockReturnValue({
      configured: true,
      webhookConfigured: true,
      callbackConfigured: true,
      callbackUrl: "http://127.0.0.1:18789/integrations/n8n/callback",
      runsPath: "/tmp/n8n-runs.json",
      workflowKey: "research-ingest",
      workflowLabel: "Research -> Ingest",
    });

    await n8nHandlers["n8n.status"]({
      req: {} as never,
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ configured: true, workflowKey: "research-ingest" }),
      undefined,
    );
  });

  it("clamps the runs limit before loading entries", async () => {
    const respond = createRespond();
    bridgeMocks.listN8nTaskRuns.mockResolvedValue([{ id: "run-1" }]);

    await n8nHandlers["n8n.runs"]({
      req: {} as never,
      params: { limit: 999 },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(bridgeMocks.listN8nTaskRuns).toHaveBeenCalledWith(50);
    expect(respond).toHaveBeenCalledWith(true, { entries: [{ id: "run-1" }], total: 1 }, undefined);
  });

  it("rejects unsupported workflow keys", async () => {
    const respond = createRespond();

    await n8nHandlers["n8n.trigger"]({
      req: {} as never,
      params: {
        workflowKey: "other-flow",
        sourceUrl: "https://x.com/dankoe",
        region: "US",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: ErrorCodes.INVALID_REQUEST }),
    );
    expect(bridgeMocks.triggerResearchIngestRun).not.toHaveBeenCalled();
  });

  it("rejects invalid regions", async () => {
    const respond = createRespond();

    await n8nHandlers["n8n.trigger"]({
      req: {} as never,
      params: {
        workflowKey: "research-ingest",
        sourceUrl: "https://x.com/dankoe",
        region: "APAC",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: ErrorCodes.INVALID_REQUEST }),
    );
    expect(bridgeMocks.triggerResearchIngestRun).not.toHaveBeenCalled();
  });

  it("triggers the research-ingest flow", async () => {
    const respond = createRespond();
    bridgeMocks.triggerResearchIngestRun.mockResolvedValue({
      id: "run-2",
      workflowKey: "research-ingest",
    });

    await n8nHandlers["n8n.trigger"]({
      req: {} as never,
      params: {
        workflowKey: "research-ingest",
        sourceUrl: "https://x.com/dankoe",
        region: "mx",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(bridgeMocks.triggerResearchIngestRun).toHaveBeenCalledWith({
      sourceUrl: "https://x.com/dankoe",
      region: "MX",
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      { run: expect.objectContaining({ id: "run-2" }) },
      undefined,
    );
  });

  it("surfaces trigger failures as unavailable errors", async () => {
    const respond = createRespond();
    bridgeMocks.triggerResearchIngestRun.mockRejectedValue(new Error("webhook offline"));

    await n8nHandlers["n8n.trigger"]({
      req: {} as never,
      params: {
        workflowKey: "research-ingest",
        sourceUrl: "https://x.com/dankoe",
        region: "US",
      },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: "webhook offline",
      }),
    );
  });
});
