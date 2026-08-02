import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { simulateFlight, degreesToRadians } from "../utils/physics";
import type { TrajectoryPoint } from "../types";
import "./live-view.css";

// ─── live doc shape (written by the iOS LiveViewPublisher) ───────────────────

interface LiveTrajPoint {
  tMs?: number;
  x?: number;
  y?: number;
  px?: number;
  py?: number;
  r?: number;
}

interface LiveShotDoc {
  shotID: string;
  club?: string;
  ballSpeedMPH?: number;
  launchAngleDeg?: number;
  backSpinRPM?: number;
  carryYards?: number;
  spinAxisDeg?: number;
  launchDirectionDeg?: number;
  sideSpinRPM?: number;
  totalSpinRPM?: number;
  spinRPM?: number;
  totalYards?: number;
  apexHeightFeet?: number;
  flightTimeMS?: number;
  smashFactor?: number;
  clubHeadSpeedMPH?: number;
  trajectory?: LiveTrajPoint[];
  framesReady?: boolean;
  frameCount?: number;
  frameURLs?: string[];
}

interface Path3DPoint {
  x: number; // lateral yards (+right)
  y: number; // height yards
  z: number; // downrange yards
}

interface TrailShot {
  shotID: string;
  path: Path3DPoint[];
  carry: number;
  total: number;
}

const SENSOR_W = 1920;
const SENSOR_H = 1080;
const FLIGHT_MS = 2600;
const REPLAY_FPS = 18;
const TRAIL_CAP = 15;
const GREEN = "#6ad87c";
const INK = "#262930";
const TRACER = "#ff4d3a";

type Phase = "idle" | "flying" | "landed";
type ViewMode = "range" | "replay";

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt0 = (v: number | undefined) => (v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString());
const fmt1 = (v: number | undefined) => (v == null || !isFinite(v) ? "—" : (Math.round(v * 10) / 10).toFixed(1));
const side = (v: number | undefined) => (v == null || Math.abs(v) < 0.05 ? "" : v < 0 ? "L" : "R");
const frac = (seed: number) => {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

function descentAngleDeg(traj: TrajectoryPoint[]): number | undefined {
  if (traj.length < 2) return undefined;
  const a = traj[traj.length - 2];
  const b = traj[traj.length - 1];
  const dxFt = (b.x - a.x) * 3;
  const dyFt = a.y - b.y;
  if (dxFt <= 0) return undefined;
  return (Math.atan2(dyFt, dxFt) * 180) / Math.PI;
}

function buildPath3D(s: LiveShotDoc): Path3DPoint[] {
  if (!s.ballSpeedMPH) return [];
  const profile = simulateFlight(
    s.ballSpeedMPH,
    degreesToRadians(s.launchAngleDeg ?? 12),
    s.spinRPM ?? s.totalSpinRPM ?? 2500
  );
  const zEnd = Math.max(profile[profile.length - 1]?.x ?? 1, 1);
  const curveMax = (s.carryYards ?? zEnd) * Math.tan(degreesToRadians((s.spinAxisDeg ?? 0) * 0.3));
  const hlaTan = Math.tan(degreesToRadians(s.launchDirectionDeg ?? 0));
  return profile.map((p) => ({
    z: p.x,
    y: p.y / 3,
    x: p.x * hlaTan + curveMax * Math.pow(p.x / zEnd, 2),
  }));
}

// ─── virtual range projection ────────────────────────────────────────────────
// Camera sits just behind the tee, ~6.5ft up, looking straight downrange.

function makeProjector(w: number, h: number) {
  const f = w * 0.62;
  const horizon = h * 0.34;
  const camY = 2.2; // yards
  const camZ = 6;   // yards behind tee
  return (x: number, y: number, z: number) => {
    const d = Math.max(z + camZ, 0.5);
    return {
      x: w / 2 + (f * x) / d,
      y: horizon + (f * (camY - y)) / d,
      d,
    };
  };
}

function drawRange(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const project = makeProjector(w, h);
  const horizon = h * 0.34;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 30);
  sky.addColorStop(0, "#dceefb");
  sky.addColorStop(1, "#f4fbff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 30);

  // grass base
  const grass = ctx.createLinearGradient(0, horizon, 0, h);
  grass.addColorStop(0, "#b9dfa8");
  grass.addColorStop(0.5, "#94cd7f");
  grass.addColorStop(1, "#6fbb5e");
  ctx.fillStyle = grass;
  ctx.fillRect(0, horizon, w, h - horizon);

  // mowing stripes (alternating bands converging to the vanishing point)
  for (let band = 0; band < 14; band++) {
    if (band % 2 === 0) continue;
    const z0 = band * 25;
    const z1 = z0 + 25;
    const a = project(-70, 0, z0);
    const b = project(70, 0, z0);
    const c = project(70, 0, z1);
    const d = project(-70, 0, z1);
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  // tree line on the horizon
  ctx.fillStyle = "#5da36c";
  ctx.beginPath();
  ctx.moveTo(0, horizon + 6);
  for (let i = 0; i <= 40; i++) {
    const x = (w / 40) * i;
    const bump = 10 + frac(i) * 22;
    ctx.lineTo(x, horizon + 6 - bump);
  }
  ctx.lineTo(w, horizon + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(38,41,48,0.12)";
  ctx.fillRect(0, horizon + 4, w, 3);

  // distance arcs (painted arcs centered on the tee)
  ctx.font = `800 ${Math.max(10, w * 0.009)}px 'Manrope', system-ui, sans-serif`;
  ctx.textAlign = "center";
  for (const dist of [50, 100, 150, 200, 250, 300]) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = dist < 150 ? 2 : 1.4;
    ctx.beginPath();
    let started = false;
    for (let i = -24; i <= 24; i++) {
      const x = (dist * 0.55 * i) / 24;
      const z = Math.sqrt(Math.max(dist * dist - x * x, 0));
      const p = project(x, 0, z);
      if (p.y < horizon + 8) continue;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
    const label = project(0, 0, dist);
    if (label.y > horizon + 12) {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      const lw = Math.max(30, w * 0.026);
      const lh = Math.max(15, w * 0.013);
      ctx.beginPath();
      ctx.roundRect(label.x - lw / 2, label.y - lh / 2, lw, lh, lh / 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.fillText(String(dist), label.x, label.y + lh * 0.26);
    }
  }

  // flags
  for (const flag of [
    { x: -18, z: 95 },
    { x: 12, z: 150 },
    { x: -6, z: 215 },
    { x: 24, z: 265 },
  ]) {
    const base = project(flag.x, 0, flag.z);
    const top = project(flag.x, 2.6, flag.z);
    ctx.strokeStyle = "rgba(38,41,48,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    ctx.fillStyle = "#e2493b";
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(top.x + Math.max(7, 90 / top.d), top.y + 3);
    ctx.lineTo(top.x, top.y + 6);
    ctx.closePath();
    ctx.fill();
  }

  // tee mat + ball
  const m1 = project(-2.4, 0, -1.5);
  const m2 = project(2.4, 0, -1.5);
  const m3 = project(2.4, 0, 3);
  const m4 = project(-2.4, 0, 3);
  ctx.fillStyle = "#4f9e51";
  ctx.beginPath();
  ctx.moveTo(m1.x, m1.y);
  ctx.lineTo(m2.x, m2.y);
  ctx.lineTo(m3.x, m3.y);
  ctx.lineTo(m4.x, m4.y);
  ctx.closePath();
  ctx.fill();
  const ball = project(0, 0.06, 0);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(38,41,48,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, Math.max(3.5, w * 0.004), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  path: Path3DPoint[],
  fraction: number,
  style: "live" | "ghost"
) {
  if (path.length < 2) return;
  const project = makeProjector(w, h);
  const count = Math.max(2, Math.floor(path.length * Math.min(fraction, 1)));

  ctx.save();
  if (style === "live") {
    ctx.shadowColor = TRACER;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = TRACER;
    ctx.lineWidth = 3.5;
  } else {
    ctx.strokeStyle = "rgba(38,41,48,0.16)";
    ctx.lineWidth = 1.5;
  }
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const p = path[i];
    const s = project(p.x, p.y, p.z);
    i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  ctx.restore();

  if (style === "live" && fraction < 1) {
    const head = path[count - 1];
    const s = project(head.x, head.y, head.z);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawLanding(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  path: Path3DPoint[],
  carry: number,
  total: number
) {
  if (!path.length) return;
  const project = makeProjector(w, h);
  const land = path[path.length - 1];
  const s = project(land.x, 0, land.z);

  // roll (dashed continuation toward total)
  const roll = Math.max(total - carry, 0);
  if (roll > 1) {
    const dir = Math.atan2(land.x - (path[path.length - 4]?.x ?? land.x), land.z - (path[path.length - 4]?.z ?? land.z - 1));
    const end = project(land.x + Math.sin(dir) * roll, 0, land.z + Math.cos(dir) * roll);
    ctx.save();
    ctx.strokeStyle = "rgba(226,73,59,0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  // landing ring
  ctx.strokeStyle = TRACER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // carry pill
  const text = `${Math.round(carry)} YDS`;
  ctx.font = "800 13px 'Manrope', system-ui, sans-serif";
  const tw = ctx.measureText(text).width + 22;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.beginPath();
  ctx.roundRect(s.x - tw / 2, s.y - 40, tw, 26, 13);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.fillText(text, s.x, s.y - 22);
}

// ─── component ───────────────────────────────────────────────────────────────

export default function LiveView({ uid }: { uid: string | null }) {
  const [shot, setShot] = useState<LiveShotDoc | null>(null);
  const [connected, setConnected] = useState(false);
  const [trail, setTrail] = useState<TrailShot[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("range");
  const [replayLoading, setReplayLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapeRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const phaseStartRef = useRef(0);
  const viewModeRef = useRef<ViewMode>("range");
  const shotRef = useRef<LiveShotDoc | null>(null);
  const trailRef = useRef<TrailShot[]>([]);
  const framesRef = useRef<HTMLImageElement[]>([]);
  const framesShotIdRef = useRef("");
  const lastShotIdRef = useRef("");

  const flightProfile = useMemo(() => {
    if (!shot?.ballSpeedMPH) return [] as TrajectoryPoint[];
    return simulateFlight(
      shot.ballSpeedMPH,
      degreesToRadians(shot.launchAngleDeg ?? 12),
      shot.spinRPM ?? shot.totalSpinRPM ?? 2500
    );
  }, [shot?.shotID, shot?.ballSpeedMPH, shot?.launchAngleDeg, shot?.spinRPM, shot?.totalSpinRPM]);

  const descent = useMemo(() => descentAngleDeg(flightProfile), [flightProfile]);

  useEffect(() => {
    shotRef.current = shot;
  }, [shot]);
  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // ── Firestore subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    const unsubscribe = onSnapshot(
      doc(db, "users", uid, "liveView", "current"),
      (snapshot) => {
        setConnected(true);
        const data = snapshot.data() as LiveShotDoc | undefined;
        if (!data?.shotID) return;
        setShot(data);

        if (data.shotID !== lastShotIdRef.current) {
          lastShotIdRef.current = data.shotID;
          framesRef.current = [];
          framesShotIdRef.current = "";
          phaseRef.current = "flying";
          phaseStartRef.current = performance.now();
          setViewMode("range");
          setTrail((current) => {
            if (current.some((t) => t.shotID === data.shotID)) return current;
            const path = buildPath3D(data);
            if (!path.length) return current;
            return [
              ...current.slice(-(TRAIL_CAP - 1)),
              {
                shotID: data.shotID,
                path,
                carry: data.carryYards ?? path[path.length - 1].z,
                total: data.totalYards ?? data.carryYards ?? 0,
              },
            ];
          });
        }
      },
      () => setConnected(false)
    );
    return unsubscribe;
  }, [uid]);

  // ── optional frame replay (fetched only on demand) ────────────────────────
  const openReplay = useCallback(() => {
    const s = shotRef.current;
    if (!s?.framesReady || !s.frameURLs?.length) return;
    if (framesShotIdRef.current === s.shotID && framesRef.current.length) {
      phaseStartRef.current = performance.now();
      setViewMode("replay");
      return;
    }
    setReplayLoading(true);
    const shotID = s.shotID;
    const images = s.frameURLs.map((url) => {
      const img = new Image();
      img.src = url;
      return img;
    });
    void Promise.allSettled(
      images.map(
        (img) =>
          new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          })
      )
    ).then((results) => {
      setReplayLoading(false);
      if (shotRef.current?.shotID !== shotID) return;
      const loaded = images.filter((_, i) => results[i].status === "fulfilled");
      if (!loaded.length) return;
      framesRef.current = loaded;
      framesShotIdRef.current = shotID;
      phaseStartRef.current = performance.now();
      setViewMode("replay");
    });
  }, []);

  const closeReplay = useCallback(() => setViewMode("range"), []);

  // ── main canvas render loop ───────────────────────────────────────────────
  const drawReplay = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, now: number) => {
    const s = shotRef.current;
    const frames = framesRef.current;
    if (!s || !frames.length) return;

    const frameDuration = 1000 / REPLAY_FPS;
    const elapsed = now - phaseStartRef.current;
    const totalFrames = frames.length;
    const index = Math.floor(elapsed / frameDuration) % totalFrames;
    const frame = frames[index];

    const iw = frame.naturalWidth || SENSOR_W;
    const ih = frame.naturalHeight || SENSOR_H;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(frame, dx, dy, dw, dh);

    const traj = (s.trajectory ?? []).filter((p) => p.px != null && p.py != null);
    if (traj.length >= 2) {
      const fraction = (index + 1) / totalFrames;
      const count = Math.max(2, Math.round(traj.length * fraction));
      ctx.save();
      ctx.shadowColor = TRACER;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = TRACER;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const p = traj[i];
        const x = dx + ((p.px as number) / SENSOR_W) * dw;
        const y = dy + ((p.py as number) / SENSOR_H) * dh;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;

      if (viewModeRef.current === "replay" && framesRef.current.length) {
        drawReplay(ctx, w, h, now);
      } else {
        drawRange(ctx, w, h);

        const currentTrail = trailRef.current;
        const currentID = shotRef.current?.shotID;
        for (const t of currentTrail) {
          if (t.shotID !== currentID) drawPath(ctx, w, h, t.path, 1, "ghost");
        }

        const active = currentTrail.find((t) => t.shotID === currentID);
        if (active) {
          if (phaseRef.current === "flying") {
            const progress = (now - phaseStartRef.current) / FLIGHT_MS;
            const eased = 1 - Math.pow(1 - Math.min(progress, 1), 2.1);
            drawPath(ctx, w, h, active.path, eased, "live");
            if (progress >= 1) phaseRef.current = "landed";
          } else if (phaseRef.current === "landed") {
            drawPath(ctx, w, h, active.path, 1, "live");
            drawLanding(ctx, w, h, active.path, active.carry, active.total);
          }
        }

        if (phaseRef.current === "idle") {
          const pulse = 0.55 + 0.35 * Math.sin(now / 600);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath();
          ctx.roundRect(w / 2 - 130, h * 0.42 - 20, 260, 40, 20);
          ctx.fill();
          ctx.fillStyle = `rgba(38, 41, 48, ${pulse})`;
          ctx.font = "800 14px 'Manrope', system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("W A I T I N G   F O R   S H O T", w / 2, h * 0.42 + 5);
        }
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawReplay]);

  // ── shot shape canvas (top-down) ──────────────────────────────────────────
  useEffect(() => {
    const canvas = shapeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const maxZ = Math.max(...trail.map((t) => Math.max(t.total, t.carry)), 150) * 1.08;
    const maxX = Math.max(...trail.flatMap((t) => t.path.map((p) => Math.abs(p.x))), 12) * 1.4;
    const left = 14;
    const right = w - 14;
    const midY = h * 0.52;
    const zToX = (z: number) => left + (z / maxZ) * (right - left);
    const xToY = (x: number) => midY - (x / maxX) * (h * 0.34);

    // target line + ticks
    ctx.strokeStyle = "rgba(38,41,48,0.22)";
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, midY);
    ctx.lineTo(right, midY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(38,41,48,0.4)";
    ctx.font = "800 8.5px 'Manrope', system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let z = 50; z < maxZ; z += 50) {
      ctx.fillRect(zToX(z) - 0.5, midY - 3, 1, 6);
      ctx.fillText(String(z), zToX(z), midY + 14);
    }
    ctx.textAlign = "left";
    ctx.fillText("LEFT", left, h - 4);
    ctx.textAlign = "right";
    ctx.fillText("RIGHT", right, h - 4);

    // ghosts then latest
    const currentID = shot?.shotID;
    for (const t of trail) {
      const isLatest = t.shotID === currentID;
      ctx.strokeStyle = isLatest ? GREEN : "rgba(38,41,48,0.14)";
      ctx.lineWidth = isLatest ? 2.4 : 1.2;
      ctx.beginPath();
      t.path.forEach((p, i) => {
        const sx = zToX(p.z);
        const sy = xToY(-p.x); // canvas up = LEFT
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      if (isLatest && t.path.length) {
        const end = t.path[t.path.length - 1];
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(zToX(end.z), xToY(-end.x), 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [trail, shot?.shotID]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  }, []);

  const sliderPct = (v: number | undefined, range: number) =>
    `${Math.max(4, Math.min(96, 50 + ((v ?? 0) / range) * 50))}%`;

  if (!uid) {
    return (
      <div className="lv-root lv-signin">
        <p>Sign in to this account to mirror shots from the Spivot app.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="lv-root">
      <header className="lv-header">
        <div className="lv-header-club">
          <span className="lv-dot lv-dot-ready" />
          {shot?.club && shot.club !== "Unknown" ? shot.club : "READY"}
        </div>
        <div className="lv-header-title">SPIVOT LIVE</div>
        <div className={`lv-header-status ${connected ? "is-live" : ""}`}>
          <span className="lv-dot" />
          {connected ? "CONNECTED" : "CONNECTING…"}
        </div>
        <button className="lv-fullscreen" onClick={toggleFullscreen} title="Fullscreen">⛶</button>
      </header>

      <div className="lv-stage">
        <canvas ref={canvasRef} className="lv-canvas" />
        <div className="lv-stage-btns">
          {viewMode === "range" && shot?.framesReady && (
            <button className="lv-stage-btn" onClick={openReplay} disabled={replayLoading}>
              {replayLoading ? "LOADING…" : "▶ CAMERA REPLAY"}
            </button>
          )}
          {viewMode === "replay" && (
            <button className="lv-stage-btn" onClick={closeReplay}>⛳ BACK TO RANGE</button>
          )}
        </div>
      </div>

      <aside className="lv-rail">
        <div className="lv-metric">
          <span className="lv-metric-label">BALL SPEED</span>
          <span className="lv-metric-value">{fmt0(shot?.ballSpeedMPH)}</span>
          <span className="lv-metric-unit">MPH</span>
        </div>
        <div className="lv-metric">
          <span className="lv-metric-label">LAUNCH ANGLE</span>
          <span className="lv-metric-value">{fmt1(shot?.launchAngleDeg)}°</span>
        </div>
        <div className="lv-metric">
          <span className="lv-metric-label">BACKSPIN</span>
          <span className="lv-metric-value">{fmt0(shot?.backSpinRPM)}</span>
          <span className="lv-metric-unit">RPM</span>
        </div>
        <div className="lv-metric">
          <span className="lv-metric-label">CARRY</span>
          <span className="lv-metric-value">{fmt0(shot?.carryYards)}</span>
          <span className="lv-metric-unit">YDS</span>
        </div>
      </aside>

      <footer className="lv-strip">
        <div className="lv-tile lv-tile-shape">
          <span className="lv-tile-label">SHOT SHAPE</span>
          <canvas ref={shapeRef} className="lv-shape-canvas" />
        </div>
        <div className="lv-tile">
          <span className="lv-tile-label">SPIN AXIS</span>
          <span className="lv-tile-value">
            {fmt1(shot?.spinAxisDeg == null ? undefined : Math.abs(shot.spinAxisDeg))}°
            <em>{side(shot?.spinAxisDeg)}</em>
          </span>
          <span className="lv-slider"><i style={{ left: sliderPct(shot?.spinAxisDeg, 15) }} /></span>
        </div>
        <div className="lv-tile">
          <span className="lv-tile-label">LAUNCH DIRECTION</span>
          <span className="lv-tile-value">
            {fmt1(shot?.launchDirectionDeg == null ? undefined : Math.abs(shot.launchDirectionDeg))}°
            <em>{side(shot?.launchDirectionDeg)}</em>
          </span>
          <span className="lv-slider"><i style={{ left: sliderPct(shot?.launchDirectionDeg, 10) }} /></span>
        </div>
        <div className="lv-tile">
          <span className="lv-tile-label">SIDE SPIN</span>
          <span className="lv-tile-value">
            {fmt0(shot?.sideSpinRPM == null ? undefined : Math.abs(shot.sideSpinRPM))}
            <em>RPM {side(shot?.sideSpinRPM)}</em>
          </span>
        </div>
        <div className="lv-tile">
          <span className="lv-tile-label">DESCENT ANGLE</span>
          <span className="lv-tile-value">{fmt1(descent)}°</span>
        </div>
        <div className="lv-tile">
          <span className="lv-tile-label">TOTAL</span>
          <span className="lv-tile-value">
            {fmt0(shot?.totalYards)}
            <em>YDS</em>
          </span>
        </div>
      </footer>
    </div>
  );
}
