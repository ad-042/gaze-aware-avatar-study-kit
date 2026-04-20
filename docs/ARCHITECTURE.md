# Architecture

## System Overview

Gaze-Aware Avatar Study Kit is a three-tier application for configurable avatar-based studies
with optional eye tracking and optional voice interaction.

```
┌─────────────────────────────────────────────────────┐
│  Electron Shell (electron/)                         │
│  - spawns backend process                           │
│  - optionally spawns TobiiStream.exe                │
│  - opens BrowserWindow → frontend                   │
│  - kills only own child processes on quit           │
└──────────────┬──────────────────────────┬───────────┘
               │ child process            │ loads URL
               ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────┐
│  Backend (backend/)  │   │  Frontend (frontend/)    │
│  FastAPI + uvicorn   │   │  TypeScript + Three.js   │
│  127.0.0.1:8000      │◄──│  Vite dev: localhost:5173 │
│                      │   │  Proxy: /api → backend    │
└──────────────────────┘   └──────────────────────────┘
```

The project supports six practical modes:
- **public browser demo** (`?demo`) — frontend only, static config, no backend
- **full local mode** — frontend + backend, optional logging and Realtime
- **desktop dev mode** — Electron + backend + Vite dev server
- **desktop prod mode** — Electron + backend, built frontend from disk (no Vite)
- **lab / kiosk mode** — like desktop prod but fullscreen, no chrome, for controlled study sessions
- **packaged release** — self-contained Windows build, no dev tools needed (see below)

## Frontend

The frontend is a TypeScript application rendered in the browser. It uses
Three.js and `@pixiv/three-vrm` for 3D avatar rendering. It contains no
secrets, no direct OpenAI Bearer-key calls, and no server-rendered study
pages.

### Key modules

| Module | Responsibility |
| ------ | -------------- |
| `study/` | study-flow orchestration and step rendering |
| `viewer/` | `ViewerCore`, `AvatarLoader`, `IdleMotionController`, `MutualGazeTracker`; `chatvrm/` contains the ChatVRM-derived behaviour runtime — `ChatVrmAvatarRuntime` owns auto-blink, expression/emote, and lip sync; `VRMLookAtSmoother` drives smooth lookAt tracking with per-state saccade profiles and head/eye blending; the `VRMAnimation` pipeline drives VRMA-based idle body animation |
| `gaze/` | `GazeAwarenessMachine`, `IntersectionEngine`, gaze providers |
| `realtime/` | `RealtimeClient` — browser WebRTC setup via backend relay |
| `telemetry/` | `BackendReporter` — batched event logging (disabled in demo mode) |

## Backend

The backend is a FastAPI application with an API-only architecture.

### Key layers

| Layer | Responsibility |
| ----- | -------------- |
| `routes/` | HTTP endpoints (`health`, `runtime`, `study`, `logs`, `gaze`, `realtime`, `sessions`) |
| `services/` | study loading, logging, gaze store, assignment generation, realtime relay |
| `adapters/` | optional Tobii ZMQ subscriber |
| `schemas/` | Pydantic validation models |
| `settings.py` | configuration via pydantic-settings and `backend/.env` (includes `LOG_MODE`) |

The backend owns:
- validation
- persistence
- logging
- policy checks
- OpenAI key handling

## Electron

Electron is a desktop shell and process manager.

It:
- spawns the Python backend
- can optionally spawn `TobiiStream.exe` (in dev/desktop mode; in
  packaged releases the backend starts TobiiStream itself)
- waits for backend health before showing the window
- never kills unrelated system-wide processes
- uses:
  - `nodeIntegration: false`
  - `contextIsolation: true`

Electron supports three modes:
- **dev** (`npm run dev` / `--dev` flag): loads the Vite dev server URL
- **desktop prod** (`npm run start`): loads built frontend from
  `frontend/dist/index.html` via `loadFile()`; the frontend detects the
  `file://` protocol and routes API calls to `http://127.0.0.1:8000`
  directly (backend CORS allows this)
- **lab / kiosk** (`npm run lab` / `--kiosk` flag): same as desktop prod
  but window opens in kiosk mode (fullscreen, no chrome); DevTools
  shortcuts are suppressed; `Ctrl+Shift+Q` exits cleanly

Electron is optional; the browser demo does not require it.

### Packaged release mode

The packaged release (`scripts/build_release.ps1`) produces a
self-contained Windows directory via electron-builder + PyInstaller:

```
release/win-unpacked/
  gaze-aware-avatar-study-kit.exe                        ← Electron shell
  resources/
    app.asar                          ← compiled Electron main process
    backend/backend.exe (+_internal/) ← PyInstaller backend bundle
    frontend/dist/                    ← built frontend (vite build output)
    study/demo-study/                 ← study configuration files
```

**Path contracts:**

- The backend binds to `127.0.0.1:8000` (forced by Electron via
  `APP_HOST`/`APP_PORT` env vars). This matches the frontend's
  `file://` → `http://127.0.0.1:8000` detection in `apiBase.ts`.
- Writable runtime data (logs, session files) goes to Electron's
  `app.getPath("userData")` directory (typically `%APPDATA%/gaze-aware-avatar-study-kit/`
  on Windows). Electron passes `DATA_DIR` and `LOG_DIR` env vars
  pointing there.
- Study files are read from `resources/study/` (read-only). Electron
  passes `STUDY_DIR` pointing there.
- An optional `.env` file placed next to `gaze-aware-avatar-study-kit.exe` is loaded
  by the backend (CWD is set to the app root directory). This
  makes configuration easy to find for lab operators.
- The backend console window is hidden (`windowsHide: true`);
  stdout/stderr are captured via pipes.

## Study configuration

All study content lives under `study/<study-id>/`.

| File | Purpose |
| ---- | ------- |
| `study.json` | metadata, study id, conditions, question count |
| `flow.json` | ordered step sequence |
| `avatars.json` | avatars, labels, model files, voice ids |
| `questionnaires.json` | questionnaire definitions |
| `prompts.json` | voice / quiz prompt configuration |
| `gaze_profiles.json` | timing parameters for gaze state logic |

In **full local mode**, the backend validates and serves this config via:
- `GET /api/studies/{study_id}`

In **public browser demo mode**, the frontend loads:
- `frontend/public/demo-config.json`

This static file is a **snapshot** of the default study, not the primary
source of truth.

## Data flows

### 1. Full local study config loading

```
Frontend                    Backend                 Filesystem
   │                          │                        │
   │ GET /api/runtime         │                        │
   │─────────────────────────►│                        │
   │  { capabilities }        │                        │
   │◄─────────────────────────│                        │
   │                          │                        │
   │ GET /api/studies/demo    │                        │
   │─────────────────────────►│  reads study/*.json    │
   │                          │───────────────────────►│
   │                          │  validated config      │
   │  merged study config     │◄───────────────────────│
   │◄─────────────────────────│                        │
```

### 2. Public browser demo config loading

```
Frontend
   │
   │ fetch /demo-config.json
   ▼
Static merged StudyConfig
   │
   ▼
StudyFlow starts in demo mode
```

In demo mode:
- no backend runtime call
- no session registration
- no telemetry write path
- Realtime disabled
- Tobii disabled

### 3. Mouse gaze path

```
Browser mouse events
   │
   ▼
MouseProvider → normalized (x, y)
   │
   ▼
IntersectionEngine
   │
   ▼
GazeAwarenessMachine
   │
   ▼
VRMLookAtSmoother → per-state saccade profile + smooth damping + head blend
   │
   ▼
ViewerCore render loop
```

### 4. Optional Tobii gaze path

```
TobiiStream.exe ──ZMQ──► backend Tobii adapter
                              │
                              ▼
                         GazeStore (in-memory)
                              │
              ┌───────────────┴───────────────┐
              │  WS /api/gaze/stream (push)   │  ← primary
              │  GET /api/gaze/latest (poll)   │  ← fallback
              └───────────────┬───────────────┘
                              ▼
                   BackendGazeProvider
                              │
                              ▼
IntersectionEngine → GazeAwarenessMachine → VRMLookAtSmoother
```

`BackendGazeProvider` connects via WebSocket first. The backend pushes
the latest gaze sample whenever the store changes — a denser,
lower-latency live stream than HTTP polling (~30 Hz). If the
WebSocket connection fails or drops, the provider falls back to HTTP
polling and periodically retries the WebSocket.

### 5. Optional Realtime voice path

```
Frontend                      Backend                   OpenAI
   │                             │                        │
   │ getUserMedia(audio)         │                        │
   │ RTCPeerConnection           │                        │
   │ createOffer (SDP)           │                        │
   │                             │                        │
   │ POST /api/realtime/session  │                        │
   │ { sdp_offer, session_id }   │                        │
   │────────────────────────────►│                        │
   │                             │ POST /v1/realtime/calls
   │                             │ multipart/form-data:   │
   │                             │ - sdp                  │
   │                             │ - session              │
   │                             │───────────────────────►│
   │                             │   SDP answer (text)    │
   │                             │◄───────────────────────│
   │  { sdp_answer, model, voice }                        │
   │◄────────────────────────────│                        │
   │                             │                        │
   │ setRemoteDescription        │                        │
   │                             │                        │
   │◄═══════════ WebRTC audio ═══════════════════════════►│
```

### Important boundary

The backend only controls:
- the API key
- the initial session configuration
- the SDP relay

After WebRTC is established, media flows directly between the browser and
OpenAI. Ongoing server-side control of later client-side Realtime events
is **not** part of the current architecture.

### 6. Telemetry / logging

```
Frontend modules            Backend                   Filesystem
   │                          │                         │
   │ batched events           │                         │
   │ POST /api/log/events     │                         │
   │─────────────────────────►│  LoggingService         │
   │                          │  append JSONL           │
   │                          │────────────────────────►│
   │                          │  data/logs/{sid}.jsonl  │
```

The backend supports two logging modes (`LOG_MODE=default|research`).
The active mode is included in the `/api/runtime` response and recorded
as a `session.started` marker at the start of each log file. See
[DATA_FORMATS.md](DATA_FORMATS.md) for details.

In **research mode**, additional streams are active:
- `gaze.sample` — frontend viewer-relative gaze coordinates at
  configurable rate (`RESEARCH_GAZE_SAMPLE_HZ`, default 90 Hz)
- `gaze.tobii_raw` — backend-side high-rate Tobii raw coordinates
  (~90 Hz, logged near the ZMQ source)
- `conversation.turn` — textual transcripts (no audio)
- `conversation.speaking_changed` — user/assistant speaking states
- `gaze.avatar_eye_contact_changed` / `gaze.mutual_gaze_changed` —
  avatar and mutual gaze transitions
- `study.assignment_recorded`, `study.form_submitted`,
  `study.questionnaire_submitted` — study outcome data

The frontend syncs the current session context (step, condition) to the
backend via `POST /api/gaze/context` so that backend-side Tobii raw
samples can be tagged with study context.

Each event is one JSON line with mandatory fields:
- `schema_version`
- `timestamp`
- `session_id`
- `event_type`

## Module boundaries

### StudyFlow
`StudyFlow` is still the main orchestration entry point after bootstrap.
It should coordinate step switching and lifecycle, not become the owner of
low-level rendering, protocol, or persistence logic.

### ViewerCore
Owns the Three.js scene, renderer, camera, render loop, avatar attachment,
and viewer lifecycle.

### AvatarLoader
Loads VRM models and releases them cleanly.

### IdleMotionController
Applies a relaxed arm rest pose to VRM avatars whose default pose is
T-pose or A-pose. Detects the correct arm-lowering rotation per model
and replays it each frame after `vrm.update()`. This is the only
remaining function of this controller; body idle motion (breathing,
weight shift, sway) is handled by `idle_loop.vrma` via the
`AnimationMixer` in `AvatarLoader`. Viewer concern, not study-flow.

### ChatVrmAvatarRuntime (chatvrm/)
Central behaviour owner for blink, expression/emote, and lip sync.
Coordinates the ported ChatVRM controllers (`AutoBlink`,
`ExpressionController`, `EmoteController`, `LipSync`) against the loaded
VRM instance. Applies a subtle default "relaxed" expression when idle.
Manages the `AudioContext` / analyser graph for WebRTC lip sync.
ViewerCore holds this runtime and calls `update(delta)` before
`vrm.update()` and `postUpdate()` after render.

### MutualGazeTracker
Derives avatar eye contact and mutual gaze state from the lookAt target
offset and user face intersection. Emits `gaze.avatar_eye_contact_changed`
and `gaze.mutual_gaze_changed` telemetry events in research mode.
Viewer/telemetry concern.

### GazeAwarenessMachine
Pure logic FSM for gaze state changes.

### VRMLookAtSmoother (chatvrm/)
ChatVRM-derived VRMLookAt extension that provides smooth damped
tracking, head rotation blending, and per-state saccade profiles.
Registered as a GLTFLoader plugin during avatar load, it replaces
the standard VRMLookAt with a version that distributes gaze rotation
between head and eyes for natural avatar presence.

`ConversationStepController` maps each FSM state to a `SaccadeProfile`
via `SACCADE_PROFILES` and calls `setProfile()` on state transitions.
Each profile controls saccade probability, offset range (yaw/pitch
min/max), smooth damping factor, and user-limit angle. Baseline
roams broadly, gazeaware focuses tightly, gaze break forces aversion.

### RealtimeClient
Owns:
- microphone access
- RTCPeerConnection
- SDP offer/answer exchange via backend
- remote audio playback
- idempotent cleanup

### LoggingService
Writes JSONL files to `data/logs/` and validates event schema.

### RealtimeService
Relays SDP offers to the OpenAI Realtime API using backend-owned secrets
and server-side session configuration.

### Tobii adapter
Optional daemon-style backend adapter that reads normalized gaze samples
from ZMQ and stores them in `GazeStore`.

