import { app, BrowserWindow, dialog } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_HTTP_PORT, startBridgeServer } from "../server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const LOOPBACK_HOST = "localhost";
const BRIDGE_PORT_CANDIDATES = [
  { httpPort: DEFAULT_HTTP_PORT, shotPort: 9210 },
  { httpPort: 3001, shotPort: 9212 },
  { httpPort: 3002, shotPort: 9213 },
];

let bridge = null;
let mainWindow = null;
let quitting = false;

function resolveBundledGsproScript() {
  const candidates = [
    path.join(rootDir, "gspro_bridge.py"),
    typeof process.resourcesPath === "string"
      ? path.join(process.resourcesPath, "gspro_bridge.py")
      : null,
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0] ?? null;
}

function createBridgeOptions(overrides = {}) {
  const gsproScriptPath = resolveBundledGsproScript();
  return {
    silent: true,
    baseDir: rootDir,
    ...(gsproScriptPath ? { gsproScriptPath } : {}),
    ...overrides,
  };
}

async function probeExistingBridge(port = DEFAULT_HTTP_PORT) {
  try {
    const res = await fetch(`http://${LOOPBACK_HOST}:${port}/api/status`);
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
    let lastPortError = null;

    for (const candidate of BRIDGE_PORT_CANDIDATES) {
      try {
        bridge = await startBridgeServer(createBridgeOptions(candidate));
        break;
      } catch (error) {
        if (error?.code === "EADDRINUSE") {
          lastPortError = error;
          continue;
        }

        throw error;
      }
    }

    if (!bridge) {
      const existingBridge = await probeExistingBridge();
      if (existingBridge) {
        bridge = existingBridge;
      } else if (lastPortError) {
        throw new Error("The desktop bridge ports are already in use. Stop the old bridge or restart the desktop app.");
      }
    }
  }
  return bridge;
}

async function createMainWindow() {
  const bridgeHandle = await ensureBridge();
  const bridgeUrl = `http://${LOOPBACK_HOST}:${bridgeHandle.httpPort ?? DEFAULT_HTTP_PORT}`;
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
      additionalArguments: [`--bridge-url=http://${LOOPBACK_HOST}:${bridgeHandle.httpPort ?? DEFAULT_HTTP_PORT}`],
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
