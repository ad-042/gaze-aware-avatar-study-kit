import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BackendGazeProvider } from "../src/modules/gaze/BackendGazeProvider.js";

// ---------------------------------------------------------------------------
// Minimal WebSocket mock — enough to drive the transport state machine.
// ---------------------------------------------------------------------------

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  // --- test helpers ---

  /** Simulate successful connection. */
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  /** Simulate connection close. */
  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    // JSDOM doesn't have CloseEvent — use Event (the handler doesn't inspect it)
    this.onclose?.(new Event("close") as CloseEvent);
  }

  /** Simulate incoming message. */
  simulateMessage(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  /** Simulate error (fires onerror then onclose, like real browsers). */
  simulateError(): void {
    this.onerror?.(new Event("error"));
    this.simulateClose();
  }
}

// -- Helpers to read private fields --

/* eslint-disable @typescript-eslint/no-explicit-any */
const priv = (p: BackendGazeProvider) => p as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BackendGazeProvider transport state", () => {
  let instances: MockWebSocket[];

  beforeEach(() => {
    vi.useFakeTimers();
    instances = [];
    vi.stubGlobal("WebSocket", class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        instances.push(this);
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function create(): BackendGazeProvider {
    return new BackendGazeProvider("http://127.0.0.1:8000");
  }

  // -- start / WS connect --------------------------------------------------

  it("transitions idle -> connecting -> ws on successful connect", () => {
    const p = create();
    expect(priv(p).transport).toBe("idle");

    p.start();
    expect(priv(p).transport).toBe("connecting");
    expect(instances).toHaveLength(1);

    instances[0].simulateOpen();
    expect(priv(p).transport).toBe("ws");
  });

  it("transitions connecting -> polling when initial WS fails", () => {
    const p = create();
    p.start();
    expect(priv(p).transport).toBe("connecting");

    instances[0].simulateError();
    expect(priv(p).transport).toBe("polling");
    expect(priv(p).timer).not.toBeNull();
    expect(priv(p).reconnectTimer).not.toBeNull();
  });

  // -- WS message handling --------------------------------------------------

  it("updates current and lastValid on WS message", () => {
    const p = create();
    p.start();
    instances[0].simulateOpen();

    instances[0].simulateMessage({ x: 0.5, y: 0.3, valid: true });
    expect(p.current).toEqual({ x: 0.5, y: 0.3 });
    expect(p.lastValid).toBe(true);

    instances[0].simulateMessage({ x: null, y: null, valid: false });
    expect(p.lastValid).toBe(false);
  });

  // -- WS drop -> polling fallback ------------------------------------------

  it("falls back to polling when WS drops mid-session", () => {
    const p = create();
    p.start();
    instances[0].simulateOpen();
    expect(priv(p).transport).toBe("ws");

    instances[0].simulateClose();
    expect(priv(p).transport).toBe("polling");
    expect(priv(p).timer).not.toBeNull();
  });

  // -- Reconnect loop -------------------------------------------------------

  it("retries WS after 3s reconnect interval", () => {
    const p = create();
    p.start();
    instances[0].simulateError(); // fails immediately -> polling
    expect(instances).toHaveLength(1);

    vi.advanceTimersByTime(3000);
    expect(instances).toHaveLength(2); // reconnect attempt
    expect(priv(p).transport).toBe("connecting");
  });

  it("switches back to WS on successful reconnect", () => {
    const p = create();
    p.start();
    instances[0].simulateError(); // -> polling
    expect(priv(p).timer).not.toBeNull();

    vi.advanceTimersByTime(3000);
    instances[1].simulateOpen(); // reconnect succeeds
    expect(priv(p).transport).toBe("ws");
    expect(priv(p).timer).toBeNull(); // polling stopped
    expect(priv(p).reconnectTimer).toBeNull();
  });

  it("keeps retrying on repeated reconnect failures", () => {
    const p = create();
    p.start();
    instances[0].simulateError(); // -> polling

    // First reconnect fails
    vi.advanceTimersByTime(3000);
    expect(instances).toHaveLength(2);
    instances[1].simulateError();
    expect(priv(p).transport).toBe("polling");

    // Second reconnect fails
    vi.advanceTimersByTime(3000);
    expect(instances).toHaveLength(3);
    instances[2].simulateError();
    expect(priv(p).transport).toBe("polling");

    // Third reconnect succeeds
    vi.advanceTimersByTime(3000);
    expect(instances).toHaveLength(4);
    instances[3].simulateOpen();
    expect(priv(p).transport).toBe("ws");
  });

  // -- Stale socket guard ---------------------------------------------------

  it("ignores onopen from a stale socket after reconnect", () => {
    const p = create();
    p.start();
    const staleSocket = instances[0];
    staleSocket.simulateError(); // -> polling

    vi.advanceTimersByTime(3000);
    const newSocket = instances[1];
    newSocket.simulateOpen(); // -> ws
    expect(priv(p).transport).toBe("ws");

    // Stale socket fires onopen late — should be ignored
    staleSocket.simulateOpen();
    expect(priv(p).transport).toBe("ws");
    expect(priv(p).ws).toBe(newSocket);
  });

  it("ignores onmessage from a stale socket", () => {
    const p = create();
    p.start();
    const staleSocket = instances[0];
    staleSocket.simulateOpen();
    staleSocket.simulateMessage({ x: 0.1, y: 0.2, valid: true });
    expect(p.current).toEqual({ x: 0.1, y: 0.2 });

    // WS drops, reconnect
    staleSocket.simulateClose();
    vi.advanceTimersByTime(3000);
    instances[1].simulateOpen();

    // Stale socket message — should be ignored
    staleSocket.simulateMessage({ x: 0.9, y: 0.9, valid: true });
    expect(p.current).toEqual({ x: 0.1, y: 0.2 }); // unchanged
  });

  it("ignores onclose from a stale socket", () => {
    const p = create();
    p.start();
    const staleSocket = instances[0];
    staleSocket.simulateError(); // -> polling

    vi.advanceTimersByTime(3000);
    instances[1].simulateOpen(); // -> ws
    expect(priv(p).transport).toBe("ws");

    // Stale socket fires onclose again — should NOT trigger fallback
    staleSocket.simulateClose();
    expect(priv(p).transport).toBe("ws");
  });

  // -- stop() cleanup -------------------------------------------------------

  it("cleans up all state on stop()", () => {
    const p = create();
    p.start();
    instances[0].simulateOpen();
    instances[0].simulateMessage({ x: 0.5, y: 0.5, valid: true });
    expect(p.lastValid).toBe(true);

    p.stop();
    expect(priv(p).transport).toBe("idle");
    expect(priv(p).ws).toBeNull();
    expect(priv(p).timer).toBeNull();
    expect(priv(p).staleTimer).toBeNull();
    expect(priv(p).reconnectTimer).toBeNull();
    expect(p.lastValid).toBe(false);
  });

  it("cleans up polling + reconnect timers on stop()", () => {
    const p = create();
    p.start();
    instances[0].simulateError(); // -> polling with reconnect
    expect(priv(p).timer).not.toBeNull();
    expect(priv(p).reconnectTimer).not.toBeNull();

    p.stop();
    expect(priv(p).timer).toBeNull();
    expect(priv(p).reconnectTimer).toBeNull();

    // Advancing timers should NOT create new WS instances
    vi.advanceTimersByTime(5000);
    expect(instances).toHaveLength(1);
  });

  it("onclose after stop() does not trigger fallback", () => {
    const p = create();
    p.start();
    const sock = instances[0];
    sock.simulateOpen();

    p.stop();
    sock.simulateClose();
    expect(priv(p).transport).toBe("idle");
    expect(priv(p).timer).toBeNull();
  });

  // -- Stale safety timer ---------------------------------------------------

  it("sets lastValid to false after 500ms without WS message", () => {
    const p = create();
    p.start();
    instances[0].simulateOpen();
    instances[0].simulateMessage({ x: 0.5, y: 0.5, valid: true });
    expect(p.lastValid).toBe(true);

    vi.advanceTimersByTime(499);
    expect(p.lastValid).toBe(true);

    vi.advanceTimersByTime(1);
    expect(p.lastValid).toBe(false);
  });

  it("resets stale timer on each WS message", () => {
    const p = create();
    p.start();
    instances[0].simulateOpen();
    instances[0].simulateMessage({ x: 0.1, y: 0.1, valid: true });

    vi.advanceTimersByTime(400);
    instances[0].simulateMessage({ x: 0.2, y: 0.2, valid: true });

    // 400ms after second message — should still be valid
    vi.advanceTimersByTime(400);
    expect(p.lastValid).toBe(true);

    // 100ms more (500ms total since last message) — stale
    vi.advanceTimersByTime(100);
    expect(p.lastValid).toBe(false);
  });

  // -- WS constructor failure -----------------------------------------------

  it("falls back to polling when WS constructor throws", () => {
    const p = create();

    // Replace global WebSocket with one that throws
    vi.stubGlobal("WebSocket", class {
      constructor() { throw new Error("SecurityError"); }
    });

    p.start();
    expect(priv(p).transport).toBe("polling");
    expect(priv(p).timer).not.toBeNull();
    expect(priv(p).reconnectTimer).not.toBeNull();
  });
});
