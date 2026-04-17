const KEY = "openclaw.control.settings.v1";

import { isSupportedLocale } from "../i18n/index.ts";
import type { ThemeMode } from "./theme.ts";

const LEGACY_DEV_PORTS = new Set(["3000", "5173"]);
const LOCAL_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const DEFAULT_LOCAL_GATEWAY_PORT = "18789";

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  splitRatio: number; // Sidebar split ratio (0.4 to 0.7, default 0.6)
  navCollapsed: boolean; // Collapsible sidebar state
  navGroupsCollapsed: Record<string, boolean>; // Which nav groups are collapsed
  locale?: string;
};

function resolveDefaultGatewayUrl(
  currentLocation: Pick<Location, "protocol" | "host" | "hostname" | "port">,
) {
  const proto = currentLocation.protocol === "https:" ? "wss" : "ws";
  if (
    LOCAL_LOOPBACK_HOSTS.has(currentLocation.hostname) &&
    LEGACY_DEV_PORTS.has(currentLocation.port)
  ) {
    return `${proto}://127.0.0.1:${DEFAULT_LOCAL_GATEWAY_PORT}`;
  }
  return `${proto}://${currentLocation.host}`;
}

function normalizeStoredGatewayUrl(
  rawGatewayUrl: string,
  currentLocation: Pick<Location, "protocol" | "host" | "hostname" | "port">,
) {
  const trimmed = rawGatewayUrl.trim();
  if (!trimmed) {
    return resolveDefaultGatewayUrl(currentLocation);
  }
  try {
    const parsed = new URL(trimmed);
    if (
      LOCAL_LOOPBACK_HOSTS.has(currentLocation.hostname) &&
      LEGACY_DEV_PORTS.has(currentLocation.port) &&
      LOCAL_LOOPBACK_HOSTS.has(parsed.hostname) &&
      LEGACY_DEV_PORTS.has(parsed.port)
    ) {
      const nextProtocol = currentLocation.protocol === "https:" ? "wss:" : "ws:";
      return `${nextProtocol}//127.0.0.1:${DEFAULT_LOCAL_GATEWAY_PORT}`;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

export function loadSettings(): UiSettings {
  const defaultUrl = resolveDefaultGatewayUrl(location);

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  };

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      gatewayUrl:
        typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
          ? normalizeStoredGatewayUrl(parsed.gatewayUrl, location)
          : defaults.gatewayUrl,
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : (typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()) ||
            defaults.lastActiveSessionKey,
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : defaults.theme,
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean" ? parsed.chatFocusMode : defaults.chatFocusMode,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : defaults.splitRatio,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : defaults.navCollapsed,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" && parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : defaults.navGroupsCollapsed,
      locale: isSupportedLocale(parsed.locale) ? parsed.locale : undefined,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: UiSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export const __storageTestUtils = {
  normalizeStoredGatewayUrl,
  resolveDefaultGatewayUrl,
};
