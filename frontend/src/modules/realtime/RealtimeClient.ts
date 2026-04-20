/**
 * Minimal WebRTC client for OpenAI Realtime via the backend SDP relay.
 *
 * Flow:
 *  1. getUserMedia (mic)
 *  2. RTCPeerConnection + DataChannel("oai-events")
 *  3. createOffer → setLocalDescription
 *  4. POST /api/realtime/session { sdp_offer, session_id, study_id?, condition? }
 *  5. setRemoteDescription with sdp_answer
 *  6. Audio flows: mic → OpenAI, OpenAI → HTMLAudioElement
 *
 * The client does NOT send session.update — all session configuration
 * (model, voice, instructions, turn_detection) is handled server-side
 * during the SDP relay. It does send response.create via DataChannel
 * to trigger the assistant's first turn (optionally deferred via
 * waitForReady).
 * study_id and condition are passed so the backend can select the right
 * study-specific instructions from StudyConfig.
 *
 * No API key in the frontend. No model/voice/instructions overrides.
 */

import {
  parseSdpAnswer,
  parseErrorDetail,
} from "../../shared/apiParse.js";
import { apiBase } from "../../shared/apiBase.js";

export type RealtimeState = "idle" | "connecting" | "connected" | "error";

export interface TranscriptEvent {
  role: "user" | "assistant";
  transcript: string;
  item_id: string | null;
}

export interface SpeakingEvent {
  role: "user" | "assistant";
  speaking: boolean;
}

export interface RealtimeClientOptions {
  sessionId: string;
  studyId?: string;
  condition?: string;
  stepId?: string;
  avatarVoice?: string;
  /** When true, send response.create via DataChannel once open to trigger the assistant's first turn. */
  triggerFirstResponse?: boolean;
  /** When true, defer response.create until signalReady() is called (e.g. after avatar load). */
  waitForReady?: boolean;
  onStateChange?: (state: RealtimeState) => void;
  onTranscript?: (event: TranscriptEvent) => void;
  onSpeakingChange?: (event: SpeakingEvent) => void;
  onRemoteStream?: (stream: MediaStream) => void;
}

export class RealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private _state: RealtimeState = "idle";
  private readonly sessionId: string;
  private readonly studyId?: string;
  private readonly condition?: string;
  private readonly stepId?: string;
  private readonly avatarVoice?: string;
  private readonly onStateChange?: (state: RealtimeState) => void;
  private readonly onTranscript?: (event: TranscriptEvent) => void;
  private readonly onSpeakingChange?: (event: SpeakingEvent) => void;
  private readonly onRemoteStream?: (stream: MediaStream) => void;
  private assistantSpeaking = false;
  private readonly shouldTriggerFirstResponse: boolean;
  private readonly waitForReady: boolean;
  private pendingFirstResponse = false;
  private readySignaled = false;

  constructor(opts: RealtimeClientOptions) {
    this.sessionId = opts.sessionId;
    this.studyId = opts.studyId;
    this.condition = opts.condition;
    this.stepId = opts.stepId;
    this.avatarVoice = opts.avatarVoice;
    this.shouldTriggerFirstResponse = opts.triggerFirstResponse ?? false;
    this.waitForReady = opts.waitForReady ?? false;
    this.onStateChange = opts.onStateChange;
    this.onTranscript = opts.onTranscript;
    this.onSpeakingChange = opts.onSpeakingChange;
    this.onRemoteStream = opts.onRemoteStream;
  }

  get state(): RealtimeState {
    return this._state;
  }

  /** Start the WebRTC connection via the backend SDP relay. Requests mic. */
  async connect(): Promise<void> {
    if (this._state === "connecting" || this._state === "connected") return;
    this.pendingFirstResponse = this.shouldTriggerFirstResponse;
    this.setState("connecting");

    try {
      // 1. Microphone access — requested when connect() runs (may be
      //    triggered automatically on step entry or manually via start button)
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // 2. Peer connection
      this.pc = new RTCPeerConnection();

      // 3. Add local audio tracks
      for (const track of this.localStream.getTracks()) {
        this.pc.addTrack(track, this.localStream);
      }

      // 4. Detect ICE/DTLS failures that DataChannel events may miss
      this.pc.onconnectionstatechange = () => {
        const s = this.pc?.connectionState;
        if (s === "failed" || s === "disconnected") {
          this.cleanup();
          this.setState("error");
        }
      };

      // 5. Remote audio playback
      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      this.pc.ontrack = (e) => {
        if (this.audioEl && e.streams[0]) {
          this.audioEl.srcObject = e.streams[0];
          this.onRemoteStream?.(e.streams[0]);
        }
      };

      // 6. DataChannel — required by the OpenAI Realtime WebRTC protocol.
      //    The client sends response.create to trigger the assistant's
      //    first turn; all other configuration is handled server-side.
      this.dc = this.pc.createDataChannel("oai-events");
      this.wireDataChannel();

      // 7. Create SDP offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // 8. POST to backend relay (never direct to OpenAI)
      const reqBody: Record<string, string> = {
        sdp_offer: offer.sdp!,
        session_id: this.sessionId,
      };
      if (this.studyId) reqBody.study_id = this.studyId;
      if (this.condition) reqBody.condition = this.condition;
      if (this.stepId) reqBody.step_id = this.stepId;
      if (this.avatarVoice) reqBody.avatar_voice = this.avatarVoice;

      const res = await fetch(`${apiBase()}/api/realtime/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          parseErrorDetail(body, `HTTP ${res.status}`),
        );
      }

      const sdp_answer = parseSdpAnswer(await res.json());

      // 9. Set remote description — WebRTC connection established
      await this.pc.setRemoteDescription({ type: "answer", sdp: sdp_answer });

      this.setState("connected");
    } catch (err) {
      console.error("[RealtimeClient] connect failed:", err);
      this.cleanup();
      this.setState("error");
    }
  }

  /** Disconnect and release all resources. Idempotent. */
  disconnect(): void {
    this.cleanup();
    if (this._state !== "idle") {
      this.setState("idle");
    }
  }

  /**
   * Signal that the external dependency (e.g. avatar) is ready.
   * When waitForReady is true, response.create is deferred until this is called.
   */
  signalReady(): void {
    this.readySignaled = true;
    if (this.pendingFirstResponse && this.dc?.readyState === "open") {
      this.pendingFirstResponse = false;
      this.sendResponseCreate();
    }
  }

  // --- internals ---

  /** Wire DataChannel events for error/close detection and transcript capture. */
  private wireDataChannel(): void {
    if (!this.dc) return;

    this.dc.onopen = () => {
      if (this.pendingFirstResponse) {
        if (!this.waitForReady || this.readySignaled) {
          this.pendingFirstResponse = false;
          this.sendResponseCreate();
        }
      }
    };

    this.dc.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);

        // Transcript capture (research mode only — callback is null otherwise)
        if (this.onTranscript) {
          if (msg.type === "response.audio_transcript.done") {
            this.onTranscript({
              role: "assistant",
              transcript: msg.transcript ?? "",
              item_id: msg.item_id ?? null,
            });
          } else if (
            msg.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            this.onTranscript({
              role: "user",
              transcript: msg.transcript ?? "",
              item_id: msg.item_id ?? null,
            });
          }
        }

        // Speaking state detection (T35b)
        if (this.onSpeakingChange) {
          if (msg.type === "input_audio_buffer.speech_started") {
            this.onSpeakingChange({ role: "user", speaking: true });
          } else if (msg.type === "input_audio_buffer.speech_stopped") {
            this.onSpeakingChange({ role: "user", speaking: false });
          } else if (msg.type === "response.created" && !this.assistantSpeaking) {
            this.assistantSpeaking = true;
            this.onSpeakingChange({ role: "assistant", speaking: true });
          } else if (msg.type === "response.done" && this.assistantSpeaking) {
            this.assistantSpeaking = false;
            this.onSpeakingChange({ role: "assistant", speaking: false });
          }
        }
      } catch {
        // ignore non-JSON or malformed DataChannel messages
      }
    };

    this.dc.onerror = () => {
      if (this._state === "connected" || this._state === "connecting") {
        this.cleanup();
        this.setState("error");
      }
    };

    this.dc.onclose = () => {
      if (this._state === "connected") {
        this.cleanup();
        this.setState("idle");
      }
    };
  }

  /**
   * Send a response.create event via the DataChannel to trigger the
   * assistant's first turn. No prompt/instructions are sent — the model
   * uses its server-configured instructions.
   */
  private sendResponseCreate(): void {
    if (!this.dc || this.dc.readyState !== "open") return;
    try {
      this.dc.send(JSON.stringify({ type: "response.create", response: {} }));
    } catch {
      console.warn("[RealtimeClient] failed to send response.create");
    }
  }

  private cleanup(): void {
    this.assistantSpeaking = false;
    if (this.dc) {
      try {
        this.dc.close();
      } catch {
        /* already closed */
      }
      this.dc = null;
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
  }

  private setState(state: RealtimeState): void {
    if (this._state === state) return;
    this._state = state;
    this.onStateChange?.(state);
  }
}
