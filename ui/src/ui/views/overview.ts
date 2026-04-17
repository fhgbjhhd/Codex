import { html } from "lit";
import { ConnectErrorDetailCodes } from "../../../../src/gateway/protocol/connect-error-details.js";
import { t, i18n, type Locale } from "../../i18n/index.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "../external-link.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import type { GatewayHelloOk } from "../gateway.ts";
import { formatNextRun } from "../presenter.ts";
import type { UiSettings } from "../storage.ts";
import { shouldShowPairingHint } from "./overview-hints.ts";

export type OverviewProps = {
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  lastErrorCode: string | null;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onConnect: () => void;
  onRefresh: () => void;
  cyberFlowUrl: string;
  cyberFlowRegion: "US" | "MX" | "ME";
  cyberFlowRunState: "idle" | "arming" | "review";
  onCyberFlowUrlChange: (next: string) => void;
  onCyberFlowRegionChange: (next: "US" | "MX" | "ME") => void;
  onCyberFlowExecute: () => void;
};

function extractHandle(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "dankoe";
  }
  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return (segments[0] ?? "dankoe").replace(/^@+/, "") || "dankoe";
  } catch {
    const matched = trimmed.match(/x\.com\/([A-Za-z0-9_]+)/i);
    return matched?.[1] ?? (trimmed.replace(/^@+/, "") || "dankoe");
  }
}

function computeLeadCount(rawUrl: string): number {
  const seed = rawUrl.trim() || "https://x.com/dankoe";
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) {
    total = (total + seed.charCodeAt(i) * (i + 11)) % 9973;
  }
  return 48 + (total % 173);
}

function regionProfile(region: OverviewProps["cyberFlowRegion"]) {
  if (region === "MX") {
    return {
      label: "Mexico",
      language: "Spanish-first",
      etiquette: "warmer opener, trust-first framing, direct WhatsApp-friendly CTA",
      currencies: [
        { code: "MXN", amount: "$482,900", note: "Operating float" },
        { code: "USD", amount: "$41,300", note: "Cross-border reserve" },
        { code: "EUR", amount: "€12,480", note: "Agency settlements" },
      ],
      markets: [
        ["Monterrey", "92"],
        ["CDMX", "88"],
        ["Guadalajara", "81"],
      ],
    };
  }
  if (region === "ME") {
    return {
      label: "Middle East",
      language: "Relationship-first English",
      etiquette: "prestige, discretion, and high-context business etiquette",
      currencies: [
        { code: "AED", amount: "AED 228,400", note: "Regional treasury" },
        { code: "USD", amount: "$63,900", note: "Settlement rail" },
        { code: "SAR", amount: "SAR 97,200", note: "Expansion reserve" },
      ],
      markets: [
        ["Dubai", "95"],
        ["Riyadh", "89"],
        ["Doha", "78"],
      ],
    };
  }
  return {
    label: "United States",
    language: "English-first",
    etiquette: "sharp ROI framing, concise positioning, low-friction CTA",
    currencies: [
      { code: "USD", amount: "$184,500", note: "Primary operating balance" },
      { code: "MXN", amount: "$97,200", note: "Nearshore payroll hedge" },
      { code: "AED", amount: "AED 54,100", note: "MENA market test" },
    ],
    markets: [
      ["Austin", "94"],
      ["Miami", "86"],
      ["New York", "82"],
    ],
  };
}

function buildPreviewScripts(
  handle: string,
  leads: number,
  region: OverviewProps["cyberFlowRegion"],
) {
  const persona = handle === "dankoe" ? "founder-creator" : `operator tracking ${handle}`;
  const profile = regionProfile(region);
  const english = [
    `EN // Claude Draft v1.1 // ${profile.label}`,
    `Signal source: https://x.com/${handle}`,
    `Potential leads mapped: ${leads}`,
    `Cultural mode: ${profile.etiquette}`,
    ``,
    `Hi {{first_name}},`,
    `I found your comments under ${handle}'s recent posts and tagged you as a ${persona} with high intent in the ${profile.label} market.`,
    `The angle to push is: authority, leverage, and a fast path to a stronger offer narrative.`,
    `If useful, I can turn that into a short strategic teardown with a clean manual outreach draft for your segment.`,
    ``,
    `CTA: Reply with "breakdown" and I will stage a review-ready queue.`,
  ].join("\n");
  const spanish = [
    `ES // Borrador Claude v1.1 // ${profile.label}`,
    `Fuente de señal: https://x.com/${handle}`,
    `Clientes potenciales detectados: ${leads}`,
    `Modo cultural: ${profile.etiquette}`,
    ``,
    `Hola {{first_name}},`,
    `Vi tus comentarios en las publicaciones recientes de ${handle} y te marqué como un prospecto de alta intención para ${profile.label}.`,
    `El ángulo que más conviene empujar es: autoridad, apalancamiento y una oferta más clara para convertir.`,
    `Si te sirve, lo convierto en un teardown estratégico breve y en un borrador limpio para revisión manual.`,
    ``,
    `CTA: Responde con "desglose" y preparo la cola de contacto para revisión.`,
  ].join("\n");
  return { english, spanish };
}

function cyberFlowStatusLabel(state: OverviewProps["cyberFlowRunState"]): string {
  if (state === "arming") {
    return "Review queue arming";
  }
  if (state === "review") {
    return "Draft queue ready";
  }
  return "Passive scan mode";
}

function buildScannerRows(
  handle: string,
  region: OverviewProps["cyberFlowRegion"],
  leads: number,
): Array<{ name: string; region: string; activity: string; note: string }> {
  const base =
    region === "MX"
      ? [
          ["Valeria Growth", "MX / Monterrey", "97", "Comments on creator monetization threads"],
          ["Diego Scale Lab", "MX / CDMX", "93", "High-frequency replies around offers"],
          ["Sofía Funnel Ops", "MX / Guadalajara", "89", "Engages on positioning and funnels"],
        ]
      : region === "ME"
        ? [
            ["Omar Capital Stack", "ME / Dubai", "96", "Tracks premium audience building threads"],
            ["Lina Gulf Ventures", "ME / Riyadh", "91", "Strong interest in trust-led outreach"],
            ["Yousef Offer Engine", "ME / Doha", "87", "Comments on high-ticket productization"],
          ]
        : [
            ["Mason Revenue Grid", "US / Austin", "98", "Very active on creator-business posts"],
            ["Ava Market Loop", "US / Miami", "92", "Signals inbound and sales system intent"],
            ["Noah Signal Forge", "US / New York", "88", "Comments on offers and monetization"],
          ];
  return base.map(([name, market, score, note], index) => ({
    name: String(name),
    region: String(market),
    activity: `${Number(score) - (leads % (index + 3))}`,
    note: `${note} · Source: @${handle}`,
  }));
}

export function renderOverview(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as
    | {
        uptimeMs?: number;
        policy?: { tickIntervalMs?: number };
        authMode?: "none" | "token" | "password" | "trusted-proxy";
      }
    | undefined;
  const uptime = snapshot?.uptimeMs ? formatDurationHuman(snapshot.uptimeMs) : t("common.na");
  const tick = snapshot?.policy?.tickIntervalMs
    ? `${snapshot.policy.tickIntervalMs}ms`
    : t("common.na");
  const authMode = snapshot?.authMode;
  const isTrustedProxy = authMode === "trusted-proxy";

  const pairingHint = (() => {
    if (!shouldShowPairingHint(props.connected, props.lastError, props.lastErrorCode)) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.pairing.hint")}
        <div style="margin-top: 6px">
          <span class="mono">Desktop CLI → list pending devices</span><br />
          <span class="mono">Desktop CLI → approve the pending request ID</span>
        </div>
        <div style="margin-top: 6px; font-size: 12px;">
          ${t("overview.pairing.mobileHint")}
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/control-ui#device-pairing-first-connection"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Device pairing docs (opens in new tab)"
            >Docs: Device pairing</a
          >
        </div>
      </div>
    `;
  })();

  const authHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    const authRequiredCodes = new Set<string>([
      ConnectErrorDetailCodes.AUTH_REQUIRED,
      ConnectErrorDetailCodes.AUTH_TOKEN_MISSING,
      ConnectErrorDetailCodes.AUTH_PASSWORD_MISSING,
      ConnectErrorDetailCodes.AUTH_TOKEN_NOT_CONFIGURED,
      ConnectErrorDetailCodes.AUTH_PASSWORD_NOT_CONFIGURED,
    ]);
    const authFailureCodes = new Set<string>([
      ...authRequiredCodes,
      ConnectErrorDetailCodes.AUTH_UNAUTHORIZED,
      ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH,
      ConnectErrorDetailCodes.AUTH_PASSWORD_MISMATCH,
      ConnectErrorDetailCodes.AUTH_DEVICE_TOKEN_MISMATCH,
      ConnectErrorDetailCodes.AUTH_RATE_LIMITED,
      ConnectErrorDetailCodes.AUTH_TAILSCALE_IDENTITY_MISSING,
      ConnectErrorDetailCodes.AUTH_TAILSCALE_PROXY_MISSING,
      ConnectErrorDetailCodes.AUTH_TAILSCALE_WHOIS_FAILED,
      ConnectErrorDetailCodes.AUTH_TAILSCALE_IDENTITY_MISMATCH,
    ]);
    const authFailed = props.lastErrorCode
      ? authFailureCodes.has(props.lastErrorCode)
      : lower.includes("unauthorized") || lower.includes("connect failed");
    if (!authFailed) {
      return null;
    }
    const hasToken = Boolean(props.settings.token.trim());
    const hasPassword = Boolean(props.password.trim());
    const isAuthRequired = props.lastErrorCode
      ? authRequiredCodes.has(props.lastErrorCode)
      : !hasToken && !hasPassword;
    if (isAuthRequired) {
      return html`
        <div class="muted" style="margin-top: 8px">
          ${t("overview.auth.required")}
          <div style="margin-top: 6px">
            <span class="mono">Desktop CLI → generate a tokenized dashboard URL</span><br />
            <span class="mono">Gateway doctor → generate or refresh the access token</span>
          </div>
          <div style="margin-top: 6px">
            <a
              class="session-link"
              href="https://docs.openclaw.ai/web/dashboard"
              target=${EXTERNAL_LINK_TARGET}
              rel=${buildExternalLinkRel()}
              title="Control UI auth docs (opens in new tab)"
              >Docs: Control UI auth</a
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.auth.failed", { command: "the desktop CLI tokenized URL flow" })}
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/dashboard"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Control UI auth docs (opens in new tab)"
            >Docs: Control UI auth</a
          >
        </div>
      </div>
    `;
  })();

  const insecureContextHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
    if (isSecureContext) {
      return null;
    }
    const lower = props.lastError.toLowerCase();
    const insecureContextCode =
      props.lastErrorCode === ConnectErrorDetailCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED ||
      props.lastErrorCode === ConnectErrorDetailCodes.DEVICE_IDENTITY_REQUIRED;
    if (
      !insecureContextCode &&
      !lower.includes("secure context") &&
      !lower.includes("device identity required")
    ) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.insecure.hint", { url: "http://127.0.0.1:18789" })}
        <div style="margin-top: 6px">
          ${t("overview.insecure.stayHttp", { config: "gateway.controlUi.allowInsecureAuth: true" })}
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.openclaw.ai/gateway/tailscale"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Tailscale Serve docs (opens in new tab)"
            >Docs: Tailscale Serve</a
          >
          <span class="muted"> · </span>
          <a
            class="session-link"
            href="https://docs.openclaw.ai/web/control-ui#insecure-http"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Insecure HTTP docs (opens in new tab)"
            >Docs: Insecure HTTP</a
          >
        </div>
      </div>
    `;
  })();

  const currentLocale = i18n.getLocale();
  const cyberHandle = extractHandle(props.cyberFlowUrl);
  const cyberLeadCount = computeLeadCount(props.cyberFlowUrl);
  const cyberProfile = regionProfile(props.cyberFlowRegion);
  const cyberPreview = buildPreviewScripts(cyberHandle, cyberLeadCount, props.cyberFlowRegion);
  const scannerRows = buildScannerRows(cyberHandle, props.cyberFlowRegion, cyberLeadCount);
  const safeRunMessage =
    props.cyberFlowRunState === "review"
      ? "Bulk posting is intentionally disabled. Drafts are staged for manual review."
      : props.cyberFlowRunState === "arming"
        ? `Sequencing ${cyberProfile.label} lead scan, scoring signals, and warming the bilingual draft queue.`
        : "Paste a live X profile URL to regenerate the lead score, region filter, and bilingual draft previews.";

  return html`
    <section class="cyberflow-console">
      <div class="cyberflow-console__backdrop"></div>
      <div class="cyberflow-console__hero">
        <div class="cyberflow-console__intro">
          <div class="cyberflow-console__eyebrow">CyberFlow Strategic Harvest Console</div>
          <h2>Dan Koe signal intake, lead scoring, and bilingual script drafting in one surface.</h2>
          <p>
            This panel stages a high-intensity review workflow around live X signals. It does not
            fire bulk comments; it prepares a manual queue with aggressive visibility into who to
            contact and what to say next.
          </p>
        </div>
        <div class="cyberflow-console__statusbar">
          <div class="cyberflow-chip cyberflow-chip--pulse">
            <span class="cyberflow-chip__label">Harvest state</span>
            <strong>${cyberFlowStatusLabel(props.cyberFlowRunState)}</strong>
          </div>
          <div class="cyberflow-chip">
            <span class="cyberflow-chip__label">Potential leads</span>
            <strong>${cyberLeadCount}</strong>
          </div>
          <div class="cyberflow-chip">
            <span class="cyberflow-chip__label">Source handle</span>
            <strong>@${cyberHandle}</strong>
          </div>
        </div>
      </div>

      <div class="cyberflow-grid">
        <section class="cyberflow-panel cyberflow-panel--command">
          <div class="cyberflow-panel__header">
            <div>
              <div class="cyberflow-panel__kicker">Core Input</div>
              <h3>X link intake</h3>
            </div>
          </div>
          <div class="cyberflow-region-toggle" role="tablist" aria-label="Region Toggle">
            ${(["US", "MX", "ME"] as const).map(
              (region) => html`
                <button
                  class="cyberflow-region-toggle__item ${props.cyberFlowRegion === region ? "active" : ""}"
                  @click=${() => props.onCyberFlowRegionChange(region)}
                >
                  ${region}
                </button>
              `,
            )}
          </div>
          <label class="field cyberflow-field">
            <span>Dan Koe or target X link</span>
            <input
              .value=${props.cyberFlowUrl}
              @input=${(event: Event) =>
                props.onCyberFlowUrlChange((event.target as HTMLInputElement).value)}
              placeholder="https://x.com/dankoe"
            />
          </label>
          <div class="cyberflow-actions">
            <button class="btn primary cyberflow-execute" @click=${() => props.onCyberFlowExecute()}>
              ${props.cyberFlowRunState === "arming" ? "Arming Review Queue…" : "One-Click Execute"}
            </button>
            <div class="cyberflow-safety-note">
              Manual-review mode only. Automated spam or harassment flows are not enabled.
            </div>
          </div>
          <div class="cyberflow-runline">${safeRunMessage}</div>
          <div class="cyberflow-region-brief">
            <strong>${cyberProfile.label}</strong>
            <span>${cyberProfile.language}</span>
            <span>${cyberProfile.etiquette}</span>
          </div>
        </section>

        <section class="cyberflow-panel cyberflow-panel--balances">
          <div class="cyberflow-panel__header">
            <div>
              <div class="cyberflow-panel__kicker">Airwallex Preview</div>
              <h3>Multi-currency monitor</h3>
            </div>
          </div>
          <div class="cyberflow-balance-stack">
            ${cyberProfile.currencies.map(
              (currency) => html`
                <div class="cyberflow-balance-card">
                  <div>
                    <span>${currency.code}</span>
                    <strong>${currency.amount}</strong>
                  </div>
                  <small>${currency.note}</small>
                </div>
              `,
            )}
          </div>
          <div class="cyberflow-airwallex-note">
            Airwallex API preview slot: wired as a dashboard placeholder in this UI pass.
          </div>
        </section>

        <section class="cyberflow-panel cyberflow-panel--metrics">
          <div class="cyberflow-panel__header">
            <div>
              <div class="cyberflow-panel__kicker">Harvest Status Bar</div>
              <h3>Lead pressure map</h3>
            </div>
          </div>
          <div class="cyberflow-metric-stack">
            <div class="cyberflow-metric-card">
              <span>Potential customers captured</span>
              <strong>${cyberLeadCount}</strong>
            </div>
            <div class="cyberflow-metric-card">
              <span>Comment intent score</span>
              <strong>${72 + (cyberLeadCount % 23)}%</strong>
            </div>
            <div class="cyberflow-metric-card">
              <span>Manual queue readiness</span>
              <strong>${props.cyberFlowRunState === "review" ? "Ready" : "Standby"}</strong>
            </div>
          </div>
          <div class="cyberflow-market-strip">
            ${cyberProfile.markets.map(
              ([market, score]) => html`
                <div class="cyberflow-market-strip__item">
                  <span>${market}</span>
                  <strong>${score}</strong>
                </div>
              `,
            )}
          </div>
        </section>

        <section class="cyberflow-panel cyberflow-panel--scanner">
          <div class="cyberflow-panel__header">
            <div>
              <div class="cyberflow-panel__kicker">Dan Koe Follower Scanner</div>
              <h3>Active users in ${cyberProfile.label}</h3>
            </div>
          </div>
          <div class="cyberflow-scanner-list">
            ${scannerRows.map(
              (row) => html`
                <article class="cyberflow-scanner-row">
                  <div>
                    <strong>${row.name}</strong>
                    <span>${row.region}</span>
                  </div>
                  <div class="cyberflow-scanner-row__meta">
                    <b>${row.activity}</b>
                    <small>${row.note}</small>
                  </div>
                </article>
              `,
            )}
          </div>
        </section>

        <section class="cyberflow-panel cyberflow-panel--logic">
          <div class="cyberflow-panel__header">
            <div>
              <div class="cyberflow-panel__kicker">AI Logic Window</div>
              <h3>Claude bilingual script preview</h3>
            </div>
          </div>
          <div class="cyberflow-script-grid">
            <article class="cyberflow-script-card">
              <div class="cyberflow-script-card__title">English Draft</div>
              <pre>${cyberPreview.english}</pre>
            </article>
            <article class="cyberflow-script-card">
              <div class="cyberflow-script-card__title">Borrador en Español</div>
              <pre>${cyberPreview.spanish}</pre>
            </article>
          </div>
        </section>
      </div>
    </section>

    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">${t("overview.access.title")}</div>
        <div class="card-sub">${t("overview.access.subtitle")}</div>
        <div class="form-grid" style="margin-top: 16px;">
          <label class="field">
            <span>${t("overview.access.wsUrl")}</span>
            <input
              .value=${props.settings.gatewayUrl}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, gatewayUrl: v });
              }}
              placeholder="ws://100.x.y.z:18789"
            />
          </label>
          ${
            isTrustedProxy
              ? ""
              : html`
                <label class="field">
                  <span>${t("overview.access.token")}</span>
                  <input
                    .value=${props.settings.token}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      props.onSettingsChange({ ...props.settings, token: v });
                    }}
                    placeholder="CYBERFLOW_GATEWAY_TOKEN"
                  />
                  <div class="muted" style="margin-top: 6px;">${t("overview.access.tokenHint")}</div>
                </label>
                <label class="field">
                  <span>${t("overview.access.password")}</span>
                  <input
                    type="password"
                    .value=${props.password}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      props.onPasswordChange(v);
                    }}
                    placeholder="system or shared password"
                  />
                </label>
              `
          }
          <label class="field">
            <span>${t("overview.access.sessionKey")}</span>
            <input
              .value=${props.settings.sessionKey}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSessionKeyChange(v);
              }}
            />
          </label>
          <label class="field">
            <span>${t("overview.access.language")}</span>
            <select
              .value=${currentLocale}
              @change=${(e: Event) => {
                const v = (e.target as HTMLSelectElement).value as Locale;
                void i18n.setLocale(v);
                props.onSettingsChange({ ...props.settings, locale: v });
              }}
            >
              <option value="en">${t("languages.en")}</option>
              <option value="zh-CN">${t("languages.zhCN")}</option>
              <option value="zh-TW">${t("languages.zhTW")}</option>
              <option value="pt-BR">${t("languages.ptBR")}</option>
            </select>
          </label>
        </div>
        <div class="row" style="margin-top: 14px;">
          <button class="btn" @click=${() => props.onConnect()}>${t("common.connect")}</button>
          <button class="btn" @click=${() => props.onRefresh()}>${t("common.refresh")}</button>
          <span class="muted">${
            isTrustedProxy ? t("overview.access.trustedProxy") : t("overview.access.connectHint")
          }</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("overview.snapshot.title")}</div>
        <div class="card-sub">${t("overview.snapshot.subtitle")}</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.status")}</div>
            <div class="stat-value ${props.connected ? "ok" : "warn"}">
              ${props.connected ? t("common.ok") : t("common.offline")}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.uptime")}</div>
            <div class="stat-value">${uptime}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.tickInterval")}</div>
            <div class="stat-value">${tick}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.lastChannelsRefresh")}</div>
            <div class="stat-value">
              ${props.lastChannelsRefresh ? formatRelativeTimestamp(props.lastChannelsRefresh) : t("common.na")}
            </div>
          </div>
        </div>
        ${
          props.lastError
            ? html`<div class="callout danger" style="margin-top: 14px;">
              <div>${props.lastError}</div>
              ${pairingHint ?? ""}
              ${authHint ?? ""}
              ${insecureContextHint ?? ""}
            </div>`
            : html`
                <div class="callout" style="margin-top: 14px">
                  ${t("overview.snapshot.channelsHint")}
                </div>
              `
        }
      </div>
    </section>

    <section class="grid grid-cols-3" style="margin-top: 18px;">
      <div class="card stat-card">
        <div class="stat-label">${t("overview.stats.instances")}</div>
        <div class="stat-value">${props.presenceCount}</div>
        <div class="muted">${t("overview.stats.instancesHint")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t("overview.stats.sessions")}</div>
        <div class="stat-value">${props.sessionsCount ?? t("common.na")}</div>
        <div class="muted">${t("overview.stats.sessionsHint")}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">${t("overview.stats.cron")}</div>
        <div class="stat-value">
          ${props.cronEnabled == null ? t("common.na") : props.cronEnabled ? t("common.enabled") : t("common.disabled")}
        </div>
        <div class="muted">${t("overview.stats.cronNext", { time: formatNextRun(props.cronNext) })}</div>
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">${t("overview.notes.title")}</div>
      <div class="card-sub">${t("overview.notes.subtitle")}</div>
      <div class="note-grid" style="margin-top: 14px;">
        <div>
          <div class="note-title">${t("overview.notes.tailscaleTitle")}</div>
          <div class="muted">
            ${t("overview.notes.tailscaleText")}
          </div>
        </div>
        <div>
          <div class="note-title">${t("overview.notes.sessionTitle")}</div>
          <div class="muted">${t("overview.notes.sessionText")}</div>
        </div>
        <div>
          <div class="note-title">${t("overview.notes.cronTitle")}</div>
          <div class="muted">${t("overview.notes.cronText")}</div>
        </div>
      </div>
    </section>
  `;
}
