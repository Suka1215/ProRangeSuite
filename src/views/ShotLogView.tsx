import React from "react";
import { Button } from "../components/ui/Button";
import { Chip, Badge } from "../components/ui/Badge";
import { MetricDelta } from "../components/ui/MetricDelta";
import { pctError } from "../utils/stats";
import type { Shot } from "../types";

interface ShotLogViewProps {
  shots: Shot[];
  activeShot: Shot | null;
  onSelectShot: (shot: Shot) => void;
  onClear: () => void;
  onExport: () => void;
}

export default function ShotLogView({ shots, activeShot, onSelectShot, onClear, onExport }: ShotLogViewProps) {
  return (
    <div style={{ animation: "slideUp 0.25s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:"-.3px" }}>Shot Log</h1>
          <p style={{ color:"#6b7280", fontSize:13, marginTop:3 }}>
            {shots.length} shots · Click any row to view trajectory
          </p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Button variant="danger" size="sm" onClick={onClear}>Clear All</Button>
          <Button size="sm" onClick={onExport}>↓ Export CSV</Button>
        </div>
      </div>

      <div style={{ background:"#fff", borderRadius:18, border:"1px solid rgba(0,0,0,.06)", overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,.04)" }}>
        {shots.length > 0 ? (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#fafbff" }}>
                  {["#","Club","Time","Speed PR","Speed TM","Δ Speed","VLA PR","VLA TM","Δ VLA","Carry","Spin","Pts","Status"].map((h) => (
                    <th key={h} style={{ padding:"12px 14px", fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".5px", borderBottom:"1px solid #f0f2f7", textAlign:"left", whiteSpace:"nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shots.map((s, i) => {
                  const hasTM = s.tm?.vla != null && s.tm?.speed != null;
                  const vPass = hasTM && Math.abs(pctError(s.pr.vla,   s.tm!.vla!))   <= 1;
                  const sPass = hasTM && Math.abs(pctError(s.pr.speed, s.tm!.speed!)) <= 1;
                  const active = activeShot?.id === s.id;
                  return (
                    <tr key={String(s.id)} onClick={() => onSelectShot(s)} style={{
                      cursor:"pointer",
                      background: active ? "#eff6ff" : "transparent",
                      borderBottom:"1px solid #f9fafb",
                      transition:"background .1s",
                    }}>
                      <td style={{ padding:"11px 14px", fontWeight:700, color:"#9ca3af", fontSize:12 }}>#{i+1}</td>
                      <td style={{ padding:"11px 14px", fontSize:13, fontWeight:600 }}>{s.club}</td>
                      <td style={{ padding:"11px 14px", color:"#9ca3af", fontSize:12 }}>{s.timestamp}</td>
                      <td style={{ padding:"11px 14px", fontFamily:"monospace", fontWeight:700 }}>{s.pr.speed}</td>
                      <td style={{ padding:"11px 14px", fontFamily:"monospace", color:"#9ca3af" }}>{s.tm?.speed ?? "—"}</td>
                      <td style={{ padding:"11px 14px" }}><MetricDelta pr={s.pr.speed} tm={s.tm?.speed} /></td>
                      <td style={{ padding:"11px 14px", fontFamily:"monospace", fontWeight:700 }}>{s.pr.vla}°</td>
                      <td style={{ padding:"11px 14px", fontFamily:"monospace", color:"#9ca3af" }}>{s.tm?.vla != null ? s.tm.vla+"°" : "—"}</td>
                      <td style={{ padding:"11px 14px" }}><MetricDelta pr={s.pr.vla} tm={s.tm?.vla} /></td>
                      <td style={{ padding:"11px 14px", fontSize:13 }}>{s.pr.carry} yd</td>
                      <td style={{ padding:"11px 14px", fontFamily:"monospace", fontSize:12 }}>{(+s.pr.spin).toLocaleString()}</td>
                      <td style={{ padding:"11px 14px", fontWeight:700, color: s.trackPts == null ? "#9ca3af" : s.trackPts>=13?"#16a34a":"#f97316" }}>
                        {s.trackPts ?? "—"}
                      </td>
                      <td style={{ padding:"11px 14px" }}>
                        {hasTM ? <Chip pass={!!(vPass && sPass)} /> : <Badge na>N/A</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding:"60px 40px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>
            <div style={{ fontSize:32, marginBottom:10 }}>📋</div>
            No shots logged yet. Use "Generate Shot" or go to Input Data.
          </div>
        )}
      </div>
    </div>
  );
}
