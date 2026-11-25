# AI 사용량 (Windows usage monitor) — design

## Why
The user codes and runs live servers with Claude Code and Codex on a Windows PC. Running out of a limit mid-task is costly, so the current limit usage has to be visible at all times.

## Goals
- Show Claude Code and Codex 5-hour and weekly limit percentages, reset countdowns, and whether the current pace runs out before reset.
- Stay in the Windows tray; notify at configurable thresholds (default 80% / 95%).
- Installable with a normal .exe; guide written for a non-developer.

## Non-goals
- claude.ai / chatgpt.com web chat history, API billing (Admin API) — out of scope for v1.

## Approaches
1. **Electron (chosen by the user)** — web UI, easiest to polish and to test here; ~80 MB installer.
2. Tauri — much lighter, but harder to verify from a Linux container.

## Data
- Claude: `~/.claude/.credentials.json` token → `GET api.anthropic.com/api/oauth/usage` (undocumented; same source as Claude Code's usage screen). Expired token is never refreshed by us (would rotate Claude Code's token). Today's tokens from `~/.claude/projects/**/*.jsonl`.
- Codex: `~/.codex/auth.json` token → `GET chatgpt.com/backend-api/wham/usage` (undocumented); fallback to the newest `token_count.rate_limits` in `~/.codex/sessions/**/rollout-*.jsonl`, labelled "기록 기준".
- On failure the last good numbers stay on screen, marked stale; 429 backs off 2→10 min.

## Builder calls
- Installer built by GitHub Actions on windows-latest (unsigned NSIS one-click, per-user, no admin).
- Pretendard font bundled; light/dark follows Windows.
