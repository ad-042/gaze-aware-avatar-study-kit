#!/usr/bin/env python3
"""Inspect and summarize JSONL session logs.

Usage:
    python scripts/inspect_logs.py data/sample/demo-session-full.jsonl
    python scripts/inspect_logs.py data/logs/a1b2c3d4e5f60001.jsonl

Reads a JSONL log file and prints a human-readable summary:
- session ID(s)
- total event count
- event types with counts
- time span (first -> last timestamp)
- study outcomes (form submissions, questionnaire answers)

No external dependencies required — uses only the Python standard library.

Exit codes:
    0  — success
    1  — file not found or parse error
    2  — usage error
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


def inspect(path: Path) -> int:
    if not path.is_file():
        print(f"ERROR: File not found: {path}")
        return 1

    events: list[dict] = []
    parse_errors = 0

    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError as exc:
            print(f"WARNING: Line {lineno}: invalid JSON — {exc}")
            parse_errors += 1

    if not events and parse_errors == 0:
        print(f"File is empty: {path.name}")
        return 0

    if not events:
        print(f"ERROR: No valid events in {path.name} ({parse_errors} parse errors)")
        return 1

    # --- Gather stats ---
    session_ids = sorted(set(ev.get("session_id", "?") for ev in events))
    type_counts = Counter(ev.get("event_type", "unknown") for ev in events)
    timestamps = [ev.get("timestamp", "") for ev in events if ev.get("timestamp")]

    first_ts = min(timestamps) if timestamps else "?"
    last_ts = max(timestamps) if timestamps else "?"

    # --- Print summary ---
    print(f"File:       {path.name}")
    print(f"Events:     {len(events)}")
    if parse_errors:
        print(f"Parse errs: {parse_errors}")
    print(f"Session(s): {', '.join(session_ids)}")
    print(f"Time span:  {first_ts}  ->  {last_ts}")
    print()
    print("Event types:")
    for event_type, count in type_counts.most_common():
        print(f"  {event_type:40s} {count:>4}")

    # --- Step sequence (if study.step_entered events exist) ---
    steps = [
        ev.get("data", {})
        for ev in events
        if ev.get("event_type") == "study.step_entered" and ev.get("data")
    ]
    if steps:
        print()
        print("Step sequence:")
        for s in steps:
            cond = s.get("condition")
            cond_str = f"  ({cond})" if cond else ""
            print(f"  [{s.get('step_index', '?')}] {s.get('step_id', '?')} ({s.get('step_type', '?')}){cond_str}")

    # --- Log mode ---
    session_started = [
        ev for ev in events if ev.get("event_type") == "session.started"
    ]
    if session_started:
        mode = session_started[0].get("data", {}).get("log_mode", "?")
        print(f"\nLog mode:   {mode}")

    # --- Study assignment (research mode) ---
    assignments = [
        ev for ev in events if ev.get("event_type") == "study.assignment_recorded"
    ]
    if assignments:
        data = assignments[0].get("data", {})
        print()
        print("Study assignment:")
        print(f"  study_id:    {data.get('study_id', '?')}")
        print(f"  study_mode:  {data.get('study_mode', '?')}")
        print(f"  seed:        {data.get('seed', '?')}")
        print(f"  cond. order: {data.get('condition_order', [])}")
        print(f"  q/condition: {data.get('questions_per_condition', '?')}")
        rounds = data.get("rounds", [])
        if rounds:
            for r in rounds:
                if isinstance(r, dict):
                    print(f"    round {r.get('round_index', '?')}: {r.get('condition', '?')} ({r.get('step_id', '?')}) -> {r.get('question_ids', [])}")
        # Older format fallback
        slices = data.get("question_slices", {})
        if slices and not rounds:
            for cond, info in slices.items():
                if isinstance(info, dict):
                    print(f"    {cond}: questions[{info.get('start')}:{info.get('end')}]")

    # --- Form submissions (research mode) ---
    forms = [
        ev for ev in events if ev.get("event_type") == "study.form_submitted"
    ]
    if forms:
        print()
        print("Form submissions:")
        for f in forms:
            data = f.get("data", {})
            answers = data.get("answers", {})
            fields = ", ".join(f"{k}={v}" for k, v in answers.items())
            print(f"  [{data.get('step_id', '?')}] {fields}")

    # --- Questionnaire submissions (research mode) ---
    questionnaires = [
        ev for ev in events if ev.get("event_type") == "study.questionnaire_submitted"
    ]
    if questionnaires:
        print()
        print("Questionnaire submissions:")
        for q in questionnaires:
            data = q.get("data", {})
            qid = data.get("questionnaire_id", "?")
            step = data.get("step_id", "?")
            cond = data.get("condition")
            answers = data.get("answers", {})
            cond_str = f" ({cond})" if cond else ""
            n_answers = len(answers)
            print(f"  [{step}] {qid}{cond_str}  — {n_answers} answer(s)")

    # --- Conversation transcript turns (research mode) ---
    turns = [
        ev for ev in events if ev.get("event_type") == "conversation.turn"
    ]
    if turns:
        print()
        user_turns = [t for t in turns if t.get("data", {}).get("role") == "user"]
        asst_turns = [t for t in turns if t.get("data", {}).get("role") == "assistant"]
        print(f"Conversation turns: {len(turns)} total ({len(user_turns)} user, {len(asst_turns)} assistant)")
        steps_with_turns = sorted(
            {t.get("data", {}).get("step_id", "?") for t in turns}
        )
        print(f"  Steps with turns: {', '.join(steps_with_turns)}")
        for t in turns[:6]:
            data = t.get("data", {})
            role = data.get("role", "?")
            text = data.get("transcript", "")
            preview = (text[:60] + "...") if len(text) > 60 else text
            print(f"  [{data.get('turn_index', '?')}] {role}: {preview}")
        if len(turns) > 6:
            print(f"  ... ({len(turns) - 6} more)")

    # --- Speaking transitions (research mode) ---
    speaking_events = [
        ev for ev in events if ev.get("event_type") == "conversation.speaking_changed"
    ]
    if speaking_events:
        print()
        user_sp = [e for e in speaking_events if e.get("data", {}).get("role") == "user"]
        asst_sp = [e for e in speaking_events if e.get("data", {}).get("role") == "assistant"]
        print(f"Speaking transitions: {len(speaking_events)} ({len(user_sp)} user, {len(asst_sp)} assistant)")
        steps_with_sp = sorted(
            {e.get("data", {}).get("step_id", "?") for e in speaking_events}
        )
        print(f"  Steps: {', '.join(steps_with_sp)}")

    # --- Gaze samples (research mode) ---
    gaze_samples = [
        ev for ev in events if ev.get("event_type") == "gaze.sample"
    ]
    if gaze_samples:
        print()
        steps_with_samples = sorted(
            {s.get("data", {}).get("step_id", "?") for s in gaze_samples}
        )
        hit_count = sum(
            1 for s in gaze_samples if s.get("data", {}).get("intersecting")
        )
        print(f"Gaze samples: {len(gaze_samples)} (~90 Hz research stream)")
        print(f"  Steps: {', '.join(steps_with_samples)}")
        print(f"  Intersecting: {hit_count}/{len(gaze_samples)}")
        # Avatar lookAt orientation
        yaw_vals = [
            s.get("data", {}).get("avatar_lookat_yaw_deg")
            for s in gaze_samples
            if s.get("data", {}).get("avatar_lookat_yaw_deg") is not None
        ]
        pitch_vals = [
            s.get("data", {}).get("avatar_lookat_pitch_deg")
            for s in gaze_samples
            if s.get("data", {}).get("avatar_lookat_pitch_deg") is not None
        ]
        if yaw_vals:
            print(f"  Avatar lookAt yaw:   min={min(yaw_vals):.2f}  max={max(yaw_vals):.2f}  (deg)")
            print(f"  Avatar lookAt pitch:  min={min(pitch_vals):.2f}  max={max(pitch_vals):.2f}  (deg)")

    # --- Tobii raw samples (research mode, backend high-rate) ---
    tobii_raw = [
        ev for ev in events if ev.get("event_type") == "gaze.tobii_raw"
    ]
    if tobii_raw:
        print()
        steps_with_raw = sorted(
            {s.get("data", {}).get("step_id") or "?" for s in tobii_raw}
        )
        seqs = [s.get("data", {}).get("seq", 0) for s in tobii_raw]
        ts_list = [s.get("timestamp", "") for s in tobii_raw]
        first_ts = min(ts_list) if ts_list else "?"
        last_ts = max(ts_list) if ts_list else "?"
        print(f"Tobii raw samples: {len(tobii_raw)} (backend high-rate)")
        print(f"  Steps: {', '.join(steps_with_raw)}")
        print(f"  Seq range: {min(seqs)}–{max(seqs)}")
        print(f"  Time span: {first_ts} -> {last_ts}")

    # --- Avatar eye contact / mutual gaze (research mode) ---
    eye_contact_events = [
        ev for ev in events if ev.get("event_type") == "gaze.avatar_eye_contact_changed"
    ]
    mutual_gaze_events = [
        ev for ev in events if ev.get("event_type") == "gaze.mutual_gaze_changed"
    ]
    if eye_contact_events or mutual_gaze_events:
        print()
        print(f"Avatar eye contact transitions: {len(eye_contact_events)}")
        ec_on = sum(1 for e in eye_contact_events if e.get("data", {}).get("avatar_eye_contact"))
        print(f"  Onsets (avatar looking at user): {ec_on}")
        print(f"Mutual gaze transitions: {len(mutual_gaze_events)}")
        mg_on = sum(1 for e in mutual_gaze_events if e.get("data", {}).get("mutual_gaze"))
        print(f"  Onsets (both looking at each other): {mg_on}")

    # --- Gaze sources ---
    gaze_sources = sorted(
        {
            ev.get("data", {}).get("gaze_source")
            for ev in events
            if ev.get("event_type") in ("gaze.intersection_changed", "gaze.sample", "gaze.tobii_raw")
            and ev.get("data", {}).get("gaze_source")
        }
    )
    if gaze_sources:
        print()
        print(f"Gaze source(s): {', '.join(gaze_sources)}")

    return 0


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        return 2 if len(sys.argv) < 2 else 0

    exit_code = 0
    for arg in sys.argv[1:]:
        if len(sys.argv) > 2:
            print(f"=== {arg} ===")
        result = inspect(Path(arg))
        if result != 0:
            exit_code = result
        if len(sys.argv) > 2:
            print()

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
