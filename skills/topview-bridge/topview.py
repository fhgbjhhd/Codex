#!/usr/bin/env python3
"""Minimal Topview bridge for script drafting and text-to-video jobs."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

DEFAULT_ENDPOINT = "https://api.topview.ai/v1"
DEFAULT_MODEL = "Standard"
DEFAULT_ASPECT_RATIO = "16:9"
DEFAULT_RESOLUTION = 720
DEFAULT_DURATION = 5
DEFAULT_COUNT = 1
DEFAULT_SOUND = "off"
DEFAULT_TIMEOUT = 600
DEFAULT_INTERVAL = 5.0


class TopviewBridgeError(RuntimeError):
    pass


def _trim_base_url(url: str) -> str:
    return url.rstrip("/")


def load_credentials() -> dict[str, str]:
    endpoint = _trim_base_url(os.environ.get("TOPVIEW_API_ENDPOINT", DEFAULT_ENDPOINT).strip())
    api_key = os.environ.get("TOPVIEW_API_KEY", "").strip()
    uid = os.environ.get("TOPVIEW_UID", "").strip()

    cred_file = Path.home() / ".topview" / "credentials.json"
    if cred_file.exists():
        try:
            data = json.loads(cred_file.read_text())
        except json.JSONDecodeError as exc:
            raise TopviewBridgeError(f"Invalid Topview credential file: {cred_file}") from exc
        uid = uid or str(data.get("uid", "")).strip()
        api_key = api_key or str(data.get("api_key", "")).strip()

    if not api_key:
        raise TopviewBridgeError("Missing TOPVIEW_API_KEY.")
    if not uid:
        raise TopviewBridgeError("Missing TOPVIEW_UID and no uid found in ~/.topview/credentials.json.")

    return {
        "endpoint": endpoint or DEFAULT_ENDPOINT,
        "uid": uid,
        "api_key": api_key,
    }


def topview_headers(creds: dict[str, str]) -> dict[str, str]:
    return {
        "Topview-Uid": creds["uid"],
        "Authorization": f"Bearer {creds['api_key']}",
        "Content-Type": "application/json",
    }


def _normalize_endpoint(endpoint: str, path: str) -> str:
    base = _trim_base_url(endpoint)
    if path.startswith("/v1/") or path.startswith("/v2/"):
        if base.endswith("/v1") or base.endswith("/v2"):
            return f"{base.rsplit('/', 1)[0]}{path}"
        return f"{base}{path}"
    return f"{base}/{path.lstrip('/')}"


def topview_post(endpoint: str, headers: dict[str, str], path: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = _normalize_endpoint(endpoint, path)
    body = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib_request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise TopviewBridgeError(f"Topview submit failed: HTTP {exc.code} {detail}") from exc
    except urllib_error.URLError as exc:
        raise TopviewBridgeError(f"Topview submit failed: {exc.reason}") from exc
    data = json.loads(raw)
    code = str(data.get("code", ""))
    if code != "200":
        raise TopviewBridgeError(data.get("message", f"Topview submit failed: {code}"))
    return data.get("result", data)


def topview_get(endpoint: str, headers: dict[str, str], path: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urllib_parse.urlencode(params)
    url = _normalize_endpoint(endpoint, path)
    if query:
        url = f"{url}?{query}"
    req = urllib_request.Request(url, headers=headers, method="GET")
    try:
        with urllib_request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise TopviewBridgeError(f"Topview query failed: HTTP {exc.code} {detail}") from exc
    except urllib_error.URLError as exc:
        raise TopviewBridgeError(f"Topview query failed: {exc.reason}") from exc
    data = json.loads(raw)
    code = str(data.get("code", ""))
    if code != "200":
        raise TopviewBridgeError(data.get("message", f"Topview query failed: {code}"))
    return data.get("result", data)


def generate_script(
    topic: str,
    audience: str,
    goal: str,
    style: str,
    locale: str,
    duration_seconds: int,
) -> dict[str, Any]:
    hook = f"For {audience}: {topic} is the fastest path to {goal}."
    voiceover = [
        hook,
        f"Show the core friction in one sentence, then resolve it with a simple system.",
        f"Keep the tone {style}. Speak to {locale} expectations and end with one clear call to action.",
    ]
    scenes = [
        {"scene": 1, "title": "Hook", "visual": f"Immediate tension around {topic}", "voiceover": voiceover[0]},
        {"scene": 2, "title": "Problem", "visual": "Show wasted motion or chaos", "voiceover": voiceover[1]},
        {"scene": 3, "title": "System", "visual": "Show the workflow or leverage point", "voiceover": f"Introduce the system that delivers {goal}."},
        {"scene": 4, "title": "CTA", "visual": "Clean branded close", "voiceover": voiceover[2]},
    ]
    prompt = (
        f"{style}. {locale}. {duration_seconds}-second video about {topic}. "
        f"Audience: {audience}. Goal: {goal}. "
        "Open with a sharp hook, show the bottleneck, then reveal the workflow and end with a clean CTA."
    )
    return {
        "topic": topic,
        "audience": audience,
        "goal": goal,
        "style": style,
        "locale": locale,
        "duration_seconds": duration_seconds,
        "hook": hook,
        "scenes": scenes,
        "render_prompt": prompt,
    }


def submit_task(
    prompt: str,
    model: str = DEFAULT_MODEL,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
    resolution: int = DEFAULT_RESOLUTION,
    duration: int = DEFAULT_DURATION,
    count: int = DEFAULT_COUNT,
    sound: str = DEFAULT_SOUND,
    board_id: str | None = None,
) -> dict[str, Any]:
    creds = load_credentials()
    payload: dict[str, Any] = {
      "model": model,
      "prompt": prompt,
      "aspectRatio": aspect_ratio,
      "resolution": resolution,
      "duration": duration,
      "generatingCount": count,
      "sound": sound,
    }
    if board_id:
        payload["boardId"] = board_id
    result = topview_post(
        creds["endpoint"],
        topview_headers(creds),
        "/v1/common_task/text2video/task/submit",
        payload,
    )
    return {"task_id": result["taskId"], "submitted": True}


def get_video_url(task_id: str, timeout: float = DEFAULT_TIMEOUT, interval: float = DEFAULT_INTERVAL) -> dict[str, Any]:
    creds = load_credentials()
    headers = topview_headers(creds)
    start = time.time()
    while True:
        elapsed = time.time() - start
        if elapsed > timeout:
            raise TimeoutError(f"Task {task_id} did not complete within {timeout}s")
        result = topview_get(
            creds["endpoint"],
            headers,
            "/v1/common_task/text2video/task/query",
            {"taskId": task_id},
        )
        status = str(result.get("status", "")).lower()
        if status == "success":
            videos = result.get("videos", [])
            urls = [video.get("filePath", "") for video in videos if video.get("filePath")]
            edit_links = []
            board_id = result.get("boardId")
            if board_id:
                for video in videos:
                    board_task_id = video.get("boardTaskId")
                    if board_task_id:
                        edit_links.append(
                            f"https://www.topview.ai/board/{board_id}?boardResultId={board_task_id}"
                        )
            return {
                "task_id": task_id,
                "status": status,
                "video_urls": urls,
                "edit_links": edit_links,
                "raw_result": result,
            }
        if status in {"fail", "failed"}:
            raise TopviewBridgeError(result.get("errorMsg", f"Topview task {task_id} failed."))
        time.sleep(interval)


def get_task_status(task_id: str) -> dict[str, Any]:
    creds = load_credentials()
    result = topview_get(
        creds["endpoint"],
        topview_headers(creds),
        "/v1/common_task/text2video/task/query",
        {"taskId": task_id},
    )
    status = str(result.get("status", "")).lower()
    videos = result.get("videos", [])
    urls = [video.get("filePath", "") for video in videos if video.get("filePath")]
    edit_links = []
    board_id = result.get("boardId")
    if board_id:
        for video in videos:
            board_task_id = video.get("boardTaskId")
            if board_task_id:
                edit_links.append(
                    f"https://www.topview.ai/board/{board_id}?boardResultId={board_task_id}"
                )
    return {
        "task_id": task_id,
        "status": status or "unknown",
        "video_urls": urls,
        "edit_links": edit_links,
        "raw_result": result,
    }


def _print(data: dict[str, Any]) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Topview bridge")
    sub = parser.add_subparsers(dest="command", required=True)

    gen = sub.add_parser("generate_script", help="Draft a video script package.")
    gen.add_argument("--text", help="Shorthand creative brief. Used as topic when --topic is omitted.")
    gen.add_argument("--topic")
    gen.add_argument("--audience", default="operators and consultants")
    gen.add_argument("--goal", default="turn AI workflow ideas into a concrete video concept")
    gen.add_argument("--style", default="clear, premium, concise")
    gen.add_argument("--locale", default="en-US")
    gen.add_argument("--duration-seconds", type=int, default=30)

    submit = sub.add_parser("submit_task", help="Submit a Topview text-to-video task.")
    submit.add_argument("--prompt")
    submit.add_argument(
        "--render_prompt",
        help="Alias for --prompt. Accepted because some agents infer this name from script output.",
    )
    submit.add_argument("--model", default=DEFAULT_MODEL)
    submit.add_argument("--aspect-ratio", default=DEFAULT_ASPECT_RATIO)
    submit.add_argument("--resolution", type=int, default=DEFAULT_RESOLUTION)
    submit.add_argument("--duration", type=int, default=DEFAULT_DURATION)
    submit.add_argument("--count", type=int, default=DEFAULT_COUNT)
    submit.add_argument("--sound", choices=["on", "off"], default=DEFAULT_SOUND)
    submit.add_argument("--board-id")

    query = sub.add_parser("get_video_url", help="Poll a task and return output URLs.")
    query.add_argument("--task-id", required=True)
    query.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT)
    query.add_argument("--interval", type=float, default=DEFAULT_INTERVAL)

    status = sub.add_parser(
        "check_topview_status",
        help="Alias for get_video_url. Prefer this when the intent is status checking.",
    )
    status.add_argument("--task-id", required=True)
    status.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT)
    status.add_argument("--interval", type=float, default=DEFAULT_INTERVAL)

    once = sub.add_parser(
        "get_task_status",
        help="Query TopView once and return the current task status without waiting for completion.",
    )
    once.add_argument("--task-id", required=True)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "generate_script":
            topic = (args.topic or args.text or "").strip()
            if not topic:
                raise TopviewBridgeError("generate_script requires --topic or --text.")
            _print(
                generate_script(
                    topic=topic,
                    audience=args.audience,
                    goal=args.goal,
                    style=args.style,
                    locale=args.locale,
                    duration_seconds=args.duration_seconds,
                )
            )
            return 0
        if args.command == "submit_task":
            prompt = (args.prompt or args.render_prompt or "").strip()
            if not prompt:
                raise TopviewBridgeError("submit_task requires --prompt or --render_prompt.")
            _print(
                submit_task(
                    prompt=prompt,
                    model=args.model,
                    aspect_ratio=args.aspect_ratio,
                    resolution=args.resolution,
                    duration=args.duration,
                    count=args.count,
                    sound=args.sound,
                    board_id=args.board_id,
                )
            )
            return 0
        if args.command in {"get_video_url", "check_topview_status"}:
            _print(
                get_video_url(
                    task_id=args.task_id,
                    timeout=args.timeout,
                    interval=args.interval,
                )
            )
            return 0
        if args.command == "get_task_status":
            _print(get_task_status(task_id=args.task_id))
            return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
