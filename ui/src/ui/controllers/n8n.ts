import type { GatewayBrowserClient } from "../gateway.ts";
import type { N8nBridgeStatus, N8nRunsResult, N8nTaskRun } from "../types.ts";

export type N8nState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  n8nLoading: boolean;
  n8nTriggering: boolean;
  n8nStatus: N8nBridgeStatus | null;
  n8nRuns: N8nTaskRun[];
  n8nError: string | null;
  cyberFlowUrl: string;
  cyberFlowRegion: "US" | "MX" | "ME";
  cyberFlowRunState: "idle" | "arming" | "review";
};

function syncCyberFlowRunState(state: N8nState) {
  const latest = state.n8nRuns[0];
  if (!latest) {
    return;
  }
  if (latest.status === "success") {
    state.cyberFlowRunState = "review";
    return;
  }
  if (latest.status === "running" || latest.status === "pending") {
    state.cyberFlowRunState = "arming";
    return;
  }
  if (latest.status === "error") {
    state.cyberFlowRunState = "idle";
  }
}

export async function loadN8n(state: N8nState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.n8nLoading = true;
  try {
    const [status, runs] = await Promise.all([
      state.client.request<N8nBridgeStatus>("n8n.status", {}),
      state.client.request<N8nRunsResult>("n8n.runs", { limit: 20 }),
    ]);
    state.n8nStatus = status;
    state.n8nRuns = Array.isArray(runs.entries) ? runs.entries : [];
    state.n8nError = null;
    syncCyberFlowRunState(state);
  } catch (error) {
    state.n8nError = String(error);
  } finally {
    state.n8nLoading = false;
  }
}

export async function triggerN8nResearchIngest(state: N8nState) {
  if (!state.client || !state.connected || state.n8nTriggering) {
    return;
  }
  state.n8nTriggering = true;
  state.n8nError = null;
  state.cyberFlowRunState = "arming";
  try {
    const response = await state.client.request<{ run?: N8nTaskRun }>("n8n.trigger", {
      workflowKey: "research-ingest",
      sourceUrl: state.cyberFlowUrl,
      region: state.cyberFlowRegion,
    });
    if (response.run) {
      state.n8nRuns = [
        response.run,
        ...state.n8nRuns.filter((entry) => entry.id !== response.run?.id),
      ];
    }
    await loadN8n(state);
  } catch (error) {
    state.cyberFlowRunState = "idle";
    state.n8nError = String(error);
  } finally {
    state.n8nTriggering = false;
  }
}
