import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const electronBin = path.join(rootDir, "node_modules", ".bin", isWindows ? "electron.cmd" : "electron");
const children = new Set();

function spawnChild(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: isWindows,
    windowsHide: false,
  });

  children.add(child);
  child.on("exit", () => {
    children.delete(child);
  });
  child.on("error", (error) => {
    console.error(`[desktop:dev] Failed to start ${command}:`, error.message);
    shutdown(1);
  });

  return child;
}

async function waitForUrl(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const vite = spawnChild(npmCmd, ["run", "dev", "--", "--host", "127.0.0.1"]);
vite.on("exit", (code) => {
  if (code && code !== 0) shutdown(code);
});

try {
  await waitForUrl("http://127.0.0.1:5173");
} catch (error) {
  console.error(`[desktop:dev] ${error.message}`);
  shutdown(1);
}

const electron = spawnChild(electronBin, ["."], {
  VITE_DEV_SERVER_URL: "http://127.0.0.1:5173",
});

electron.on("exit", (code) => shutdown(code ?? 0));
