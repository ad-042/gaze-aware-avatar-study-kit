# Troubleshooting

Common issues and their fixes for gaze-aware-avatar-study-kit.

## Browser demo mode

### How to use demo mode

Add `?demo` to the URL: `http://localhost:5173/?demo`

Demo mode runs entirely in the browser without a Python backend. Study
config is loaded from a static JSON file, telemetry is disabled, and
Realtime voice is cleanly unavailable.

**Note:** The demo uses `frontend/public/demo-config.json`, a generated
snapshot of `study/demo-study/`. If you edit the study config files,
regenerate it: `python scripts/build_demo_config.py`.

### Demo mode shows "Failed to load study"

**Cause:** The static config file `frontend/public/demo-config.json` is
missing or malformed.

**Fix:** Verify the file exists and is valid JSON. It is included in the
repository by default.

### Demo mode vs full local mode

| Feature             | Demo mode (`?demo`)  | Full local mode       |
| ------------------- | -------------------- | --------------------- |
| Backend required    | No                   | Yes                   |
| Study config source | Static JSON file     | Backend API           |
| Telemetry/logging   | Disabled             | Active (JSONL logs)   |
| Realtime voice      | Disabled             | Optional (needs key)  |
| Tobii eye tracking  | Disabled             | Optional (Windows)    |
| Session ID          | Local UUID           | Backend-registered    |
| Avatar + gaze FSM   | Works (mouse input)  | Works (mouse or Tobii)|

---

## Experimenter start screen

### What is the start screen?

In full local, desktop, and kiosk modes, an **Experiment Setup** screen
appears before the study flow begins. It shows:

- Study info (name, ID, version, conditions)
- Runtime status (environment, log mode, Realtime/Tobii capabilities)
- Data capture summary (what this session records and processes)
- Session metadata fields (participant ID, trial ID, session label,
  operator notes)

The experimenter reviews the setup, optionally adjusts the metadata,
and clicks **Start Study** to begin. The session is created only after
confirmation, so the metadata is included in the session log from the
start.

### Data capture summary

The start screen includes a **Data Capture** section showing which
data streams are active (transcripts, gaze samples, audio-to-OpenAI,
etc.). This is derived from the backend's `LOG_MODE` and capabilities.
In demo mode, it shows "Demo mode — no data is stored or sent
externally."

### Consent notice

The consent step now includes a small runtime-aware notice block below
the study-configured consent text. It shows human-readable disclosure
lines matching the active capabilities (e.g., "Voice audio is sent to
OpenAI for realtime processing."). In demo mode, it states that no
data is stored or sent externally.

### Demo mode and the start screen

In `?demo` mode, the start screen is shown with demo-appropriate
information (all capture flags off, "Demo mode" notice). The study
starts after clicking "Start Study".

### Participant ID

A pseudonymous ID (e.g., `P-20260323-a1b`) is auto-generated. The
experimenter can edit it before starting. This is a lab code, not a
real name.

### Operator notes not appearing in logs

Operator notes are only persisted when `LOG_MODE=research` is set in
`backend/.env`. In default mode, they are intentionally omitted from
the session log even if the experimenter enters them.

---

## Electron starts but frontend is not visible

**Symptom:** Electron window opens but shows a blank page or connection
error.

**Cause:** The Vite dev server is not running. In dev mode, Electron loads
`http://localhost:5173` by default.

**Fix:** Start the frontend dev server before launching Electron:

```bash
cd frontend
npm run dev
```

Then start Electron in a separate terminal:

```bash
cd electron
npm run dev
```

You can also set `FRONTEND_URL` to point to a different address if needed.

---

## Backend does not start

### Python not found or wrong version

**Symptom:** `uvicorn: command not found` or import errors.

**Fix:** Make sure you have Python 3.11+ and the venv is activated:

```bash
cd backend
python -m venv .venv

# Linux / macOS:
source .venv/bin/activate

# Windows PowerShell:
.venv\Scripts\Activate.ps1

pip install -e ".[dev]"
```

### Missing dependencies

**Symptom:** `ModuleNotFoundError` for `fastapi`, `pydantic`, etc.

**Fix:** Install backend dependencies:

```bash
cd backend
pip install -e ".[dev]"
```

### Port already in use

**Symptom:** `[Errno 98] Address already in use` or similar.

**Fix:** Another process is using port 8000. Either stop it or change the
port in `backend/.env`:

```dotenv
APP_PORT=8001
```

If you change the port, set `VITE_API_URL` so the Vite dev proxy points
to the new backend:

```bash
# Shell environment variable
VITE_API_URL=http://localhost:8001 npm run dev

# Or in frontend/.env
VITE_API_URL=http://localhost:8001
```

For Electron, pass the frontend URL via `FRONTEND_URL`.

---

## Avatar shows placeholder instead of 3D model

**Symptom:** The conversation step shows "Avatar not available" with a
placeholder silhouette instead of a 3D character.

**Cause:** The demo VRM avatar files are missing or corrupted. The two
demo avatars (AvatarSample_B.vrm, AvatarSample_C.vrm) should be
included in the repository. If they are missing, the demo displays a
designed fallback state.

**Fix:** Verify that the files exist in `frontend/public/avatars/`:

- `frontend/public/avatars/AvatarSample_B.vrm`
- `frontend/public/avatars/AvatarSample_C.vrm`

If the files are missing, re-clone the repository or restore them from
git. If you are using custom avatars, check that file names match exactly
what is defined in `study/demo-study/avatars.json`.

---

## Realtime voice is unavailable

**Symptom:** Conversation step shows "Voice chat not available" instead of
starting a voice session.

**Cause:** Realtime is disabled or misconfigured.

**Fix:** Check `backend/.env`:

```dotenv
OPENAI_API_KEY=sk-...          # Must be a valid key with Realtime access
OPENAI_REALTIME_ENABLED=true   # Must be explicitly true
```

Both values are required. If the key is empty or `OPENAI_REALTIME_ENABLED`
is `false`, the backend returns a 4xx error and the frontend shows the
fallback.

Check backend logs for errors from the realtime service (e.g., invalid
key, OpenAI API errors).

---

## Voice auto-start did not work

**Symptom:** Entering a conversation step shows the manual "Start voice
session" button instead of auto-connecting.

**Possible causes:**

1. **Microphone permission denied** — the browser blocked mic access
   before the session could start. Allow mic access and reload (see
   "Microphone permission denied" below).
2. **Realtime not enabled** — check that `OPENAI_API_KEY` and
   `OPENAI_REALTIME_ENABLED=true` are set in `backend/.env`.
3. **Browser autoplay policy** — some browsers require a recent user
   gesture for `getUserMedia`. The "Start Quiz" button on the
   instruction slide provides this gesture. If the step is reached
   without a click (e.g., direct URL navigation), the browser may block
   mic access.
4. **Backend unreachable** — the SDP relay POST failed. Check backend
   logs for errors.

**Fallback behavior:** When auto-start fails, the voice bar shows a
manual "Start voice session" button. The study flow is not broken; the
user can start the session manually.

---

## Realtime voice quality / environment tips

**Symptom:** The assistant responds to ambient sounds, triggers
unexpectedly, or fails to detect speech reliably.

**Cause:** OpenAI's server-side VAD (voice activity detection) is
sensitive to background noise. In noisy environments, ambient sounds
can be misinterpreted as speech input.

**Recommendations:**

- Use a **quiet environment** — close windows, turn off fans or music,
  mute system notification sounds.
- Use a **headset or directional microphone** to reduce ambient pickup.
- If the assistant keeps responding to background noise, the environment
  is likely too noisy for reliable operation.

**Tunable settings in `backend/.env`:**

| Variable | Purpose |
| -------- | ------- |
| `OPENAI_REALTIME_MODEL` | Realtime model (e.g., `gpt-realtime-mini`) |
| `OPENAI_REALTIME_VOICE` | Voice preset (e.g., `alloy`, `echo`, `shimmer`) |

These are the user-facing Realtime settings. Deeper VAD /
turn-detection tuning (e.g., silence thresholds, detection mode)
currently requires backend code changes in the session configuration
(`backend/app/services/realtime_service.py`).

---

## Voice connected but no visible mouth movement

**Symptom:** Voice session is connected and audio plays, but the avatar's
mouth does not move.

**Possible causes:**

1. **Avatar not loaded** — if the avatar file failed to load (fallback
   placeholder is shown), lip sync has nothing to drive.
2. **Browser AudioContext blocked** — some browsers suspend new
   AudioContext instances until a user gesture. Reloading the page and
   clicking "Start voice session" again usually resolves this.
3. **VRM model has no `aa` expression** — the lip sync controller sets
   the standard VRM `aa` (mouth open) expression. Custom VRM models that
   lack this blendshape will not show mouth movement.

---

## Microphone permission denied

**Symptom:** Voice session fails immediately; browser console shows
`NotAllowedError` or `Permission denied`.

**Cause:** The browser blocked microphone access.

**Fix:**

1. Click the lock/site icon in the browser address bar.
2. Allow microphone access for `localhost`.
3. Reload the page and try again.

In some browsers, `localhost` requires HTTPS for microphone access. Vite's
dev server runs on HTTP by default. Most modern browsers allow mic access
on `localhost` without HTTPS, but if yours does not, consult your browser's
documentation.

---

## Logging endpoint errors (`/api/logs` or `/api/log/events`)

**Symptom:** Console errors or network failures when the frontend tries to
send telemetry events.

**Possible causes:**

1. **Backend not running** — Start the backend first.
2. **Wrong port** — The Vite proxy sends `/api/*` to `http://localhost:8000`
   by default. If the backend runs on a different port, set `VITE_API_URL`
   (see "Port already in use" above).
3. **`data/logs/` directory** — The backend creates this directory
   automatically. If it fails (permissions), check that the `data/`
   directory is writable.

---

## Tobii enabled but no gaze data

See [TOBII_SETUP.md](TOBII_SETUP.md) for detailed Tobii troubleshooting.

**Quick checklist:**

- Is `TOBII_ENABLED=true` in `backend/.env`?
- Is `TOBIISTREAM_PATH` set to the correct path?
- Is `pyzmq` installed? (`pip install -e ".[tobii]"`)
- Is TobiiStream.exe actually running and publishing data?
- Are you on Windows? Tobii is Windows-only.

---

## pyzmq not installed

**Symptom:** Backend log says `pyzmq not available — Tobii adapter
disabled` even though `TOBII_ENABLED=true`.

**Fix:** Install pyzmq via the Tobii extra:

```bash
cd backend
pip install -e ".[tobii]"
```

---

## `.env` file not loaded / settings not applied

**Symptom:** Backend uses default values even though you set variables in
`.env`.

**Cause:** The `.env` file is in the wrong location. The backend reads
`.env` relative to its working directory.

**Fix:** Place the file at `backend/.env` (not the project root).

When running manually:

```bash
cd backend
uvicorn app.main:app --reload
```

When running via Electron, the backend's working directory is also set to
`backend/`.

To verify which settings are active, check the backend startup logs or
call `GET /api/runtime` which reports capability flags (e.g., whether
Realtime is enabled).

---

## CI / tests fail

### Backend tests

```bash
cd backend
pytest -q
```

**Common causes:**

- Missing dev dependencies — run `pip install -e ".[dev]"`
- Python version too old — requires 3.11+
- Lint failures — run `ruff check .` and `ruff format --check .`

### Frontend tests

```bash
cd frontend
npm test
```

**Common causes:**

- Missing node_modules — run `npm ci`
- Node.js version too old — requires 22+
- Lint failures — run `npm run lint`
- Build failures — run `npm run build` (checks TypeScript)

### Running all checks locally

```bash
# Linux / macOS
./scripts/dev.sh lint

# Windows PowerShell
.\scripts\dev.ps1 lint
```

This runs backend lint + frontend lint + frontend build, matching what CI
does.

---

## Research mode / log inspection

### How to enable research mode

Set `LOG_MODE=research` in `backend/.env`. The active mode is visible
in the `/api/runtime` response and recorded in every session log file.

### Inspecting session logs

Use the CLI inspector to get a quick summary of any session log:

```bash
python scripts/inspect_logs.py data/logs/*.jsonl
```

### No gaze.tobii_raw events in research mode

**Cause:** The frontend must sync session context to the backend via
`POST /api/gaze/context` for Tobii raw logging to start. This happens
automatically when a conversation step begins.

**Check:** Verify that Tobii is connected, `LOG_MODE=research` is set,
and a conversation step has been entered.

---

## Electron-specific issues

### Desktop prod mode shows blank page

**Symptom:** Electron opens but the window is blank in desktop prod mode
(`npm run start`).

**Cause:** The frontend has not been built, so `frontend/dist/` is
missing or outdated.

**Fix:** Build the frontend before starting Electron:

```bash
cd frontend
npm run build
cd ../electron
npm run start
```

### Desktop prod mode: API errors / "Backend not reachable"

**Symptom:** The app loads but shows "Backend not reachable" or API
calls fail in desktop prod mode.

**Cause:** In desktop prod mode the frontend runs from `file://` and
sends API requests directly to `http://127.0.0.1:8000`. If the backend
is not running on that address, requests fail.

**Fix:** Verify the backend is running on port 8000. Check `backend/.env`
for `APP_HOST` and `APP_PORT`. The default values (`127.0.0.1:8000`)
match what the frontend expects.

### Backend exited early

**Symptom:** Electron shows "Backend Start Failed" dialog.

**Cause:** The Python backend process crashed before responding to health
checks.

**Fix:** Check the terminal output for `[backend]` log lines. Common
causes:

- Python venv not set up (see "Backend does not start" above)
- Port conflict
- Missing `backend/.env`

### Lab / kiosk mode: how to exit

**Symptom:** The app is fullscreen with no window controls or taskbar.

**Fix:** Press `Ctrl+Shift+Q` to quit the kiosk app cleanly. On Windows,
`Alt+F4` also works. The backend and all child processes are shut down
automatically on exit.

### Lab / kiosk mode: blank screen

**Cause:** Same as desktop prod mode — the frontend must be built first.

**Fix:**

```bash
cd frontend
npm run build
cd ../electron
npm run lab
```

### Custom Python path

If your Python is not in `backend/.venv/`, set `BACKEND_PYTHON`:

```bash
BACKEND_PYTHON=/path/to/python npm run dev
```

Electron uses this to spawn the backend process.

---

## Windows release (packaged app)

### Building the release

```powershell
.\scripts\build_release.ps1
```

Requires PyInstaller: `cd backend && pip install -e ".[package]"`

The script builds frontend, backend executable, and Electron package.
Output: `release/win-unpacked/`.

### Where are logs and runtime data?

The packaged app writes to Electron's `userData` directory
(`app.getPath("userData")`). On Windows this is typically
`%APPDATA%/gaze-aware-avatar-study-kit/`.

- Logs: `<userData>/data/logs/*.jsonl`
- `.env`: `<userData>/.env` (optional, user-created)

### Where to put .env in a release

Place a `.env` file next to `gaze-aware-avatar-study-kit.exe` in the release directory.
Example content:

```dotenv
LOG_MODE=research
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_ENABLED=true
```

`APP_HOST` and `APP_PORT` are forced to `127.0.0.1:8000` in packaged
mode and cannot be overridden via `.env`.

### Release app does not start / backend error

**Symptom:** The app shows "Backend Start Failed" or closes immediately.

**Possible causes:**

1. **Incomplete build** — verify `resources/backend/backend.exe` exists
   inside the release directory.
2. **Port conflict** — another process is using port 8000. The packaged
   backend always binds to `127.0.0.1:8000`.
3. **Antivirus blocking** — some antivirus software may block PyInstaller
   executables. Add an exception for the release directory.

### No backend console window visible

This is intentional. The packaged backend runs with `windowsHide: true`.
Backend output is captured internally by Electron. Check the Electron
console (if available) or the log files in `<userData>/data/logs/` for
backend activity.

### Tobii in release

Tobii works in the release if:
1. `TOBII_ENABLED=true` is set in `<userData>/.env`
2. `TOBIISTREAM_PATH` points to the TobiiStream.exe binary
3. pyzmq was installed when building the backend executable

If pyzmq was not installed at build time, Tobii is gracefully disabled
with a log warning. Rebuild with `pip install -e ".[tobii]"` first.

**Note:** In the release build, TobiiStream is launched by the
backend process (not by the Electron shell). The `.env` next to
the exe is read by the backend via pydantic-settings. Set both
`TOBII_ENABLED=true` and `TOBIISTREAM_PATH=C:\path\to\TobiiStream.exe`
there.

### Realtime voice in release

Set `OPENAI_API_KEY` and `OPENAI_REALTIME_ENABLED=true` in the
`.env` next to `gaze-aware-avatar-study-kit.exe`. Without these, conversation steps
show a fallback message — the app still starts normally.
