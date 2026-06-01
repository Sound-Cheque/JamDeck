# JamDeck

Local web app for designing and running improvisational exercises for group music sessions. Slide-deck style: each slide has instructions, drawings, image, or video with configurable timing. Musicians follow along on a projected display; phones in the room can edit the deck in real time.

See [Plan/JAM_DECK_SPEC.md](Plan/JAM_DECK_SPEC.md) for the full specification and [Plan/BUILD_PLAN.md](Plan/BUILD_PLAN.md) for the living build plan.

## Features

- **Three timing modes** per deck — Ableton Link (DAW-synced), Internal Clock (built-in metronome with uploadable click sounds), or Duration Only (seconds).
- **Bar-based slide durations** under Link or Internal modes. Tempo changes mid-slide reschedule the remaining time. Quantized start aligns playback to the next bar boundary.
- **Transport sharing via Link** — pressing Play in Jam Deck plays the DAW (and vice versa) when connected to a Link session. Self-echoes are suppressed.
- **Slide types** — freehand canvas with shape tools (brush, rect, circle, line, arrow, triangle, text), images, and video.
- **Live multi-client sync** — every connected browser stays in sync over WebSockets. Changes from any client land on disk and propagate to all peers.
- **Drag-to-reorder** slides in the editor.
- **Mobile edit view** — phones get a vertical slide list with thumbnails and a simplified per-slide editor (duration + image swap; on-canvas drawing on a phone is on the roadmap). The currently-playing slide is locked. Tap the 📱 Share button to start an ngrok tunnel and show a QR code.
- **Fullscreen / second-window playback** — projector-friendly. Choose between the browser Fullscreen API on the current window or a popped-out output window in App settings.
- **Light / dark / auto theme**.

## Layout

```
.
├── server/    Node + Express 5 + ws backend
├── client/    Vite + React 18 frontend
├── data/      Runtime storage (JSON decks, uploaded media) — gitignored
└── Plan/      Spec and build plan
```

Workspaces are managed by npm; one `npm install` at the root pulls deps for both.

## Run

```sh
npm install
npm run dev      # server on :4000, client on :5173 (Vite proxies /api and /api/ws)
```

Open <http://localhost:5173>.

### Optional environment

- `JAM_DECK_DATA_DIR` — override the on-disk data directory. Defaults to `./data` at the project root.
- `JAM_DECK_LINK=0` — skip the Ableton Link native addon at boot. Useful for CI or when debugging Link issues.
- `NGROK_AUTHTOKEN` — required for the 📱 Share button (phones-on-other-networks). The host stays usable without it; the share modal will surface the auth error if you click Start without a token.

### Modes (URL-driven)

- `/` — host UI (3-panel editor + playback)
- `/?mobile=1` — mobile UI (vertical slide list, simplified editor). Auto-detected on phone user-agents; `?mobile=0` forces desktop UI.
- `/?playback=1` — output-only window. Auto-opened by the host's Fullscreen button when "second window" mode is selected.

## Test

```sh
npm test         # runs both suites (server with vitest+supertest, client with vitest+RTL+jsdom)
npm run test:watch
```

Currently 488 tests across the two workspaces.

Test stack: [Vitest](https://vitest.dev) on both sides; [supertest](https://github.com/ladjs/supertest) for HTTP, [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/) for components, jsdom environment.

## Development approach

Test-driven. Every server module, hook, and pure utility lands with its tests. UI components are tested for behavior; visual layout iterates in the browser. See `Plan/BUILD_PLAN.md` for the full TDD policy and the per-phase change log.

## Native modules

Two optional native deps:

- **`abletonlink`** — for Ableton Link integration. Lazy-loaded inside the bridge's `enable()`, so the rest of the server still works if the addon doesn't build.
- **`@ngrok/ngrok`** — for the share tunnel. Lazy-loaded inside `share.start()`; the host UI works without it, the Share button just errors if you click Start.

## Node version

Built against Node 25.9.0 / npm 11. There's a `.nvmrc` at the project root — `nvm use` switches to the right version.

If `node --version` doesn't match: nvm is sourced from `~/.zshrc`, which only runs in interactive shells. For non-interactive contexts (scripts, agents, CI), pin the version into PATH from `~/.zshenv` instead, e.g.:

```sh
export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH"
```
