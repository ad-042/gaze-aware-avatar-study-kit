/**
 * Returns the base URL prefix for backend API calls.
 *
 * - Browser (Vite dev / preview): empty string — the Vite proxy or
 *   same-origin serves /api/*.
 * - Desktop prod (file://): absolute URL to the local backend so that
 *   fetch("/api/...") works without a dev server.
 */

let _cached: string | undefined;

export function apiBase(): string {
  if (_cached === undefined) {
    _cached =
      window.location.protocol === "file:"
        ? "http://127.0.0.1:8000"
        : "";
  }
  return _cached;
}
