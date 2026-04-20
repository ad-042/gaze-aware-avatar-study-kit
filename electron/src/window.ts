import { app, BrowserWindow, globalShortcut } from "electron";

export interface WindowOptions {
  /** When true, window opens in kiosk mode (fullscreen, no chrome). */
  kiosk?: boolean;
}

/**
 * Create the main application window.
 * Security: nodeIntegration off, contextIsolation on.
 *
 * @param source — an http(s) URL (dev mode) or a file path (desktop prod).
 * @param opts — optional window behavior overrides.
 */
export function createMainWindow(
  source: string,
  opts: WindowOptions = {},
): BrowserWindow {
  const isKiosk = opts.kiosk === true;

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    kiosk: isKiosk,
    fullscreen: isKiosk,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);

  // In kiosk mode, suppress DevTools and register a safe exit shortcut.
  if (isKiosk) {
    win.webContents.on("before-input-event", (_event, input) => {
      // Block F12 and Ctrl+Shift+I to prevent DevTools in kiosk
      if (
        input.key === "F12" ||
        (input.control && input.shift && input.key.toLowerCase() === "i")
      ) {
        _event.preventDefault();
      }
    });

    // Ctrl+Shift+Q → safe exit from kiosk mode
    globalShortcut.register("CommandOrControl+Shift+Q", () => {
      console.log("[electron] Kiosk exit shortcut pressed — quitting.");
      app.quit();
    });

    console.log(
      "[electron] Kiosk mode active. Press Ctrl+Shift+Q to exit.",
    );
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    win.loadURL(source);
  } else {
    win.loadFile(source);
  }

  win.once("ready-to-show", () => {
    win.show();
  });

  return win;
}
