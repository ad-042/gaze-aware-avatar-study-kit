import { ChildProcess, spawn, execSync } from "child_process";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

/** Tracked child processes — only these get killed on quit. */
const children: ChildProcess[] = [];

// ---------------------------------------------------------------------------
// Backend — dev mode (Python venv)
// ---------------------------------------------------------------------------

/**
 * Resolve the Python executable path.
 * Priority: BACKEND_PYTHON env > platform-specific venv default.
 * Throws if the resolved path does not exist.
 */
function resolvePythonPath(): string {
  if (process.env.BACKEND_PYTHON) {
    const custom = path.resolve(process.env.BACKEND_PYTHON);
    if (!fs.existsSync(custom)) {
      throw new Error(
        `BACKEND_PYTHON is set to "${custom}" but the file does not exist.`,
      );
    }
    return custom;
  }

  const venvPython =
    process.platform === "win32"
      ? path.join(PROJECT_ROOT, "backend", ".venv", "Scripts", "python.exe")
      : path.join(PROJECT_ROOT, "backend", ".venv", "bin", "python");

  if (!fs.existsSync(venvPython)) {
    throw new Error(
      `Python not found at "${venvPython}". ` +
        `Create the venv (python -m venv backend/.venv && pip install -e backend/[dev]) ` +
        `or set BACKEND_PYTHON to a custom path.`,
    );
  }

  return venvPython;
}

/**
 * Spawn the Python backend via venv (dev / desktop-prod unpackaged).
 */
function startDevBackend(host: string, port: number): ChildProcess {
  const venvPython = resolvePythonPath();

  const proc = spawn(
    venvPython,
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--host",
      host,
      "--port",
      String(port),
    ],
    {
      cwd: path.join(PROJECT_ROOT, "backend"),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  pipeBackendOutput(proc);
  children.push(proc);
  return proc;
}

// ---------------------------------------------------------------------------
// Backend — packaged mode (PyInstaller backend.exe)
// ---------------------------------------------------------------------------

/**
 * Spawn the bundled backend executable in packaged mode.
 *
 * Key contracts:
 * - APP_HOST / APP_PORT are forced to 127.0.0.1:8000 so the frontend's
 *   file:// → http://127.0.0.1:8000 detection always matches.
 * - DATA_DIR / LOG_DIR point to the writable Electron userData directory.
 * - STUDY_DIR points to the read-only bundled study files in resources/.
 * - CWD is set to the app's root directory (next to the exe) so an
 *   optional .env file placed there is loaded by pydantic-settings.
 *   This is more practical for lab setups than hiding it in AppData.
 * - windowsHide prevents an extra console window in the release build.
 */
function startPackagedBackend(host: string, port: number): ChildProcess {
  const backendExe = path.join(
    process.resourcesPath,
    "backend",
    "backend.exe",
  );

  if (!fs.existsSync(backendExe)) {
    throw new Error(
      `Packaged backend not found at "${backendExe}". The release build may be incomplete.`,
    );
  }

  // Writable runtime data goes to Electron userData (always writable).
  const userDataDir = app.getPath("userData");
  fs.mkdirSync(userDataDir, { recursive: true });

  const dataDir = path.join(userDataDir, "data");
  const logDir = path.join(dataDir, "logs");
  const studyDir = path.join(process.resourcesPath, "study");

  // CWD = app root directory (parent of resources/).
  // .env is loaded from CWD by pydantic-settings, so placing it next
  // to the exe makes it easy to find for lab operators.
  const appRootDir = path.resolve(process.resourcesPath, "..");

  const proc = spawn(backendExe, [], {
    cwd: appRootDir,
    env: {
      ...process.env,
      APP_HOST: host,
      APP_PORT: String(port),
      DATA_DIR: dataDir,
      LOG_DIR: logDir,
      STUDY_DIR: studyDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  pipeBackendOutput(proc);
  children.push(proc);

  console.log(`[electron] Packaged backend: ${backendExe}`);
  console.log(`[electron] User data dir: ${userDataDir}`);

  return proc;
}

// ---------------------------------------------------------------------------
// Backend — public entry point
// ---------------------------------------------------------------------------

/**
 * Spawn the backend process.
 * In packaged mode: launches the bundled backend.exe.
 * In dev / desktop-prod: launches Python via venv.
 */
export function startBackend(host: string, port: number): ChildProcess {
  if (app.isPackaged) {
    return startPackagedBackend(host, port);
  }
  return startDevBackend(host, port);
}

/** Pipe child stdout/stderr to the Electron console with [backend] prefix. */
function pipeBackendOutput(proc: ChildProcess): void {
  proc.stdout?.on("data", (data: Buffer) => {
    console.log(`[backend] ${data.toString().trimEnd()}`);
  });
  proc.stderr?.on("data", (data: Buffer) => {
    console.error(`[backend] ${data.toString().trimEnd()}`);
  });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Poll GET /api/health until it returns 200 or we exceed maxAttempts.
 */
export function waitForBackend(
  host: string,
  port: number,
  intervalMs = 500,
  maxAttempts = 30,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const poll = () => {
      attempts++;
      const req = http.get(
        `http://${host}:${port}/api/health`,
        (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else if (attempts < maxAttempts) {
            setTimeout(poll, intervalMs);
          } else {
            reject(new Error(`Backend not ready after ${maxAttempts} attempts`));
          }
        },
      );

      req.on("error", () => {
        if (attempts < maxAttempts) {
          setTimeout(poll, intervalMs);
        } else {
          reject(new Error(`Backend unreachable after ${maxAttempts} attempts`));
        }
      });

      req.end();
    };

    poll();
  });
}

// ---------------------------------------------------------------------------
// TobiiStream (optional)
// ---------------------------------------------------------------------------

/**
 * Optionally spawn TobiiStream.exe if TOBIISTREAM_PATH is set and the file exists.
 * Returns true if spawned, false if skipped.
 * Never throws — a missing or failing TobiiStream must not crash the app.
 */
export function startTobiiStream(): boolean {
  const tobiiPath = process.env.TOBIISTREAM_PATH;
  if (!tobiiPath) {
    console.log("[tobii] TOBIISTREAM_PATH not set — skipping TobiiStream.");
    return false;
  }

  const resolved = path.resolve(tobiiPath);
  if (!fs.existsSync(resolved)) {
    console.warn(
      `[tobii] TobiiStream not found at "${resolved}" — skipping.`,
    );
    return false;
  }

  if (process.platform !== "win32") {
    console.warn("[tobii] TobiiStream is Windows-only — skipping.");
    return false;
  }

  try {
    const proc = spawn(resolved, ["--no-wait"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    });

    proc.stdout?.on("data", (data: Buffer) => {
      console.log(`[tobii] ${data.toString().trimEnd()}`);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[tobii] ${data.toString().trimEnd()}`);
    });
    proc.on("error", (err) => {
      console.error(`[tobii] Failed to start TobiiStream: ${err.message}`);
    });
    proc.on("close", (code) => {
      console.log(`[tobii] TobiiStream exited with code ${code}`);
    });

    children.push(proc);
    console.log(`[tobii] TobiiStream started from "${resolved}".`);
    return true;
  } catch (err) {
    console.error(`[tobii] Exception launching TobiiStream: ${err}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Kill only the child processes we spawned.
 * No global taskkill, no system-wide process destruction.
 *
 * On Windows, SIGTERM doesn't reliably kill child trees,
 * so we use `taskkill /pid /t /f` targeting only our own PID.
 */
export function killOwnProcesses(): void {
  for (const child of children) {
    if (!child.killed && child.pid != null) {
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: "ignore" });
        } else {
          child.kill();
        }
      } catch {
        // Process may already be gone — that's fine.
      }
    }
  }
  children.length = 0;
}
