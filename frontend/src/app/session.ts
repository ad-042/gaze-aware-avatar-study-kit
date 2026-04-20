/**
 * Minimal app-session helper.
 * Calls POST /api/app-sessions to obtain a backend-registered session ID.
 */

import type { SessionMetadata } from "../shared/types.js";
import { parseSessionId } from "../shared/apiParse.js";
import { apiBase } from "../shared/apiBase.js";

export async function createAppSession(
  metadata?: SessionMetadata,
): Promise<string> {
  const options: RequestInit = { method: "POST" };
  if (metadata) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(metadata);
  }
  const res = await fetch(`${apiBase()}/api/app-sessions`, options);
  if (!res.ok) {
    throw new Error(`Failed to create app session: ${res.status}`);
  }
  return parseSessionId(await res.json());
}
