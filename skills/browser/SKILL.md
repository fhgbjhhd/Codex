---
name: browser
description: Browser automation and web UI debugging with Playwright-style tools. Use when Codex needs to open a live web page, inspect rendered page structure, click or type through UI flows, submit forms, switch tabs, upload files, capture screenshots, or investigate browser-side console and network behavior.
---

# Browser

## Overview

Use the browser tools for live, stateful, or JavaScript-heavy pages where simple HTTP fetching is not enough. Prefer structured inspection and targeted actions over trial-and-error clicking.

## Choose The Right Tool

Use browser tools when the task depends on rendered UI state, authentication, client-side routing, modal dialogs, form flows, or visual verification.

Do not reach for the browser first when a static page, API call, repo file read, or CLI command will answer the question faster and more reliably.

## Core Workflow

### 1. Navigate And Stabilize

Start with navigation, then wait for the page to settle before acting.

- Navigate directly to the target URL.
- Wait for a reliable page signal: visible text, a stable heading, or a short bounded delay.
- Resize the viewport early if the task is device-specific or responsive behavior matters.

### 2. Inspect Before Acting

Prefer a structured page snapshot over blind clicking.

- Capture an accessibility snapshot to get actionable refs for buttons, inputs, links, and dialogs.
- Use screenshots for visual confirmation, layout review, or user-facing evidence, not as the primary interaction primitive.
- Re-snapshot after meaningful DOM changes so refs stay current.

### 3. Act With Targeted Tools

Use the narrowest tool that matches the interaction.

- Click for buttons, links, toggles, and menu items.
- Type for text entry that should trigger key handlers or submit on Enter.
- Fill form fields in one call when multiple inputs can be set deterministically.
- Select option for dropdowns.
- Press key for keyboard-only flows, shortcuts, dismissal, or focus management.
- Drag only when the UI genuinely requires pointer movement.
- Upload files only from known local paths that already exist.

### 4. Handle Dynamic UI Carefully

Treat modern web apps as asynchronous systems.

- Wait after actions that trigger navigation, lazy content, autosave, or modal transitions.
- Re-check the page state before repeating an action to avoid double-submits.
- Use tab management when actions open a new page or popup.
- Use evaluation only when a dedicated browser action cannot express the operation cleanly.

### 5. Debug Failures With Browser Signals

When the UI does not behave as expected, inspect the browser instead of guessing.

- Read recent console messages for runtime errors, warnings, and failed script assumptions.
- Read network requests when the problem may be API-driven, auth-related, or caused by missing assets.
- Use small, focused JavaScript evaluation to inspect state only when snapshot and built-in tools are insufficient.

### 6. Verify The Outcome

Confirm the exact state the user asked for.

- Take a screenshot when visual proof matters.
- Re-snapshot or inspect the relevant controls to confirm text, selection, disabled state, or navigation result.
- Report concrete outcomes: final URL, visible text, error message, or downloaded artifact.

## Safety Rules

- Do not submit purchases, deletions, irreversible settings changes, or external messages unless the user explicitly asked for that final action.
- Do not rely on stale refs after navigation or major rerenders.
- Do not loop on the same failing action; inspect the current state and adjust.
- Do not use heavyweight browser flows for tasks that a non-browser tool can complete more directly.

## Quick Patterns

### Inspect A Page

1. Navigate.
2. Wait for the page shell.
3. Capture a snapshot.
4. Identify the target refs.

### Fill And Submit A Form

1. Snapshot the form.
2. Fill or type into the required fields.
3. Submit once.
4. Wait for the success or error state.
5. Verify the resulting page state.

### Debug A Broken Interaction

1. Reproduce the issue once.
2. Check console messages.
3. Check recent network requests.
4. Re-snapshot the page.
5. Use evaluation only if the cause is still unclear.
