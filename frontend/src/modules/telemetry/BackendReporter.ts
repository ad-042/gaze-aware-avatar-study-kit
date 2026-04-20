/**
 * Lightweight frontend telemetry reporter.
 *
 * Queues events and sends them in batches to the backend.
 * Events follow a standard format (schema_version, timestamp,
 * session_id, event_type). Failed batches are re-queued for the
 * next flush attempt.
 */

export interface TelemetryEvent {
  schema_version: number;
  timestamp: string;
  session_id: string;
  event_type: string;
  data?: Record<string, unknown>;
}

import { apiBase } from "../../shared/apiBase.js";

export class BackendReporter {
  private queue: TelemetryEvent[] = [];
  private flushTimer: number | null = null;
  private readonly endpoint: string;
  private readonly flushIntervalMs: number;
  private readonly sessionId: string;
  private readonly disabled: boolean;

  constructor(options?: {
    endpoint?: string;
    flushIntervalMs?: number;
    sessionId?: string;
    disabled?: boolean;
  }) {
    this.endpoint = options?.endpoint ?? `${apiBase()}/api/logs`;
    this.flushIntervalMs = options?.flushIntervalMs ?? 5000;
    this.sessionId = options?.sessionId ?? crypto.randomUUID();
    this.disabled = options?.disabled ?? false;
    if (!this.disabled) {
      this.startAutoFlush();
    }
  }

  /** Add an event to the queue. No-op when disabled. */
  emit(eventType: string, data?: Record<string, unknown>): void {
    if (this.disabled) return;
    this.queue.push({
      schema_version: 1,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      event_type: eventType,
      data,
    });
  }

  /** Send all queued events to the backend. */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
      });
      if (!res.ok && res.status !== 404) {
        console.warn(`[BackendReporter] flush failed: ${res.status}`);
        this.queue.unshift(...batch);
      }
    } catch {
      // Network error or backend not running — re-queue for next attempt
      this.queue.unshift(...batch);
    }
  }

  /** Stop auto-flush and attempt a final flush. */
  async destroy(): Promise<void> {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private startAutoFlush(): void {
    this.flushTimer = globalThis.setInterval(
      () => this.flush(),
      this.flushIntervalMs,
    );
  }
}
