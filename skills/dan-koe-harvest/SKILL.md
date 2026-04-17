---
name: dan-koe-harvest
description: Build a compliant X research queue around dan_koe public posts. Use when you need to ingest official API or manually exported public data, score likely automation-interest signals with heuristics or Claude, and generate manual-review reply drafts instead of auto-posting.
metadata: { "openclaw": { "emoji": "🌾", "requires": { "bins": ["python3"] } } }
---

# Dan Koe Harvest

## Overview

Use this skill to turn public engagement around `dan_koe` posts into a manual-review outreach queue.

This skill is intentionally constrained:

- Use only official X API output or manually exported public data.
- Do not scrape private data, evade rate limits, or simulate human behavior.
- Do not auto-reply, auto-DM, or auto-post.
- Treat the output as a research queue for human approval.

## Workflow

1. Collect one source post plus up to 50 public participants from official tooling.
2. Save the payload as JSON matching `references/input-schema.md`.
3. Run the bundled script to score public “automation / leverage / workflow pain” signals.
4. Review the generated Markdown queue and edit any draft reply before posting manually.

## Quick Start

```bash
python3 {baseDir}/scripts/review_queue.py \
  --input /tmp/dan-koe-latest.json \
  --markdown-output /tmp/dan-koe-queue.md \
  --json-output /tmp/dan-koe-queue.json \
  --cta-url "https://getcyberflow.ai/?ref=dan-koe-review"
```

With Claude scoring enabled:

```bash
ANTHROPIC_API_KEY=... \
python3 {baseDir}/scripts/review_queue.py \
  --input /tmp/dan-koe-latest.json \
  --markdown-output /tmp/dan-koe-queue.md \
  --json-output /tmp/dan-koe-queue.json \
  --cta-url "https://getcyberflow.ai/?ref=dan-koe-review" \
  --analysis-mode claude
```

## Guardrails

- Cap each run to a reviewable batch. The script defaults to `12` approved-draft slots per hour via a local state file.
- The script may suggest a reply, but it never sends one.
- Keep replies evidence-based. Refer only to what is visible in the public profile and public post history supplied in the input payload.
- If the candidate data is thin or ambiguous, prefer `matched = false`.

## Output

The script writes:

- Markdown queue for review
- JSON queue for downstream tooling
- Optional state file to avoid reprocessing the same source post

Each match includes:

- profile summary
- interest score
- rationale
- supporting public signals
- reply draft in a leverage / systems / compounding style

## References

- Read `references/input-schema.md` for the accepted payload shape and field notes.
