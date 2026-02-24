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
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTTP_PORT = 3000;
const SHOT_PORT = 9211;

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load TrackMan reference DB — ALL 10k shots in one flat array
//    Match purely on speed + VLA euclidean distance (club is irrelevant)
// ─────────────────────────────────────────────────────────────────────────────
let TM_ALL = [];  // flat: [{speed, vla, hla, spin, carry}, ...]

function loadTMDatabase() {
  const csvPath = path.join(__dirname, "public", "pga_precision_10k_v8.csv");
  if (!fs.existsSync(csvPath)) {
    console.warn("[TM-DB] pga_precision_10k_v8.csv not found — no TM reference data");
    return;
  }

  const lines   = fs.readFileSync(csvPath, "utf8").trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  const col     = {};
  headers.forEach((h, i) => { col[h] = i; });

  let count = 0;
  for (const line of lines.slice(1)) {
    const v = line.split(",");
    const speed = parseFloat(v[col["Ball Speed"]]);
    const vla   = parseFloat(v[col["Launch Angle"]]);
    const hla   = parseFloat(v[col["Launch Direction"]]);
    const spin  = parseFloat(v[col["Spin Rate"]]);
    if (isNaN(speed) || isNaN(vla) || isNaN(spin)) continue;
    // Carry not in dataset — estimate from physics
    const carry = +(speed * (1.55 + (Math.max(0,vla) / 45) * 0.35)).toFixed(0);
    TM_ALL.push({ speed: +speed.toFixed(1), vla: +vla.toFixed(1), hla: +hla.toFixed(1), spin: +spin.toFixed(0), carry });
    count++;
  }
  console.log(`[TM-DB] Loaded ${count} shots from CSV (matching by speed+VLA)`);
}

/**
 * Find nearest TM shot by Euclidean distance in (speed, VLA) space.
 * Speed is weighted more heavily since it has larger range.
 */
function findTMRef(prSpeed, prVla) {
  if (TM_ALL.length === 0) return null;
  let best = null, bestDist = Infinity;
  for (const shot of TM_ALL) {
    // Normalize: speed range ~50-180mph, VLA range ~5-45° → weight speed less
    const ds = (shot.speed - prSpeed) / 2.0;  // 2 mph = 1 unit
    const dv = (shot.vla   - prVla)   / 1.0;  // 1° = 1 unit
    const dist = ds * ds + dv * dv;
    if (dist < bestDist) { bestDist = dist; best = shot; }
  }
  return best;
}

loadTMDatabase();

// ─────────────────────────────────────────────────────────────────────────────
// 2. HTTP server — serves built React app + API endpoints
// ─────────────────────────────────────────────────────────────────────────────
const distDir = path.join(__dirname, "dist");

const httpServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // TM lookup endpoint — browser calls this to enrich stored shots that have tm:null
  if (req.url === "/api/tm-lookup" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { speed, vla } = JSON.parse(body);
        const tm = findTMRef(+speed, +vla);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ tm }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Batch TM lookup — enrich an array of shots in one call
  if (req.url === "/api/tm-lookup-batch" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const shots = JSON.parse(body); // [{id, speed, vla}, ...]
        const results = shots.map(s => ({
          id: s.id,
          tm: findTMRef(+s.speed, +s.vla),
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.url === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ip: getLocalIP(), shotPort: SHOT_PORT, tmShots: TM_ALL.length }));
    return;
  }

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Serve static files
  let filePath = path.join(distDir, req.url === "/" ? "index.html" : req.url);
  if (!fs.existsSync(filePath)) filePath = path.join(distDir, "index.html");
  const ext  = path.extname(filePath);
  const mime = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css",
                 ".svg":"image/svg+xml", ".ico":"image/x-icon", ".json":"application/json",
                 ".csv":"text/csv" }[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. WebSocket — browser clients
// ─────────────────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Browser connected (${clients.size} total)`);
  ws.send(JSON.stringify({ type: "tm_ready", totalShots: TM_ALL.length }));
  ws.on("close", () => { clients.delete(ws); });
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) { if (ws.readyState === 1) ws.send(msg); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GSPro shot receiver — iPhone POSTs here
// ─────────────────────────────────────────────────────────────────────────────
const shotServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method !== "POST")    { res.writeHead(405); res.end(); return; }

  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    try {
      const gspro = JSON.parse(body);

      // Skip heartbeats
      if (gspro.ShotDataOptions?.IsHeartBeat === true) {
        res.writeHead(200); res.end(JSON.stringify({ status: "heartbeat" })); return;
      }

      const ball    = gspro.BallData ?? {};
      const prSpeed = +(ball.Speed    ?? 0).toFixed(1);
      const prVla   = +(ball.VLA      ?? 0).toFixed(1);
      const prHla   = +(ball.HLA      ?? 0).toFixed(1);
      const prSpin  = +(ball.TotalSpin ?? ball.BackSpin ?? 0).toFixed(0);
      const prCarry = +(ball.CarryDistance ?? estimateCarry(prSpeed, prVla)).toFixed(0);

      // Skip empty shots
      if (prSpeed === 0 && prVla === 0) {
        res.writeHead(200); res.end(JSON.stringify({ status: "empty" })); return;
      }

      // Match to nearest TM shot by speed + VLA
      const tmRef = findTMRef(prSpeed, prVla);

      const shot = {
        id:        `live-${Date.now()}`,
        club:      "7-Iron",   // UI club selector controls display label
        timestamp: new Date().toLocaleTimeString(),
        source:    "live",
        pr:  { speed: prSpeed, vla: prVla, hla: prHla, carry: prCarry, spin: prSpin },
        tm:  tmRef ? { speed: tmRef.speed, vla: tmRef.vla, hla: tmRef.hla, carry: tmRef.carry, spin: tmRef.spin } : null,
trackPts: gspro.TrackPointsCount ?? (Array.isArray(gspro.TrackPoints) ? gspro.TrackPoints.length : null),
        trajectory: buildTrajectory(gspro.TrackPoints, prSpeed, prVla),
      };

      console.log(`[SHOT] speed=${prSpeed}mph VLA=${prVla}° → TM match: speed=${tmRef?.speed ?? "?"}mph VLA=${tmRef?.vla ?? "?"}° err=${tmRef ? (prVla - tmRef.vla).toFixed(1) : "?"}°`);
      broadcast({ type: "shot", shot });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    } catch (e) {
      console.error("[SHOT] Error:", e.message);
      res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
    }
  });
});

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

  // Filter to real detections + sort by frame
  const pts = trackPoints
    .filter(p => p.IsReal === true || p.Label === "lock")
    .sort((a, b) => a.Frame - b.Frame);

  if (pts.length < 2) return null;

  const vlaRad  = (prVla * Math.PI) / 180;
  const M_TO_YD = 1.09361;
  const M_TO_FT = 3.28084;

  // Origin: the lock point (address position, distance = DFitM from camera)
  const origin = pts[0];
  const originDist = origin.DFitM ?? origin.DRawM ?? 2.0; // meters from camera

  return pts.map((p, i) => {
    const dist = (p.DFitM ?? p.DRawM ?? originDist);
    const t    = Math.max(0, (p.Tms - origin.Tms) / 1000.0);

    const distDelta = originDist - dist;
    const carryM    = Math.max(0, distDelta * Math.cos(vlaRad));

    const vMs = prSpeed * 0.44704;
    const hM  = Math.max(0, vMs * Math.sin(vlaRad) * t - 0.5 * 9.81 * t * t);

    return {
      // Chart coordinates
      x: +(carryM * M_TO_YD).toFixed(1),
      y: +(hM * M_TO_FT).toFixed(1),
      // Raw sensor data — powers the frame scrubber
      _px:   p.X    ?? null,      // pixel X (0-1920)
      _py:   p.Y    ?? null,      // pixel Y (0-1080)
      _r:    p.R    ?? null,      // radius in pixels
      _dRaw: p.DRawM ?? null,     // raw distance (m)
      _dFit: p.DFitM ?? null,     // fitted distance (m)
      frame:  p.Frame  ?? null,
      tMs:    p.Tms    ?? null,
      isReal: p.IsReal ?? false,
      label:  p.Label  ?? null,
    };
  }).filter(p => p.x >= 0 && p.y >= 0);
}

function estimateCarry(speed = 0, vla = 0) {
  if (!speed) return 0;
  const r = (vla * Math.PI) / 180;
  return +(speed * 1.72 * Math.pow(Math.sin(2 * r), 0.4)).toFixed(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Start
// ─────────────────────────────────────────────────────────────────────────────
httpServer.listen(HTTP_PORT, () => {
  const ip = getLocalIP();
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║    ProRange Bridge Server — RUNNING        ║`);
  console.log(`╠════════════════════════════════════════════╣`);
  console.log(`║  Browser : http://localhost:${HTTP_PORT}             ║`);
  console.log(`║  LAN     : http://${ip}:${HTTP_PORT}         ║`);
  console.log(`║  iPhone  : GSPro IP=${ip} Port=${SHOT_PORT}  ║`);
  console.log(`║  TM DB   : ${TM_ALL.length.toLocaleString()} shots (speed+VLA match)   ║`);
  console.log(`╚════════════════════════════════════════════╝\n`);
});

shotServer.listen(SHOT_PORT, () => {
  console.log(`[Shot receiver] Listening on port ${SHOT_PORT}`);
});
