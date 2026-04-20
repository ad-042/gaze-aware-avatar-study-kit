import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_URL || "http://localhost:8000";

  return {
    base: process.env.GITHUB_PAGES ? "/gaze-aware-avatar-study-kit/" : "./",
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          ws: true,
        },
      },
    },
    test: {
      include: ["tests/**/*.test.ts"],
    },
  };
});
