# Jam Deck — Build Plan

Living document. Updated as we execute. Source of truth for spec is [JAM_DECK_SPEC.md](JAM_DECK_SPEC.md).

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked / needs decision

---

## TDD approach

Test-driven development for everything where tests give real value. Write a failing test first, watch it fail, make it pass, refactor.

**TDD-first (red → green → refactor):**
- Server: deck CRUD (file ops, validation), media upload handling, WebSocket event routing, conflict resolution / last-write-wins, playback state machine (server-authoritative).
- Pure logic: timing calculations (bars↔seconds at given BPM, Link tempo-responsive remaining time, quantized start-on-next-bar), countdown computation, slide-strip windowing.
- Hooks: `usePlayback`, `useWebSocket` reconnect/queue logic, `useLink` state derivation — tested with React Testing Library + fake timers.

**Tested but not strictly TDD-first:**
- React components — write tests alongside, but visual layout iterates faster with the browser open. Tests cover behavior (clicks, keyboard, state changes) not pixels.
- Canvas drawing — TDD the data model (objects array, serialization, hit-testing) but not the brush rendering itself.

**Not TDD'd:**
- Ableton Link native bridge — will be a thin wrapper around the addon; smoke-tested with the real library running. Logic *on top of* Link tempo (e.g. duration calc) is unit-tested with a mock.
- Manual visual QA for fullscreen, projector output, mobile responsiveness.

**Tooling:**
- Server: `vitest` (fast, ESM-native, same runner both sides).
- Client: `vitest` + `@testing-library/react` + `jsdom`.
- One root `package.json` workspace or two — decide in Phase 0.

**Rule:** every PR-sized chunk lands with its tests. If a bug escapes, the next commit is a failing test that reproduces it, then the fix.

---

## Phase 0 — Repo & tooling setup ✅

- [x] Decide workspace layout — **chose:** single root `package.json` w/ npm workspaces (`server/` + `client/`)
- [x] `git init`, `.gitignore` (node_modules, data/, .env, dist, coverage)
- [x] Server scaffold: Node + Express 5 + ws, `vitest` + supertest, smoke test for `/api/health`
- [x] Client scaffold: Vite + React 18, `vitest` + RTL + jsdom, smoke test for App layout
- [x] Root `npm run dev` boots both via `concurrently` — verified server :4000 + client :5173 both reachable
- [x] Root `npm test` runs both test suites — both green
- [x] README with run/test instructions
- [x] Initial commit

**Exit criteria met:** `npm test` green on both sides; `npm run dev` opens the 3-panel React shell; client proxies `/api` and `/ws` to the server.

---

## Phase 1 — Core shell

Spec §"Phase 1 — Core Shell"

### Server
- [x] `decks.js` — `createDeckStore({ dataDir })` factory exposing `listDecks()`, `getDeck(id)`, `createDeck({ name })`, `updateDeck(id, patch)`, `deleteDeck(id)`, `toggleFavorite(id)` + `DeckNotFoundError`. JSON files in `./data/decks/`, atomic writes via temp + rename, per-id write queue for in-process serialization, deep-merge of `settings`, wholesale replace of `slides`, id whitelist regex (rejects path separators). 26 tests. _Decision: `listDecks` returns lightweight summaries (id, name, favorite, timestamps, slideCount) — full decks fetched via `getDeck`._
- [ ] REST endpoints wrapping `decks.js`. **Tests first** with supertest.
- [ ] WebSocket server: connection lifecycle, `client:join` / `client:leave` broadcasts, message routing skeleton. **Tests first** using `ws` client in-process.
- [ ] Deck schema validation (zod or hand-rolled). **Tests first.**

### Client
- [ ] 3-panel layout (`TopBar`, `DeckPanel`, `SlidePanel`, main area placeholder). Component tests for layout presence + responsive collapse rules.
- [ ] `useWebSocket` hook: connect, auto-reconnect, message dispatch. **Tests first** with mock WS.
- [ ] Deck panel: list, create, delete, favorite (favorites pinned to top, then alpha). Tests for sort order + interactions.
- [ ] Per-deck settings modal (cog at top of slide panel): timing mode, timer style, countdown, slide strip toggle. Tests for form state + save.

**Exit criteria:** Create a deck, see it in the list, favorite it, edit its settings, refresh the page, state persists.

---

## Phase 2 — Slides & canvas

Spec §"Phase 2 — Slides & Canvas"

- [ ] Slide CRUD on server (add, delete, reorder, update content). Tests first.
- [ ] WebSocket `deck:update` event w/ broadcast to all peers except sender. Tests first.
- [ ] Slide list panel: thumbnails, click-to-select, +add, delete, drag-to-reorder. Tests for interactions; thumbnail rendering is visual.
- [ ] Canvas data model: `objects[]` (stroke, shape, text), serialization round-trip, hit-testing for selection. **TDD'd.**
- [ ] Canvas editor UI: freehand brush, shape palette (rect, circle, line, arrow, triangle), text tool, color/size controls. Behavior tests; rendering manual.
- [ ] Image slide: upload via REST → `./data/media/`, dedupe by content hash, validation (size, mime). **Tests first** for server side.
- [ ] Thumbnail generation (canvas → PNG dataURL or server-side). Decide approach.

**Exit criteria:** Build a 3-slide deck with one freehand canvas, one shape canvas, one image. Reload page, all preserved. Open a second browser tab, edits sync live.

---

## Phase 3 — Playback & timers (duration mode only)

Spec §"Phase 3 — Playback & Timers"

- [ ] Server-side playback state machine: idle → playing → idle, current slide index, start timestamp, loop flag. **TDD'd.** All clients receive `playback:start` / `playback:stop` / `playback:slide`.
- [ ] `usePlayback` hook on client: derives elapsed/remaining from server-broadcast start time + local clock. **TDD'd** with fake timers.
- [ ] Timer visualizations: `BackgroundFill`, `ShrinkingBall`. Pure functions for "% complete → visual state", tested. Render layer manual.
- [ ] Countdown overlay (seconds mode). Tested via the same % calculation.
- [ ] Horizontal slide strip during playback (toggleable per spec). Tests for current-slide highlighting + windowing.
- [ ] Play/Stop controls + spacebar shortcut. Tests.
- [ ] Loop toggle. Tests.

**Exit criteria:** Run a duration-mode deck end-to-end with timer fill, countdown, and loop. Spacebar plays/stops.

---

## Phase 4 — Timing & sync

Spec §"Phase 4 — Timing & Sync"

- [ ] `timing.js` utils: `barsToSeconds(bars, bpm, beatsPerBar)`, `secondsToBars(...)`, remaining-time-given-tempo-changes. **Pure, TDD'd.**
- [ ] Internal clock module: tick generator, metronome accent/beat trigger. **Tests first** with fake timers.
- [ ] Metronome sound upload + playback (web audio on client). Server-side upload TDD'd; audio playback manual.
- [ ] Bar-based slide durations work in internal-clock mode. Integration test: configure 8 bars @ 120bpm → 16s slide.
- [ ] Ableton Link bridge (`server/link.js`): pick library (`abletonlink` npm or build from source), expose `getTempo()`, `getBeat()`, `enable/disable`, event emitter. Smoke test with real Link peer; mock for unit tests.
- [ ] Tempo-responsive remaining-time calc — re-derive on every Link tempo update. **TDD'd** against the mock.
- [ ] Quantized start: align playback start to next bar boundary. **TDD'd.**
- [ ] Transport sharing via Link (play/stop). Manual + Link peer test.

**Exit criteria:** Connect to a DAW running Link, hit play, slides advance in bars, tempo changes mid-slide adjust remaining time, play starts on a bar boundary.

---

## Phase 5 — Mobile & sharing

Spec §"Phase 5 — Mobile & Sharing"

- [ ] Mobile detection (URL param `?mobile=1` and/or UA sniff — prefer explicit param)
- [ ] `MobileApp` shell: vertical slide list, thumbnails, edit toggles
- [ ] Current-slide lock during playback (server enforces; client greys out). **Tests first** for server-side rejection.
- [ ] `MobileSlideEditor`: simplified canvas + duration. Send button submits whole-slide state. Tests for submit payload.
- [ ] Conflict resolution / last-write-wins behavior at the deck-update level. **Tests first** with two simulated clients.
- [ ] ngrok integration: start tunnel from server on demand, expose URL via REST. Decide: built-in `ngrok` npm package vs. expect user to run `ngrok` separately. Tests for URL plumbing only.
- [ ] QR code modal — encodes tunnel URL. Tests.

**Exit criteria:** Open ngrok URL on phone, scroll through slides, edit a non-playing slide, see changes appear on host.

---

## Phase 6 — Polish

Spec §"Phase 6 — Polish"

- [ ] Fullscreen / second-window playback output. App-settings page toggle.
- [ ] Video slide type — upload, playback, refined progress bar.
- [ ] Drag-and-drop slide reorder polish (already in P2 — confirm UX).
- [ ] Visual design pass — typography, spacing, dark mode probably.
- [ ] README + screenshots.

---

## Open questions / decisions to make

- [ ] Which Ableton Link npm package — confirm `abletonlink` builds on current Node/macOS, fallback plan if not.
- [ ] Thumbnail generation: client-side `canvas.toDataURL` (simple, ships pixels over WS) vs. server-side render (cleaner, needs headless canvas).
- [ ] Per-canvas drawing engine: roll our own object model (lighter, fits TDD) vs. embed Fabric.js / Excalidraw (faster, harder to test).
- [ ] State management on client: plain React + context vs. Zustand. Default to plain unless we feel pain.
- [ ] ngrok: built-in vs. external — affects offline-only use.

Each decision will be made when we get to that phase, recorded here, and rationale noted.

---

## Working log

> Append-only notes as we execute. Date entries.

- _2026-05-04_ — Plan created from spec. TDD approach defined. Awaiting kickoff on Phase 0.
- _2026-05-04_ — Phase 1 (server) started: `decks.js` deck store landed TDD-style. 26 tests. Settled two decisions inline: (1) `listDecks` returns summaries not full decks; (2) writes serialize per-deck via an in-process promise queue + atomic temp-file rename — last-write-wins emerges from arrival order, file is never partially written.
- _2026-05-04_ — Phase 0 complete. Workspace layout: npm workspaces. Server (Express 5 + ws) and client (Vite + React 18) scaffolded with vitest smoke tests both green. `npm run dev` brings both up; client proxies to server. Discovered `/usr/local/bin/node` is a stale 2015 v0.10 install shadowing Homebrew's Node 25 in `$PATH` — worked around by prepending `/opt/homebrew/bin` per command; user should clean up at their leisure.
