#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import textwrap
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib import error, request


POSITIVE_SIGNALS: list[tuple[re.Pattern[str], int, str]] = [
    (re.compile(r"\bautomation\b", re.I), 20, "mentions automation directly"),
    (re.compile(r"\bworkflow(s)?\b", re.I), 12, "talks about workflows"),
    (re.compile(r"\bsystem(s)?\b", re.I), 10, "talks about systems"),
    (re.compile(r"\bprocess(es)?\b", re.I), 10, "talks about processes"),
    (re.compile(r"\bops\b|\boperations\b", re.I), 14, "works in operations"),
    (re.compile(r"\bdelegate|delegation\b", re.I), 8, "cares about delegation"),
    (re.compile(r"\bmanual\b|\brepetitive\b|\bbottleneck\b", re.I), 16, "describes manual bottlenecks"),
    (re.compile(r"\bai\b|\bagent(s)?\b|\btooling\b", re.I), 12, "already experiments with AI or tooling"),
    (re.compile(r"\bleverage\b|\bscale\b|\bcompound\b", re.I), 8, "uses leverage language"),
    (re.compile(r"\bfounder\b|\bagency\b|\boperator\b|\bcreator\b", re.I), 7, "fits likely operator persona"),
]

NEGATIVE_SIGNALS: list[tuple[re.Pattern[str], int, str]] = [
    (re.compile(r"\bmeme\b|\bshitpost\b|\bgiveaway\b", re.I), -12, "content looks low-intent"),
    (re.compile(r"\bcrypto calls\b|\bsports picks\b", re.I), -20, "content is off-topic for workflow help"),
    (re.compile(r"\bnsfw\b|\badult\b", re.I), -30, "content is not appropriate for outreach"),
]


@dataclass
class CandidateResult:
    username: str
    matched: bool
    score: int
    rationale: list[str]
    supporting_signals: list[str]
    draft_reply: str
    profile: dict[str, Any]
    engagement: dict[str, Any]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a manual-review queue from public engagement around a dan_koe post."
    )
    parser.add_argument("--input", required=True, help="Path to input JSON payload.")
    parser.add_argument("--markdown-output", help="Write the review queue as Markdown.")
    parser.add_argument("--json-output", help="Write the review queue as JSON.")
    parser.add_argument("--state-file", help="Optional state file used for hourly cap and latest-post dedupe.")
    parser.add_argument("--limit", type=int, default=50, help="Maximum participants to inspect. Default: 50.")
    parser.add_argument(
        "--hourly-cap",
        type=int,
        default=12,
        help="Maximum matched drafts to emit per hour per state file. Default: 12.",
    )
    parser.add_argument(
        "--analysis-mode",
        choices=["heuristic", "claude"],
        default="heuristic",
        help="Use local heuristics or Claude API scoring.",
    )
    parser.add_argument(
        "--claude-model",
        default=os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest"),
        help="Claude model name when --analysis-mode claude is used.",
    )
    parser.add_argument(
        "--cta-url",
        default="https://getcyberflow.ai/",
        help="Manual-review CTA URL to append to reply drafts.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Process the payload even if the latest post matches the state file.",
    )
    return parser.parse_args()


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def save_text(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def save_json(path: str, payload: dict[str, Any]) -> None:
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def utcnow() -> datetime:
    return datetime.now(UTC)


def read_state(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    state_path = Path(path)
    if not state_path.exists():
        return {}
    return json.loads(state_path.read_text(encoding="utf-8"))


def write_state(path: str | None, state: dict[str, Any]) -> None:
    if not path:
        return
    Path(path).write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def update_hourly_window(state: dict[str, Any], hourly_cap: int) -> tuple[dict[str, Any], int]:
    now = utcnow()
    started_at_raw = state.get("window_started_at")
    emitted = int(state.get("emitted_this_window", 0) or 0)
    started_at = None
    if isinstance(started_at_raw, str):
        try:
            started_at = datetime.fromisoformat(started_at_raw.replace("Z", "+00:00"))
        except ValueError:
            started_at = None

    if started_at is None or now - started_at >= timedelta(hours=1):
        state["window_started_at"] = now.isoformat().replace("+00:00", "Z")
        state["emitted_this_window"] = 0
        emitted = 0

    remaining = max(0, hourly_cap - emitted)
    return state, remaining


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def flatten_candidate_text(candidate: dict[str, Any]) -> str:
    profile = candidate.get("profile") or {}
    recent_posts = candidate.get("recent_posts") or []
    parts = [
        str(profile.get("name", "")),
        str(profile.get("username", "")),
        str(profile.get("bio", "")),
    ]
    for post in recent_posts[:10]:
        parts.append(str((post or {}).get("text", "")))
    return "\n".join(parts)


def heuristic_analysis(candidate: dict[str, Any], cta_url: str) -> CandidateResult:
    profile = candidate.get("profile") or {}
    engagement = candidate.get("engagement") or {}
    combined_text = flatten_candidate_text(candidate)

    score = 20
    rationale: list[str] = []
    supporting_signals: list[str] = []

    for pattern, weight, reason in POSITIVE_SIGNALS:
        if pattern.search(combined_text):
            score += weight
            rationale.append(reason)
            supporting_signals.append(pattern.pattern)

    for pattern, weight, reason in NEGATIVE_SIGNALS:
        if pattern.search(combined_text):
            score += weight
            rationale.append(reason)
            supporting_signals.append(pattern.pattern)

    followers = int(profile.get("followers_count") or 0)
    if 100 <= followers <= 50000:
        score += 5
        rationale.append("profile size suggests an active but reachable operator")

    if str(engagement.get("type", "")).lower() == "reply":
        score += 5
        rationale.append("already engages in discussion, not just passive likes")

    score = clamp(score, 0, 100)
    matched = score >= 60 and any(weight > 0 and pattern.search(combined_text) for pattern, weight, _ in POSITIVE_SIGNALS)

    draft_reply = build_reply_draft(
        profile=profile,
        matched=matched,
        rationale=rationale,
        cta_url=cta_url,
    )

    return CandidateResult(
        username=str(profile.get("username", "")),
        matched=matched,
        score=score,
        rationale=dedupe_list(rationale) or ["insufficient public signal"],
        supporting_signals=dedupe_list(supporting_signals),
        draft_reply=draft_reply,
        profile=profile,
        engagement=engagement,
    )


def build_reply_draft(profile: dict[str, Any], matched: bool, rationale: list[str], cta_url: str) -> str:
    username = str(profile.get("username", "")).strip() or "there"
    if not matched:
        return ""

    primary_reason = reply_focus_from_rationale(rationale)
    body = (
        f"@{username} The hidden edge here is leverage: once the repeatable part of your work is explicit, "
        f"you stop renting your attention to tasks and start compounding it through systems. "
        f"If {primary_reason}, the next move is usually not more hustle, but encoding the manual path into a repeatable workflow. "
        f"I put one practical breakdown here if useful: {cta_url}"
    )
    return squash_whitespace(body)


def squash_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def dedupe_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            result.append(value)
            seen.add(value)
    return result


def reply_focus_from_rationale(rationale: list[str]) -> str:
    reason_map = {
        "mentions automation directly": "automation is already on your mind",
        "talks about workflows": "you are already thinking in workflows",
        "talks about systems": "you are already thinking in systems",
        "talks about processes": "your work is process-heavy",
        "works in operations": "you operate close to recurring execution",
        "cares about delegation": "you are trying to delegate without losing quality",
        "describes manual bottlenecks": "you are feeling the drag of manual bottlenecks",
        "already experiments with AI or tooling": "you are already testing AI or tooling",
        "fits likely operator persona": "you sound like an operator who values leverage",
        "profile size suggests an active but reachable operator": "you are operating at a scale where systems matter",
        "already engages in discussion, not just passive likes": "you are engaging thoughtfully rather than passively scrolling",
    }
    for reason in rationale:
        if reason in reason_map:
            return reason_map[reason]
    return "you seem to care about leverage and repeatable systems"


def build_claude_prompt(candidate: dict[str, Any], latest_post: dict[str, Any], cta_url: str) -> str:
    profile = candidate.get("profile") or {}
    recent_posts = candidate.get("recent_posts") or []
    compact_posts = [
        {
            "text": str((post or {}).get("text", ""))[:280],
            "created_at": (post or {}).get("created_at"),
            "url": (post or {}).get("url"),
        }
        for post in recent_posts[:8]
    ]
    payload = {
        "source_post": {
            "text": latest_post.get("text"),
            "url": latest_post.get("url"),
        },
        "candidate_profile": {
            "name": profile.get("name"),
            "username": profile.get("username"),
            "bio": profile.get("bio"),
            "followers_count": profile.get("followers_count"),
            "url": profile.get("url"),
        },
        "recent_posts": compact_posts,
        "cta_url": cta_url,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def call_claude(candidate: dict[str, Any], latest_post: dict[str, Any], cta_url: str, model: str) -> CandidateResult:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is required for --analysis-mode claude")

    prompt = build_claude_prompt(candidate, latest_post, cta_url)
    body = {
        "model": model,
        "max_tokens": 500,
        "temperature": 0.1,
        "system": textwrap.dedent(
            """
            You are scoring public X users for possible interest in workflow automation.
            Use only the supplied public text. Be conservative.
            Return valid JSON with keys:
            matched (boolean),
            score (integer 0-100),
            rationale (array of short strings),
            supporting_signals (array of short strings),
            draft_reply (string).
            Never suggest auto-posting, scraping, or evasion.
            """
        ).strip(),
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
    }

    req = request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Claude API error: {exc.code} {detail}") from exc

    text_fragments: list[str] = []
    for block in payload.get("content", []):
        if isinstance(block, dict) and block.get("type") == "text":
            text_fragments.append(str(block.get("text", "")))
    combined = "\n".join(text_fragments).strip()
    result_json = extract_json_object(combined)

    profile = candidate.get("profile") or {}
    engagement = candidate.get("engagement") or {}
    return CandidateResult(
        username=str(profile.get("username", "")),
        matched=bool(result_json.get("matched")),
        score=clamp(int(result_json.get("score", 0) or 0), 0, 100),
        rationale=[str(item) for item in result_json.get("rationale", [])][:8] or ["Claude returned no rationale"],
        supporting_signals=[str(item) for item in result_json.get("supporting_signals", [])][:8],
        draft_reply=squash_whitespace(str(result_json.get("draft_reply", ""))),
        profile=profile,
        engagement=engagement,
    )


def extract_json_object(value: str) -> dict[str, Any]:
    start = value.find("{")
    end = value.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError("Claude response did not contain a JSON object")
    return json.loads(value[start : end + 1])


def render_markdown(
    latest_post: dict[str, Any],
    results: list[CandidateResult],
    remaining_after_run: int,
    analysis_mode: str,
) -> str:
    lines = [
        "# Dan Koe Harvest Queue",
        "",
        f"- Source post: {latest_post.get('url') or latest_post.get('id') or 'unknown'}",
        f"- Source text: {squash_whitespace(str(latest_post.get('text', '')))}",
        f"- Analysis mode: {analysis_mode}",
        f"- Draft slots remaining this hour: {remaining_after_run}",
        "",
    ]

    if not results:
        lines.extend(["No matched candidates in this batch.", ""])
        return "\n".join(lines)

    for index, result in enumerate(results, start=1):
        profile = result.profile
        lines.extend(
            [
                f"## {index}. @{result.username}",
                "",
                f"- Score: {result.score}",
                f"- Name: {profile.get('name') or ''}",
                f"- Profile: {profile.get('url') or ''}",
                f"- Bio: {squash_whitespace(str(profile.get('bio', '')))}",
                f"- Followers: {profile.get('followers_count') or 0}",
                f"- Rationale: {'; '.join(result.rationale)}",
                "",
                "Draft reply:",
                "",
                result.draft_reply,
                "",
            ]
        )
    return "\n".join(lines)


def validate_payload(payload: dict[str, Any]) -> None:
    latest_post = payload.get("latest_post")
    participants = payload.get("participants")
    if not isinstance(latest_post, dict):
        raise ValueError("Input payload must include latest_post object")
    if not latest_post.get("id") and not latest_post.get("text"):
        raise ValueError("latest_post must include id or text")
    if not isinstance(participants, list):
        raise ValueError("Input payload must include participants array")


def main() -> int:
    args = parse_args()
    payload = load_json(args.input)
    validate_payload(payload)

    latest_post = payload.get("latest_post") or {}
    participants = list(payload.get("participants") or [])[: args.limit]
    state = read_state(args.state_file)
    state, remaining_slots = update_hourly_window(state, args.hourly_cap)

    latest_post_id = str(latest_post.get("id") or "")
    if (
        args.state_file
        and not args.force
        and latest_post_id
        and state.get("last_seen_post_id") == latest_post_id
    ):
        print("Latest post already processed; use --force to regenerate the queue.", file=sys.stderr)
        return 0

    if remaining_slots <= 0:
        print("Hourly review cap reached; wait for the next window or raise --hourly-cap.", file=sys.stderr)
        return 1

    matched_results: list[CandidateResult] = []
    for candidate in participants:
        try:
            if args.analysis_mode == "claude":
                result = call_claude(candidate, latest_post, args.cta_url, args.claude_model)
            else:
                result = heuristic_analysis(candidate, args.cta_url)
        except Exception as exc:
            print(f"Warning: analysis failed for candidate: {exc}", file=sys.stderr)
            continue

        if result.matched and result.draft_reply:
            matched_results.append(result)
        if len(matched_results) >= remaining_slots:
            break

    state["emitted_this_window"] = int(state.get("emitted_this_window", 0) or 0) + len(matched_results)
    if latest_post_id:
        state["last_seen_post_id"] = latest_post_id
    write_state(args.state_file, state)

    queue_json = {
        "source": payload.get("source") or {},
        "latest_post": latest_post,
        "analysis_mode": args.analysis_mode,
        "generated_at": utcnow().isoformat().replace("+00:00", "Z"),
        "matched_count": len(matched_results),
        "results": [
            {
                "username": result.username,
                "matched": result.matched,
                "score": result.score,
                "rationale": result.rationale,
                "supporting_signals": result.supporting_signals,
                "draft_reply": result.draft_reply,
                "profile": result.profile,
                "engagement": result.engagement,
            }
            for result in matched_results
        ],
    }

    remaining_after_run = max(0, remaining_slots - len(matched_results))
    markdown = render_markdown(latest_post, matched_results, remaining_after_run, args.analysis_mode)

    if args.markdown_output:
        save_text(args.markdown_output, markdown)
    if args.json_output:
        save_json(args.json_output, queue_json)

    if not args.markdown_output and not args.json_output:
        print(markdown)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
