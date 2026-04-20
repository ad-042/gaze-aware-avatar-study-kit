/**
 * Conversation provider abstraction.
 *
 * The only active provider is RealtimeClient (voice via backend SDP relay).
 * When realtime is disabled the conversation step shows a static fallback
 * ("Voice chat not available") — no scripted provider is needed yet.
 *
 * This file re-exports RealtimeClient as the default conversation backend
 * so that StudyFlow (and future consumers) can import from a single path.
 */

export { RealtimeClient } from "./RealtimeClient.js";
export type { RealtimeClientOptions, RealtimeState } from "./RealtimeClient.js";
