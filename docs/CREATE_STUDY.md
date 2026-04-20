# Create Your Own Study

How to create and customize a study using this repository.

## 1. What is a "study"?

A study is a complete experiment configuration: the flow of steps a
participant goes through, the avatars they interact with, the
questionnaires they answer, the voice prompts the avatar uses, and the
gaze behavior parameters.

All of this is defined in **JSON files** — no code changes required for
most customizations. The backend loads, validates, and serves these files.
The frontend renders the steps in order.

### What you can change without touching code

- Study metadata (name, description, conditions)
- Step order and step content (welcome text, consent text, form fields)
- Questionnaires (questions, scales, response types)
- Avatars (swap VRM files, change labels and voice IDs)
- Gaze profiles (FSM timing parameters)
- Voice prompts (system messages and quiz questions)
- Number of conditions and their order

### What currently requires code changes

- Adding a **new step type** beyond the seven built-in types
- Changing **how** a step type renders (e.g., custom UI for consent)
- Modifying the gaze FSM logic itself (not just its timing)
- Changing the Realtime voice session behavior
- Adding new telemetry event types

## 2. Study directory structure

Each study lives in its own subfolder under `study/`. The folder name
is the study ID used by the backend API.

```
study/
└── demo-study/              ← study ID = "demo-study"
    ├── study.json           ← metadata (id, name, conditions)
    ├── flow.json            ← ordered list of steps
    ├── avatars.json         ← available avatars
    ├── questionnaires.json  ← questionnaire definitions
    ├── prompts.json         ← voice/quiz prompt configuration
    └── gaze_profiles.json   ← gaze FSM timing parameters
```

All six files are required. The backend validates every file on load
and rejects the study if any file is missing or invalid.

### study.json

Study-level metadata. Defines the study ID, human-readable name,
experimental conditions, and how many questions each condition uses.

```json
{
  "id": "demo-study",
  "version": "1.0.0",
  "name": "Gaze-Aware Avatar Study",
  "description": "Within-subjects study comparing baseline and gaze-aware avatar conditions.",
  "study_mode": "within_subjects",
  "conditions": ["baseline", "gazeaware"],
  "questions_per_condition": 5,
  "assignment": {
    "condition_order_mode": "counterbalanced",
    "question_order_mode": "shuffle"
  }
}
```

| Field | Required | Purpose |
| ----- | -------- | ------- |
| `id` | yes | Must match the folder name exactly |
| `version` | yes | Semantic version string |
| `name` | yes | Human-readable study name |
| `description` | no | Longer description (default: empty) |
| `study_mode` | yes | Descriptive study design label (e.g. `"within_subjects"`). Logged in telemetry but has no runtime effect — actual counterbalancing is controlled by the `assignment` policy. |
| `conditions` | yes | List of condition names (min 1); referenced in `flow.json` |
| `questions_per_condition` | yes | Number of quiz questions per condition (min 1) |
| `assignment` | no | Assignment policy (see below; defaults to fixed order, no shuffle) |

**Assignment policy:**

| Field | Values | Default | Purpose |
| ----- | ------ | ------- | ------- |
| `condition_order_mode` | `"fixed"`, `"counterbalanced"`, `"random"` | `"fixed"` | How conditions are ordered per session. `"counterbalanced"` alternates AB/BA via seed-based rotation (for 2 conditions) or cyclic rotation (for N conditions). |
| `fixed_condition_order` | string[] | — | Required when mode is `"fixed"`. Must contain the same IDs as `conditions`, no duplicates. Ignored when mode is not `"fixed"`. |
| `question_order_mode` | `"fixed"`, `"shuffle"` | `"fixed"` | Whether quiz questions are shuffled per session. |

**Examples:**

Always AB (baseline first):
```json
"assignment": { "condition_order_mode": "fixed", "fixed_condition_order": ["baseline", "gazeaware"] }
```

Always BA (gazeaware first):
```json
"assignment": { "condition_order_mode": "fixed", "fixed_condition_order": ["gazeaware", "baseline"] }
```

Counterbalanced (AB/BA varies per session):
```json
"assignment": { "condition_order_mode": "counterbalanced", "question_order_mode": "shuffle" }
```

If `assignment` is omitted, the default is `"fixed"` with the condition
order from `conditions` and no shuffle.
When writing an explicit `"fixed"` mode, `fixed_condition_order` is
required.

### flow.json

The ordered list of steps a participant walks through. Each step has a
`type` that determines how the frontend renders it.

```json
{
  "steps": [
    { "id": "welcome", "type": "info", "title": "Welcome", "content": "..." },
    { "id": "consent", "type": "consent", "title": "Consent", "content": "...", "consent_label": "I agree." },
    { "id": "condition1", "type": "conversation", "condition": "baseline" },
    { "id": "questionnaire1", "type": "questionnaire", "questionnaire_id": "round" },
    { "id": "ending", "type": "info", "title": "Thank You", "content": "..." }
  ]
}
```

**Available step types:**

| Type | Purpose | Key fields |
| ---- | ------- | ---------- |
| `info` | Static text page | `title`, `content`, `content_blocks`, `button_label` |
| `consent` | Consent page with checkbox | `title`, `content`, `consent_label` |
| `form` | Data collection form | `title`, `fields` (array of form fields) |
| `calibration` | Gaze verification (3-point fixation check) | `title` |
| `avatar_selection` | Let participant choose an avatar | `title`, `content` |
| `conversation` | Avatar conversation (voice or fallback) | `condition` |
| `questionnaire` | Renders a questionnaire | `questionnaire_id` |

Every step must have a unique `id` string.

**Optional fields for `info` steps:**

| Field | Purpose |
| ----- | ------- |
| `content_blocks` | Array of strings rendered as separate paragraphs. If present, takes priority over `content`. Useful for multi-paragraph instruction slides. |
| `button_label` | Custom text for the navigation button (default: `"Continue"`). Example: `"Start Quiz"`. |

**Form fields** (for `type: "form"`) support these field types:

| Field type | Renders as |
| ---------- | ---------- |
| `text` | Text input |
| `number` | Number input |
| `select` | Dropdown (needs `options` array) |

Each field object supports:

| Property | Required | Purpose |
| -------- | -------- | ------- |
| `id` | yes | Unique field identifier (used as key in logged answers) |
| `type` | yes | `"text"`, `"number"`, or `"select"` |
| `label` | yes | Label shown to the participant |
| `required` | yes | Whether the field must be filled before continuing |
| `options` | `select` only | Array of dropdown option strings |
| `min` | no | Minimum value (for `number` fields, rendered as HTML `min` attribute) |
| `max` | no | Maximum value (for `number` fields, rendered as HTML `max` attribute) |

### avatars.json

Defines the avatars available for selection.

```json
{
  "avatars": [
    {
      "id": "avatar_b",
      "label": "Character A",
      "model_file": "AvatarSample_B.vrm",
      "voice": "alloy",
      "thumbnail": "avatars/avatar_b_thumb.png"
    }
  ]
}
```

| Field | Purpose |
| ----- | ------- |
| `id` | Unique avatar identifier |
| `label` | Display name shown to the participant |
| `model_file` | VRM filename — must exist in `frontend/public/avatars/` |
| `voice` | OpenAI Realtime voice ID (used when Realtime is enabled) |
| `thumbnail` | *(optional)* Path to a thumbnail image shown in the avatar selection grid (relative to `frontend/public/`) |

At least one avatar is required.

### questionnaires.json

A dictionary of named questionnaires. Each key is a questionnaire ID
that can be referenced from `flow.json`.

```json
{
  "questionnaires": {
    "round": {
      "title": "Questionnaire",
      "instruction": "Please rate the following statements:",
      "items": [
        {
          "id": "q1",
          "text": "The avatar appeared interested in me.",
          "type": "likert",
          "scale_min": 1,
          "scale_max": 5,
          "scale_labels": ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"],
          "required": true
        }
      ]
    }
  }
}
```

**Questionnaire item types:**

| Type | Purpose | Extra fields |
| ---- | ------- | ------------ |
| `likert` | Likert scale | `scale_min`, `scale_max`, `scale_labels` (optional) |
| `choice` | Single-choice selection | `options` (array of strings) |
| `text` | Free-text input | — |

Each item needs a unique `id` within its questionnaire.

### prompts.json

Configuration for the voice conversation. Currently supports the `quiz`
prompt format used by the Realtime voice session.

```json
{
  "quiz": {
    "system_base": "You are a Quizmaster. Your task is to conduct a general knowledge quiz...",
    "system_end": "Begin by stating that the quiz is starting and ask the first question...",
    "questions": [
      { "id": "q01", "text": "What is the capital of France?" },
      { "id": "q02", "text": "Who was the first person to walk on the Moon?" }
    ]
  }
}
```

| Field | Purpose |
| ----- | ------- |
| `system_base` | Start of the system prompt sent to the voice model |
| `system_end` | End of the system prompt (closing instructions) |
| `questions` | List of structured quiz questions with `id` and `text` (min 1); assigned per condition based on `questions_per_condition` and the assignment policy |

Each question must have a unique `id` and a `text` field containing the
question text. The total number of questions should be at least
`questions_per_condition * number_of_conditions`.

### gaze_profiles.json

Timing parameters for the gaze awareness FSM. Each profile defines how
long the avatar waits before transitioning between gaze states.

```json
{
  "profiles": {
    "default": {
      "states": ["baseline", "gazeaware_pending", "gazeaware", "gaze_break"],
      "pending_time_ms": 300,
      "mutual_time_ms": 3600,
      "break_time_ms": 1250,
      "lose_debounce_ms": 200
    }
  }
}
```

| Field | Purpose |
| ----- | ------- |
| `states` | The FSM state names (informational) |
| `pending_time_ms` | How long gaze must be detected before entering mutual gaze |
| `mutual_time_ms` | How long mutual gaze lasts before a natural gaze break |
| `break_time_ms` | Duration of the gaze break before returning |
| `lose_debounce_ms` | Grace period before gaze-loss is registered |

All timing values are in milliseconds and must be ≥ 0.

### About demo-config.json (browser demo mode)

The file `frontend/public/demo-config.json` is a **generated snapshot**
of the study configuration used by the browser demo mode (`?demo` URL
parameter). It contains a merged copy of all six JSON files in a single
object.

- It is **not** the source of truth — the `study/` folder is.
- If you change files in `study/demo-study/`, regenerate it:
  ```bash
  python scripts/build_demo_config.py
  ```
- If you are creating a new study (not `demo-study`), you do not need to
  touch `demo-config.json` at all — it only applies to the `?demo` path.

## 3. How to create a new study

### Step 1 — Copy the demo study

```bash
cp -r study/demo-study study/my-study
```

Your new study ID is `my-study` (the folder name).

### Step 2 — Update study.json

Change the `id` to match your folder name. Update the name, description,
conditions, and question count to match your design.

```json
{
  "id": "my-study",
  "version": "1.0.0",
  "name": "My Experiment",
  "description": "A brief description of your study.",
  "study_mode": "within_subjects",
  "conditions": ["control", "experimental"],
  "questions_per_condition": 3
}
```

**Critical:** The `id` field must match the folder name exactly. If they
differ, the backend will serve the config but the ID will be inconsistent.

### Step 3 — Edit flow.json

Design your study flow. You can:

- Remove or reorder steps
- Add more conversation + questionnaire blocks
- Change welcome/consent/ending text
- Add or remove form fields in the demographics step
- Use different condition names (must match `study.json` `conditions`)

Example: a simpler single-condition study:

```json
{
  "steps": [
    { "id": "welcome", "type": "info", "title": "Welcome", "content": "Welcome to the study." },
    { "id": "consent", "type": "consent", "title": "Consent", "content": "...", "consent_label": "I agree." },
    { "id": "avatar_pick", "type": "avatar_selection", "title": "Choose your avatar" },
    { "id": "main_conversation", "type": "conversation", "condition": "control" },
    { "id": "post_survey", "type": "questionnaire", "questionnaire_id": "post" },
    { "id": "thanks", "type": "info", "title": "Done", "content": "Thank you." }
  ]
}
```

### Step 4 — Edit questionnaires.json

Add, remove, or modify questionnaires. Make sure every `questionnaire_id`
used in `flow.json` has a matching key here.

```json
{
  "questionnaires": {
    "post": {
      "title": "Post-Conversation Survey",
      "instruction": "Please answer the following questions.",
      "items": [
        {
          "id": "engagement",
          "text": "I felt engaged during the conversation.",
          "type": "likert",
          "scale_min": 1,
          "scale_max": 7,
          "scale_labels": ["Strongly Disagree", "", "", "Neutral", "", "", "Strongly Agree"],
          "required": true
        },
        {
          "id": "preference",
          "text": "Would you use this system again?",
          "type": "choice",
          "options": ["Yes", "No", "Maybe"],
          "required": true
        }
      ]
    }
  }
}
```

### Step 5 — Edit avatars.json

Reference VRM files that exist in `frontend/public/avatars/`. The two
demo avatars (AvatarSample_B.vrm, AvatarSample_C.vrm) are included in
the repo and can be reused.

To use a custom avatar:

1. Place your `.vrm` file in `frontend/public/avatars/`
2. Reference the filename in `avatars.json`
3. Custom VRM files are git-ignored by default — they will not be
   committed

```json
{
  "avatars": [
    {
      "id": "my_avatar",
      "label": "Dr. Smith",
      "model_file": "MyCustomAvatar.vrm",
      "voice": "shimmer"
    }
  ]
}
```

The `voice` field is only used when OpenAI Realtime is enabled. Valid
voice IDs depend on the OpenAI Realtime API (e.g., `alloy`, `echo`,
`shimmer`). If Realtime is disabled, this field is ignored but still
required in the schema.

### Step 6 — Edit prompts.json

Change the quiz questions and system prompt to fit your study. Each
question needs a unique `id` and a `text`.

```json
{
  "quiz": {
    "system_base": "You are a friendly assistant conducting a short interview...",
    "system_end": "After all questions are done, say goodbye and tell the user to click Continue.",
    "questions": [
      { "id": "q01", "text": "What is your favorite hobby?" },
      { "id": "q02", "text": "Tell me about a recent trip you took." },
      { "id": "q03", "text": "What do you find most interesting about technology?" }
    ]
  }
}
```

### Step 7 — Edit gaze_profiles.json (optional)

The default profile works well for most studies. Adjust timing values
only if you need different gaze behavior dynamics.

### Step 8 — Verify your study

Start the backend and load your study via the API:

```bash
# Start the backend
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# In another terminal, test the API
curl http://localhost:8000/api/studies/my-study
```

If the JSON is valid, you get the full merged config back. If there are
errors, the response includes specific validation messages telling you
which file and field failed.

Then run the full local mode to test your study end-to-end:

```bash
# Terminal 1 — Backend (already running)
# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open `http://localhost:5173` (without `?demo`) and walk through every
step to verify the flow works correctly.

## 4. Important cross-file references

Several IDs must be consistent across files. If they are mismatched, the
backend will reject the study or the frontend will show errors at runtime.

### study.json → flow.json: condition names

Every `condition` value in a `conversation` step must appear in the
`conditions` array in `study.json`. The backend does not currently
enforce this automatically, but the frontend uses condition names to
determine gaze behavior (baseline vs. gaze-aware).

```
study.json:   "conditions": ["baseline", "gazeaware"]
                                  ↑              ↑
flow.json:    "condition": "baseline"    "condition": "gazeaware"
```

### flow.json → questionnaires.json: questionnaire IDs

Every `questionnaire_id` in a flow step must match a key in the
`questionnaires` dictionary. The backend **does** validate this — if a
referenced ID is missing, the study will not load.

```
flow.json:              "questionnaire_id": "round"
                                              ↑
questionnaires.json:    "questionnaires": { "round": { ... } }
```

### avatars.json → filesystem: model files

Each `model_file` must correspond to an actual `.vrm` file in
`frontend/public/avatars/`. The backend does not check file existence
(it only validates JSON structure), so a typo here will cause a runtime
error when the frontend tries to load the avatar.

```
avatars.json:    "model_file": "AvatarSample_B.vrm"
                                        ↑
filesystem:      frontend/public/avatars/AvatarSample_B.vrm
```

### study.json: id → folder name

The `id` in `study.json` should match the folder name under `study/`.
The backend uses the folder name to locate files and the `id` field for
metadata. Keep them identical to avoid confusion.

```
study/my-study/          ← folder name
study/my-study/study.json:  "id": "my-study"   ← must match
```

### Condition names and gaze behavior

The condition name in a conversation step affects avatar behavior:

- `"gazeaware"` — enables the gaze awareness FSM (avatar responds to
  where the participant is looking)
- `"baseline"` — avatar uses static/default gaze behavior (no FSM)
- Any other string is treated as baseline behavior

This mapping is handled in the frontend code. You cannot define custom
gaze behaviors purely through config — only the timing parameters in
`gaze_profiles.json` are configurable.

## 5. Safe customization guide

### Safe to change freely

These changes are purely config-driven and require no code knowledge:

- **Text content** — welcome messages, consent text, form labels,
  questionnaire items, prompt text
- **Step order** — rearrange steps in `flow.json`
- **Number of conditions** — add or remove conditions and corresponding
  conversation + questionnaire blocks
- **Questionnaire design** — add/remove items, change scale ranges,
  mix likert/choice/text types
- **Quiz questions** — change the question list in `prompts.json`
- **Avatar selection** — swap VRM files, change labels and voice IDs
- **Gaze timing** — adjust millisecond values in `gaze_profiles.json`
- **Form fields** — add/remove/reorder demographics fields

### Change with care

These changes are possible but may have side effects:

- **New condition names** — the frontend treats `"gazeaware"` specially.
  A custom name like `"experimental"` will behave as baseline unless you
  also modify the frontend condition-handling code.
- **Removing the calibration step** — works fine; the step verifies gaze
  tracking before the study begins but is not strictly required.
- **Removing avatar_selection** — works, but the participant will not
  choose an avatar (the first avatar in the list is used as default).
- **Changing the `voice` field** — must be a valid OpenAI voice ID if
  Realtime is enabled; invalid IDs cause session setup failures.

### Requires code changes

- **New step types** — the seven built-in types (`info`, `consent`,
  `form`, `calibration`, `avatar_selection`, `conversation`,
  `questionnaire`) are validated by the backend schema. Adding a new
  type requires changes to the Pydantic schema and the frontend
  rendering logic.
- **Custom gaze FSM behavior** — the FSM states and transitions are
  defined in code (`GazeAwarenessMachine`). Config only controls timing.
- **Realtime session behavior** — the SDP relay and session setup are
  in backend/frontend code.
- **Tobii integration** — hardware-specific, configured via backend
  `.env`, not study JSON.
- **Telemetry events** — event types are defined in code.

## 6. Common mistakes

### Mismatched study ID and folder name

```
study/my-study/study.json  →  "id": "my_study"   ← WRONG (underscore vs. hyphen)
```

The backend uses the folder name to find files. The `id` field is
metadata. Keep them identical.

### Referencing a questionnaire that does not exist

```json
// flow.json
{ "id": "q1", "type": "questionnaire", "questionnaire_id": "post_survey" }
```

If `"post_survey"` is not a key in `questionnaires.json`, the backend
will reject the study with a clear error message.

### Avatar file not found

```json
// avatars.json
{ "model_file": "MyAvatar.vrm" }
```

If `frontend/public/avatars/MyAvatar.vrm` does not exist, the avatar
step will show a fallback placeholder instead of a 3D model. The backend
does **not** validate file existence — this is a runtime error only.

**Tip:** Double-check exact file names including capitalization. File
names are case-sensitive on Linux/macOS.

### Duplicate step IDs

Every step in `flow.json` must have a unique `id`. Duplicate IDs may
cause unexpected behavior in telemetry logging and step navigation.

### Forgetting to regenerate demo-config.json

If you modify `study/demo-study/` and also use the browser demo mode
(`?demo`), the demo will still show the **old** configuration from
`frontend/public/demo-config.json`. Regenerate it with:

```bash
python scripts/build_demo_config.py
```

This only matters for `demo-study` and the `?demo` URL. If you created
a new study folder with a different name, `demo-config.json` is
irrelevant — you load your study via the backend API in full local mode.

### Experimenter start screen

In full local / desktop / kiosk modes, an **Experiment Setup** screen
appears before the study flow begins. It displays study info, runtime
capabilities, and lets the experimenter set session metadata
(participant ID, trial ID, session label, operator notes). The session
is created only after the experimenter clicks **Start Study**.

In `?demo` mode, the start screen is shown with demo-appropriate
information (all capture flags off, "Demo mode" notice). The
experimenter clicks **Start Study** to begin.

This screen is part of the application runtime, not the study JSON
config. You do not need to configure it per study.

### Confusing demo mode and full local mode

| | Demo mode (`?demo`) | Full local mode |
|-| -------------------- | --------------- |
| Config source | `frontend/public/demo-config.json` | Backend API (`/api/studies/{id}`) |
| Backend required | No | Yes |
| Study folder used | Not directly — uses static snapshot | Yes — reads `study/{id}/` |
| Validation | None (static file) | Full Pydantic validation |
| Telemetry | Disabled | Active |

If you are developing a new study, use **full local mode** (backend +
frontend, no `?demo`). Demo mode is for public sharing of the default
demo study only.

### Using a condition name the frontend does not know

The frontend currently recognizes `"gazeaware"` as the trigger for gaze
FSM behavior. If you name your condition `"gaze_aware"` or
`"experimental"`, the avatar will behave as baseline (no gaze
awareness). This is not a validation error — it will load fine but
behave differently than expected.

### Empty questions list in prompts.json

The `questions` array in `prompts.json` must have at least one entry.
An empty array will fail backend validation.

## 7. Recommended workflow

### Quick validation (no backend required)

Run the validation script from the project root:

```bash
python scripts/validate_study.py study/your-study
```

This runs the same schema and cross-reference checks as the backend API,
plus additional advisory warnings for common mistakes (ID/folder
mismatch, duplicate step IDs, unknown condition names, missing avatar
files). Requires the backend Python dependencies (`pip install -e ".[dev]"`
in `backend/`).

- Exit code 0 — all checks passed (warnings may still be printed)
- Exit code 1 — validation errors found
- Exit code 2 — usage error (bad path)

### Full test: Edit → Validate → Run → Click

1. **Edit** your JSON files in `study/your-study/`
2. **Validate** without starting the server:
   ```bash
   python scripts/validate_study.py study/your-study
   ```
3. **Start the backend** (optional — for full integration test):
   ```bash
   cd backend
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
4. **Test the API** to confirm the backend serves the config:
   ```bash
   curl http://localhost:8000/api/studies/your-study
   ```
   - Success: returns the full merged config as JSON
   - Failure: returns a 404 with specific error details
5. **Start the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```
6. **Walk through the study** in the browser at `http://localhost:5173`
   — click through every step and verify:
   - All text displays correctly
   - Avatar loads (no placeholder fallback)
   - Questionnaires show the right items
   - Conversation step behaves as expected (voice or fallback)
   - No console errors

### Checklist before considering a study ready

- [ ] `study.json` `id` matches folder name
- [ ] All `questionnaire_id` references in `flow.json` exist in
      `questionnaires.json`
- [ ] All `condition` values in flow steps exist in `study.json`
      `conditions`
- [ ] All `model_file` values in `avatars.json` have corresponding files
      in `frontend/public/avatars/`
- [ ] Every step `id` in `flow.json` is unique
- [ ] `prompts.json` `questions` has at least one entry
- [ ] `curl /api/studies/your-study` returns 200 with valid JSON
- [ ] Full click-through in the browser works without errors

## Further reading

- [Architecture](ARCHITECTURE.md) — system overview and module
  boundaries
- [Third-Party Assets](THIRD_PARTY_ASSETS.md) — what is included,
  what you must provide
- [Troubleshooting](TROUBLESHOOTING.md) — common runtime issues and
  solutions
