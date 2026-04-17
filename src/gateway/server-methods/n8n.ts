import {
  listN8nTaskRuns,
  resolveN8nBridgeStatus,
  triggerResearchIngestRun,
} from "../n8n-bridge.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const n8nHandlers: GatewayRequestHandlers = {
  "n8n.status": ({ respond }) => {
    respond(true, resolveN8nBridgeStatus(), undefined);
  },
  "n8n.runs": async ({ params, respond }) => {
    const limitRaw = typeof params.limit === "number" ? params.limit : undefined;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(50, Math.floor(limitRaw)))
        : 20;
    const runs = await listN8nTaskRuns(limit);
    respond(true, { entries: runs, total: runs.length }, undefined);
  },
  "n8n.trigger": async ({ params, respond }) => {
    const workflowKey = typeof params.workflowKey === "string" ? params.workflowKey.trim() : "";
    const sourceUrl = typeof params.sourceUrl === "string" ? params.sourceUrl.trim() : "";
    const region = typeof params.region === "string" ? params.region.trim().toUpperCase() : "";
    if (workflowKey !== "research-ingest") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "n8n.trigger currently supports workflowKey=research-ingest only",
        ),
      );
      return;
    }
    if (!sourceUrl) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sourceUrl is required"));
      return;
    }
    if (region !== "US" && region !== "MX" && region !== "ME") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "region must be US, MX, or ME"),
      );
      return;
    }
    try {
      const run = await triggerResearchIngestRun({
        sourceUrl,
        region,
      });
      respond(true, { run }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, error instanceof Error ? error.message : String(error)),
      );
    }
  },
};
