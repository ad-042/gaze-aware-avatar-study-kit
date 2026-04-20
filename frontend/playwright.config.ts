import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/visual",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: "http://localhost:5199",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx vite --port 5199",
    port: 5199,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
