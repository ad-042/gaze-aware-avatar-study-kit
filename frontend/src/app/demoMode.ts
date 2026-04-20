/**
 * Public browser demo mode.
 *
 * Activated by adding `?demo` to the URL (e.g. http://localhost:5173/?demo).
 * In demo mode the frontend runs without a Python backend:
 *   - RuntimeInfo is static (realtime + tobii disabled)
 *   - StudyConfig is loaded from a static JSON file
 *   - Session ID is a local UUID
 *   - Telemetry is disabled (no network calls)
 */

import type { RuntimeInfo, StudyConfig } from "../shared/types.js";
import { parseStudyConfig } from "../shared/apiParse.js";

/** Returns true when the app should run in backend-free demo mode. */
export function isDemoMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("demo");
}

/** Static runtime info for demo mode — all optional features disabled. */
export function demoRuntime(): RuntimeInfo {
  return {
    env: "demo",
    log_mode: "default",
    capabilities: {
      openai_realtime_enabled: false,
      tobii_enabled: false,
      tobii_connected: false,
    },
    effective_capture: {
      session_metadata: false,
      questionnaire_answers: false,
      form_answers: false,
      transcripts: false,
      gaze_samples: false,
      gaze_tobii_raw: false,
      speaking_states: false,
      operator_notes_persisted: false,
      audio_sent_to_openai: false,
    },
  };
}

/** Loads the pre-merged study config from a static JSON file. */
export async function fetchDemoStudyConfig(): Promise<StudyConfig> {
  const res = await fetch(`${import.meta.env.BASE_URL}demo-config.json`);
  if (!res.ok) {
    throw new Error(`Failed to load demo config: ${res.status}`);
  }
  return parseStudyConfig(await res.json());
}
