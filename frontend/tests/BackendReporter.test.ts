import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackendReporter } from "../src/modules/telemetry/BackendReporter.js";

describe("BackendReporter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  it("re-queues events when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));

    const reporter = new BackendReporter({ endpoint: "http://test/api/logs", flushIntervalMs: 999_999, sessionId: "test" });
    reporter.emit("test.event", { key: "value" });
    expect(reporter["queue"]).toHaveLength(1);

    await reporter.flush();

    // Events should be back in the queue, not lost
    expect(reporter["queue"]).toHaveLength(1);
    expect(reporter["queue"][0].event_type).toBe("test.event");
  });

  it("re-queues events when backend returns server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const reporter = new BackendReporter({ endpoint: "http://test/api/logs", flushIntervalMs: 999_999, sessionId: "test" });
    reporter.emit("a");
    reporter.emit("b");

    await reporter.flush();

    expect(reporter["queue"]).toHaveLength(2);
  });

  it("clears queue on successful flush", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    const reporter = new BackendReporter({ endpoint: "http://test/api/logs", flushIntervalMs: 999_999, sessionId: "test" });
    reporter.emit("a");

    await reporter.flush();

    expect(reporter["queue"]).toHaveLength(0);
  });

  it("destroy() awaits flush", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const reporter = new BackendReporter({ endpoint: "http://test/api/logs", flushIntervalMs: 999_999, sessionId: "test" });
    reporter.emit("final.event");

    await reporter.destroy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reporter["queue"]).toHaveLength(0);
  });
});
