---
name: topview
description: TopView video bridge for script drafting, render submission, and result polling. Use when you need generate_script, submit_task, or get_video_url for TopView-based video jobs.
homepage: https://www.topview.ai
metadata:
  {
    "openclaw":
      {
        "emoji": "🔴",
        "skillKey": "topview",
        "homepage": "https://www.topview.ai",
        "requires": { "bins": ["python3"], "env": ["TOPVIEW_API_KEY"] },
        "primaryEnv": "TOPVIEW_API_KEY",
      },
  }
---

# Topview Bridge

Use the bundled bridge instead of writing ad-hoc HTTP calls.

## Workflow

1. Draft a video script with `node topview.js generate_script`.
2. Submit the render with `node topview.js submit_task`.
3. Poll for finished output with `node topview.js get_video_url`.
4. For status-only follow-ups, prefer `node topview.js check_topview_status`.
5. For a one-shot progress probe, use `node topview.js get_task_status`.

## Command Examples

Use the Node wrapper with explicit flags when possible. It automatically picks the working Python runtime.

```bash
node topview.js generate_script \
  --topic "CyberFlow AI verification clip" \
  --audience "operators and consultants" \
  --goal "turn AI workflow ideas into a concrete video concept" \
  --style "black-gold, premium, minimal" \
  --locale "en-US" \
  --duration-seconds 5
```

`generate_script` also accepts `--text` as a shorthand brief when you only have one creative sentence.

```bash
node topview.js submit_task \
  --prompt "A 5-second black and gold CyberFlow AI verification clip, premium interface glow" \
  --model Standard \
  --aspect-ratio 16:9 \
  --resolution 720 \
  --duration 5 \
  --count 1 \
  --sound off
```

```bash
node topview.js get_video_url --task-id "<task_id>" --timeout 180 --interval 5
```

```bash
node topview.js check_topview_status --task-id "<task_id>" --timeout 180 --interval 5
```

```bash
node topview.js get_task_status --task-id "<task_id>"
```

## Files

- `topview.py`: Python bridge CLI with the three required functions.
- `topview.js`: Preferred entrypoint. Use this wrapper in agent runs so the correct Python runtime is selected automatically.
- `topview.json`: JSON contract for the bridge functions and parameters.

## Notes

- The bridge reads `TOPVIEW_API_KEY` and `TOPVIEW_API_ENDPOINT` from the environment.
- `TOPVIEW_UID` is optional when `~/.topview/credentials.json` already exists.
- `generate_script` is local and deterministic; `submit_task` / `get_video_url` call Topview.
- `submit_task` accepts both `--prompt` and `--render_prompt`.
- Avoid calling `python3 topview.py` directly from agent runs when `node topview.js` is available.
- `submit_task` returns a TopView `task_id`, not a local process/session id. Never use `process.poll` with that value.
- Always poll TopView jobs with `node topview.js get_video_url --task-id "<task_id>"`.
- When the user asks to "check status", use `node topview.js check_topview_status --task-id "<task_id>"`.
- When you only need to know whether a task has started or completed, use `node topview.js get_task_status --task-id "<task_id>"`.
