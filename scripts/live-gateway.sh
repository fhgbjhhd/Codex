#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI=(node "${ROOT_DIR}/dist/index.js")
PLIST="${HOME}/Library/LaunchAgents/ai.openclaw.gateway.plist"

read_gateway_token() {
  node -e '
    const fs = require("fs");
    const path = process.env.HOME + "/.openclaw/openclaw.json";
    const config = JSON.parse(fs.readFileSync(path, "utf8"));
    const token = config?.gateway?.auth?.token;
    if (typeof token !== "string" || token.trim().length === 0) {
      process.exit(1);
    }
    process.stdout.write(token.trim());
  '
}

require_token() {
  if ! TOKEN="$(read_gateway_token)"; then
    echo "Gateway token missing in ~/.openclaw/openclaw.json" >&2
    exit 1
  fi
  export TOKEN
}

bootstrap_gateway() {
  launchctl bootout "gui/$UID" "${PLIST}" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$UID" "${PLIST}"
}

usage() {
  cat <<'EOF'
Usage: scripts/live-gateway.sh <command>

Commands:
  status       Show repo Gateway service status without RPC probe
  health       Call gateway health using the local config token
  n8n-status   Call n8n.status using the local config token
  n8n-runs     Call n8n.runs using the local config token
  install      Reinstall LaunchAgent from the repo build
  restart      Restart LaunchAgent via bootout/bootstrap
  logs         Tail the current Gateway log file
EOF
}

cmd="${1:-status}"

case "${cmd}" in
  status)
    exec "${CLI[@]}" gateway status --no-probe
    ;;
  health)
    require_token
    exec "${CLI[@]}" gateway call health --token "${TOKEN}"
    ;;
  n8n-status)
    require_token
    exec "${CLI[@]}" gateway call n8n.status --token "${TOKEN}"
    ;;
  n8n-runs)
    require_token
    exec "${CLI[@]}" gateway call n8n.runs --params '{"limit":5}' --token "${TOKEN}"
    ;;
  install)
    exec "${CLI[@]}" gateway install --force --runtime node
    ;;
  restart)
    bootstrap_gateway
    exec "${CLI[@]}" gateway status --no-probe
    ;;
  logs)
    latest_log="$(ls -1t /tmp/openclaw/openclaw-*.log 2>/dev/null | head -n 1)"
    if [[ -z "${latest_log}" ]]; then
      echo "No /tmp/openclaw log file found" >&2
      exit 1
    fi
    exec tail -f "${latest_log}"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown command: ${cmd}" >&2
    usage >&2
    exit 1
    ;;
esac
