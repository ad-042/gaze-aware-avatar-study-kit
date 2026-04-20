# Privacy

This document describes what data Gaze-Aware Avatar Study Kit processes, stores, and
transmits. It reflects the actual current implementation — not planned
future features.

## Overview

Gaze-Aware Avatar Study Kit is a local-first application.

In **public browser demo mode** (`?demo`):
- no backend is required
- no telemetry is sent
- no microphone is used
- no data leaves the machine

External network calls only happen when optional features are explicitly
enabled, most notably OpenAI Realtime voice in full local mode.

## Capture disclosure

The application makes its data capture behavior transparent to both
experimenters and participants:

- The **experimenter start screen** shows an `effective_capture` summary
  listing exactly which data streams are active for the session (e.g.,
  transcripts, gaze samples, audio-to-OpenAI).
- The **consent step** displays a runtime-aware notice block with
  human-readable disclosure lines matching the active capabilities.
- In **demo mode**, both locations clearly state that no data is stored
  or sent externally.
- The `effective_capture` summary is recorded in the `session.started`
  log event so it can be audited after the fact.

The capture summary is derived automatically from `LOG_MODE` and backend
capabilities — it is not configurable per study. It reflects the actual
session reality, not a selected profile.

## Data processed locally

### Mouse / gaze coordinates

- In browser demo mode and normal browser use without Tobii, mouse
  position is used as a simulated gaze source.
- Coordinates are normalized to `[0, 1]` in-memory and used for real-time
  avatar interaction.
- In **default** mode, raw coordinates are not persisted — only gaze
  intersection change events are logged.
- In **research** mode, coordinates are persisted as `gaze.sample`
  events (viewer-container-relative, configurable rate) and, when Tobii
  is connected, as `gaze.tobii_raw` events (screen-relative, hardware
  rate). See [DATA_FORMATS.md](DATA_FORMATS.md) for details.

### Tobii gaze data

When Tobii is enabled:
- `TobiiStream.exe` publishes normalized gaze data via ZMQ
- the backend receives and stores the latest sample in memory (`GazeStore`)
- stale or missing gaze samples are reported as invalid
- the app continues without Tobii if the adapter cannot start

This path is optional and Windows-only.

### Avatar interaction

- VRM avatar models are loaded from local files in
  `frontend/public/avatars/`
- avatar state, gaze state transitions, idle motion, and look-at behavior
  are computed locally
- no avatar geometry or asset content is sent to OpenAI or another remote
  service

### Study configuration

- full local mode reads study config from local JSON files in `study/`
- browser demo mode reads a static merged snapshot from
  `frontend/public/demo-config.json`
- no external service is used for study config delivery

## Telemetry logging

In **full local mode**, the frontend batches structured events and sends
them to the backend, which writes JSONL files to:

```text
data/logs/{session_id}.jsonl
```

In **public browser demo mode**, telemetry is disabled and no log files are
written.

### Log modes

The backend supports two logging modes via `LOG_MODE` in `backend/.env`:

- **`default`** (the default) — slim, privacy-conservative logging.
  Only structural study-flow events are recorded (step navigation,
  avatar selection, gaze state transitions, voice session state).
  No form/questionnaire answers, no transcripts, no raw gaze streams,
  no audio content.

- **`research`** — extended logging for research use. Must be
  explicitly activated by setting `LOG_MODE=research`. In addition
  to all default events, research mode logs:
  - **Study assignment metadata** — study design, condition order,
    question assignment per condition
  - **Form submissions** — structured answers from form steps
    (e.g., demographics)
  - **Questionnaire submissions** — structured answers from all
    questionnaire steps (round, comparison, feedback)
  - **Conversation transcripts** — textual user/assistant turns from
    the OpenAI Realtime voice session. No raw audio is stored — only
    the text transcripts returned by the OpenAI DataChannel
    (`response.audio_transcript.done` for assistant turns,
    `conversation.item.input_audio_transcription.completed` for user
    turns via Whisper). The backend enables `input_audio_transcription`
    in the Realtime session config only when in research mode.
  - **Gaze sample stream (frontend)** — normalised and pixel gaze
    coordinates at a configurable rate (default 90 Hz, set via
    `RESEARCH_GAZE_SAMPLE_HZ`) during conversation steps, with viewer
    dimensions, intersection state, gaze source, and avatar lookAt
    orientation (yaw/pitch in degrees, derived from the lookAt target
    offset — no personal data). Coordinates are relative to the
    viewer container.
  - **Tobii raw gaze stream (backend)** — high-rate (~90 Hz)
    screen-normalised gaze coordinates plus raw pixel values from
    TobiiStream, logged backend-side near the ZMQ source. Only active
    when Tobii is connected. Includes raw screen pixel coordinates
    from TobiiStream (`x_raw_px`/`y_raw_px`) and the TobiiStream
    sequence number. The frontend syncs the current session context
    to the backend via `POST /api/gaze/context` so samples can be
    tagged with step and condition.

  - **Speaking state transitions** — boolean speaking start/stop
    events for user and assistant during Realtime voice sessions.
    User speech is detected by OpenAI's server-side VAD; assistant
    speech is tracked via audio generation events. No audio content
    is stored — only the role and boolean speaking state with
    condition context.

Research mode never activates silently. The active mode is visible in
the `/api/runtime` response and recorded as a `session.started` marker
event at the start of every session log file.

### Event format

Each JSONL line has these mandatory fields:

| Field | Description |
| ----- | ----------- |
| `schema_version` | Integer schema version |
| `timestamp` | ISO 8601 timestamp |
| `session_id` | Random session identifier |
| `event_type` | Event category string |

Optional:
- `data` — event-specific object payload

### Currently documented event types

Events emitted in both modes:
- `session.started` — backend-generated marker with the active log mode
- `study.step_entered` — step navigation with condition context
- `study.avatar_selected` — participant avatar choice
- `avatar.loaded` — avatar load per conversation step
- `gaze.intersection_changed` — gaze hit/miss transitions with source
- `fsm.state_changed` — gaze FSM state transitions
- `realtime.state_changed` — voice session state changes
- `gaze.source_status_changed` — backend gaze valid/stale transitions

Events emitted only in research mode:
- `study.assignment_recorded` — study design metadata, condition order,
  question assignment
- `study.form_submitted` — structured form answers (e.g., demographics)
- `study.questionnaire_submitted` — structured questionnaire answers
  (round, comparison, feedback)
- `conversation.turn` — textual transcript of a user or assistant turn
  (text only, no audio content)
- `conversation.speaking_changed` — speaking start/stop transitions
  for user and assistant (boolean state only, no audio content)
- `gaze.sample` — gaze coordinates (normalised + pixel) and avatar
  lookAt orientation (yaw/pitch degrees) at configurable rate during
  conversation steps (container-relative, avatar data is non-personal)
- `gaze.tobii_raw` — high-rate Tobii gaze coordinates (screen-
  normalised + raw pixel) from the backend ZMQ source
- `gaze.avatar_eye_contact_changed` — avatar lookAt orientation
  transitions (facing user / looking away), derived from lookAt target
  offset. No personal data — only boolean state + condition context.
- `gaze.mutual_gaze_changed` — mutual gaze transitions (both user
  and avatar looking at each other). No personal data — only boolean
  state + condition context.

See [DATA_FORMATS.md](DATA_FORMATS.md) for the current event schema and
sample logs.

### What is not logged

- no API keys or secrets
- no raw audio streams or audio files
- no gaze coordinate streams in default mode (only in research mode
  as container-relative `gaze.sample` events at configurable rate)
- no transcripts in default mode (only in research mode as text-only
  `conversation.turn` events — no audio content)
- no personally identifying user account data by design
- no custom avatar file contents
- no form/questionnaire answers in default mode (only in research mode)

## Microphone and audio

### When microphone access happens

Microphone access happens **only** when:
- Realtime is enabled
- a conversation step is reached
- the browser permission is granted

When a conversation step is entered and Realtime is available, the
voice session starts automatically. The browser may prompt for
microphone permission at that point. If the auto-start fails, a
manual start button appears as fallback.

### When Realtime is active

- the frontend acquires microphone access via `getUserMedia`
- the backend performs the initial SDP relay
- the browser and OpenAI then communicate directly over WebRTC
- remote audio is played locally in the browser

The backend does **not** proxy audio and does **not** persist audio.

## OpenAI usage

- `OPENAI_API_KEY` is stored in `backend/.env`
- the frontend never receives the key
- the frontend never makes a direct Bearer-key REST call to OpenAI
- the backend relays the initial Realtime setup via:
  - `POST /api/realtime/session`
  - upstream to `POST /v1/realtime/calls`

The backend sends:
- SDP offer
- model
- voice
- initial session configuration

The backend does **not** provide ongoing server-side control over later
client-side Realtime events in the current version.

If Realtime is disabled or the key is missing:
- no OpenAI call is made
- the UI falls back cleanly

## Data included vs excluded from the repository

### Included in the repo

- source code
- study config JSON files
- synthetic sample logs under `data/sample/`
- two demo avatars:
  - `frontend/public/avatars/AvatarSample_B.vrm`
  - `frontend/public/avatars/AvatarSample_C.vrm`

### Not included in the repo

| Item | Reason |
| ---- | ------ |
| `.env` files | contain secrets / local config |
| custom local `*.vrm` avatars | user-provided, git-ignored by default |
| `*.fbx` animation files | not distributed by default |
| `TobiiStream.exe` | proprietary external binary |
| `data/logs/` runtime logs | local session output |
| `.venv/` | local Python environment |
| `node_modules/` | installed locally |

## Session metadata (experimenter start screen)

In full local / desktop / kiosk modes, an experimenter start screen
is shown before the study flow begins. It collects optional session
metadata:

| Field | Purpose | Persisted? |
| ----- | ------- | ---------- |
| `participant_id` | Pseudonymous study identifier (e.g., `P-20260323-a1b`). Not a real name or account — intended as a lab-assigned code. | Always (both log modes) |
| `trial_id` | Optional trial/run identifier. | Always (both log modes) |
| `session_label` | Optional free-form label. | Always (both log modes) |
| `operator_notes` | Optional experimenter notes. May contain sensitive free text. | **Research mode only.** Omitted from session logs in default mode. |

In **demo mode**, the start screen is shown with demo-appropriate
information (all capture flags off, "Demo mode" notice). No metadata
is collected or stored — the session uses a local UUID.

These fields are written once into the `session.started` marker event
in the JSONL session log file. They are not repeated in subsequent
events. No field is intended to contain personally identifying
information — `participant_id` is a pseudonymous lab code, not a name
or email.

`operator_notes` is treated conservatively: it is a free-text field
that could contain sensitive content, so it is only persisted when
`LOG_MODE=research` is explicitly set.

## Consent

The demo study includes a `consent` step in `study/demo-study/flow.json`.
The flow does not proceed until the participant explicitly confirms.

The consent text itself is config-driven, not hardcoded in frontend code.

## Summary by mode

| Scenario | Data leaves the machine? | What is sent? |
| -------- | ------------------------ | ------------- |
| Public browser demo (`?demo`) | No | Nothing |
| Full local mode, no Realtime | No | Local backend logging only |
| Full local mode with Realtime | Yes | Initial SDP relay + direct mic audio via WebRTC to OpenAI |
| Tobii enabled | No internet implied by Tobii path | Local ZMQ between TobiiStream and backend |

## Notes

This file is not legal advice. It documents the current behavior of the
repository and should be updated whenever:
- logging behavior changes
- included assets change
- Realtime handling changes
- demo/full-local mode behavior changes
