/**
 * ProRange Live Bridge Server
 * - Loads pga_precision_10k_v8.csv at startup (10k TM reference shots)
 * - Matches each live shot by SPEED + VLA distance (club ignored)
 * - Exposes /api/tm-lookup so browser can retroactively enrich stored shots
 */

import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_HTTP_PORT = 3000;
export const DEFAULT_SHOT_PORT = 9211;
const DEFAULT_GSPRO_BRIDGE_SCRIPT = "/Users/jmmiller/Downloads/gspro_bridge.py";
const CONNECTOR_TIMEOUT_MS = 30_000;

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

function resolveTMDatabasePath(baseDir) {
  const candidates = [
    path.join(baseDir, "public", "pga_precision_10k_v8.csv"),
    path.join(baseDir, "dist", "pga_precision_10k_v8.csv"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load TrackMan reference DB — ALL 10k shots in one flat array
//    Match purely on speed + VLA euclidean distance (club is irrelevant)
// ─────────────────────────────────────────────────────────────────────────────
function loadTMDatabase(baseDir = MODULE_DIR) {
  const csvPath = resolveTMDatabasePath(baseDir);
  if (!csvPath) {
    console.warn("[TM-DB] pga_precision_10k_v8.csv not found — no TM reference data");
    return [];
  }

  const lines = fs.readFileSync(csvPath, "utf8").trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  const tmAll = [];
  let count = 0;
  for (const line of lines.slice(1)) {
    const v = line.split(",");
    const speed = parseFloat(v[col["Ball Speed"]]);
    const vla = parseFloat(v[col["Launch Angle"]]);
    const hla = parseFloat(v[col["Launch Direction"]]);
    const spin = parseFloat(v[col["Spin Rate"]]);
    if (isNaN(speed) || isNaN(vla) || isNaN(spin)) continue;

    // Carry not in dataset — estimate from physics
    const carry = +(speed * (1.55 + (Math.max(0, vla) / 45) * 0.35)).toFixed(0);
    tmAll.push({
      speed: +speed.toFixed(1),
      vla: +vla.toFixed(1),
      hla: +hla.toFixed(1),
      spin: +spin.toFixed(0),
      carry,
    });
    count++;
  }

  console.log(`[TM-DB] Loaded ${count} shots from CSV (matching by speed+VLA)`);
  return tmAll;
}

/**
 * Find nearest TM shot by Euclidean distance in (speed, VLA) space.
 * Speed is weighted more heavily since it has larger range.
 */
function findTMRef(tmAll, prSpeed, prVla) {
  if (tmAll.length === 0) return null;

  let best = null;
  let bestDist = Infinity;
  for (const shot of tmAll) {
    // Normalize: speed range ~50-180mph, VLA range ~5-45° → weight speed less
    const ds = (shot.speed - prSpeed) / 2.0;  // 2 mph = 1 unit
    const dv = (shot.vla - prVla) / 1.0;      // 1° = 1 unit
    const dist = ds * ds + dv * dv;
    if (dist < bestDist) {
      bestDist = dist;
      best = shot;
    }
  }

  return best;
}

/**
 * Convert iOS TrackPoints array → trajectory [{x: carryYards, y: heightFeet}, ...]
 * Each point has: Frame, Tms (ms), X, Y (pixels), R (radius), DRawM, DFitM (meters from camera)
 *
 * Strategy: use DFitM (fitted distance from camera in meters) and the shot VLA to
 * reconstruct the 3D position, then project to carry+height.
 * For real points (IsReal=true), use the actual measured distances.
 * For predicted/lock points, interpolate.
 */
function buildTrajectory(trackPoints, prSpeed, prVla) {
  if (!Array.isArray(trackPoints) || trackPoints.length < 2) return null;

  const pts = trackPoints
    .filter((p) => p.IsReal === true || p.Label === "lock")
    .sort((a, b) => a.Frame - b.Frame);

  if (pts.length < 2) return null;

  const vlaRad = (prVla * Math.PI) / 180;
  const M_TO_YD = 1.09361;
  const M_TO_FT = 3.28084;

  const origin = pts[0];
  const originDist = origin.DFitM ?? origin.DRawM ?? 2.0;

  return pts.map((p) => {
    const dist = p.DFitM ?? p.DRawM ?? originDist;
    const t = Math.max(0, (p.Tms - origin.Tms) / 1000.0);

    const distDelta = originDist - dist;
    const carryM = Math.max(0, distDelta * Math.cos(vlaRad));

    const vMs = prSpeed * 0.44704;
    const hM = Math.max(0, vMs * Math.sin(vlaRad) * t - 0.5 * 9.81 * t * t);

    return {
      // Chart coordinates
      x: +(carryM * M_TO_YD).toFixed(1),
      y: +(hM * M_TO_FT).toFixed(1),
      // Raw sensor data — powers the frame scrubber
      _px: p.X ?? null,
      _py: p.Y ?? null,
      _r: p.R ?? null,
      _dRaw: p.DRawM ?? null,
      _dFit: p.DFitM ?? null,
      frame: p.Frame ?? null,
      tMs: p.Tms ?? null,
      isReal: p.IsReal ?? false,
      label: p.Label ?? null,
    };
  }).filter((p) => p.x >= 0 && p.y >= 0);
}

function estimateCarry(speed = 0, vla = 0) {
  if (!speed) return 0;
  const r = (vla * Math.PI) / 180;
  return +(speed * 1.72 * Math.pow(Math.sin(2 * r), 0.4)).toFixed(0);
}

function readRequestBody(req, onSuccess, onError) {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    try {
      onSuccess(body);
    } catch (error) {
      onError(error);
    }
  });
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath);
  return {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".csv": "text/csv",
  }[ext] || "application/octet-stream";
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("error", onError);
      reject(error);
    };

    server.on("error", onError);
    server.listen(port, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function createPairingToken() {
  return crypto.randomBytes(16).toString("hex");
}

export async function startBridgeServer(options = {}) {
  const baseDir = options.baseDir ?? MODULE_DIR;
  const httpPort = options.httpPort ?? DEFAULT_HTTP_PORT;
  const shotPort = options.shotPort ?? DEFAULT_SHOT_PORT;
  const staticDir = options.staticDir ?? path.join(baseDir, "dist");
  const gsproScriptPath = options.gsproScriptPath ?? process.env.GSPRO_BRIDGE_SCRIPT ?? DEFAULT_GSPRO_BRIDGE_SCRIPT;
  const tmAll = loadTMDatabase(baseDir);
  const clients = new Set();
  const offlinePairing = {
    token: createPairingToken(),
    paired: false,
    deviceName: null,
    userId: null,
    isPremium: false,
    premiumExpiresAt: null,
    pairedAt: null,
  };

  function pairingSnapshot() {
    return {
      token: offlinePairing.token,
      paired: offlinePairing.paired,
      deviceName: offlinePairing.deviceName,
      userId: offlinePairing.userId,
      isPremium: offlinePairing.isPremium,
      premiumExpiresAt: offlinePairing.premiumExpiresAt,
      pairedAt: offlinePairing.pairedAt,
    };
  }

  const connectors = {
    gspro: {
      id: "gspro",
      name: "GSPro",
      status: "idle",
      detail: "Ready to start the GSPro bridge.",
      updatedAt: new Date().toISOString(),
      commandLabel: "Connect to GSPro",
      available: fs.existsSync(gsproScriptPath),
      process: null,
      timer: null,
      connected: false,
    },
    "infinite-tee": {
      id: "infinite-tee",
      name: "Infinite Tee",
      status: "idle",
      detail: "Connector scaffold is ready. Add the Infinite Tee launch command to enable one-click connect.",
      updatedAt: new Date().toISOString(),
      commandLabel: "Connect to Infinite Tee",
      available: false,
      process: null,
      timer: null,
      connected: false,
    },
  };

  function connectorSnapshot(connectorId) {
    const connector = connectors[connectorId];
    return {
      id: connector.id,
      name: connector.name,
      status: connector.status,
      detail: connector.detail,
      updatedAt: connector.updatedAt,
      commandLabel: connector.commandLabel,
      available: connector.available,
    };
  }

  function connectorsSnapshot() {
    return [
      connectorSnapshot("gspro"),
      connectorSnapshot("infinite-tee"),
    ];
  }

  function updateConnector(connectorId, patch) {
    const connector = connectors[connectorId];
    Object.assign(connector, patch, { updatedAt: new Date().toISOString() });
    broadcast({ type: "connector_status", connectors: connectorsSnapshot() });
    return connectorSnapshot(connectorId);
  }

  function clearConnectorTimer(connectorId) {
    const connector = connectors[connectorId];
    if (connector.timer) {
      clearTimeout(connector.timer);
      connector.timer = null;
    }
  }

  function stopConnectorProcess(connectorId) {
    const connector = connectors[connectorId];
    clearConnectorTimer(connectorId);
    if (connector.process) {
      try {
        connector.process.kill();
      } catch {}
      connector.process = null;
    }
    connector.connected = false;
  }

  function attachProcessLogging(connectorId, child) {
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (connectorId === "gspro") {
        if (trimmed.includes("Connected to GSPro")) {
          clearConnectorTimer("gspro");
          connectors.gspro.connected = true;
          updateConnector("gspro", {
            status: "connected",
            detail: "Connected to GSPro. SPIVOT is forwarding shots through the local bridge.",
          });
          return;
        }

        if (trimmed.includes("GSPro unavailable") && connectors.gspro.status === "establishing") {
          updateConnector("gspro", {
            status: "establishing",
            detail: "Establishing GSPro connection. Open GSPro Open Connect to finish pairing.",
          });
          return;
        }

        if (trimmed.includes("Send error")) {
          connectors.gspro.connected = false;
          updateConnector("gspro", {
            status: "failed",
            detail: "GSPro rejected the bridge payload. Re-open Open Connect and try again.",
          });
          stopConnectorProcess("gspro");
        }
      }
    };

    child.stdout?.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    });

    child.stderr?.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    });
  }

  function beginGsproConnect() {
    const connector = connectors.gspro;

    if (connector.status === "connected" || connector.status === "establishing") {
      return connectorSnapshot("gspro");
    }

    stopConnectorProcess("gspro");

    if (!fs.existsSync(gsproScriptPath)) {
      return updateConnector("gspro", {
        status: "failed",
        detail: `GSPro bridge script not found at ${gsproScriptPath}.`,
        available: false,
      });
    }

    connector.available = true;

    const child = spawn("python3", ["-u", gsproScriptPath], {
      cwd: path.dirname(gsproScriptPath),
      stdio: ["ignore", "pipe", "pipe"],
    });

    connector.process = child;
    connector.connected = false;

    updateConnector("gspro", {
      status: "establishing",
      detail: "Establishing GSPro connection…",
    });

    connector.timer = setTimeout(() => {
      if (connectors.gspro.status !== "connected") {
        updateConnector("gspro", {
          status: "failed",
          detail: "Connection failed. Start GSPro Open Connect, then try again.",
        });
        stopConnectorProcess("gspro");
      }
    }, CONNECTOR_TIMEOUT_MS);

    attachProcessLogging("gspro", child);

    child.on("error", (error) => {
      updateConnector("gspro", {
        status: "failed",
        detail: `Failed to start GSPro bridge: ${error.message}`,
      });
      stopConnectorProcess("gspro");
    });

    child.on("exit", () => {
      if (connectors.gspro.process !== child) return;
      connectors.gspro.process = null;
      clearConnectorTimer("gspro");

      if (connectors.gspro.status === "connected") {
        updateConnector("gspro", {
          status: "failed",
          detail: "GSPro bridge stopped. Reconnect when GSPro is ready again.",
        });
      } else if (connectors.gspro.status === "establishing") {
        updateConnector("gspro", {
          status: "failed",
          detail: "Connection failed. Start GSPro Open Connect, then try again.",
        });
      }
    });

    return connectorSnapshot("gspro");
  }

  function beginInfiniteTeeConnect() {
    return updateConnector("infinite-tee", {
      status: "failed",
      detail: "Infinite Tee connector is not configured yet. Add its launch command or bridge spec to enable one-click connect.",
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. HTTP server — serves built React app + API endpoints
  // ───────────────────────────────────────────────────────────────────────────
  const httpServer = http.createServer((req, res) => {
    const requestPath = (req.url ?? "/").split("?")[0] || "/";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (requestPath === "/api/tm-lookup" && req.method === "POST") {
      readRequestBody(
        req,
        (body) => {
          const { speed, vla } = JSON.parse(body);
          const tm = findTMRef(tmAll, +speed, +vla);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ tm }));
        },
        (error) => {
          res.writeHead(400);
          res.end(JSON.stringify({ error: error.message }));
        }
      );
      return;
    }

    if (requestPath === "/api/tm-lookup-batch" && req.method === "POST") {
      readRequestBody(
        req,
        (body) => {
          const shots = JSON.parse(body);
          const results = shots.map((shot) => ({
            id: shot.id,
            tm: findTMRef(tmAll, +shot.speed, +shot.vla),
          }));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ results }));
        },
        (error) => {
          res.writeHead(400);
          res.end(JSON.stringify({ error: error.message }));
        }
      );
      return;
    }

    if (requestPath === "/api/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ip: getLocalIP(), httpPort, shotPort, tmShots: tmAll.length }));
      return;
    }

    if (requestPath === "/api/offline/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, pairing: pairingSnapshot() }));
      return;
    }

    if (requestPath === "/api/connectors/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, connectors: connectorsSnapshot() }));
      return;
    }

    if (requestPath === "/api/connectors/gspro/connect" && req.method === "POST") {
      const connector = beginGsproConnect();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, connector, connectors: connectorsSnapshot() }));
      return;
    }

    if (requestPath === "/api/connectors/infinite-tee/connect" && req.method === "POST") {
      const connector = beginInfiniteTeeConnect();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, connector, connectors: connectorsSnapshot() }));
      return;
    }

    if (requestPath === "/api/offline/pair" && req.method === "POST") {
      readRequestBody(
        req,
        (body) => {
          const payload = JSON.parse(body || "{}");
          const token = String(payload?.token ?? "");
          const isPremium = payload?.isPremium === true;
          const premiumExpiresAt =
            typeof payload?.premiumExpiresAt === "string" ? payload.premiumExpiresAt : null;
          const userId = typeof payload?.userId === "string" ? payload.userId.trim() : "";
          const premiumExpiryTime = premiumExpiresAt ? new Date(premiumExpiresAt).getTime() : null;
          const premiumIsCurrent = isPremium && (
            premiumExpiryTime === null || (!Number.isNaN(premiumExpiryTime) && premiumExpiryTime > Date.now())
          );

          if (!token || token !== offlinePairing.token) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "invalid_token" }));
            return;
          }

          if (!userId) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "auth_required" }));
            return;
          }

          offlinePairing.paired = true;
          offlinePairing.deviceName = typeof payload?.deviceName === "string" ? payload.deviceName : "SPIVOT App";
          offlinePairing.userId = userId;
          offlinePairing.isPremium = premiumIsCurrent;
          offlinePairing.premiumExpiresAt = premiumExpiresAt;
          offlinePairing.pairedAt = new Date().toISOString();

          broadcast({ type: "offline_status", pairing: pairingSnapshot() });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, pairing: pairingSnapshot() }));
        },
        (error) => {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: error.message }));
        }
      );
      return;
    }

    if (requestPath === "/api/offline/unpair" && req.method === "POST") {
      offlinePairing.token = createPairingToken();
      offlinePairing.paired = false;
      offlinePairing.deviceName = null;
      offlinePairing.userId = null;
      offlinePairing.isPremium = false;
      offlinePairing.premiumExpiresAt = null;
      offlinePairing.pairedAt = null;

      broadcast({ type: "offline_status", pairing: pairingSnapshot() });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, pairing: pairingSnapshot() }));
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    let filePath = path.join(staticDir, requestPath === "/" ? "index.html" : requestPath);
    if (!fs.existsSync(filePath)) filePath = path.join(staticDir, "index.html");

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": mimeTypeFor(filePath) });
      res.end(data);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. WebSocket — browser clients
  // ───────────────────────────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server: httpServer });

  // Mirror HTTP listen failures into logged diagnostics so startup errors
  // remain understandable when Electron boots the bridge internally.
  wss.on("error", (error) => {
    if (!options.silent) {
      console.error("[WS] Error:", error.message);
    }
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[WS] Browser connected (${clients.size} total)`);
    ws.send(JSON.stringify({ type: "tm_ready", totalShots: tmAll.length }));
    ws.send(JSON.stringify({ type: "offline_status", pairing: pairingSnapshot() }));
    ws.send(JSON.stringify({ type: "connector_status", connectors: connectorsSnapshot() }));
    ws.on("close", () => { clients.delete(ws); });
  });

  function broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. GSPro shot receiver — iPhone POSTs here
  // ───────────────────────────────────────────────────────────────────────────
  const shotServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    readRequestBody(
      req,
      (body) => {
        const gspro = JSON.parse(body);

        if (gspro.ShotDataOptions?.IsHeartBeat === true) {
          res.writeHead(200);
          res.end(JSON.stringify({ status: "heartbeat" }));
          return;
        }

        const ball = gspro.BallData ?? {};
        const prSpeed = +(ball.Speed ?? 0).toFixed(1);
        const prVla = +(ball.VLA ?? 0).toFixed(1);
        const prHla = +(ball.HLA ?? 0).toFixed(1);
        const prSpin = +(ball.TotalSpin ?? ball.BackSpin ?? 0).toFixed(0);
        const prCarry = +(ball.CarryDistance ?? estimateCarry(prSpeed, prVla)).toFixed(0);

        if (prSpeed === 0 && prVla === 0) {
          res.writeHead(200);
          res.end(JSON.stringify({ status: "empty" }));
          return;
        }

        const tmRef = findTMRef(tmAll, prSpeed, prVla);

        const shot = {
          id: `live-${Date.now()}`,
          club: "7-Iron",   // UI club selector controls display label
          timestamp: new Date().toLocaleTimeString(),
          source: "live",
          pr: { speed: prSpeed, vla: prVla, hla: prHla, carry: prCarry, spin: prSpin },
          tm: tmRef ? { speed: tmRef.speed, vla: tmRef.vla, hla: tmRef.hla, carry: tmRef.carry, spin: tmRef.spin } : null,
          trackPts: gspro.TrackPointsCount ?? (Array.isArray(gspro.TrackPoints) ? gspro.TrackPoints.length : null),
          trajectory: buildTrajectory(gspro.TrackPoints, prSpeed, prVla),
        };

        console.log(`[SHOT] speed=${prSpeed}mph VLA=${prVla}° → TM match: speed=${tmRef?.speed ?? "?"}mph VLA=${tmRef?.vla ?? "?"}° err=${tmRef ? (prVla - tmRef.vla).toFixed(1) : "?"}°`);
        broadcast({ type: "shot", shot });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      },
      (error) => {
        console.error("[SHOT] Error:", error.message);
        res.writeHead(400);
        res.end(JSON.stringify({ error: error.message }));
      }
    );
  });

  await listen(httpServer, httpPort);
  try {
    await listen(shotServer, shotPort);
  } catch (error) {
    await closeServer(httpServer);
    await new Promise((resolve) => wss.close(resolve));
    throw error;
  }

  const ip = getLocalIP();
  if (!options.silent) {
    console.log("\n╔════════════════════════════════════════════╗");
    console.log("║    ProRange Bridge Server — RUNNING        ║");
    console.log("╠════════════════════════════════════════════╣");
    console.log(`║  Browser : http://localhost:${httpPort}             ║`);
    console.log(`║  LAN     : http://${ip}:${httpPort}         ║`);
    console.log(`║  iPhone  : GSPro IP=${ip} Port=${shotPort}  ║`);
    console.log(`║  TM DB   : ${tmAll.length.toLocaleString()} shots (speed+VLA match)   ║`);
    console.log("╚════════════════════════════════════════════╝\n");
    console.log(`[Shot receiver] Listening on port ${shotPort}`);
  }

  let stopped = false;
  return {
    httpPort,
    shotPort,
    ip,
    tmCount: tmAll.length,
    async stop() {
      if (stopped) return;
      stopped = true;

      stopConnectorProcess("gspro");
      stopConnectorProcess("infinite-tee");

      for (const ws of clients) {
        try { ws.close(); } catch {}
      }

      await Promise.allSettled([
        new Promise((resolve) => wss.close(resolve)),
        closeServer(shotServer),
        closeServer(httpServer),
      ]);
    },
  };
}

const isDirectRun = process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startBridgeServer().catch((error) => {
    console.error("[Bridge] Failed to start:", error);
    process.exitCode = 1;
  });
}
