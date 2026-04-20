import { describe, it, expect } from "vitest";
import {
  parseRuntimeInfo,
  parseSessionId,
  parseStudyConfig,
  parseSdpAnswer,
  parseErrorDetail,
} from "../src/shared/apiParse.js";

describe("parseRuntimeInfo", () => {
  it("accepts valid runtime data", () => {
    const result = parseRuntimeInfo({
      env: "development",
      log_mode: "default",
      capabilities: {
        openai_realtime_enabled: true,
        tobii_enabled: false,
        tobii_connected: false,
      },
    });
    expect(result.env).toBe("development");
    expect(result.log_mode).toBe("default");
    expect(result.capabilities.openai_realtime_enabled).toBe(true);
    expect(result.capabilities.tobii_enabled).toBe(false);
    expect(result.capabilities.tobii_connected).toBe(false);
  });

  it("accepts research log mode", () => {
    const result = parseRuntimeInfo({
      env: "development",
      log_mode: "research",
      capabilities: {},
    });
    expect(result.log_mode).toBe("research");
  });

  it("parses research_gaze_sample_hz in research mode", () => {
    const result = parseRuntimeInfo({
      env: "development",
      log_mode: "research",
      research_gaze_sample_hz: 30,
      capabilities: {},
    });
    expect(result.research_gaze_sample_hz).toBe(30);
  });

  it("ignores research_gaze_sample_hz in default mode", () => {
    const result = parseRuntimeInfo({
      env: "development",
      log_mode: "default",
      research_gaze_sample_hz: 30,
      capabilities: {},
    });
    expect(result.research_gaze_sample_hz).toBeUndefined();
  });

  it("defaults log_mode to default when missing", () => {
    const result = parseRuntimeInfo({
      env: "test",
      capabilities: {},
    });
    expect(result.log_mode).toBe("default");
  });

  it("falls back to default for unknown log_mode", () => {
    const result = parseRuntimeInfo({
      env: "test",
      log_mode: "unknown_value",
      capabilities: {},
    });
    expect(result.log_mode).toBe("default");
  });

  it("accepts runtime data with tobii connected", () => {
    const result = parseRuntimeInfo({
      env: "development",
      capabilities: {
        openai_realtime_enabled: false,
        tobii_enabled: true,
        tobii_connected: true,
      },
    });
    expect(result.capabilities.tobii_enabled).toBe(true);
    expect(result.capabilities.tobii_connected).toBe(true);
  });

  it("coerces missing booleans to false", () => {
    const result = parseRuntimeInfo({
      env: "test",
      capabilities: {},
    });
    expect(result.capabilities.openai_realtime_enabled).toBe(false);
    expect(result.capabilities.tobii_enabled).toBe(false);
    expect(result.capabilities.tobii_connected).toBe(false);
  });

  it("parses effective_capture from response", () => {
    const result = parseRuntimeInfo({
      env: "development",
      log_mode: "research",
      capabilities: {},
      effective_capture: {
        session_metadata: true,
        questionnaire_answers: true,
        transcripts: false,
        gaze_samples: true,
        gaze_tobii_raw: false,
        speaking_states: false,
        form_answers: true,
        operator_notes_persisted: true,
        audio_sent_to_openai: false,
      },
    });
    expect(result.effective_capture.session_metadata).toBe(true);
    expect(result.effective_capture.transcripts).toBe(false);
    expect(result.effective_capture.gaze_samples).toBe(true);
    expect(result.effective_capture.audio_sent_to_openai).toBe(false);
  });

  it("defaults effective_capture to all false when absent", () => {
    const result = parseRuntimeInfo({
      env: "test",
      capabilities: {},
    });
    expect(result.effective_capture.session_metadata).toBe(false);
    expect(result.effective_capture.transcripts).toBe(false);
    expect(result.effective_capture.audio_sent_to_openai).toBe(false);
  });

  it("rejects non-object", () => {
    expect(() => parseRuntimeInfo("not an object")).toThrow(
      "expected JSON object",
    );
    expect(() => parseRuntimeInfo(null)).toThrow("expected JSON object");
  });

  it("rejects missing env", () => {
    expect(() =>
      parseRuntimeInfo({ capabilities: {} }),
    ).toThrow('missing field "env"');
  });

  it("rejects missing capabilities", () => {
    expect(() => parseRuntimeInfo({ env: "test" })).toThrow(
      'missing field "capabilities"',
    );
  });

  it("rejects non-object capabilities", () => {
    expect(() =>
      parseRuntimeInfo({ env: "test", capabilities: "nope" }),
    ).toThrow("capabilities is not an object");
  });
});

describe("parseSessionId", () => {
  it("returns session_id from valid response", () => {
    expect(parseSessionId({ session_id: "abc-123" })).toBe("abc-123");
  });

  it("rejects non-object", () => {
    expect(() => parseSessionId(42)).toThrow("expected JSON object");
  });

  it("rejects missing session_id", () => {
    expect(() => parseSessionId({})).toThrow("missing or empty session_id");
  });

  it("rejects empty session_id", () => {
    expect(() => parseSessionId({ session_id: "" })).toThrow(
      "missing or empty session_id",
    );
  });
});

describe("parseStudyConfig", () => {
  const minimal = {
    meta: { id: "test" },
    flow: { steps: [] },
    avatars: { avatars: [] },
    questionnaires: { questionnaires: {} },
    prompts: { quiz: {} },
    gaze_profiles: { profiles: {} },
  };

  it("accepts a minimal valid config", () => {
    const result = parseStudyConfig(minimal);
    expect(result.meta.id).toBe("test");
  });

  it("rejects non-object", () => {
    expect(() => parseStudyConfig([])).toThrow("expected JSON object");
  });

  it("rejects missing top-level field", () => {
    const { meta: _, ...rest } = minimal;
    expect(() => parseStudyConfig(rest)).toThrow('missing field "meta"');
  });

  it("rejects flow without steps array", () => {
    expect(() =>
      parseStudyConfig({ ...minimal, flow: { steps: "nope" } }),
    ).toThrow("flow.steps must be an array");
  });

  it("rejects avatars without avatars array", () => {
    expect(() =>
      parseStudyConfig({ ...minimal, avatars: {} }),
    ).toThrow("avatars.avatars must be an array");
  });
});

describe("parseSdpAnswer", () => {
  it("returns sdp_answer from valid response", () => {
    expect(parseSdpAnswer({ sdp_answer: "v=0\r\n..." })).toBe("v=0\r\n...");
  });

  it("rejects missing sdp_answer", () => {
    expect(() => parseSdpAnswer({})).toThrow("missing or empty sdp_answer");
  });

  it("rejects non-object", () => {
    expect(() => parseSdpAnswer(null)).toThrow("expected JSON object");
  });
});

describe("parseErrorDetail", () => {
  it("extracts detail string", () => {
    expect(parseErrorDetail({ detail: "Not found" }, "fallback")).toBe(
      "Not found",
    );
  });

  it("returns fallback for non-object", () => {
    expect(parseErrorDetail(null, "fallback")).toBe("fallback");
  });

  it("returns fallback when detail is not a string", () => {
    expect(parseErrorDetail({ detail: 123 }, "fallback")).toBe("fallback");
  });

  it("returns fallback when detail is missing", () => {
    expect(parseErrorDetail({}, "fallback")).toBe("fallback");
  });
});
