import type { GazePoint, GazeProvider } from "./GazeProvider.js";

type Transport = "idle" | "connecting" | "ws" | "polling";

const WS_RECONNECT_MS = 3000;
const WS_STALE_MS = 500;

/**
 * Gaze source that receives data from the backend Tobii adapter.
 *
 * Primary transport: WebSocket push via ``/api/gaze/stream`` — the
 * backend sends the latest gaze sample whenever the store version
 * changes, providing a denser, lower-latency live stream than HTTP
 * polling.
 *
 * Fallback transport: HTTP polling via ``GET /api/gaze/latest`` at
 * ~30 Hz.  Activated automatically when the WebSocket connection
 * fails or drops.  The provider periodically retries the WebSocket
 * and switches back on success.
 *
 * Falls back gracefully: if the backend is unreachable or returns
 * ``valid: false``, the provider keeps reporting the last known point
 * (or the origin) without throwing.
 */
export class BackendGazeProvider implements GazeProvider {
  private readonly pollUrl: string;
  private readonly wsUrl: string;
  private readonly intervalMs: number;
  private point: GazePoint = { x: 0, y: 0 };
  private _lastValid = false;

  private ws: WebSocket | null = null;
  private transport: Transport = "idle";
  private intentionalClose = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(backendUrl: string, intervalMs = 33 /* ~30 fps */) {
    this.pollUrl = `${backendUrl}/api/gaze/latest`;
    this.wsUrl = BackendGazeProvider.buildWsUrl(backendUrl);
    this.intervalMs = intervalMs;
  }

  get current(): GazePoint {
    return this.point;
  }

  /** Whether the most recent sample (WS or poll) returned valid gaze data. */
  get lastValid(): boolean {
    return this._lastValid;
  }

  start(): void {
    if (this.transport !== "idle") return;
    this.intentionalClose = false;
    this.connectWs();
  }

  stop(): void {
    this.intentionalClose = true;
    this.transport = "idle";
    this._lastValid = false;

    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      ws.close();
    }

    this.clearTimer();
    this.clearStaleTimer();
    this.clearReconnectTimer();
  }

  // -- WebSocket transport ---------------------------------------------------

  private connectWs(): void {
    this.transport = "connecting";

    let sock: WebSocket;
    try {
      sock = new WebSocket(this.wsUrl);
    } catch {
      // Constructor threw (bad URL, security restriction, etc.)
      this.fallbackToPolling();
      return;
    }

    this.ws = sock;

    sock.onopen = () => {
      if (sock !== this.ws) return; // stale socket
      this.transport = "ws";
      this.clearTimer();
      this.clearReconnectTimer();
    };

    sock.onmessage = (e: MessageEvent) => {
      if (sock !== this.ws) return; // stale socket
      try {
        const data = JSON.parse(e.data as string);
        if (data.valid) {
          this.point = { x: data.x, y: data.y };
          this._lastValid = true;
        } else {
          this._lastValid = false;
        }
      } catch {
        // Malformed message — ignore
      }
      this.resetStaleTimer();
    };

    // onerror is intentionally a no-op — onclose always fires after onerror
    // for browser WebSocket, and we handle fallback there.
    sock.onerror = () => {};

    sock.onclose = () => {
      if (sock !== this.ws) return; // stale socket
      if (this.intentionalClose || this.transport === "idle") return;
      this.ws = null;
      this.clearStaleTimer();
      this.fallbackToPolling();
    };
  }

  // -- HTTP polling fallback -------------------------------------------------

  private fallbackToPolling(): void {
    if (this.timer === null) {
      this.timer = setInterval(() => void this.poll(), this.intervalMs);
    }
    this.transport = "polling";
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, WS_RECONNECT_MS);
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch(this.pollUrl);
      if (!res.ok) {
        this._lastValid = false;
        return;
      }
      const data = await res.json();
      if (data.valid) {
        this.point = { x: data.x, y: data.y };
        this._lastValid = true;
      } else {
        this._lastValid = false;
      }
    } catch {
      // Backend unreachable — keep last known point.
      this._lastValid = false;
    }
  }

  // -- Stale safety ----------------------------------------------------------

  private resetStaleTimer(): void {
    this.clearStaleTimer();
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null;
      this._lastValid = false;
    }, WS_STALE_MS);
  }

  // -- Cleanup helpers -------------------------------------------------------

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private clearStaleTimer(): void {
    if (this.staleTimer !== null) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // -- WS URL construction ---------------------------------------------------

  private static buildWsUrl(backendUrl: string): string {
    const base = backendUrl || window.location.origin;
    const url = new URL("/api/gaze/stream", base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.href;
  }
}
