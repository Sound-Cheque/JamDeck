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
- [x] WebSocket `deck:update` event broadcast to all peers. `WebSocketServer` mounted at `/ws`. `createServer` exposes a `broadcast(message)` helper (or accepts an injected one for tests) that sends JSON to every open client. Routes call it after every successful mutation: `deck:created` (POST /api/decks), `deck:update` (PATCH, favorite, slide CRUD, reorder), `deck:deleted` (DELETE). Client `useWebSocket(url, handler)` hook connects on mount, JSON-decodes incoming, dispatches to handler, auto-reconnects with exponential backoff (1s → 30s); cleanup cancels reconnect on unmount. App subscribes to `/ws` and refreshes `useDecks` / `useDeck` state on relevant messages — peer-to-peer is symmetric (sender sees its own broadcast and idempotently re-fetches). Sender-suppression deferred — current state-from-response means the redundant refresh is a no-op. 17 new tests (8 broadcast spy + 3 WS round-trip integration + 6 useWebSocket).
- [~] Slide list panel: click-to-select (aria-current), +Add, delete, auto-select-on-add, auto-clear-selection-on-delete. App owns `selectedSlideId` and clears it when the selected slide vanishes. 8 new SlidePanel tests + 4 new useDeck tests covering addSlide/updateSlide/deleteSlide/reorderSlides through the REST endpoints. Drag-to-reorder + thumbnails deferred (server `reorderSlides` already wired, just needs UI).
- [x] Canvas data model: `objects[]` with per-kind handler registry for `bbox` + `hitTest`. Registered: `stroke`, `rect`, `circle`, `line`, `arrow`, `triangle`, `text`. Triangle uses bbox-inscribed isoceles with apex at top-center; arrow shares geometry with line. Text bbox is approximate (no canvas context in the data layer). Pure functions: `newCanvas`, `addObject`, `removeObject`, `updateObject`, `getObject`, `bbox`, `hitTest`, plus `createStroke`. JSON round-trip; topmost-wins for overlapping hit-tests. 18 tests.
- [x] Canvas editor UI — `CanvasEditor` with a Toolbar (Brush, Rectangle, Circle, Line, Arrow, Triangle, Text + color/width controls), pluggable tool handlers (start/move/end), and per-kind drawers. `SlideEditor` dispatcher (canvas / image / unknown). The in-progress draft lives in a ref (no React re-render per pixel); commit happens on mouseup with `addObject` → `updateSlide` → server PATCH. Bounding-box drag is shared between rect and triangle; endpoint drag between line and arrow. Text uses `window.prompt` for input (mocked in tests). Switched from pointer events to mouse events (jsdom's PointerEvent doesn't propagate `clientX/Y` or `button` through fireEvent — touch/pointer support deferred to Phase 5 mobile work).
- [x] Image slide: upload via REST → `./data/media/`, dedupe by content hash, validation (size, mime). Server `media.js` store hashes incoming buffers (sha-256), maps allowed MIME → extension, dedupes via `stat`-then-write. `POST /api/media` accepts multipart via multer 2.x (memory storage, 10 MB cap), returns 201 with `{ hash, url, mimeType, size }`; 415 on unsupported MIME, 400 on no file, 413 on oversize. Static `/media/*` serves from `./data/media/`. Client `ImageSlideEditor` shows an upload prompt for empty image slides, posts FormData on file change, displays the returned `<img>`, has a Replace control. `SlidePanel` got an "+ Add Image" button alongside "+ Add Slide"; App's `onAddImageSlide` calls `addSlide({ type: 'image', content: { src: null } })` then auto-selects. 18 new tests (7 store + 6 routes + 5 component).
- [x] Thumbnail generation. Decision: client-side canvas rendering via a shared `utils/canvasRender.js` (extracted from `CanvasEditor` so the same drawers are used). `SlideThumbnail` paints a 112×84 canvas with uniform-scale-preserving transform from the editor's 800×600 source, falls back to `<img>` for image slides and a placeholder glyph for unset / unknown types. Used in slide-panel rows. 4 tests.

**Exit criteria:** Build a 3-slide deck with one freehand canvas, one shape canvas, one image. Reload page, all preserved. Open a second browser tab, edits sync live.

---

## Phase 3 — Playback & timers (duration mode only)

Spec §"Phase 3 — Playback & Timers"

- [x] Server-side playback state machine. `createPlaybackController({ deckStore, broadcast, now })` snapshots the deck at start, advances slides via setTimeout, broadcasts `playback:start` (initial), `playback:slide` (advances + loop wrap), `playback:stop` (end / explicit stop). Rejects empty / unknown decks; restart-while-playing returns to slide 0. Bars-mode auto-advance deferred to Phase 4. REST: `GET /api/playback`, `POST /api/playback/start { deckId }`, `POST /api/playback/stop`. 13 controller tests + 8 route tests.
- [x] `usePlayback` hook: hydrates from `GET /api/playback` on mount, reacts to WS `playback:*` messages, exposes `start(deckId)` / `stop()` REST helpers and a stable `handleMessage` for the App's WS dispatcher. 9 tests.
- [x] Timer visualizations: pure `computeProgress({ startedAt, durationMs, now })` returns `{ elapsedMs, remainingMs, fraction }` (clamped). `useNow(intervalMs)` hook ticks ~30Hz off setInterval. `PlaybackView` renders Background Fill (`width = fraction*100%`) or Shrinking Ball (`width/height = (1-fraction)*100%`) based on `deck.settings.timerStyle`. 8 progress tests + 3 useNow tests.
- [x] Countdown overlay (seconds mode). Numeric `Math.ceil(remainingMs / 1000)` overlays the stage when `remainingMs ≤ countdownSeconds * 1000`. Covered by the PlaybackView tests.
- [x] Horizontal slide strip during playback. Reuses `SlideThumbnail`; toggled by `deck.settings.showSlideStrip`. Active slide marked `aria-current`. Windowing not needed yet — full-deck strip with `overflow-x: auto`.
- [x] Play/Stop controls + spacebar shortcut. `TopBar` shows Play (idle) or Stop (playing); disabled when no deck loaded or deck has no slides. Spacebar listener is global on `window` but skipped while focus is in an input / textarea / contentEditable. 11 tests.
- [x] Loop toggle. `TopBar` Loop button reflects `deck.settings.loop` via `aria-pressed`. Click PATCHes the deck (existing settings flow). Disabled when no deck loaded. 4 tests.

**Exit criteria:** Run a duration-mode deck end-to-end with timer fill, countdown, and loop. Spacebar plays/stops.

---

## Phase 4 — Timing & sync

Spec §"Phase 4 — Timing & Sync"

- [x] `timing.js` utils: `barsToMs(bars, bpm, beatsPerBar=4)`, `msToBars(...)`, `slideDurationMs(slide, settings)`. Mirrored on server (`server/src/timing.js`) and client (`client/src/utils/timing.js`) with parallel tests; bars-mode resolves to ms via the deck's `internalBpm` under internal timing, returns null for Link mode (driven by Link tempo elsewhere). 22 tests across both sides.
- [x] Internal clock metronome (client web-audio). Pure `nextBeatAtOrAfter(startedAt, bpm, now)` helper + `useMetronome({ enabled, startedAt, bpm, beatsPerBar, player })` hook + `createTonePlayer({ audioContextFactory })` Web Audio adapter (lazy AudioContext, 880Hz accent + 440Hz beat sine envelopes). Hook reschedules on startedAt changes, catches up correctly when joining mid-playback, no-ops when disabled / bpm missing. Wired in App: enabled when the loaded deck is playing under internal timing. 13 tests (hook + audio + math). _Per-deck mute toggle and uploadable accent/beat sounds deferred — built-in tones for now._
- [x] Metronome sound upload + playback. `media.js` now accepts audio MIME types (`audio/wav`, `audio/x-wav`, `audio/wave`, `audio/mpeg`, `audio/mp3`, `audio/ogg`, `audio/webm`, `audio/mp4`, `audio/aac`) alongside images. `createTonePlayer` exposes `setSamples({ accent, beat })` — URLs are fetched + decoded once, cached, and replayed on every beat; missing/loading samples fall back to the built-in sine tone so the click never goes silent. App pushes `deck.settings.metronomeSounds` into the player on mount + change. `DeckSettings` got a "Metronome sounds" fieldset with per-kind upload + reset, posting to `/api/media`. 9 new tests (1 server media + 5 audio player + 3 deck-settings UI).
- [x] Bar-based slide durations work in internal-clock mode — server playback `scheduleAdvance` uses the shared `slideDurationMs` so a 4-bar slide at 120 BPM advances at 8 s. Two new playback tests cover the auto-advance + Link-mode opt-out paths.
- [x] Ableton Link bridge (`server/src/link.js`). Thin wrapper around `abletonlink@0.2.0-beta.0`; lazy-loaded inside `enable()` so the module imports cleanly even where the native addon isn't built. Polls via `link.startUpdate(intervalMs, cb)` and re-emits `tempo` / `peers` events; exposes `getTempo()` / `getPhase()` / `getQuantum()` / `getNumPeers()` and an `msUntilNextBar()` helper for quantized starts. `JAM_DECK_LINK=0` opts out at boot. Tested with a mock constructor (17 tests), smoke-tested live (server logs `Ableton Link enabled (tempo=120)` on boot).
- [x] Tempo-responsive remaining-time calc. The playback controller subscribes to the bridge's `tempo` event for the duration of each Link bars-mode slide; on a tempo change it computes bars-played at the previous tempo, holds bars-remaining, and reschedules the advance at the new tempo. Bookkeeping (`slideStartedAtMs`, `slideBpmAtStart`, `slideBarsLeft`) lives outside the deck snapshot so loops keep their full bar count. 2 new playback tests covering speed-up + tempo-halve scenarios.
- [x] Quantized start. When `timingMode === 'link'` and the bridge is enabled, `start()` peeks `msUntilNextBar()` and waits before broadcasting `playback:start`. The controller exposes a transient `'pending'` state (cancellable via `stop()`) so the UI can stay in sync. 3 new playback tests (delays correctly, cancels on stop, fires immediately when on a boundary).
- [x] Live tempo broadcast to clients. `server.js` re-broadcasts the bridge's `tempo` / `peers` events as `link:tempo` / `link:peers` WS messages; `playback:start` includes `linkBpm` when in Link mode. Client `usePlayback` records `state.linkBpm` (preserved across slide advances and stop), and `PlaybackView` splices it into settings so progress + countdown work for bars-mode slides under Link. Shared `slideDurationMs(slide, settings)` resolves Link bars-mode when `settings.linkBpm` is present (mirrored on server + client). 3 server-broadcast tests + 5 usePlayback tests + 3 timing tests.
- [x] Transport sharing via Link (play/stop). Bridge calls `enablePlayStateSync()` on enable, exposes `setIsPlaying(bool)` / `getIsPlaying()`, and emits `playState` only for external transitions (self-originating changes are suppressed via a pre-claimed `_lastSeenIsPlaying` flag — no feedback loops). Playback controller flips Link transport on user-initiated `start()` / `stop()` in Link mode and reacts to external `playState` events: Play re-arms the last-played deck (idempotent if already playing); Stop tears down current playback. 14 new tests (6 bridge + 8 controller) covering both directions and the no-echo guarantees.

**Exit criteria:** Connect to a DAW running Link, hit play, slides advance in bars, tempo changes mid-slide adjust remaining time, play starts on a bar boundary. ✅ Met by tests + live boot. (Manual DAW round-trip test still recommended before declaring victory.)

---

## Phase 5 — Mobile & sharing

Spec §"Phase 5 — Mobile & Sharing"

- [x] Mobile detection — `utils/mobile.js` checks `?mobile=0|1` first, falls back to a phone/tablet UA regex. `main.jsx` chooses `MobileApp` vs `App` at boot. 7 tests.
- [x] `MobileApp` shell — deck picker → vertical slide list with thumbnails + 🔒/✏ per row, "+ Add Slide" at the bottom, full-screen `MobileSlideEditor` when a row is tapped. Auto-switches to whichever deck starts playing. 4 tests.
- [x] Current-slide lock — `playback.js` exposes `getActiveSlideId()`; deck router rejects PATCH/DELETE on the playing slide and DELETE on the playing deck with 409. Other slides remain editable; once playback stops, the formerly-playing slide unlocks. 3 controller tests + 7 route tests.
- [x] `MobileSlideEditor` — simplified, full-screen, single-shot Send. v1 covers duration + image swap; on-canvas drawing on a phone is deferred. The whole slide payload (duration + content) is PATCHed in one shot — last-write-wins emerges from the existing per-deck queue. 5 tests.
- [x] Conflict resolution — last-write-wins emerges from `decks.js`'s per-deck promise queue + atomic temp-file rename. 3 explicit two-client tests pin the behavior (concurrent slide PATCHes, deck-vs-slide patch interleave, mobile-style whole-slide replacement).
- [x] ngrok integration — `share.js` `createShareController({ tunnelFactory, port })` with idempotent `start()`, `stop()`, `getStatus()`. `defaultNgrokTunnelFactory` lazy-imports `@ngrok/ngrok` inside `start()` so the module is safe to import without the package. REST: `GET /api/share`, `POST /api/share/start`, `POST /api/share/stop`. 7 controller tests + 4 route tests. `useShare` hook (4 tests) hydrates + drives the controller from the host UI.
- [x] QR code modal — `ShareModal` renders a `qrcode`-drawn canvas and the share URL (with `?mobile=1` auto-appended). Triggered from `TopBar`'s 📱 Share button. 6 tests.

**Exit criteria:** Open ngrok URL on phone, scroll through slides, edit a non-playing slide, see changes appear on host. ✅ All pieces in place; manual phone-on-real-network smoke test still recommended (requires `NGROK_AUTHTOKEN` env var).

---

## Phase 6 — Polish

Spec §"Phase 6 — Polish"

- [x] Fullscreen / second-window playback output. `useAppSettings` hook persists `fullscreenMode` to localStorage; `AppSettingsModal` exposes the radio toggle. ⛶ Fullscreen button in TopBar fires `requestFullscreen()` on the host's `<html>` in 'current' mode, or `window.open('/?playback=1', ...)` in 'window' mode. New `PlaybackWindow` boot mode renders only the playback view; `getBootMode()` routes between host / mobile / playback in `main.jsx`. 5 useAppSettings tests + 5 AppSettingsModal tests + 4 boot-mode tests.
- [x] Video slide type. `media.js` accepts `video/mp4`, `video/webm`, `video/quicktime`, `video/ogg`. New `VideoSlideEditor` (file picker + preview + Replace), wired into `SlideEditor`'s type dispatch. `SlideRenderer` plays videos in playback (autoplay + muted + playsInline; `key` on src restarts on slide change). `SlideThumbnail` uses a paused `<video preload="metadata">` for first-frame thumbs. "+ Add Video" button on the slide panel. 1 server media test + 4 video editor tests.
- [x] Drag-and-drop slide reorder. Pure `reorderIds(ids, fromId, toId)` helper (6 tests) drives the SlidePanel's drag handlers — HTML5 drag/drop with visual feedback (`--dragging` opacity, `--drag-over` outline). On drop, computes new order and calls `onReorderSlides(ids)` which routes through the existing `useDeck.reorderSlides` → `PUT /api/decks/:id/slides/order`. 4 SlidePanel drag tests.
- [x] Visual design pass — light/dark/auto theme via CSS custom properties. `useAppSettings.theme` controls a `data-theme` attribute on `<html>`; CSS overrides via `[data-theme="dark"]`, `[data-theme="light"]`, plus a `prefers-color-scheme: dark` media query for `auto`. New CSS for app settings modal, playback window, video editor, and drag feedback.
- [x] README updated. Documents features, run/test, env vars (`JAM_DECK_DATA_DIR`, `JAM_DECK_LINK`, `NGROK_AUTHTOKEN`), URL modes (`?mobile=1`, `?playback=1`), and the two optional native deps. Screenshots deferred — easier to capture once the user has a real session running.

---

## Phase 7 — Manual Smoke Tests

Features that can't be meaningfully exercised in vitest: native DAW integration, live ngrok tunnels, real-device touch, browser Fullscreen API, and `prefers-color-scheme` rendering. Work through this checklist before declaring any release ready. Mark items `[x]` as each passes.

### Boot & Basic Sanity
- [x] `npm run dev` starts cleanly — server on :4000, client on :5173, no native-addon errors in the log
- [x] 3-panel host UI loads in the browser
- [x] Create a deck, add a canvas slide + image slide + video slide, reload page — all slides persist with correct content

### Ableton Link _(requires a Link-enabled app: Ableton Live, Reason, LinkHut, etc.)_
- [x] Server log shows `Ableton Link enabled (tempo=120)` on boot (set `JAM_DECK_LINK=0` to opt out)
- [x] Create a bars-mode deck, start playback in Link timing — slide advances after the correct number of bars at the DAW's current tempo
- [x] Change tempo in the DAW mid-slide — remaining time adjusts; slide still advances at the right moment under the new tempo
- [x] Hit Play in JamDeck → DAW transport starts
- [x] Hit Stop in JamDeck → DAW transport stops
- [x] Hit Play in the DAW → JamDeck shows a brief "pending" state, then `playback:start` fires on the next bar boundary
- [x] Hit Stop in the DAW → JamDeck stops

### Ngrok / Mobile Sharing _(requires `NGROK_AUTHTOKEN` env var)_
- [ ] 📱 Share button in TopBar → QR code modal appears with correct ngrok URL
- [ ] Scan QR on a phone (or open URL in mobile browser) → Mobile UI loads, slide list visible with thumbnails
- [ ] Edit a non-playing slide on the phone → change appears in the host browser tab
- [ ] Start playback on the host → phone's active-slide indicator updates to the current slide
- [ ] Try to edit the currently-playing slide on the phone → action rejected (slide locked)
- [ ] Stop playback → formerly-playing slide is editable again on the phone
- [ ] Click Stop Sharing → tunnel closes, Share button resets to its idle state

### Multi-Client Real-Time Sync _(two browser tabs, no phone needed)_
- [ ] Create a slide in Tab 1 → appears in Tab 2 without a manual refresh
- [ ] Edit a slide in Tab 1 → Tab 2 reflects the change
- [ ] Start playback in Tab 1 → both tabs show the playback view simultaneously
- [ ] Delete a deck in Tab 1 → Tab 2 reflects the deletion

### Fullscreen & Second-Window Playback _(ideally two monitors)_
- [ ] AppSettings → "Current Window": ⛶ button triggers browser fullscreen; Escape exits
- [ ] AppSettings → "Second Window": ⛶ button opens `/?playback=1` in a new window with output-only view (no editor chrome)
- [ ] Start playback on the host → second window advances slides in real time

### Mobile UI _(real phone or narrow viewport at `?mobile=1`)_
- [ ] Tap a slide row → full-screen MobileSlideEditor opens
- [ ] Adjust duration and tap Send → change persists on the host
- [ ] Swap image on an image slide → host shows the updated image
- [ ] 🔒 icon on the playing slide → tapping it gives no edit access

### Dark Mode & Theming
- [ ] AppSettings theme toggle: Light renders white background, Dark renders dark background, Auto follows the OS setting
- [ ] Set macOS Appearance to Dark → Auto mode switches the app to dark
- [ ] Close and reopen the browser tab → chosen theme persists (localStorage)

### Canvas & Media
- [x] Draw freehand strokes on a canvas slide → strokes reload identically after page refresh
- [ ] Use all shape tools — Rect, Circle, Line, Arrow, Triangle, Text — each persists and reloads correctly
- [ ] Upload the same image file twice → deduplication works (no duplicate stored on disk)
- [ ] Video slide: plays back automatically (muted) during playback; thumbnail shows first frame in the slide panel

### Playback Timers & Controls
- [ ] Background Fill: bar shrinks from right to left over the slide duration
- [ ] Shrinking Ball: ball scales down to nothing at the end of the slide
- [ ] Countdown overlay: with `countdownSeconds` set, numeric countdown appears in the final N seconds
- [ ] Loop: playback wraps back to slide 0 after the last slide
- [ ] Spacebar plays and stops; spacebar is ignored when an input or textarea is focused

### Internal Clock Metronome
- [ ] At BPM 120, internal timing: hear 880 Hz accent on beat 1 and 440 Hz on beats 2–4
- [ ] Upload a custom accent sound in DeckSettings → custom sound plays on beat 1
- [ ] Upload a custom beat sound → custom sound plays on beats 2–4
- [ ] Click Reset on each sound → built-in sine tones return

### Drag-to-Reorder Slides
- [ ] Drag a slide to a new position in SlidePanel → order updates visually and persists after reload

---

## Open questions / decisions to make

- [x] ~~Which Ableton Link npm package — confirm `abletonlink` builds on current Node/macOS, fallback plan if not.~~ **Decision:** `abletonlink@0.2.0-beta.0` works on Node 25 / macOS arm64. Yellow flag: `libc++abi: terminating` on process exit, harmless during operation. Opt-out via `JAM_DECK_LINK=0` if it ever causes trouble.
- [ ] Thumbnail generation: client-side `canvas.toDataURL` (simple, ships pixels over WS) vs. server-side render (cleaner, needs headless canvas).
- [ ] Per-canvas drawing engine: roll our own object model (lighter, fits TDD) vs. embed Fabric.js / Excalidraw (faster, harder to test).
- [ ] State management on client: plain React + context vs. Zustand. Default to plain unless we feel pain.
- [ ] ngrok: built-in vs. external — affects offline-only use.

Each decision will be made when we get to that phase, recorded here, and rationale noted.

---

## Working log

> Append-only notes as we execute. Date entries.

- _2026-05-04_ — Plan created from spec. TDD approach defined. Awaiting kickoff on Phase 0.
- _2026-05-07_ — Phase 2 polish pass: visual style + slide thumbnails. Added `client/src/styles.css` (CSS custom properties for colors/spacing, full layout for top-bar + 3-panel grid, styled buttons / inputs / panels / canvas toolbar / image slide editor / deck settings, `visually-hidden` utility for screen-reader-only labels). Extracted per-kind drawers from `CanvasEditor` into a shared `utils/canvasRender.js` so the new `SlideThumbnail` component can paint the same shapes scaled into a 112×84 thumb (uniform scale preserves aspect ratio). Image slides display via `<img>`; unset image slides show a placeholder. 4 new tests; 236 total. Drag-to-reorder still deferred — own pass.
- _2026-05-07_ — WebSocket live-sync layer landed TDD-style. Server broadcasts `deck:created` / `deck:update` / `deck:deleted` after every successful mutation; clients subscribe via a `useWebSocket` hook and refresh state on relevant messages. Round-trip verified end-to-end with a real `ws` client + supertest mutation in the same test process. 17 new tests; 232 total (97 server + 135 client). Decisions captured: (1) WS path pinned to `/ws` so non-WS upgrade attempts are rejected; (2) sender filtering deferred — peers refresh idempotently from REST after a broadcast, so self-broadcasts are no-ops; (3) reconnect uses exponential backoff (1s→30s); (4) handler updates don't tear the socket down (handler stashed in a ref).
- _2026-05-09_ — Phase 6 (Polish) landed. Drag-to-reorder slides via HTML5 drag/drop on top of a pure `reorderIds()` helper. Video slide type end-to-end (media MIME, VideoSlideEditor, playback render, thumbnail, "+ Add Video"). Fullscreen / second-window playback: `useAppSettings` persists to localStorage, `AppSettingsModal` exposes the toggle, ⛶ Fullscreen button in TopBar branches between `requestFullscreen()` and `window.open('/?playback=1')`. New `PlaybackWindow` boot mode (output-only) routed by a `getBootMode()` util alongside the existing host/mobile modes. Light/dark/auto theme via `data-theme` + CSS custom properties + `prefers-color-scheme` media query. README rewritten with features, env vars, URL modes. 30 new tests; 488 total (199 server + 289 client). All six phases complete pending manual smoke (DAW + phone-on-network).
- _2026-05-09_ — Phase 5 (Mobile & Sharing) landed in one pass. Server side: `getActiveSlideId()` on the playback controller, deck router rejects edits/deletes on the playing slide (and deletion of the playing deck) with 409. `share.js` controller wraps an injectable `tunnelFactory` (production uses `@ngrok/ngrok`'s `forward()` lazy-loaded inside `start()`); REST at `/api/share` (GET/start/stop). Two-client conflict test pins the existing last-write-wins behavior of the per-deck queue. Client side: `utils/mobile.js` (URL param + UA), `MobileApp` (deck picker → vertical slide list with 🔒/✏), `MobileSlideEditor` (simplified, single-shot Send for duration + image swap; canvas drawing on a phone deferred), `useShare` hook + `ShareModal` (qrcode-drawn canvas + URL with `?mobile=1` appended). `main.jsx` picks `MobileApp` vs `App` based on `isMobileMode()`. CSS for share modal + mobile UI added. 50 new tests; 458 total (198 server + 260 client). Phase 5 functional; manual phone-on-real-network test still recommended.
- _2026-05-09_ — Phase 4 wrap: uploadable metronome samples landed, closing out Phase 4. `media.js` extended with audio MIME types (wav/mp3/ogg/m4a/etc.); `createTonePlayer` gained a `setSamples({accent, beat})` API that fetches + decodes once and caches the AudioBuffer, with graceful fallback to the built-in sine tone whenever a sample is missing or still loading. App pushes the loaded deck's `metronomeSounds` into the player on every settings change; `DeckSettings` shows per-kind upload + reset rows posting to `/api/media`. 9 new tests; 408 total (174 server + 234 client). Phase 4 effectively complete — manual DAW round-trip is the only remaining "real" verification.
- _2026-05-09_ — Phase 4 transport sharing (play/stop via Link) landed. Bridge gained `setIsPlaying` / `getIsPlaying` and a `playState` event that fires only for external transitions (self-originating changes get pre-claimed in `_lastSeenIsPlaying` to suppress the echo). Playback controller flips Link transport on user-initiated start/stop in Link mode, and reacts to external playState events: Play re-arms `lastDeckId` (idempotent while already playing); Stop tears down playback. Round-tripped via a fake bridge that synchronously fires events but awaits async listeners so the test can `await emit()` and assert state. 14 new tests; 398 total (173 server + 225 client). Live smoke: server still boots clean with `Ableton Link enabled (tempo=120)`. Phase 4 nearly closed — only uploadable metronome sounds remain.
- _2026-05-09_ — Phase 4 Ableton Link bridge landed. `server/src/link.js` wraps `abletonlink@0.2.0-beta.0` (lazy-loaded inside `enable()` so unit tests don't touch the native addon — they inject a mock constructor instead). Bridge polls via `startUpdate(100ms, cb)`, re-emits `tempo` / `peers`, and computes `msUntilNextBar()` for quantized starts. Playback controller picks up the bridge: bars-mode in Link timing now resolves duration from live tempo, subscribes to tempo changes for in-flight rescheduling (bars preserved across BPM flips), and quantized-starts via a transient `'pending'` state. Server re-broadcasts `link:tempo` / `link:peers` over WS; `playback:start` carries `linkBpm`; client `usePlayback` records the live tempo and `PlaybackView` splices it into settings so progress + countdown work for Link bars-mode. Shared `slideDurationMs` (server + client) accepts `settings.linkBpm`. 35 new tests (17 link bridge + 7 playback Link + 3 server broadcast + 5 usePlayback + 3 timing). 384 total (159 server + 225 client). Live smoke: server boots with `Ableton Link enabled (tempo=120)`. Remaining for Phase 4: transport sharing (play/stop via Link) and uploadable metronome sounds.
- _2026-05-09_ — Phase 4 metronome landed (commit B of Phase 4). Built-in 880Hz/440Hz sine clicks via a tiny `createTonePlayer` Web Audio adapter; `useMetronome` hook schedules beats from `startedAt + bpm` so every connected client stays in sync without a beat-tick broadcast. Catches up correctly when joining mid-playback. Audio context stays lazy until first beat (autoplay policy). 13 new tests; 349 total (131 server + 218 client). Per-deck mute toggle and uploadable accent/beat sounds deferred. Next on Phase 4: Ableton Link bridge + quantized start.
- _2026-05-09_ — Phase 4 commit A: bars-mode auto-advance under internal-clock timing. Shared `timing.slideDurationMs(slide, settings)` mirrored on server + client; server playback now schedules bars-mode advances when `timingMode==='internal'` (e.g., 4 bars at 120 BPM = 8s). Link mode still null on the server side until the bridge lands. 22 new tests; 331 total.
- _2026-05-08_ — Phase 3 done in three commits (server / render / controls). Server playback is single-tenant and snapshots the deck at start to keep advance() free of async I/O — the unit tests drive `vi.fakeTimers + advanceTimersByTimeAsync` over the whole timeline. Client renders the playing deck in the main panel (replacing SlideEditor), with the timer style picked from `deck.settings.timerStyle`, the countdown threshold from `countdownSeconds`, and the slide strip toggled by `showSlideStrip`. Top bar grew Play/Stop and Loop, with a global spacebar shortcut that defers to inputs/textareas. Total: 309 tests (118 server + 191 client). Bars-mode timing waits for Phase 4.
- _2026-05-06_ — Phase 2 image slides landed TDD-style. Server: `media.js` store + `/api/media` route (multer 2.x, sha-256 hash dedupe, MIME/size validation, 415/413 on rejection) + static `/media/*` serving. Client: `ImageSlideEditor` (file picker, FormData upload, `<img>` display, Replace control), wired into `SlideEditor`'s type dispatch. `SlidePanel` got an "+ Add Image" button; App routes through `addSlide({ type: 'image' })`. 18 new tests; 212 total (86 server + 126 client). Live smoke test deferred to next session — committing on tests-green alone since work was done remote-via-iPhone. Decision: dedicated "Add Image" button vs auto-converting on upload — chose the button for explicit type intent.
- _2026-05-06_ — Phase 2 shape palette completed: circle (drag-from-center), line, arrow (line + arrowhead), triangle (bbox-inscribed isoceles), text (prompt-based input). Pulled bounding-box and endpoint drag into shared tool factories so adding shape tools is now mostly registering a kind. Smoke-tested live: drew rect/circle/line/arrow/triangle/text on one slide, persisted, reloaded — identical 5071-pixel readback. 22 new tests; 191 total (73 server + 118 client). Phase 2 canvas slides effectively done — next: image slide upload.
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
