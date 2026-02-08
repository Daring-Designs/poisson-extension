# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Poisson is a Chrome Manifest V3 extension that generates decoy browsing noise using Poisson-process scheduling. No build tools, no dependencies, no server — pure vanilla JS loaded directly as an unpacked extension.

## Development

There is no build step, package.json, or test framework. To develop:

1. Open `chrome://extensions`, enable Developer Mode
2. Click "Load unpacked", select this directory
3. After editing files, click the reload button on the extension card (or Ctrl+R on the extensions page)

## Architecture

Three runtime contexts communicate via `chrome.runtime.sendMessage`:

```
popup.js  ──sendMessage──▶  background.js  ──executeScript──▶  interact.js
  (UI)                      (service worker)                   (injected into noise tabs)
```

- **background.js** — The core engine. Runs as a service worker. Manages Poisson scheduling (chrome.alarms fires every 60s, tasks dispatched via setTimeout at exponential inter-arrival offsets), opens/closes noise tabs, injects interact.js, tracks bandwidth via webRequest, persists everything to chrome.storage.local. Contains all hardcoded data arrays (118 browse sites, 18 ad sites, 215+ search terms, 4 search engines).

- **interact.js** — Content script injected only into noise tabs (never user tabs). Runs a 5-phase interaction sequence (dwell → scroll → hover → maybe click → final dwell) within the task's time budget, then sends `interaction-complete` message back with scroll/click counts and byte estimate. Only clicks same-origin links.

- **popup.js + popup.html + popup.css** — Three-tab popup UI (Status/Log/Settings). Sends action messages to background (`start`, `stop`, `set-intensity`, `set-engines`, `set-task-weights`, `set-categories`, `get-status`, `get-logs`, `get-bandwidth`, `get-settings`, `clear-logs`). Auto-refreshes every 3s while open.

## Key Data Flow

All persistent state lives in `chrome.storage.local`:
- `running`, `intensity`, `sessionStart` — engine state
- `engineSettings`, `taskWeights`, `categorySettings` — user preferences
- `stats` — daily counters (auto-reset on date change) + all-time totals + daysActive array
- `logs` — ring buffer of 500 entries (newest first), includes both task entries and `system` type entries for start/stop/settings changes
- `bandwidthHourly` (last 24 hours), `bandwidthDaily` (last 30 days) — rolling bandwidth windows

Runtime-only state: `noiseTabIds` Set (filters webRequest to only count noise tab traffic), `pendingTasks` array, `sessionBandwidth` counter.

## Site Data Organization

`BROWSE_SITES` is a flat array with `SITE_CATEGORIES` mapping category names to index ranges (e.g., `news: { start: 0, end: 16 }`). When editing sites, update both the array and the category ranges, and verify indices are correct.

## Conventions

- Every file has a header comment block explaining what it does and does NOT do (privacy/security transparency)
- System events (engine start/stop, settings changes, errors) are logged via `logSystem()` so they appear in the user's log feed
- All URLs are validated with `isValidUrl()` (http/https only) before opening
- Tabs are always opened with `active: false` and always cleaned up (even on errors)
- The popup uses `escapeHtml()` for all dynamic content to prevent XSS
