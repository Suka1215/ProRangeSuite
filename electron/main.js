import { app, BrowserWindow, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_HTTP_PORT, startBridgeServer } from "../server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let bridge = null;
let mainWindow = null;
let quitting = false;

async function probeExistingBridge(port = DEFAULT_HTTP_PORT) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    if (!res.ok) return null;

    const status = await res.json();
    if (status?.ok !== true || typeof status.shotPort !== "number") return null;

    return {
      external: true,
      httpPort: port,
      async stop() {},
    };
  } catch {
    return null;
  }
}

async function ensureBridge() {
  if (!bridge) {
    try {
      bridge = await startBridgeServer({ silent: true });
    } catch (error) {
      if (error?.code === "EADDRINUSE") {
        const existingBridge = await probeExistingBridge();
        if (existingBridge) {
          bridge = existingBridge;
        } else {
          throw new Error("Port 3000 is already in use by another process. Stop it or free the port before launching ProRange Desktop.");
        }
      } else {
        throw error;
      }
    }
  }
  return bridge;
}

async function createMainWindow() {
  const bridgeHandle = await ensureBridge();
  const bridgeUrl = `http://127.0.0.1:${bridgeHandle.httpPort ?? DEFAULT_HTTP_PORT}`;
  const appUrl = new URL(process.env.VITE_DEV_SERVER_URL || bridgeUrl);
  appUrl.searchParams.set("desktop", "1");
  appUrl.searchParams.set("bridgeUrl", bridgeUrl);

  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 800,
    autoHideMenuBar: true,
    backgroundColor: "#09111f",
    show: false,
    webPreferences: {
      additionalArguments: [`--bridge-url=http://127.0.0.1:${bridgeHandle.httpPort ?? DEFAULT_HTTP_PORT}`],
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  mainWindow = window;
  await window.loadURL(appUrl.toString());
}

async function stopBridge() {
  if (!bridge) return;
  const currentBridge = bridge;
  bridge = null;
  await currentBridge.stop();
}

app.whenReady().then(async () => {
  try {
    await createMainWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("ProRange Desktop failed to start", message);
    app.exit(1);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  stopBridge().finally(() => app.exit(0));
});
