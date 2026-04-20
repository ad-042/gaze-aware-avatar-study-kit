import * as path from "path";
import { app, dialog, globalShortcut } from "electron";

// Force English locale so native validation messages are in English
app.commandLine.appendSwitch("lang", "en-US");
import {
  startBackend,
  startTobiiStream,
  waitForBackend,
  killOwnProcesses,
} from "./processes";
import { createMainWindow } from "./window";

/** Configurable via env; defaults match backend settings.py */
const BACKEND_HOST = process.env.APP_HOST ?? "127.0.0.1";
const BACKEND_PORT = Number(process.env.APP_PORT ?? 8000);

/**
 * Mode detection:
 * --dev      → dev mode (load Vite dev server URL)
 * --kiosk    → lab/kiosk mode (fullscreen, no chrome, safe exit shortcut)
 * no flag    → desktop prod (load built frontend from disk)
 * isPackaged → packaged release (frontend/study/backend in resources/)
 */
const IS_DEV = process.argv.includes("--dev");
const IS_KIOSK = process.argv.includes("--kiosk");
const IS_PACKAGED = app.isPackaged;

/**
 * Frontend source:
 * - dev: Vite dev-server (default 5173)
 * - packaged: built frontend inside resources/frontend/dist/
 * - desktop-prod / kiosk (unpackaged): file path relative to project root
 */
function resolveFrontendSource(): string {
  if (IS_DEV) {
    return process.env.FRONTEND_URL ?? "http://localhost:5173";
  }
  if (IS_PACKAGED) {
    return path.join(
      process.resourcesPath,
      "frontend",
      "dist",
      "index.html",
    );
  }
  return path.resolve(__dirname, "..", "..", "frontend", "dist", "index.html");
}

const FRONTEND_SOURCE = resolveFrontendSource();

function modeName(): string {
  if (IS_DEV) return "dev";
  if (IS_PACKAGED && IS_KIOSK) return "packaged-kiosk";
  if (IS_PACKAGED) return "packaged";
  if (IS_KIOSK) return "kiosk";
  return "desktop-prod";
}

app.whenReady().then(async () => {
  console.log(`[electron] Mode: ${modeName()}`);
  console.log("[electron] Starting backend...");
  const backendProc = startBackend(BACKEND_HOST, BACKEND_PORT);

  // Optional: start TobiiStream before backend readiness check.
  // If TOBIISTREAM_PATH is not set or the binary is missing, this is a no-op.
  startTobiiStream();

  // If the backend process exits before we're ready, abort.
  let backendExited = false;
  backendProc.once("exit", (code) => {
    backendExited = true;
    console.error(`[electron] Backend exited early with code ${code}`);
  });

  try {
    await waitForBackend(BACKEND_HOST, BACKEND_PORT);
  } catch (err) {
    const message = backendExited
      ? "Backend process exited before becoming ready."
      : `Backend did not respond to health checks: ${err}`;
    console.error(`[electron] ${message}`);
    dialog.showErrorBox("Backend Start Failed", message);
    app.quit();
    return;
  }

  console.log("[electron] Backend ready — opening window.");
  createMainWindow(FRONTEND_SOURCE, { kiosk: IS_KIOSK });
});

app.on("will-quit", () => {
  console.log("[electron] Shutting down — killing own child processes.");
  globalShortcut.unregisterAll();
  killOwnProcesses();
});

// macOS convention: quit when all windows closed
app.on("window-all-closed", () => {
  app.quit();
});
