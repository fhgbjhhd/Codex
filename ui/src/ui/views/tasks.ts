import { html } from "lit";
import { formatDurationHuman, formatRelativeTimestamp } from "../format.ts";
import type { N8nBridgeStatus, N8nTaskRun } from "../types.ts";

export type TasksProps = {
  loading: boolean;
  triggering: boolean;
  status: N8nBridgeStatus | null;
  runs: N8nTaskRun[];
  error: string | null;
  onRefresh: () => void;
};

function statusTone(status: N8nTaskRun["status"]) {
  if (status === "success") {
    return "ok";
  }
  if (status === "error") {
    return "error";
  }
  if (status === "running") {
    return "warn";
  }
  return "muted";
}

function renderRun(run: N8nTaskRun) {
  const age = formatRelativeTimestamp(run.updatedAtMs);
  const duration =
    run.updatedAtMs > run.createdAtMs
      ? formatDurationHuman(run.updatedAtMs - run.createdAtMs)
      : "just started";
  return html`
    <article class="card">
      <div class="list-main" style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <div class="list-title">${run.workflowLabel}</div>
          <div class="muted">${run.sourceUrl ?? "no source url"} · ${run.region ?? "n/a"}</div>
          <div class="muted">Updated ${age} · Duration ${duration}</div>
          ${run.executionId ? html`<div class="mono muted">execution ${run.executionId}</div>` : null}
        </div>
        <span class="status ${statusTone(run.status)}">${run.status}</span>
      </div>
      <div style="margin-top:12px;display:grid;gap:8px;">
        ${run.steps.map(
          (step) => html`
            <div
              style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);"
            >
              <div>
                <strong>${step.label}</strong>
                <div class="muted">${step.detail ?? "Waiting for update."}</div>
              </div>
              <span class="status ${statusTone(step.status)}">${step.status}</span>
            </div>
          `,
        )}
      </div>
      ${run.error ? html`<div class="error" style="margin-top:12px;">${run.error}</div>` : null}
    </article>
  `;
}

export function renderTasks(props: TasksProps) {
  return html`
    <section class="stack">
      <div class="card">
        <div class="section-title">Real-Time Tasks</div>
        <div class="muted">
          n8n bridge for the CyberFlow research -> ingest workflow. This page reflects OpenClaw's
          callback-fed view of each workflow step.
        </div>
        <div class="row" style="margin-top:12px;">
          <button class="btn" @click=${props.onRefresh}>Refresh</button>
          <span class="muted">
            ${props.loading ? "Refreshing tasks…" : props.triggering ? "Workflow trigger in flight…" : "Live polling active while this page is open."}
          </span>
        </div>
        <div class="row" style="margin-top:12px;gap:16px;flex-wrap:wrap;">
          <span class="status ${props.status?.configured ? "ok" : "error"}">
            ${props.status?.configured ? "Bridge ready" : "Bridge not configured"}
          </span>
          ${props.status ? html`<span class="mono muted">${props.status.callbackUrl}</span>` : null}
        </div>
        ${props.error ? html`<div class="error" style="margin-top:12px;">${props.error}</div>` : null}
      </div>
      ${
        props.runs.length > 0
          ? props.runs.map((run) => renderRun(run))
          : html`
              <div class="card">
                <div class="section-title">No task runs yet</div>
                <div class="muted">
                  Trigger the CyberFlow research pipeline from the Overview tab. Once n8n posts callbacks back to
                  OpenClaw, each step will appear here with green/red state.
                </div>
              </div>
            `
      }
    </section>
  `;
}
