/**
 * Experimenter start screen shown before the study flow begins.
 *
 * Displays study info, runtime/capability status, and collects
 * session metadata (participant_id, trial_id, session_label,
 * operator_notes). Resolves with the metadata when the
 * experimenter confirms.
 *
 * Shown in all modes. In demo mode, displays demo-appropriate
 * information (all capture flags off, "Demo mode" notice).
 */

import type { RuntimeInfo, EffectiveCapture, StudyConfig, SessionMetadata } from "../../shared/types.js";

/** Generates a pseudonymous participant ID: P-YYYYMMDD-xxx */
function generateParticipantId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.floor(Math.random() * 0xfff)
    .toString(16)
    .padStart(3, "0");
  return `P-${date}-${rand}`;
}

function esc(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function capabilityLabel(runtime: RuntimeInfo): string {
  const parts: string[] = [];

  parts.push(
    runtime.capabilities.openai_realtime_enabled
      ? "Realtime: available"
      : "Realtime: unavailable",
  );

  if (runtime.capabilities.tobii_enabled) {
    parts.push(
      runtime.capabilities.tobii_connected
        ? "Eye tracker: available"
        : "Eye tracker: enabled (not connected)",
    );
  } else {
    parts.push("Eye tracker: unavailable");
  }

  return parts.join(" | ");
}

function yesNo(v: boolean): string {
  return v ? "yes" : "no";
}

function captureRecordedHtml(ec: EffectiveCapture, tobiiEnabled: boolean): string {
  const gazeLabel = tobiiEnabled ? "Gaze samples (eye tracker)" : "Gaze samples (mouse)";
  return (
    `<dt>Session metadata</dt><dd>${yesNo(ec.session_metadata)}</dd>` +
    `<dt>Form / questionnaire answers</dt><dd>${yesNo(ec.questionnaire_answers)}</dd>` +
    `<dt>Conversation transcripts</dt><dd>${yesNo(ec.transcripts)}</dd>` +
    `<dt>${gazeLabel}</dt><dd>${yesNo(ec.gaze_samples)}</dd>` +
    `<dt>Tobii raw stream</dt><dd>${yesNo(ec.gaze_tobii_raw)}</dd>` +
    `<dt>Speaking states</dt><dd>${yesNo(ec.speaking_states)}</dd>` +
    `<dt>Operator notes</dt><dd>${yesNo(ec.operator_notes_persisted)}</dd>`
  );
}

function captureProcessingHtml(ec: EffectiveCapture): string {
  return `<dt>Audio sent to OpenAI</dt><dd>${yesNo(ec.audio_sent_to_openai)}</dd>`;
}

export function showExperimentStartScreen(
  container: HTMLElement,
  config: StudyConfig,
  runtime: RuntimeInfo,
): Promise<SessionMetadata> {
  return new Promise((resolve) => {
    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "study-screen experiment-start";

    // --- Title ---
    const h2 = document.createElement("h2");
    h2.textContent = "Experiment Setup";
    wrapper.appendChild(h2);

    // --- Study info ---
    const studySec = document.createElement("div");
    studySec.className = "experiment-section";
    const studyH3 = document.createElement("h3");
    studyH3.textContent = "Study";
    studySec.appendChild(studyH3);

    const dl1 = document.createElement("dl");
    dl1.className = "experiment-dl";
    dl1.innerHTML =
      `<dt>Name</dt><dd>${esc(config.meta.name)}</dd>` +
      `<dt>ID</dt><dd>${esc(config.meta.id)}</dd>` +
      `<dt>Version</dt><dd>${esc(config.meta.version)}</dd>` +
      `<dt>Conditions</dt><dd>${esc(config.meta.conditions.join(", "))}</dd>` +
      `<dt>Design</dt><dd>${esc(config.meta.study_mode.replace(/_/g, "-"))}</dd>`;
    studySec.appendChild(dl1);
    wrapper.appendChild(studySec);

    // --- Runtime ---
    const rtSec = document.createElement("div");
    rtSec.className = "experiment-section";
    const rtH3 = document.createElement("h3");
    rtH3.textContent = "Runtime";
    rtSec.appendChild(rtH3);

    const dl2 = document.createElement("dl");
    dl2.className = "experiment-dl";
    dl2.innerHTML =
      `<dt>Environment</dt><dd>${esc(runtime.env)}</dd>` +
      `<dt>Log mode</dt><dd>${esc(runtime.log_mode)}</dd>` +
      `<dt>Capabilities</dt><dd>${esc(capabilityLabel(runtime))}</dd>`;
    rtSec.appendChild(dl2);
    wrapper.appendChild(rtSec);

    // --- Data capture ---
    const capSec = document.createElement("div");
    capSec.className = "experiment-section";
    const capH3 = document.createElement("h3");
    capH3.textContent = "Data Capture";
    capSec.appendChild(capH3);

    if (runtime.env === "demo") {
      const p = document.createElement("p");
      p.className = "experiment-hint";
      p.innerHTML =
        "This demo runs locally in your browser.<br>" +
        "• No session data is stored.<br>" +
        "• No audio is sent to OpenAI.<br>" +
        "• Mouse input is used instead of eye tracking.";
      capSec.appendChild(p);
    } else {
      const ec = runtime.effective_capture;

      const recLabel = document.createElement("h4");
      recLabel.className = "experiment-sublabel";
      recLabel.textContent = "Recorded";
      capSec.appendChild(recLabel);

      const dl3 = document.createElement("dl");
      dl3.className = "experiment-dl";
      dl3.innerHTML = captureRecordedHtml(ec, runtime.capabilities.tobii_enabled);
      capSec.appendChild(dl3);

      const procLabel = document.createElement("h4");
      procLabel.className = "experiment-sublabel";
      procLabel.textContent = "External processing";
      capSec.appendChild(procLabel);

      const dl4 = document.createElement("dl");
      dl4.className = "experiment-dl";
      dl4.innerHTML = captureProcessingHtml(ec);
      capSec.appendChild(dl4);
    }
    wrapper.appendChild(capSec);

    // --- Session form ---
    const form = document.createElement("form");
    form.className = "experiment-form";

    const sesH3 = document.createElement("h3");
    sesH3.textContent = "Session";
    form.appendChild(sesH3);

    const defaultPid = generateParticipantId();

    const fields: {
      id: string;
      label: string;
      value: string;
      required: boolean;
      textarea?: boolean;
      hint?: string;
    }[] = [
      { id: "participant_id", label: "Participant ID", value: defaultPid, required: true },
      { id: "trial_id", label: "Trial ID", value: "", required: false },
      { id: "session_label", label: "Session label", value: "", required: false },
      {
        id: "operator_notes",
        label: "Operator notes",
        value: "",
        required: false,
        textarea: true,
        hint:
          runtime.env === "demo"
            ? "Not stored in demo mode."
            : runtime.log_mode === "research"
              ? "Stored in the session log (research mode)."
              : "Operator notes are not stored in default mode.",
      },
    ];

    for (const f of fields) {
      const group = document.createElement("div");
      group.className = "study-form-group";

      const label = document.createElement("label");
      label.htmlFor = `exp-${f.id}`;
      label.textContent = f.label;
      if (!f.required) {
        const opt = document.createElement("span");
        opt.className = "experiment-optional";
        opt.textContent = " (optional)";
        label.appendChild(opt);
      }
      group.appendChild(label);

      if (f.textarea) {
        const ta = document.createElement("textarea");
        ta.id = `exp-${f.id}`;
        ta.name = f.id;
        ta.className = "study-textarea";
        ta.rows = 2;
        ta.value = f.value;
        group.appendChild(ta);
      } else {
        const input = document.createElement("input");
        input.id = `exp-${f.id}`;
        input.name = f.id;
        input.type = "text";
        input.value = f.value;
        if (f.required) input.required = true;
        group.appendChild(input);
      }

      if (f.hint) {
        const hint = document.createElement("p");
        hint.className = "experiment-hint";
        hint.textContent = f.hint;
        group.appendChild(hint);
      }

      form.appendChild(group);
    }

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.className = "study-btn";
    btn.textContent = "Start Study";
    form.appendChild(btn);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const metadata: SessionMetadata = {
        participant_id: (fd.get("participant_id") as string) || defaultPid,
      };
      const trialId = fd.get("trial_id") as string;
      if (trialId) metadata.trial_id = trialId;
      const label = fd.get("session_label") as string;
      if (label) metadata.session_label = label;
      const notes = fd.get("operator_notes") as string;
      if (notes) metadata.operator_notes = notes;
      resolve(metadata);
    });

    wrapper.appendChild(form);
    container.appendChild(wrapper);
  });
}
