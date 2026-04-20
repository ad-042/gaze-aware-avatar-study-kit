import { defineConfig } from "@playwright/test";

/**
 * Integration test config — starts both the Python backend and the
 * Vite frontend dev server.  The backend is pinned to a deterministic
 * non-hardware / non-secret configuration via explicit env vars so the
 * tests are stable regardless of ambient machine config.
 */
export default defineConfig({
  testDir: "tests/integration",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:5199",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        "cd ../backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        APP_ENV: "development",
        APP_HOST: "127.0.0.1",
        APP_PORT: "8000",
        LOG_MODE: "default",
        OPENAI_REALTIME_ENABLED: "false",
        OPENAI_API_KEY: "",
        TOBII_ENABLED: "false",
      },
    },
    {
      command: "npx vite --port 5199",
      port: 5199,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
