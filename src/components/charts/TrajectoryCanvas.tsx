import React, { useState, useEffect, useRef } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area,
} from "recharts";
import type { Shot, TrajectoryPoint } from "../../types";

interface Props {
  shots: Shot[];
  activeShot: Shot | null;
  playing: boolean;
  onPlayDone: () => void;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background:"#fff", borderRadius:10, padding:"10px 14px", boxShadow:"0 4px 20px rgba(0,0,0,.12)", border:"1px solid #f0f2f7", fontSize:12 }}>
      {d.label && <div style={{ color:"#9ca3af", marginBottom:3, fontFamily:"monospace" }}>{d.label}</div>}
      <div style={{ color:"#9ca3af", marginBottom:2 }}>{d.carry !== undefined ? `${(+d.carry).toFixed(1)} yds` : ""}</div>
      <div style={{ fontWeight:700, color:"#1a6bff" }}>Height: {(+d.height).toFixed(1)} ft</div>
      {d.tMs != null && <div style={{ color:"#9ca3af", marginTop:2 }}>t = {(d.tMs/1000).toFixed(3)}s</div>}
      {d.frame != null && <div style={{ color:"#c4c8d4" }}>frame {d.frame}</div>}
    </div>
  );
};

export function TrajectoryCanvas({ shots, activeShot, playing, onPlayDone }: Props) {
  const [progress, setProgress] = useState(1);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (playing && activeShot) {
      setProgress(0);
      let p = 0;
      animRef.current = setInterval(() => {
        p += 0.02;
        setProgress(Math.min(p, 1));
        if (p >= 1) { clearInterval(animRef.current!); onPlayDone(); }
      }, 16);
    } else {
      setProgress(1);
    }
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [playing, activeShot]);

  // Build smooth trajectory line from points
  const buildLine = (traj: TrajectoryPoint[], frac: number) => {
    if (!traj?.length) return [];
    const cut = Math.max(1, Math.floor(traj.length * frac));
    return traj.slice(0, cut).map(p => ({ carry: p.x, height: p.y, tMs: p.tMs, frame: p.frame, label: p.label }));
  };

  // Separate real detections from interpolated for dot rendering
  const buildRealDots = (traj: TrajectoryPoint[], frac: number) => {
    if (!traj?.length) return [];
    const cut = Math.max(1, Math.floor(traj.length * frac));
    return traj.slice(0, cut)
      .filter(p => p.isReal === true)
      .map(p => ({ carry: p.x, height: p.y, tMs: p.tMs, frame: p.frame, label: p.label }));
  };

  const buildPredictedDots = (traj: TrajectoryPoint[], frac: number) => {
    if (!traj?.length) return [];
    const cut = Math.max(1, Math.floor(traj.length * frac));
    return traj.slice(0, cut)
      .filter(p => p.isReal === false)
      .map(p => ({ carry: p.x, height: p.y, tMs: p.tMs, frame: p.frame, label: p.label }));
  };

  // Fallback physics trajectory when no real data
  const buildPhysicsLine = (shot: Shot, frac: number) => {
    const speed = shot.pr.speed * 0.44704; // mph → m/s
    const vlaRad = (shot.pr.vla * Math.PI) / 180;
    const carryM = shot.pr.carry * 0.9144;
    const steps = 40;
    const tFlight = (2 * speed * Math.sin(vlaRad)) / 9.81;
    const pts = [];
    const cutSteps = Math.floor(steps * frac);
    for (let i = 0; i <= cutSteps; i++) {
      const t = (i / steps) * tFlight;
      const x = speed * Math.cos(vlaRad) * t * 1.09361;
      const y = Math.max(0, (speed * Math.sin(vlaRad) * t - 0.5 * 9.81 * t * t) * 3.28084);
      pts.push({ carry: +x.toFixed(1), height: +y.toFixed(1) });
    }
    return pts;
  };

  const hasRealTraj = !!(activeShot?.trajectory?.length);

  const activeLineData  = activeShot
    ? (hasRealTraj ? buildLine(activeShot.trajectory!, progress) : buildPhysicsLine(activeShot, progress))
    : [];

  const realDots        = activeShot?.trajectory ? buildRealDots(activeShot.trajectory, progress) : [];
  const predictedDots   = activeShot?.trajectory ? buildPredictedDots(activeShot.trajectory, progress) : [];

  // Historical shots — faded
  const histData = shots
    .filter(s => s.id !== activeShot?.id && (s.trajectory?.length || s.pr.speed))
    .slice(-5)
    .map(s => s.trajectory?.length
      ? s.trajectory.map(p => ({ carry: p.x, height: p.y }))
      : buildPhysicsLine(s, 1)
    );

  // Expected (TM reference physics line)
  const expectedLine = activeShot?.tm
    ? (() => {
        const speed = (activeShot.tm.speed ?? activeShot.pr.speed) * 0.44704;
        const vla   = activeShot.tm.vla   ?? activeShot.pr.vla;
        const vlaRad = (vla * Math.PI) / 180;
        const steps  = 40;
        const tFlight = (2 * speed * Math.sin(vlaRad)) / 9.81;
        return Array.from({ length: steps + 1 }, (_, i) => {
          const t = (i / steps) * tFlight;
          return {
            carry:  +(speed * Math.cos(vlaRad) * t * 1.09361).toFixed(1),
            height: +Math.max(0, (speed * Math.sin(vlaRad) * t - 0.5 * 9.81 * t * t) * 3.28084).toFixed(1),
          };
        });
      })()
    : [];

  const allPts = [...activeLineData, ...expectedLine];
  const maxCarry  = Math.max(...allPts.map(d => d.carry),  100);
  const maxHeight = Math.max(...allPts.map(d => d.height), 30);

  if (!activeShot) {
    return (
      <div style={{ height:320, display:"flex", alignItems:"center", justifyContent:"center", background:"#f0f4ff", borderRadius:16, border:"1px solid #e5e9f0", color:"#9ca3af", fontSize:14, flexDirection:"column", gap:8 }}>
        <span style={{ fontSize:32 }}>⛳</span>
        <span>Select a shot to see trajectory</span>
      </div>
    );
  }

  return (
    <div>
      {/* Point count badge */}
      {hasRealTraj && (
        <div style={{ display:"flex", gap:16, padding:"8px 4px 0", flexWrap:"wrap", marginBottom:4 }}>
          <span style={{ fontSize:11, color:"#06b6d4", fontWeight:700 }}>
            ● {realDots.length} real detections
          </span>
          {predictedDots.length > 0 && (
            <span style={{ fontSize:11, color:"#8b5cf6", fontWeight:700 }}>
              ◌ {predictedDots.length} predicted
            </span>
          )}
          <span style={{ fontSize:11, color:"#9ca3af" }}>
            {activeShot.trackPts ?? activeShot.trajectory?.length ?? "?"} total pts
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart margin={{ top:12, right:20, left:8, bottom:24 }}>
          <defs>
            <linearGradient id="trajFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#1a6bff" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#1a6bff" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />

          <XAxis dataKey="carry" type="number"
            domain={[0, Math.ceil(maxCarry * 1.08)]}
            tick={{ fontSize:10, fill:"#9ca3af" }} axisLine={false} tickLine={false}
            label={{ value:"Carry (yards)", position:"insideBottom", offset:-14, fontSize:10, fill:"#9ca3af" }}
            tickFormatter={v => `${v}yd`}
          />
          <YAxis dataKey="height" type="number"
            domain={[0, Math.ceil(maxHeight * 1.2)]}
            tick={{ fontSize:10, fill:"#9ca3af" }} axisLine={false} tickLine={false}
            label={{ value:"Height (ft)", angle:-90, position:"insideLeft", offset:10, fontSize:10, fill:"#9ca3af" }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke:"#c7d7ff", strokeWidth:1 }} />

          {/* Historical shots — faint */}
          {histData.map((hd, i) => (
            <Line key={`h${i}`} data={hd} dataKey="height" type="monotoneX"
              stroke="#bfdbfe" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          ))}

          {/* TrackMan expected trajectory — green dashed */}
          {expectedLine.length > 0 && (
            <Line data={expectedLine} dataKey="height" type="monotoneX"
              stroke="#22c55e" strokeWidth={2} strokeDasharray="6 4"
              dot={false} isAnimationActive={false} />
          )}

          {/* Area fill */}
          <Area data={activeLineData} dataKey="height" type="monotoneX"
            stroke="none" fill="url(#trajFill)" isAnimationActive={false} />

          {/* Main trajectory line */}
          <Line data={activeLineData} dataKey="height" type="monotoneX"
            stroke="#1a6bff" strokeWidth={3} dot={false} isAnimationActive={false} />

          {/* Predicted/interpolated points — purple hollow */}
          {predictedDots.length > 0 && (
            <Scatter data={predictedDots} dataKey="height"
              fill="transparent" stroke="#8b5cf6" strokeWidth={2} r={5}
              isAnimationActive={false} />
          )}

          {/* Real detection points — teal solid */}
          {realDots.length > 0 && (
            <Scatter data={realDots} dataKey="height"
              fill="#06b6d4" r={5} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display:"flex", gap:16, padding:"4px 4px 0", flexWrap:"wrap" }}>
        {[
          { color:"#06b6d4",  filled:true,  label:"Real Detections" },
          { color:"#8b5cf6",  filled:false, label:"Predicted Points" },
          { color:"#1a6bff",  line:true,    label:"ProRange Trajectory" },
          { color:"#22c55e",  line:true,    label:"TM Reference" },
          { color:"#bfdbfe",  line:true,    label:"Previous Shots" },
        ].map(({ color, filled, line, label }) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#6b7280" }}>
            {line
              ? <div style={{ width:16, height:2, background:color, borderRadius:2 }}/>
              : <div style={{ width:10, height:10, borderRadius:"50%", background:filled?color:"transparent", border:`2px solid ${color}` }}/>
            }
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
