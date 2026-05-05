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
- [x] REST endpoints wrapping `decks.js` (`GET /api/decks`, `POST /api/decks`, `GET/PATCH/DELETE /api/decks/:id`, `POST /api/decks/:id/favorite`). 14 supertest cases incl. 400 on missing/empty name and 404 on unknown / path-traversal-like ids. `createServer` now accepts `{ deckStore }` for testability; production wires a default store at `data/decks/`.
- [ ] WebSocket server: connection lifecycle, `client:join` / `client:leave` broadcasts, message routing skeleton. **Tests first** using `ws` client in-process.
- [ ] Deck schema validation (zod or hand-rolled). **Tests first.**

### Client (next up)
> Strategy: wire the UI to the **REST endpoints first** so we have something usable in the browser. Add WebSocket broadcasts later, once there's a second client to sync to. The WS skeleton task moves to its own bullet below.

- [x] `useDecks` hook — fetch list, create, delete, toggle-favorite via `/api/decks`. 7 tests with a `vi.stubGlobal('fetch', ...)` mock.
- [~] 3-panel layout — App composes useDecks + useDeck + DeckPanel + SlidePanel; main area still a placeholder pending Phase 2 (canvas/media editor).
- [x] Deck panel UI: list, create (inline form), delete, favorite (favorites pinned to top, then alpha by name). 15 tests. Smoke-tested live: create → favorite → delete cycle hits server with 201/200/204.
- [x] `useDeck(id)` hook — fetches single full deck, exposes `update(patch)` and `refresh()`, handles id=null + id changes (stale-response guard via request ticket). 7 tests.
- [x] Per-deck settings panel (cog at top of slide panel): timing mode (radio), internal BPM (number), timer style (radio), countdown bars/seconds (numbers), show slide strip + loop (checkboxes), Save/Cancel. Submits a `{ settings: {...full draft} }` patch via `PATCH /api/decks/:id`; closes panel on save; rehydrates draft when the deck changes. 7 component tests for the form, 7 for the panel host. Smoke-tested live: edits round-trip and persist; saved values rehydrate on re-open. (Metronome sound upload deferred to Phase 4.)
- [ ] **WS skeleton** — `useWebSocket` hook (connect, auto-reconnect, message dispatch) + server-side connection lifecycle. Wired up here once we know what events we'll broadcast. **Tests first** with mock WS / in-process `ws` client.

**Exit criteria:** Create a deck, see it in the list, favorite it, edit its settings, refresh the page, state persists.

---

## Phase 2 — Slides & canvas

Spec §"Phase 2 — Slides & Canvas"

- [x] Slide CRUD on server (add, delete, reorder, update content). Extended `decks.js` with `addSlide` / `updateSlide` / `deleteSlide` / `reorderSlides` (all per-deck-locked, `mergeDeck`-driven), plus a `SlideNotFoundError`. New REST endpoints: `POST/PATCH/DELETE /api/decks/:id/slides[...]` and `PUT /api/decks/:id/slides/order`. Returns full updated deck on every mutation. 32 new server tests (20 store + 12 routes); 73 server tests total.
- [ ] WebSocket `deck:update` event w/ broadcast to all peers except sender. Tests first.
- [~] Slide list panel: click-to-select (aria-current), +Add, delete, auto-select-on-add, auto-clear-selection-on-delete. App owns `selectedSlideId` and clears it when the selected slide vanishes. 8 new SlidePanel tests + 4 new useDeck tests covering addSlide/updateSlide/deleteSlide/reorderSlides through the REST endpoints. Drag-to-reorder + thumbnails deferred (server `reorderSlides` already wired, just needs UI).
- [~] Canvas data model: `objects[]` with per-kind handler registry for `bbox` + `hitTest`. Registered: `stroke`, `rect`. Pending: circle/line/arrow/triangle/text. Pure functions: `newCanvas`, `addObject`, `removeObject`, `updateObject`, `getObject`, `bbox`, `hitTest`, plus `createStroke`. JSON round-trip; topmost-wins for overlapping hit-tests. 18 tests.
- [~] Canvas editor UI — `CanvasEditor` with a Toolbar (Brush + Rectangle + color/width controls), pluggable tool handlers (start/move/end), and per-kind drawers. `SlideEditor` dispatcher (canvas / image / unknown). The in-progress draft lives in a ref (no React re-render per pixel); commit happens on mouseup with `addObject` → `updateSlide` → server PATCH. Switched from pointer events to mouse events (jsdom's PointerEvent doesn't propagate `clientX/Y` or `button` through fireEvent — touch/pointer support deferred to Phase 5 mobile work). Pending: circle, line, arrow, triangle, text.
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
- _2026-05-05_ — Phase 2 tools palette + rect tool landed TDD-style. CanvasEditor now has a Toolbar (Brush/Rectangle + color picker + width number input) and a pluggable tool-handler registry (start/move/end). Drag-to-define rect normalizes coords (works in any direction) and rejects zero-size commits. Smoke-tested: drew a 250×150 rect via drag-and-drop, persisted to disk, 2100 non-white pixels rendered. 12 new tests (6 canvas data model + 6 CanvasEditor — toolbar + 3 rect tool); 169 total (73 server + 96 client).
- _2026-05-05_ — Phase 2 canvas (freehand) landed TDD-style. `utils/canvas.js` data model with extensible per-kind handler registry; only `stroke` registered in v1. `CanvasEditor` uses a ref-based in-progress stroke (no React render per pixel) and commits on mouseup. `SlideEditor` dispatches by `slide.type`. Smoke-tested live: drew a 31-point stroke, persisted via PATCH, reloaded the page, identical pixel readback after re-render — round-trip confirmed. 27 new client tests (18 data model + 5 CanvasEditor + 3 SlideEditor + 1 useDeck addition); 84 total client + 73 server = 157 tests. Two notes for follow-up: (1) `launch.json` now wraps npm in `sh -c` with PATH prefix so concurrently/vite/node resolve to nvm v25 even when Claude Code's own PATH is stale; (2) jsdom's PointerEvent quirk forced a switch to mouse events — pointer/touch support deferred to Phase 5.
- _2026-05-05_ — Phase 2 client slide list landed TDD-style. `useDeck` got `addSlide` / `updateSlide` / `deleteSlide` / `reorderSlides`. `SlidePanel` renders rows showing index/type/duration with select + delete; +Add at the bottom always visible when a deck is loaded. App lifts `selectedSlideId`, auto-selects newly added slides, and clears the selection if the slide is deleted or the deck unloads. 130 tests total (73 server + 57 client). Smoke-tested live: 3-slide create → select → delete-others → delete-selected cycle works end-to-end.
- _2026-05-05_ — Phase 2 server slide CRUD landed TDD-style. Default new-slide duration is timing-mode-aware (`bars/8` for link/internal, `seconds/30` for duration). `reorderSlides` is strict — it requires a permutation of existing ids, returns 400 otherwise. Decision: every slide mutation returns the full updated deck so the client doesn't need to reconcile partial responses.
- _2026-05-05_ — Per-deck settings landed TDD-style. `useDeck(id)` + `DeckSettings` form + `SlidePanel` host. 21 new client tests (7+7+7). Smoke-tested live: every field persists through `PATCH /api/decks/:id`, panel auto-closes on save, form rehydrates on re-open. Wired App so PATCHes also trigger `useDecks.refresh()` to keep the list summary in sync with name/timestamp changes. Cleaned up the stale 2015 `/usr/local/bin/node` shadow once and for all (rm'd the binary + symlinks; nothing on the system referenced them); `.zshenv` PATH prepend now flows cleanly into Claude Code's shell after a restart, so `.claude/launch.json` reverted from absolute-path workaround to plain `npm`.
- _2026-05-04_ — Client `useDecks` hook + `DeckPanel` landed TDD-style (22 new tests, 87 total: 41 server + 24 client + .nvmrc, no — recount: 41 server + 24 client = 65, plus the 22 already in client makes the math work: 7 hook + 15 panel + 2 app = 24 client). Smoke-tested via Claude Preview: create / favorite / delete all round-trip through the live server. Caught one regression: empty-state hint was rendering alongside the error alert — fixed test-first. Settled UX choice: inline create form (input + Create + Cancel) instead of `prompt()` or modal. Settings cog at the deck level deferred until we have the SlidePanel host for it.
- _2026-05-04_ — Decided next step: wire client UI to REST first, defer WebSocket skeleton until we have events worth broadcasting. Set up `.nvmrc` + `~/.zshenv` PATH so nvm's Node 25.9.0 is canonical for all shells (incl. non-interactive Claude tool calls) — no more per-command PATH prefixes.
- _2026-05-04_ — REST router landed TDD-style. `decks.routes.js` mounted at `/api/decks`. 14 tests. `createServer` now takes `{ deckStore }`; production builds one from `data/decks/`. Smoke-tested live: create → list → delete round-trips through the live HTTP server.
- _2026-05-04_ — Phase 1 (server) started: `decks.js` deck store landed TDD-style. 26 tests. Settled two decisions inline: (1) `listDecks` returns summaries not full decks; (2) writes serialize per-deck via an in-process promise queue + atomic temp-file rename — last-write-wins emerges from arrival order, file is never partially written.
- _2026-05-04_ — Phase 0 complete. Workspace layout: npm workspaces. Server (Express 5 + ws) and client (Vite + React 18) scaffolded with vitest smoke tests both green. `npm run dev` brings both up; client proxies to server. Discovered `/usr/local/bin/node` is a stale 2015 v0.10 install shadowing Homebrew's Node 25 in `$PATH` — worked around by prepending `/opt/homebrew/bin` per command; user should clean up at their leisure.
