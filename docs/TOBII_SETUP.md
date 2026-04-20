# Tobii Eye Tracker Setup

Tobii integration is **optional**. The browser demo works without it,
using mouse position as a simulated gaze source.

## Requirements

- **Windows only** — `TobiiStream.exe` is a Windows binary. On other
  platforms, the Tobii adapter is skipped automatically.
- **TobiiStream.exe** — not checked into git (proprietary). Place the
  full TobiiStream bundle (exe + DLLs) in `tools/TobiiStream/`. This
  directory is git-ignored.
- **Tobii eye tracker hardware** — this project is currently developed
  and tested with the **Tobii Eye Tracker 4C**. Other Tobii models that
  work with TobiiStream may function but are untested.
- **pyzmq** — Python ZMQ bindings for the backend adapter.

## Installation

### 1. Place TobiiStream

Copy the full TobiiStream bundle into the repository:

```
tools/TobiiStream/
├── TobiiStream.exe
├── TobiiStream.exe.config
├── Tobii.EyeX.Client.dll
├── Tobii.Interaction.Model.dll
├── Tobii.Interaction.Net.dll
├── ZeroMQ.dll
├── amd64/
│   ├── libsodium.dll
│   └── libzmq.dll
└── i386/
    ├── libsodium.dll
    └── libzmq.dll
```

This directory is git-ignored. Each developer must copy it locally.

### 2. Install pyzmq

From the backend directory, install the Tobii extra:

```bash
cd backend
pip install -e ".[tobii]"
```

This installs `pyzmq>=26`. If you skip this step and enable Tobii, the
backend will log a warning and continue without gaze data.

### 3. Configure Environment

Add the following to `backend/.env`:

```dotenv
TOBII_ENABLED=true
TOBIISTREAM_PATH=tools/TobiiStream/TobiiStream.exe
TOBII_ZMQ_ENDPOINT=tcp://127.0.0.1:5556
```

| Variable             | Default                   | Description                                      |
| -------------------- | ------------------------- | ------------------------------------------------ |
| `TOBII_ENABLED`      | `false`                   | Enable the Tobii ZMQ adapter                     |
| `TOBIISTREAM_PATH`   | (empty)                   | Path to `TobiiStream.exe` (absolute or relative) |
| `TOBII_ZMQ_ENDPOINT` | `tcp://127.0.0.1:5556`    | ZMQ endpoint TobiiStream publishes to            |

### Where `.env` Is Loaded

The backend reads `.env` from its own working directory. When you run
`uvicorn` from `backend/`, the file is `backend/.env`. When Electron
spawns the backend, it also sets `cwd` to `backend/`.

The relevant setting in `backend/app/settings.py`:

```python
model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
```

## How It Works

1. **TobiiStream.exe** connects to the Tobii hardware and publishes
   normalized gaze coordinates via ZMQ (`PUB` socket).
2. The **backend Tobii adapter** (`backend/app/adapters/tobii.py`) runs a
   daemon thread that subscribes to the ZMQ endpoint. It parses messages
   in the format `"TobiiStream <seq> <x> <y>"`, normalizes coordinates to
   `[0, 1]`, and stores them in an in-memory `GazeStore`.
3. The **frontend** connects via WebSocket (`/api/gaze/stream`) through
   `BackendGazeProvider`. The backend pushes the latest sample whenever
   the store changes, providing lower latency than the previous HTTP
   polling. If the WebSocket fails, the provider falls back to polling
   `GET /api/gaze/latest` (~30 Hz) and retries the WebSocket
   periodically.
4. Gaze data flows into `IntersectionEngine` → `GazeAwarenessMachine` →
   avatar behavior, the same pipeline as mouse-based demo gaze.

### In Electron

Who starts `TobiiStream.exe` depends on the run mode:

- **Electron dev / desktop:** Electron can spawn it as a child process
  if `TOBIISTREAM_PATH` is set in the Electron environment. It tracks
  the process for cleanup on quit.
- **Packaged release:** The backend process reads `.env` (next to the
  exe) and starts TobiiStream itself when `TOBII_ENABLED=true` and
  `TOBIISTREAM_PATH` is set.

In both cases, if the path is not set or the binary is missing, the
system logs a message and continues without Tobii.

## Typical Failure Modes

### TobiiStream.exe not found

```
[tobii] TobiiStream not found at "C:\...\TobiiStream.exe" — skipping.
```

**Fix:** Verify that `tools/TobiiStream/TobiiStream.exe` exists and
`TOBIISTREAM_PATH` in `backend/.env` points to it.

### pyzmq not installed

```
[tobii] pyzmq not available — Tobii adapter disabled.
```

**Fix:** Run `pip install -e ".[tobii]"` in the backend directory.

### No gaze data arriving

- Verify the Tobii hardware is connected and recognized by TobiiStream.
- Verify `TOBII_ZMQ_ENDPOINT` matches the endpoint TobiiStream is
  configured to use (default: `tcp://127.0.0.1:5556`).
- Check backend logs for ZMQ connection errors.
- Poll `GET /api/gaze/latest` manually — if it returns
  `{ "valid": false }`, either no data is arriving or data is too stale.

### Non-Windows platform

```
[tobii] TobiiStream is Windows-only — skipping.
```

This is expected. Tobii is only supported on Windows.

## Data Paths: Live Interaction vs Research Logging

Tobii gaze data flows through two independent paths:

### Live interaction path
- The backend stores the latest Tobii sample in `GazeStore` (in-memory).
- `BackendGazeProvider` connects via WebSocket (`/api/gaze/stream`).
  The backend pushes the latest sample whenever the store changes —
  a denser, lower-latency live stream than the previous ~30 Hz HTTP
  polling. If the WebSocket connection fails or drops, the provider
  falls back to `GET /api/gaze/latest` HTTP polling and periodically
  retries the WebSocket connection.
- This drives avatar gaze behavior in real time.
- Active in both default and research mode whenever Tobii is enabled.

### Research raw stream (research mode only)
- When `LOG_MODE=research`, the backend Tobii adapter also logs every
  ZMQ sample as a `gaze.tobii_raw` event at the hardware rate (~90 Hz).
- These events include screen-normalised and raw pixel coordinates plus
  the TobiiStream sequence number.
- The frontend syncs the current session context (session ID, step,
  condition) to the backend via `POST /api/gaze/context` when
  conversation steps start and end. The Tobii thread reads this context
  to tag raw samples with study context. Between conversation steps,
  no raw samples are logged.

### Frontend gaze sample stream (research mode only)
- Independently, the frontend emits `gaze.sample` events at a
  configurable rate (`RESEARCH_GAZE_SAMPLE_HZ`, default 90 Hz).
- These are viewer-container-relative coordinates and work for both
  mouse and backend (Tobii) gaze sources.
- `RESEARCH_GAZE_SAMPLE_HZ` controls the frontend sample rate only; it
  does not affect the backend-side Tobii raw stream rate.

Both streams can coexist in the same session log and serve different
analysis needs. See [DATA_FORMATS.md](DATA_FORMATS.md) for full event
schemas.

## Without Tobii

When Tobii is disabled or unavailable:

- The frontend falls back to `MouseProvider` — mouse position on the
  3D viewer acts as the gaze source.
- `GET /api/gaze/latest` returns `null` or `{ "valid": false }`.
- The study flow, FSM, and avatar behavior work identically; only the
  gaze input source changes.
- No error is shown to the user.
