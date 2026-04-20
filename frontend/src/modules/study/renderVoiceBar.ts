import type { RuntimeInfo } from "../../shared/types.js";
import {
  RealtimeClient,
  type RealtimeState,
} from "../realtime/RealtimeClient.js";
import type { BackendReporter } from "../telemetry/BackendReporter.js";

/**
 * Renders the voice-bar controls into the given wrapper element.
 *
 * Returns the created RealtimeClient (so the caller can disconnect on cleanup),
 * or null if voice is not available.
 */
export function renderVoiceBar(
  wrapper: HTMLElement,
  runtime: RuntimeInfo,
  sessionId: string,
  reporter: BackendReporter,
  studyId?: string,
  condition?: string,
  stepId?: string,
  avatarVoice?: string,
  hooks?: {
    onRemoteStream?: (stream: MediaStream) => void;
    onDisconnect?: () => void;
    /** Auto-connect and trigger first assistant turn on entry. Falls back to manual button on failure. */
    autoConnect?: boolean;
    /** Defer response.create until the caller signals readiness (e.g. avatar loaded). */
    waitForReady?: boolean;
  },
): RealtimeClient | null {
  const bar = document.createElement("div");
  bar.className = "voice-bar";

  const statusLabel = document.createElement("span");
  statusLabel.className = "voice-status";

  if (!runtime.capabilities.openai_realtime_enabled) {
    statusLabel.textContent = "Voice chat not available";
    bar.appendChild(statusLabel);
    wrapper.appendChild(bar);
    return null;
  }

  statusLabel.textContent = "Voice: idle";
  bar.appendChild(statusLabel);

  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "study-btn voice-btn";
  startBtn.textContent = "Start voice session";

  const stopBtn = document.createElement("button");
  stopBtn.type = "button";
  stopBtn.className = "study-btn voice-btn voice-btn-stop";
  stopBtn.textContent = "Stop voice session";
  stopBtn.style.display = "none";

  let turnIndex = 0;

  const autoConnect = hooks?.autoConnect ?? false;

  const client = new RealtimeClient({
    sessionId,
    studyId,
    condition,
    stepId,
    avatarVoice,
    triggerFirstResponse: autoConnect,
    waitForReady: hooks?.waitForReady ?? false,
    onStateChange: (state: RealtimeState) => {
      statusLabel.textContent = `Voice: ${state}`;
      const isActive = state === "connecting" || state === "connected";
      startBtn.style.display = isActive ? "none" : "";
      stopBtn.style.display = isActive ? "" : "none";
      startBtn.disabled = state === "connecting";
      reporter.emit("realtime.state_changed", { state, condition: condition ?? null });
      if (state === "idle" || state === "error") {
        hooks?.onDisconnect?.();
      }
    },
    onRemoteStream: hooks?.onRemoteStream,
    onTranscript: runtime.log_mode === "research" ? (event) => {
      reporter.emit("conversation.turn", {
        role: event.role,
        transcript: event.transcript,
        item_id: event.item_id,
        condition: condition ?? null,
        step_id: stepId ?? null,
        turn_index: turnIndex++,
      });
    } : undefined,
    onSpeakingChange: runtime.log_mode === "research" ? (event) => {
      reporter.emit("conversation.speaking_changed", {
        role: event.role,
        speaking: event.speaking,
        condition: condition ?? null,
        step_id: stepId ?? null,
      });
    } : undefined,
  });

  startBtn.addEventListener("click", () => {
    client.connect();
  });

  stopBtn.addEventListener("click", () => {
    client.disconnect();
  });

  bar.appendChild(startBtn);
  bar.appendChild(stopBtn);
  wrapper.appendChild(bar);

  if (autoConnect) {
    statusLabel.textContent = "Voice: auto-connecting\u2026";
    startBtn.style.display = "none";
    client.connect();
  }

  return client;
}
