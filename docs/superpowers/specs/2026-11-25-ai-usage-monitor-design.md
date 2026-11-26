# AI 사용량 — design

## Why
The user codes and runs live servers with Claude and ChatGPT (Codex). Running out of a limit mid-task is costly, so the current limits must be visible at a glance.

## Shape (current)
A Chrome extension (`usage-extension/`), replacing the earlier Windows Electron app at the user's request:
- Hovering the toolbar icon shows a tooltip with each 5-hour and weekly limit and its reset time.
- The badge shows the fullest 5-hour limit, coloured by warning level; "!" when a login is needed.
- Clicking opens a compact popup: Claude in orange, ChatGPT in green, limits only.
- Notifications at thresholds (default 80/95%) and when a high limit refills.

## Data
Read with the browser's own login (cookies), same as the sites' usage pages:
- Claude: `claude.ai/api/organizations` → `/api/organizations/{uuid}/usage` (five_hour, seven_day).
- ChatGPT: `chatgpt.com/api/auth/session` → `backend-api/wham/usage` (Codex limits).
Both are undocumented. Last good numbers stay shown (marked stale) when a check fails; 429 backs off 2→10 min.

## Distribution
GitHub Actions zips the extension and publishes it on the Releases page (no sign-in needed); installed via Developer mode → Load unpacked.
