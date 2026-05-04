# Jam Deck

Local web app for designing and running improvisational exercises and structures for group music sessions. Slide-deck style: each slide has instructions / drawings / media with configurable timing. Musicians follow along on a projected display; mobile users can edit the deck in real time.

See [Plan/JAM_DECK_SPEC.md](Plan/JAM_DECK_SPEC.md) for the full specification and [Plan/BUILD_PLAN.md](Plan/BUILD_PLAN.md) for the living build plan.

## Layout

```
.
├── server/    Node + Express + ws backend
├── client/    Vite + React frontend
├── data/      Runtime storage (JSON decks, uploaded media) — gitignored
└── Plan/      Spec and build plan
```

Workspaces are managed by npm; one `npm install` at the root pulls deps for both.

## Run

```sh
npm install
npm run dev      # server on :4000, client on :5173 (proxies /api and /ws)
```

Open http://localhost:5173.

## Test

```sh
npm test         # runs server + client suites
npm run test:watch
```

Test stack: [Vitest](https://vitest.dev) on both sides; [supertest](https://github.com/ladjs/supertest) for HTTP, [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/) for components, jsdom environment.

## Development approach

Test-driven. Every server module, hook, and pure utility lands with its tests. UI components are tested for behavior; visual layout iterates in the browser. See `Plan/BUILD_PLAN.md` for the full TDD policy.

## Node version

Built against Node 25.9.0 / npm 11. There's a `.nvmrc` at the project root — `nvm use` switches to the right version.

If `node --version` doesn't match: nvm is sourced from `~/.zshrc`, which only runs in interactive shells. For non-interactive contexts (scripts, agents, CI), pin the version into PATH from `~/.zshenv` instead, e.g.:

```sh
export PATH="$HOME/.nvm/versions/node/v25.9.0/bin:$PATH"
```
