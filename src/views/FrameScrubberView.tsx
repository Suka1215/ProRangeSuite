import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Shot, TrajectoryPoint } from "../types";

// ─── constants ────────────────────────────────────────────────────────────────
const SENSOR_W = 1920;
const SENSOR_H = 1080;

const C = {
  bg:           "#080b13",
  gridMajor:    "rgba(255,255,255,0.05)",
  gridMinor:    "rgba(255,255,255,0.02)",
  real:         "#00d4ff",
  realGlow:     "rgba(0,212,255,0.4)",
  predicted:    "#a855f7",
  predictGlow:  "rgba(168,85,247,0.35)",
  lock:         "#fbbf24",
  lockGlow:     "rgba(251,191,36,0.35)",
  trail:        "rgba(0,212,255,0.12)",
  text:         "#e2e8f0",
  muted:        "#4a5568",
  dim:          "#1e2533",
};

function ptColor(p: TrajectoryPoint) {
  if (p.label === "lock") return C.lock;
  if (p.isReal) return C.real;
  return C.predicted;
}
function ptGlow(p: TrajectoryPoint) {
  if (p.label === "lock") return C.lockGlow;
  if (p.isReal) return C.realGlow;
  return C.predictGlow;
}

// ─── component ────────────────────────────────────────────────────────────────
export default function FrameScrubberView({
  shots, activeShot, onSelectShot,
}: { shots: Shot[]; activeShot: Shot | null; onSelectShot: (s: Shot) => void }) {

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const accumRef    = useRef(0);
  const lastRef     = useRef(0);

  const [frameIdx,  setFrameIdx]  = useState(0);
  const [playing,   setPlaying]   = useState(false);
  const [speed,     setSpeed]     = useState(1);
  const [showTrail, setShowTrail] = useState(true);
  const [showGrid,  setShowGrid]  = useState(true);
  const [showScan,  setShowScan]  = useState(true);
  const [zoom,      setZoom]      = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const dragging    = useRef(false);
  const dragStart   = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // pick active shot — must have trajectory
  const validShots = shots.filter(s => s.trajectory && s.trajectory.length > 0);
  const shot = (activeShot?.trajectory?.length ? activeShot : null)
             ?? validShots[validShots.length - 1]
             ?? null;
  const pts: TrajectoryPoint[] = shot?.trajectory ?? [];
  const total  = pts.length;
  const cur    = pts[frameIdx] ?? null;

  useEffect(() => { setFrameIdx(0); setPlaying(false); setPanOffset({ x:0, y:0 }); setZoom(1); }, [shot?.id]);

  // ── playback ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || total === 0) return;
    const tick = (now: number) => {
      if (!lastRef.current) lastRef.current = now;
      accumRef.current += (now - lastRef.current) * speed * 0.05;
      lastRef.current = now;
      if (accumRef.current >= 1) {
        const steps = Math.floor(accumRef.current);
        accumRef.current -= steps;
        setFrameIdx(i => {
          if (i + steps >= total - 1) { setPlaying(false); return total - 1; }
          return i + steps;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    accumRef.current = 0; lastRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, total]);

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { setFrameIdx(i => Math.min(i+1, total-1)); setPlaying(false); }
      if (e.key === "ArrowLeft")  { setFrameIdx(i => Math.max(i-1, 0));       setPlaying(false); }
      if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); }
      if (e.key === "0") { setFrameIdx(0); setPlaying(false); }
      if (e.key === "End") { setFrameIdx(total-1); setPlaying(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [total]);

  // ── wheel zoom ───────────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  }, []);

  // ── pan ───────────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPanOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };
  const onMouseUp = () => { dragging.current = false; };

  // ── draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width  = Math.round(rect.width  * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.scale(dpr, dpr);
    }
    const W = rect.width;
    const H = rect.height;

    // scale from sensor → canvas with zoom + pan
    const baseScaleX = W / SENSOR_W;
    const baseScaleY = H / SENSOR_H;
    const sx = baseScaleX * zoom;
    const sy = baseScaleY * zoom;
    const ox = panOffset.x + (W * (1 - zoom)) / 2;
    const oy = panOffset.y + (H * (1 - zoom)) / 2;
    const toX = (px: number) => px * sx + ox;
    const toY = (py: number) => py * sy + oy;

    // ── clear ────────────────────────────────────────────────────────────
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // ── sensor frame outline ─────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth   = 1;
    ctx.strokeRect(ox, oy, SENSOR_W * sx, SENSOR_H * sy);

    // Corner marks
    const cm = 18;
    ctx.strokeStyle = "rgba(0,212,255,0.3)";
    ctx.lineWidth   = 1.5;
    [[0,0],[1,0],[0,1],[1,1]].forEach(([cx,cy]) => {
      const px = ox + cx * SENSOR_W * sx;
      const py = oy + cy * SENSOR_H * sy;
      const dx = cx === 0 ? 1 : -1;
      const dy = cy === 0 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx*cm, py); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + dy*cm); ctx.stroke();
    });

    // ── grid ─────────────────────────────────────────────────────────────
    if (showGrid) {
      // Minor grid (192px intervals = 10 cols × 10 rows in sensor space)
      ctx.strokeStyle = C.gridMinor;
      ctx.lineWidth   = 0.5;
      for (let gx = 0; gx <= SENSOR_W; gx += 192) {
        ctx.beginPath(); ctx.moveTo(toX(gx), oy); ctx.lineTo(toX(gx), oy + SENSOR_H*sy); ctx.stroke();
      }
      for (let gy = 0; gy <= SENSOR_H; gy += 108) {
        ctx.beginPath(); ctx.moveTo(ox, toY(gy)); ctx.lineTo(ox + SENSOR_W*sx, toY(gy)); ctx.stroke();
      }
      // Major grid (960, 540 = center lines)
      ctx.strokeStyle = C.gridMajor;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(toX(SENSOR_W/2), oy); ctx.lineTo(toX(SENSOR_W/2), oy+SENSOR_H*sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, toY(SENSOR_H/2)); ctx.lineTo(ox+SENSOR_W*sx, toY(SENSOR_H/2)); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── scanlines ────────────────────────────────────────────────────────
    if (showScan) {
      ctx.fillStyle = "rgba(0,212,255,0.025)";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    }

    // ── trail ────────────────────────────────────────────────────────────
    if (showTrail && frameIdx > 0) {
      for (let i = 1; i <= frameIdx && i < pts.length; i++) {
        const a = pts[i-1], b = pts[i];
        const ax = a._px != null ? toX(a._px) : W/2;
        const ay = a._py != null ? toY(a._py) : H/2;
        const bx = b._px != null ? toX(b._px) : W/2;
        const by = b._py != null ? toY(b._py) : H/2;
        const alpha = 0.08 + 0.45 * (i / (frameIdx + 1));
        const g = ctx.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, `rgba(0,212,255,${alpha * 0.4})`);
        g.addColorStop(1, `rgba(0,212,255,${alpha})`);
        ctx.strokeStyle = g;
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
    }

    // ── past detection dots ───────────────────────────────────────────────
    pts.slice(0, frameIdx).forEach((p, i) => {
      if (p._px == null || p._py == null) return;
      const px  = toX(p._px), py = toY(p._py);
      const r   = Math.max(3, (p._r ?? 12) * sx * 0.5);
      const col = ptColor(p);
      const fade = 0.15 + 0.35 * (i / (frameIdx || 1));
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2);
      ctx.strokeStyle = col + Math.round(fade * 255).toString(16).padStart(2,"0");
      ctx.lineWidth   = 1.2;
      ctx.fillStyle   = col + "0a";
      ctx.fill();
      ctx.stroke();
    });

    // ── current point ─────────────────────────────────────────────────────
    if (cur && cur._px != null && cur._py != null) {
      const px  = toX(cur._px), py = toY(cur._py);
      const r   = Math.max(6, (cur._r ?? 15) * sx);
      const col = ptColor(cur);
      const glow = ptGlow(cur);
      const t   = performance.now() / 1000;

      // Crosshair lines (clipped to canvas)
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3,5]);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
      ctx.setLineDash([]);

      // Outer glow halo
      const halo = ctx.createRadialGradient(px, py, r * 0.8, px, py, r * 4);
      halo.addColorStop(0, glow);
      halo.addColorStop(1, "transparent");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(px, py, r * 4, 0, Math.PI*2); ctx.fill();

      // Pulsing ring
      const pulse = 0.4 + 0.6 * ((Math.sin(t * 3) + 1) / 2);
      ctx.save();
      ctx.translate(px, py);
      ctx.strokeStyle = col + Math.round(pulse * 180).toString(16).padStart(2,"0");
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.arc(0, 0, r + 8 + pulse * 5, 0, Math.PI*2); ctx.stroke();
      ctx.restore();

      // Rotating dashed ring
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * 0.8);
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([7,5]);
      ctx.beginPath(); ctx.arc(0, 0, r + 14, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Main ball circle
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2);
      ctx.fillStyle   = col + "22";
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2.5;
      ctx.globalAlpha = 1;
      ctx.stroke();

      // Center dot
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2);
      ctx.fillStyle = col; ctx.fill();

      // ── Floating label ───────────────────────────────────────────────
      const lx = Math.min(px + r + 16, W - 170);
      const ly = Math.max(py - r, 36);
      const lines = [
        { text: cur.label ?? `pt[${frameIdx}]`, color: col,    size: 11, bold: true },
        { text: cur.tMs != null ? `t = ${(cur.tMs/1000).toFixed(4)}s` : "", color:"#94a3b8", size:10, bold:false },
        { text: cur._dFit != null ? `dist ${cur._dFit.toFixed(3)}m` : cur._dRaw != null ? `dist ${cur._dRaw.toFixed(3)}m (raw)` : "", color:"#fbbf24", size:10, bold:false },
        { text: cur._px != null ? `(${cur._px.toFixed(0)}, ${cur._py?.toFixed(0)}) px` : "", color:"#64748b", size:9, bold:false },
      ].filter(l => l.text);

      // Chip background
      const chipH = lines.length * 16 + 12;
      const chipW = 160;
      ctx.fillStyle   = "rgba(8,11,19,0.88)";
      ctx.strokeStyle = col + "40";
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.roundRect(lx - 6, ly - 18, chipW, chipH, 8); ctx.fill(); ctx.stroke();

      // Left accent bar
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(lx - 6, ly - 18, 3, chipH, [8,0,0,8]); ctx.fill();

      lines.forEach((l, i) => {
        ctx.font      = `${l.bold ? "bold " : ""}${l.size}px 'DM Mono', monospace`;
        ctx.fillStyle = l.color;
        ctx.textAlign = "left";
        ctx.fillText(l.text, lx + 4, ly - 2 + i * 16);
      });
    }

    // ── HUD ──────────────────────────────────────────────────────────────
    // Frame counter — top right
    ctx.textAlign   = "right";
    ctx.font        = "bold 12px 'DM Mono', monospace";
    ctx.fillStyle   = C.muted;
    ctx.fillText(`${String(frameIdx+1).padStart(3,"0")} / ${String(total).padStart(3,"0")}`, W-14, 22);

    if (cur?.tMs != null) {
      ctx.font      = "11px 'DM Mono', monospace";
      ctx.fillStyle = C.real;
      ctx.fillText(`t=${(cur.tMs/1000).toFixed(4)}s`, W-14, 38);
    }
    if (cur?.frame != null) {
      ctx.font      = "9px 'DM Mono', monospace";
      ctx.fillStyle = C.muted;
      ctx.fillText(`cam#${cur.frame}`, W-14, 52);
    }

    // Zoom indicator — bottom left
    if (zoom > 1) {
      ctx.textAlign = "left";
      ctx.font = "10px 'DM Mono', monospace";
      ctx.fillStyle = "rgba(0,212,255,0.6)";
      ctx.fillText(`${zoom.toFixed(1)}×`, 14, H - 12);
    }

    // Status badge — top left
    const col = ptColor(cur ?? { x:0, y:0, isReal:false });
    const txt = cur?.label === "lock" ? "LOCK / ADDRESS"
              : cur?.isReal           ? "REAL DETECTION"
              : "PREDICTED";
    ctx.textAlign = "left";
    ctx.font      = "bold 10px 'DM Mono', monospace";
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = "rgba(8,11,19,0.8)";
    ctx.beginPath(); ctx.roundRect(12, 12, tw + 32, 22, 6); ctx.fill();
    const pulse2 = 0.55 + 0.45 * Math.sin(performance.now() * 0.005);
    ctx.beginPath(); ctx.arc(24, 23, 4, 0, Math.PI*2);
    ctx.fillStyle = col + Math.round(pulse2 * 255).toString(16).padStart(2,"0");
    ctx.fill();
    ctx.fillStyle = col;
    ctx.fillText(txt, 34, 27);

  }, [frameIdx, pts, cur, showTrail, showGrid, showScan, zoom, panOffset, total, shot]);

  // Draw loop
  useEffect(() => {
    let raf: number;
    if (playing || true) { // always animate for pulse effects
      const loop = () => { draw(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }
  }, [draw, playing]);

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setFrameIdx(Math.round(t * (total - 1)));
    setPlaying(false);
  };

  const noData = !shot || pts.length === 0;
  const realCount = pts.filter(p => p.isReal).length;
  const predCount = pts.filter(p => !p.isReal && p.label !== "lock").length;
  const lockCount = pts.filter(p => p.label === "lock").length;

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", animation:"slideUp .25s ease" }}>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:18 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:"-.4px", color:"#1a1d2e", marginBottom:2 }}>
            Frame Scrubber
          </h1>
          <p style={{ color:"#6b7280", fontSize:13 }}>
            Forensic frame-by-frame playback of every ball detection
          </p>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>Speed</span>
          {[0.1, 0.25, 0.5, 1, 2].map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={{
              padding:"5px 11px", borderRadius:100, fontSize:11, fontWeight:700, cursor:"pointer",
              background: speed === s ? "#1a6bff"       : "rgba(0,0,0,.06)",
              color:      speed === s ? "#fff"           : "#6b7280",
              border:     speed === s ? "none"           : "1px solid transparent",
              transition:"all .12s",
            }}>{s}×</button>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 268px", gap:12 }}>

        {/* ── Main column ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

          {/* Canvas */}
          <div style={{
            background:"#080b13", borderRadius:20, overflow:"hidden",
            border:"1px solid rgba(255,255,255,.07)",
            boxShadow:"0 24px 64px rgba(0,0,0,.5), 0 0 0 1px rgba(0,212,255,.06)",
            position:"relative", cursor: zoom > 1 ? "grab" : "default",
          }}
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {noData ? (
              <div style={{ height:420, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, color:"#334155" }}>
                <div style={{ fontSize:56, opacity:.25 }}>📡</div>
                <div style={{ fontSize:15, fontWeight:700, color:"#475569" }}>No frame data yet</div>
                <div style={{ fontSize:12, color:"#64748b", textAlign:"center", maxWidth:260, lineHeight:1.5 }}>
                  Hit shots from the iPhone app.<br/>Tracking points will appear here.
                </div>
              </div>
            ) : (
              <canvas ref={canvasRef} style={{ width:"100%", height:420, display:"block" }} />
            )}

            {/* Top-right overlays */}
            {!noData && (
              <div style={{ position:"absolute", bottom:14, right:14, display:"flex", gap:6 }}>
                {([
                  { label:"Grid",     st:showGrid,  fn:setShowGrid  },
                  { label:"Trail",    st:showTrail, fn:setShowTrail },
                  { label:"Scan",     st:showScan,  fn:setShowScan  },
                ] as const).map(({ label, st, fn }) => (
                  <button key={label} onClick={() => (fn as any)((v: boolean) => !v)} style={{
                    padding:"4px 10px", borderRadius:100, fontSize:10, fontWeight:700, cursor:"pointer",
                    background: st ? "rgba(0,212,255,.15)" : "rgba(0,0,0,.55)",
                    color:      st ? "#00d4ff"              : "#4a5568",
                    border:     st ? "1px solid rgba(0,212,255,.3)" : "1px solid rgba(255,255,255,.06)",
                    backdropFilter:"blur(8px)",
                    transition:"all .12s",
                  }}>{label}</button>
                ))}
                <button onClick={() => { setZoom(1); setPanOffset({x:0,y:0}); }} style={{
                  padding:"4px 10px", borderRadius:100, fontSize:10, fontWeight:700, cursor:"pointer",
                  background:"rgba(0,0,0,.55)", color:"#4a5568",
                  border:"1px solid rgba(255,255,255,.06)", backdropFilter:"blur(8px)",
                }}>Reset</button>
              </div>
            )}
          </div>

          {/* Scrubber + transport */}
          {!noData && (
            <div style={{ background:"#fff", borderRadius:16, padding:"16px 20px", border:"1px solid rgba(0,0,0,.06)", boxShadow:"0 2px 8px rgba(0,0,0,.04)" }}>

              {/* Transport row */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                <TBtn onClick={() => { setFrameIdx(0); setPlaying(false); }}>⏮</TBtn>
                <TBtn onClick={() => { setFrameIdx(i => Math.max(i-1,0)); setPlaying(false); }}>‹</TBtn>
                <button
                  onClick={() => { if (frameIdx >= total-1) setFrameIdx(0); setPlaying(p=>!p); }}
                  style={{ width:42, height:42, borderRadius:12, fontSize:18, fontWeight:700, cursor:"pointer",
                    background: playing ? "#ef4444" : "#1a6bff", color:"#fff",
                    boxShadow: playing ? "0 4px 12px rgba(239,68,68,.4)" : "0 4px 14px rgba(26,107,255,.45)",
                    transition:"all .15s", display:"flex", alignItems:"center", justifyContent:"center" }}
                >{playing ? "⏸" : "▶"}</button>
                <TBtn onClick={() => { setFrameIdx(i => Math.min(i+1,total-1)); setPlaying(false); }}>›</TBtn>
                <TBtn onClick={() => { setFrameIdx(total-1); setPlaying(false); }}>⏭</TBtn>

                <div style={{ flex:1 }}/>

                {/* Point type badges */}
                <div style={{ display:"flex", gap:6 }}>
                  {lockCount > 0 && <Badge color="#fbbf24" label={`${lockCount} lock`}/>}
                  <Badge color="#00d4ff" label={`${realCount} real`}/>
                  {predCount > 0 && <Badge color="#a855f7" label={`${predCount} pred`}/>}
                </div>

                <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:"#9ca3af", marginLeft:8 }}>
                  {frameIdx+1}/{total}
                </span>
                {cur?.tMs != null && (
                  <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:"#00d4ff", fontWeight:700 }}>
                    {(cur.tMs/1000).toFixed(4)}s
                  </span>
                )}
              </div>

              {/* Scrubber track */}
              <div onClick={onScrub} style={{ position:"relative", height:44, cursor:"pointer", userSelect:"none" }}>
                {/* Track bg */}
                <div style={{ position:"absolute", top:"50%", left:0, right:0, height:5, background:"#f0f2f8", borderRadius:4, transform:"translateY(-50%)" }}>
                  <div style={{ position:"absolute", inset:0, right:`${100 - (frameIdx/(total-1))*100}%`, background:"linear-gradient(90deg,#1a6bff,#00d4ff)", borderRadius:4, transition:"right .04s" }}/>
                </div>

                {/* Per-point markers */}
                {pts.map((p, i) => {
                  const pct = (i / (total-1)) * 100;
                  const col = p.label === "lock" ? "#fbbf24" : p.isReal ? "#00d4ff" : "#a855f7";
                  const isAct = i === frameIdx;
                  return (
                    <div key={i}
                      onClick={e => { e.stopPropagation(); setFrameIdx(i); setPlaying(false); }}
                      title={`${p.label ?? `pt[${i}]`}${p.tMs != null ? ` — t=${(p.tMs/1000).toFixed(3)}s` : ""}`}
                      style={{
                        position:"absolute", top:"50%", left:`${pct}%`,
                        transform:"translate(-50%,-50%)",
                        width:  isAct ? 16 : 9,
                        height: isAct ? 16 : 9,
                        borderRadius:"50%",
                        background:   isAct ? col : "transparent",
                        border:`2px solid ${col}`,
                        boxShadow:    isAct ? `0 0 10px ${col}` : "none",
                        transition:"all .1s",
                        zIndex:2, cursor:"pointer",
                      }}
                    />
                  );
                })}
              </div>

              {/* Legend + hint */}
              <div style={{ display:"flex", gap:16, alignItems:"center", marginTop:6 }}>
                {[
                  { color:"#00d4ff", label:"Real (YOLO)" },
                  { color:"#a855f7", label:"Predicted"   },
                  { color:"#fbbf24", label:"Lock"        },
                ].map(({ color, label }) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#9ca3af" }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", border:`2px solid ${color}` }}/>
                    {label}
                  </div>
                ))}
                <div style={{ flex:1 }}/>
                <span style={{ fontSize:10, color:"#c4c8d4" }}>← → keys · Space · Scroll to zoom · Drag to pan</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

          {/* Detection detail */}
          <div style={{ background:"#080b13", borderRadius:16, padding:16, border:"1px solid rgba(255,255,255,.07)", boxShadow:"0 8px 28px rgba(0,0,0,.4)" }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#334155", letterSpacing:"1px", textTransform:"uppercase", marginBottom:10 }}>
              Detection Detail
            </div>
            {cur ? (
              <div>
                {[
                  { k:"Label",    v: cur.label ?? `pt[${frameIdx}]`,                        c: ptColor(cur) },
                  { k:"Type",     v: cur.label === "lock" ? "Lock/Address" : cur.isReal ? "YOLO detection" : "Predicted", c: ptColor(cur) },
                  { k:"Cam Frame",v: cur.frame != null ? `#${cur.frame}` : "—",              c: "#64748b" },
                  { k:"Time",     v: cur.tMs   != null ? `${(cur.tMs/1000).toFixed(4)}s` : "—", c: "#00d4ff" },
                  { k:"Pixel X",  v: cur._px   != null ? `${cur._px.toFixed(0)}` : "—",    c: "#94a3b8" },
                  { k:"Pixel Y",  v: cur._py   != null ? `${cur._py.toFixed(0)}` : "—",    c: "#94a3b8" },
                  { k:"Radius",   v: cur._r    != null ? `${cur._r.toFixed(1)}px` : "—",   c: "#94a3b8" },
                  { k:"Dist raw", v: cur._dRaw != null ? `${cur._dRaw.toFixed(4)}m` : "—", c: "#fbbf24" },
                  { k:"Dist fit", v: cur._dFit != null ? `${cur._dFit.toFixed(4)}m` : "—", c: "#fbbf24" },
                ].map(({ k, v, c }) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,.04)", fontSize:11 }}>
                    <span style={{ color:"#4a5568" }}>{k}</span>
                    <span style={{ color:c, fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color:"#334155", fontSize:12, textAlign:"center", padding:"20px 0" }}>
                No point selected
              </div>
            )}
          </div>

          {/* Shot metrics */}
          {shot && (
            <div style={{ background:"#fff", borderRadius:16, padding:14, border:"1px solid rgba(0,0,0,.06)" }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#9ca3af", letterSpacing:"1px", textTransform:"uppercase", marginBottom:10 }}>
                Shot Metrics
              </div>
              {[
                { k:"Ball Speed", v:`${shot.pr.speed} mph`,              c:"#1a6bff" },
                { k:"VLA",        v:`${shot.pr.vla}°`,                   c:"#8b5cf6" },
                { k:"HLA",        v:`${shot.pr.hla}°`,                   c:"#06b6d4" },
                { k:"Carry",      v:`${shot.pr.carry} yd`,               c:"#16a34a" },
                { k:"Spin",       v:`${(+shot.pr.spin).toLocaleString()} rpm`, c:"#f59e0b" },
                { k:"Real pts",   v:`${realCount} / ${total}`,           c: realCount >= 8 ? "#16a34a" : "#f97316" },
              ].map(({ k, v, c }) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f9fafb", fontSize:12 }}>
                  <span style={{ color:"#6b7280" }}>{k}</span>
                  <span style={{ color:c, fontFamily:"'DM Mono',monospace", fontWeight:800, fontSize:11 }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Shot list */}
          {validShots.length > 0 && (
            <div style={{ background:"#fff", borderRadius:16, border:"1px solid rgba(0,0,0,.06)", overflow:"hidden" }}>
              <div style={{ padding:"10px 14px", borderBottom:"1px solid #f0f2f7", fontSize:9, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"1px" }}>
                {validShots.length} shots with frame data
              </div>
              <div style={{ maxHeight:240, overflowY:"auto" }}>
                {[...validShots].reverse().map((s, i) => {
                  const isAct = shot?.id === s.id;
                  const rc    = s.trajectory?.filter(p => p.isReal).length ?? 0;
                  const tc    = s.trajectory?.length ?? 0;
                  return (
                    <div key={String(s.id)} onClick={() => onSelectShot(s)} style={{
                      padding:"9px 14px", cursor:"pointer", transition:"background .1s",
                      background: isAct ? "#eff6ff" : "transparent",
                      borderBottom:"1px solid #f9fafb",
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                    }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:12, color: isAct ? "#1a6bff" : "#1a1d2e" }}>
                          Shot #{validShots.length - i}
                        </div>
                        <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>
                          {s.timestamp} · {s.pr.speed} mph
                        </div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#00d4ff", fontFamily:"'DM Mono',monospace" }}>
                          {rc} real
                        </div>
                        <div style={{ fontSize:9, color:"#c4c8d4" }}>{tc} pts</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      width:34, height:34, borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer",
      background:"#f3f4f6", color:"#374151", display:"flex", alignItems:"center", justifyContent:"center",
      transition:"all .1s", border:"none",
    }}>{children}</button>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:5, padding:"3px 9px",
      borderRadius:100, fontSize:10, fontWeight:700,
      background: color + "15", color,
      border:`1px solid ${color}30`,
    }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:color }}/>
      {label}
    </div>
  );
}
