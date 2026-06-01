# Jam Deck — Project Specification

## Overview

Jam Deck is a local web application for designing and running improvisational exercises and structures for group music sessions. It functions like a presentation tool where each slide contains instructions, drawings, or media with configurable timing. Musicians follow along on a projected display while mobile users can edit the deck in real-time.

**Architecture:** Node.js backend + browser frontend. No Electron — runs as a local server, opens in any browser. Fullscreen/projector output via a second browser window.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Node.js Server                             │
│  ├── Express (static files, REST API)       │
│  ├── WebSocket (real-time sync)             │
│  ├── Ableton Link (native C++ addon)        │
│  ├── Internal Clock (metronome + tempo)     │
│  └── File storage (JSON decks, media)       │
└──────┬──────────────┬───────────────────────┘
       │              │
   WebSocket      ngrok tunnel
       │              │
┌──────┴──────┐  ┌────┴─────┐
│ Host Browser│  │ Mobile   │
│ (3-panel    │  │ Browsers │
│  editor +   │  │ (edit    │
│  playback)  │  │  view)   │
└─────────────┘  └──────────┘
```

### Tech Stack

- **Backend:** Node.js, Express, ws (WebSocket), node-abletonlink (or custom binding)
- **Frontend:** React (Vite), CSS modules or Tailwind
- **Storage:** Flat JSON files on disk (`./data/decks/`)
- **Media:** Local filesystem (`./data/media/`), served statically
- **Mobile access:** ngrok for tunnel, QR code generated from tunnel URL
- **Sync:** Ableton Link for DAW sync, internal clock as fallback

---

## Timing System

Three timing modes, selectable per-deck:

### 1. Ableton Link
- Connects to Link session on the local network
- Slide durations specified in **bars** (and/or beats)
- Duration derived from Link tempo **in real-time** — if tempo changes mid-slide, remaining time adjusts dynamically
- Playback starts quantized to the **next bar boundary**
- Transport state (play/stop) shared via Link

### 2. Internal Clock
- User sets a BPM in the deck settings
- Built-in metronome with user-uploadable click sounds (accent + beat)
- Slide durations in bars, derived from internal tempo
- No external sync

### 3. Duration Only
- Slide durations specified in seconds or minutes
- No tempo, no bars, no metronome
- Simplest mode — just timed slides

---

## Timer Display

Each deck has **global timer settings** configured in deck settings:

### Timer Styles (v1)
1. **Background Fill** — a solid color fills the slide background from left to right as time progresses
2. **Shrinking Ball** — a circle starts at full-screen size and shrinks to nothing as time elapses

### Countdown Overlay
- A numeric countdown overlays on top of the timer visualization
- Configurable: how many bars (Link/internal) or seconds (duration mode) before the slide transition
- Large, clearly visible numbers so musicians can see at a glance

---

## Slide Types

### 1. Canvas Slide
- **Freehand drawing** tool (brush size, color)
- **Tabbed shape palette:** basic shapes (rectangle, circle, line, arrow, triangle) that can be placed and resized on the canvas
- **Text tool** for adding text labels/instructions
- Independent duration per slide (bars or seconds depending on deck timing mode)

### 2. Media Slide
- **Image slides:** user uploads an image, specifies duration
- **Video slides:** user uploads a video, duration is the video length (or trimmed)
- Media slide shows a refined **progress bar at the bottom** of the video/image showing time remaining

---

## UI Layout — Host (Desktop Browser)

```
┌──────────────────────────────────────────────────────────┐
│ [Link] ◀▶ ■   [Loop]  [Fullscreen]         [QR] [⚙]    │  ← Top Bar
├────────┬──────────┬──────────────────────────────────────┤
│        │          │                                      │
│ Decks  │ Slides   │  Current Slide (large preview /      │
│ Panel  │ Panel    │  editor / playback)                  │
│        │          │                                      │
│ [+New] │ [⚙]     │                                      │
│        │ slide 1  │                                      │
│        │ slide 2  │                                      │
│ ★ Fav1 │ slide 3  │                                      │
│   Deck2│ slide 4  │                                      │
│   Deck3│          │                                      │
│        │          ├──────────────────────────────────────┤
│        │          │  Slide strip (horizontal thumbnails  │
│        │          │  of all slides — current highlighted, │
│        │          │  large enough to read at a glance)   │
└────────┴──────────┴──────────────────────────────────────┘
```

### Top Bar
- **Left:** Ableton Link toggle button (shows connected state)
- **Center:** Play ▶ / Stop ■ buttons (spacebar shortcut for play/stop)
- **Center-right:** Loop toggle button
- **Right:** Fullscreen button, QR code button, App Settings cog ⚙

### Left Panel — Deck List
- **[+ New]** button to create a new deck
- List of saved decks, sorted by name
- Star/favorite icon on each — favorited decks stick to top
- Click a deck to load it into the slide panel

### Middle Panel — Slide List
- **Deck settings cog ⚙** at top of panel (opens per-deck settings: timing mode, timer style, countdown, slide strip toggle)
- Vertical list of slide thumbnails for the currently loaded deck
- Click a slide to load it into the main editor
- Drag to reorder
- Add slide button (+ at bottom)
- Delete slide (x or swipe)

### Main Panel — Slide Editor / Playback
- Shows the currently selected slide large
- In edit mode: canvas tools, media upload, duration settings
- In playback mode: shows active slide with timer visualization
- Below the main view: **horizontal slide strip** showing all slides as thumbnails, current slide highlighted, upcoming slides visible. Must be large enough to glance at from a distance. Can be toggled off in deck settings.

### Settings Page (⚙ in top bar — App Settings)
- **Fullscreen mode:** toggle between "open in second window" or "fullscreen in current window"

### Deck Settings (⚙ cog at top of Slide List panel — Per-Deck)
Each deck has its own settings, accessed via a cog icon at the top of the middle (slide list) panel:
- **Timing mode:** Link / Internal Clock / Duration Only
- **Internal clock BPM** and metronome sound upload
- **Timer style:** Background Fill / Shrinking Ball
- **Countdown duration:** number of bars or seconds for the pre-transition countdown
- **Show slide strip:** toggle the horizontal slide preview strip during playback (default: on)

### QR Code Modal
- Click QR icon → modal shows QR code encoding the ngrok tunnel URL
- Also shows the URL as text for manual entry

---

## UI Layout — Mobile (Phone Browser via QR/ngrok)

```
┌──────────────────┐
│  Jam Deck         │
│  [deck name]      │
├──────────────────┤
│                  │
│  Slide 1    [✏]  │  ← toggle edit on/off
│  ┌────────────┐  │
│  │ thumbnail  │  │
│  └────────────┘  │
│                  │
│  Slide 2    [✏]  │
│  ┌────────────┐  │
│  └────────────┘  │
│                  │
│  [+ Add Slide]   │  ← inserts after current view
│                  │
│  Slide 3  🔒     │  ← currently playing, locked
│  ┌────────────┐  │
│  └────────────┘  │
│                  │
│  Slide 4    [✏]  │
│  ...             │
└──────────────────┘
```

- Vertical scrollable list of all slides
- Each slide shows a thumbnail and an **edit toggle** (pencil icon)
- The **currently playing slide** is locked (🔒) and cannot be edited
- All other slides (past and future) can be edited
- Tapping edit opens a simplified editor: canvas tools, duration change, media swap
- Editor has a **Send** button — edits are submitted as a complete slide state in one shot (not live/incremental)
- **[+ Add Slide]** button inserts a new slide after the one currently in view
- Swipe vertically to browse slides
- Mobile users can edit **duration/timing** as well as visual content

---

## Data Model

### Deck (JSON file: `./data/decks/{id}.json`)

```json
{
  "id": "uuid",
  "name": "Rhythm Exercise 1",
  "favorite": false,
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "settings": {
    "timingMode": "link" | "internal" | "duration",
    "internalBpm": 120,
    "metronomeSounds": {
      "accent": "path/to/accent.wav",
      "beat": "path/to/beat.wav"
    },
    "timerStyle": "backgroundFill" | "shrinkingBall",
    "countdownBars": 2,
    "countdownSeconds": 5,
    "loop": false,
    "showSlideStrip": true
  },
  "slides": [
    {
      "id": "uuid",
      "type": "canvas" | "image" | "video",
      "duration": {
        "unit": "bars" | "seconds",
        "value": 8
      },
      "content": {
        // For canvas: serialized drawing data
        "objects": [],
        "background": "#ffffff"
        // For image: { "src": "media/filename.jpg" }
        // For video: { "src": "media/filename.mp4" }
      }
    }
  ]
}
```

---

## Real-time Sync (WebSocket)

All connected clients (host + mobile) share state via WebSocket:

### Events
- `deck:update` — deck data changed (slide added, edited, reordered, deleted)
- `playback:start` — playback started (includes start time, current slide index)
- `playback:stop` — playback stopped
- `playback:slide` — current slide changed
- `link:status` — Link connection state changed
- `link:tempo` — tempo update from Link
- `client:join` / `client:leave` — mobile client connected/disconnected

All clients (host and mobile) are peers for editing. There is no authoritative host — any client can edit any slide except the currently playing one.

### Conflict Resolution
- Mobile editors have a **Send** button that submits the entire slide state in one shot (not incremental edits)
- If two clients submit changes to the same slide simultaneously, **last write wins** — the server applies them in arrival order and broadcasts the final state
- The server persists the deck to disk after each update
- Playback state (play/stop/current slide) is managed by the server and broadcast to all clients; any client can trigger play/stop

---

## File & Folder Structure

```
jam-deck/
├── server/
│   ├── index.js              # Express + WebSocket server
│   ├── link.js               # Ableton Link integration
│   ├── clock.js              # Internal clock + metronome
│   ├── decks.js              # Deck CRUD (JSON file ops)
│   └── media.js              # Media upload handling
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── TopBar.jsx
│   │   │   ├── DeckPanel.jsx
│   │   │   ├── SlidePanel.jsx
│   │   │   ├── SlideEditor.jsx
│   │   │   ├── SlideStrip.jsx
│   │   │   ├── PlaybackView.jsx
│   │   │   ├── TimerOverlay.jsx
│   │   │   ├── Canvas.jsx
│   │   │   ├── QRCodeModal.jsx
│   │   │   ├── SettingsPage.jsx
│   │   │   └── mobile/
│   │   │       ├── MobileApp.jsx
│   │   │       ├── MobileSlideList.jsx
│   │   │       └── MobileSlideEditor.jsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js
│   │   │   ├── usePlayback.js
│   │   │   └── useLink.js
│   │   └── utils/
│   │       ├── timing.js
│   │       └── storage.js
│   └── public/
├── data/
│   ├── decks/                 # JSON deck files
│   └── media/                 # Uploaded images, videos, sounds
├── package.json
└── README.md
```

---

## Build Order (Suggested Phases)

### Phase 1 — Core Shell
- Express server with static file serving
- React app with 3-panel layout (empty panels)
- WebSocket connection between client and server
- Deck CRUD: create, list, delete, favorite, persist as JSON
- Per-deck settings UI (cog at top of slide panel): timing mode, timer style, countdown, slide strip toggle

### Phase 2 — Slides & Canvas
- Slide list panel with add/delete/reorder
- Canvas slide editor (freehand drawing, shapes, text)
- Slide thumbnail generation
- Media slide type (image upload + display)

### Phase 3 — Playback & Timers
- Duration-based playback engine (seconds mode)
- Timer visualizations (background fill, shrinking ball)
- Countdown overlay
- Horizontal slide strip during playback
- Play/stop controls, spacebar shortcut, loop

### Phase 4 — Timing & Sync
- Internal clock with metronome
- Bar-based slide durations
- Ableton Link integration (native addon)
- Real-time tempo-responsive duration calculation
- Quantized playback start

### Phase 5 — Mobile & Sharing
- Mobile-responsive layout (detect via URL param or user-agent)
- Mobile slide list with edit toggles
- Mobile slide editor (simplified)
- Current-slide locking during playback
- ngrok integration + QR code generation

### Phase 6 — Polish
- Fullscreen / second-window output mode
- App settings page (fullscreen preference)
- Video slide support
- Drag-and-drop slide reordering
- Visual design pass
