import React, { useState } from "react";
import { Button } from "../components/ui/Button";
import { MetricDelta } from "../components/ui/MetricDelta";
import { METRIC_META, VERSION_COLORS } from "../constants";
import { calcSessionStats } from "../utils/stats";
import { formatDateFull } from "../utils/dates";
import type { Session, MetricKey } from "../types";

interface AllSessionsViewProps {
  sessions:  Session[];
  onDelete:  (id: string) => void;
  onReset:   () => void;
  onNew:     () => void;
}

export default function AllSessionsView({ sessions, onDelete, onReset, onNew }: AllSessionsViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:"-.3px" }}>All Sessions</h1>
          <p style={{ color:"#6b7280", fontSize:13, marginTop:3 }}>
            {sessions.length} sessions · Stored locally in your browser
          </p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Button size="sm" style={{ color:"#9ca3af" }} onClick={onReset}>Reset Demo</Button>
          <Button size="sm" variant="primary" onClick={onNew}>+ New Session</Button>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {sessions.length === 0 && (
          <div style={{ background:"#fff", borderRadius:18, border:"1px solid rgba(0,0,0,.06)", padding:"60px 40px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>
            <div style={{ fontSize:32, marginBottom:10 }}>📅</div>
            No sessions yet. Create a new session to get started.
          </div>
        )}

        {sessions.slice().reverse().map((s, ri) => {
          const i      = sessions.length - 1 - ri;
          const stats  = calcSessionStats(s);
          const color  = VERSION_COLORS[i % VERSION_COLORS.length];
          const isOpen = expanded === s.id;

          return (
            <div key={s.id} style={{ background:"#fff", borderRadius:18, border:"1px solid rgba(0,0,0,.06)", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.03)", transition:"box-shadow .2s" }}>
              {/* Header row */}
              <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", gap:16, cursor:"pointer" }} onClick={() => setExpanded(isOpen ? null : s.id)}>
                <div style={{ width:4, height:48, borderRadius:2, background:color, flexShrink:0 }} />

                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{ fontWeight:800, fontSize:15, color:"#1a1d2e" }}>{s.version}</span>
                    <span style={{ background:"#f3f4f6", color:"#6b7280", fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20 }}>{s.club}</span>
                    {s.label && <span style={{ fontSize:12, color:"#6b7280" }}>{s.label}</span>}
                  </div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>{formatDateFull(s.date)} · {s.shots.length} shots</div>
                </div>

                {/* Metric pills */}
                <div style={{ display:"flex", gap:22 }}>
                  {(["speed","vla","carry"] as MetricKey[]).map((key) => {
                    const st = stats[key];
                    const ok = st && Math.abs(st.mean) <= 1;
                    return (
                      <div key={key} style={{ textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", letterSpacing:".4px", marginBottom:3 }}>{METRIC_META[key].label.split(" ")[0]}</div>
                        <div style={{ fontSize:15, fontWeight:800, fontFamily:"'DM Mono',monospace", color: !st ? "#d1d5db" : ok ? "#16a34a" : "#ef4444" }}>
                          {st ? `${st.mean >= 0 ? "+" : ""}${st.mean}%` : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:11, color:"#9ca3af", width:12, textAlign:"center" }}>{isOpen ? "▲" : "▼"}</span>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} style={{ background:"rgba(239,68,68,.08)", color:"#ef4444", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:700, border:"none", cursor:"pointer" }}>
                    Delete
                  </button>
                </div>
              </div>

              {/* Expanded shot table */}
              {isOpen && (
                <div style={{ borderTop:"1px solid #f0f2f7", animation:"fadeIn 0.2s ease" }}>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#fafbff" }}>
                          {["#","PR Speed","TM Speed","Δ%","PR VLA","TM VLA","Δ%","Carry","Spin","Pts"].map((h) => (
                            <th key={h} style={{ padding:"9px 12px", fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".4px", borderBottom:"1px solid #f0f2f7", textAlign:"center" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.shots.map((sh) => (
                          <tr key={sh.id} style={{ borderBottom:"1px solid #f9fafb" }}>
                            <td style={{ padding:"8px 12px", color:"#9ca3af", fontSize:12, textAlign:"center" }}>{sh.shotNum}</td>
                            <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:12, textAlign:"center", fontWeight:700 }}>{sh.pr.speed}</td>
                            <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:12, textAlign:"center", color:"#9ca3af" }}>{sh.tm?.speed ?? "—"}</td>
                            <td style={{ padding:"8px 12px", textAlign:"center" }}><MetricDelta pr={sh.pr.speed} tm={sh.tm?.speed} /></td>
                            <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:12, textAlign:"center", fontWeight:700 }}>{sh.pr.vla}°</td>
                            <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:12, textAlign:"center", color:"#9ca3af" }}>{sh.tm?.vla != null ? sh.tm.vla+"°" : "—"}</td>
                            <td style={{ padding:"8px 12px", textAlign:"center" }}><MetricDelta pr={sh.pr.vla} tm={sh.tm?.vla} /></td>
                            <td style={{ padding:"8px 12px", fontSize:12, textAlign:"center" }}>{sh.pr.carry} yd</td>
                            <td style={{ padding:"8px 12px", fontSize:12, textAlign:"center", fontFamily:"monospace" }}>{(+sh.pr.spin).toLocaleString()}</td>
                            <td style={{ padding:"8px 12px", fontSize:12, textAlign:"center", fontWeight:700, color:(sh.trackPts??0)>=13?"#16a34a":"#f97316" }}>{sh.trackPts ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
