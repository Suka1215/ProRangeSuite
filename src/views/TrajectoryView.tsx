import React from "react";
import { TrajectoryCanvas } from "../components/charts/TrajectoryCanvas";
import { Button } from "../components/ui/Button";
import { METRICS, METRIC_LABELS } from "../constants";
import { MetricDelta } from "../components/ui/MetricDelta";
import type { Shot } from "../types";

interface TrajectoryViewProps {
  shots:        Shot[];
  activeShot:   Shot | null;
  playing:      boolean;
  onSelectShot: (shot: Shot) => void;
  onPlay:       () => void;
  onPlayDone:   () => void;
}

export default function TrajectoryView({ shots, activeShot, playing, onSelectShot, onPlay, onPlayDone }: TrajectoryViewProps) {
  return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:"-.3px" }}>Trajectory Playback</h1>
          <p style={{ color:"#6b7280", fontSize:13, marginTop:3 }}>Animated frame-by-frame replay with numbered detection points</p>
        </div>
        <button onClick={onPlay} disabled={playing} style={{
          background: playing ? "rgba(239,68,68,.1)" : "linear-gradient(135deg,#1a6bff,#0038b8)",
          color: playing ? "#ef4444" : "#fff",
          borderRadius:100, padding:"10px 24px", fontSize:14, fontWeight:700,
          boxShadow: playing ? "none" : "0 4px 16px rgba(26,107,255,.38)",
          opacity: playing ? 1 : 1, border: playing ? "1px solid rgba(239,68,68,.3)" : "none",
        }}>
          {playing ? "⏳ Playing…" : "▶ Play Shot"}
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:14 }}>

        {/* Main canvas card */}
        <div style={{ background:"#fff", borderRadius:18, border:"1px solid rgba(0,0,0,.06)", overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,.04)" }}>
          <div style={{ padding:"14px 18px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#1a1d2e" }}>◌ Ball Trajectory</span>
            <div style={{ display:"flex", gap:14, fontSize:11, color:"#9ca3af" }}>
              <span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ width:8, height:8, borderRadius:"50%", background:"#1a6bff", display:"inline-block" }}/>ProRange</span>
              <span style={{ display:"flex", alignItems:"center", gap:4, color:"#22c55e" }}><span style={{ fontWeight:900 }}>─</span>Expected</span>
              <span style={{ display:"flex", alignItems:"center", gap:4, color:"#06b6d4" }}>◉ Detection pts</span>
              <span style={{ display:"flex", alignItems:"center", gap:4, color:"#f97316" }}>⬤ Apex</span>
            </div>
          </div>
          <TrajectoryCanvas shots={shots} activeShot={activeShot} playing={playing} onPlayDone={onPlayDone} />
        </div>

        {/* Right column */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* Shot selector */}
          <div style={{ background:"#fff", borderRadius:18, border:"1px solid rgba(0,0,0,.06)", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.03)" }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #f0f2f7" }}>
              <span style={{ fontSize:12, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".5px" }}>Shot Select</span>
            </div>
            <div style={{ maxHeight:220, overflowY:"auto" }}>
              {shots.length === 0 ? (
                <div style={{ padding:"20px 16px", color:"#9ca3af", fontSize:12, textAlign:"center" }}>No shots yet</div>
              ) : shots.slice().reverse().map((s, i) => (
                <div key={String(s.id)} onClick={() => onSelectShot(s)} style={{
                  padding:"10px 16px", cursor:"pointer",
                  background: activeShot?.id === s.id ? "#eff6ff" : "transparent",
                  borderBottom:"1px solid #f9fafb",
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  transition:"background .1s",
                }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>Shot #{shots.length - i}</div>
                    <div style={{ fontSize:11, color:"#9ca3af" }}>{s.club} · {s.trackPts} pts</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:13, fontWeight:700, fontFamily:"monospace", color:"#1a6bff" }}>{s.pr.vla}°</div>
                    <div style={{ fontSize:11, color:"#9ca3af" }}>{s.pr.speed} mph</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shot metrics */}
          {activeShot && (
            <div style={{ background:"#fff", borderRadius:18, border:"1px solid rgba(0,0,0,.06)", padding:"14px 16px", boxShadow:"0 2px 8px rgba(0,0,0,.03)" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".5px", marginBottom:10 }}>Shot Metrics</div>
              {METRICS.map((m) => (
                <div key={m} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #f9fafb", fontSize:12 }}>
                  <span style={{ color:"#6b7280", fontWeight:600 }}>{METRIC_LABELS[m].split(" ")[0]}</span>
                  <div style={{ textAlign:"right", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontWeight:800, fontFamily:"monospace", color:"#1a1d2e" }}>{activeShot.pr[m]}</span>
                    {activeShot.tm?.[m] != null && (
                      <span style={{ color:"#9ca3af", fontSize:11 }}>/ {activeShot.tm[m]}</span>
                    )}
                    {activeShot.tm?.[m] != null && (
                      <MetricDelta pr={activeShot.pr[m]} tm={activeShot.tm[m]} />
                    )}
                  </div>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", fontSize:12 }}>
                <span style={{ color:"#6b7280", fontWeight:600 }}>Track Pts</span>
                <span style={{ fontWeight:800, color:(activeShot.trackPts??0)>=13?"#16a34a":"#f97316" }}>{activeShot.trackPts}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
