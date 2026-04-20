/**
 * Thin wrapper around the backend /api/runtime endpoint.
 * Separated from bootstrap.ts so other modules can import fetchRuntime()
 * without pulling in the full app initialisation chain.
 */
import type { RuntimeInfo } from "../shared/types.js";
import { parseRuntimeInfo } from "../shared/apiParse.js";
import { apiBase } from "../shared/apiBase.js";

export type { RuntimeInfo };

export async function fetchRuntime(): Promise<RuntimeInfo> {
  const res = await fetch(`${apiBase()}/api/runtime`);
  if (!res.ok) {
    throw new Error(`Runtime fetch failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Runtime response is not JSON");
  }
  return parseRuntimeInfo(await res.json());
}
