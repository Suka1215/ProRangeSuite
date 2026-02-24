import React, { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import { METRIC_META, VERSION_COLORS } from "../constants";
import { calcSessionStats, pctError } from "../utils/stats";
import { formatDateShort } from "../utils/dates";
import type { Session, MetricKey } from "../types";

interface Props {
  sessions: Session[];
  selectedIds: string[];
  onToggleSession: (id: string) => void;
}

const METRICS: MetricKey[] = ["vla","speed","hla","carry","spin"];

const CmpTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#fff",borderRadius:12,padding:"12px 16px",boxShadow:"0 4px 20px rgba(0,0,0,.13)",border:"1px solid #f0f2f7",fontSize:12,minWidth:140}}>
      <div style={{color:"#9ca3af",marginBottom:8,fontSize:11}}>Shot #{label}</div>
      {payload.map((p: any) => {
        const pass = Math.abs(p.value) <= 1;
        return (
          <div key={p.dataKey} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:p.color,flexShrink:0}}/>
            <span style={{color:"#374151",flex:1,fontFamily:"DM Mono,monospace",fontSize:11}}>{p.dataKey}</span>
            <span style={{fontWeight:700,color:pass?"#16a34a":"#ef4444",fontFamily:"DM Mono,monospace"}}>
              {p.value>=0?"+":""}{p.value?.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default function CompareView({ sessions, selectedIds, onToggleSession }: Props) {
  const [metric, setMetric] = useState<MetricKey>("vla");
  const [localSelected, setLocalSelected] = useState<string[]>(sessions.map(s=>s.id));

  const toggle = (id: string) => {
    setLocalSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  };

  const selected = sessions.filter(s => localSelected.includes(s.id));
  const maxShots = Math.max(...selected.map(s => s.shots.length), 0);

  const chartData = Array.from({length: maxShots}, (_, i) => {
    const pt: Record<string,any> = { shot: i+1 };
    selected.forEach(s => {
      const sh = s.shots[i];
      if (sh?.tm?.[metric] != null) {
        pt[s.version] = parseFloat(pctError(sh.pr[metric], sh.tm![metric]!).toFixed(2));
      }
    });
    return pt;
  });

  /* Session stat cards */
  const statRows = sessions.map((s,i) => {
    const st = calcSessionStats(s);
    const vla = st.vla?.mean ?? null;
    const spd = st.speed?.mean ?? null;
    return { s, i, vla, spd, pass: vla!==null&&Math.abs(vla)<=1, color: VERSION_COLORS[i%VERSION_COLORS.length] };
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div>
        <h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-.4px"}}>Session Comparison</h1>
        <p style={{color:"#6b7280",fontSize:13,marginTop:4}}>Overlay sessions to see how each code change moved the needle</p>
      </div>

      {/* Session selector grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
        {statRows.map(({s,i,vla,spd,pass,color}) => {
          const sel = localSelected.includes(s.id);
          return (
            <div key={s.id} onClick={()=>toggle(s.id)} style={{
              background:sel?color+"10":"#fff",
              borderRadius:14,padding:"14px 16px",
              border:`2px solid ${sel?color:"rgba(0,0,0,.06)"}`,
              boxShadow:"0 1px 6px rgba(0,0,0,.05)",
              cursor:"pointer",transition:"all .15s",
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:12.5,fontWeight:800,fontFamily:"DM Mono,monospace",color:sel?color:"#374151"}}>{s.version}</span>
                <span style={{fontSize:9.5,fontWeight:800,padding:"2px 8px",borderRadius:20,background:pass?"#f0fdf4":"#fef2f2",color:pass?"#16a34a":"#ef4444"}}>{pass?"PASS":"FAIL"}</span>
              </div>
              <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{formatDateShort(s.date)} · {s.shots.length} shots</div>
              <div style={{fontSize:20,fontWeight:800,color:pass?"#16a34a":"#ef4444",fontFamily:"DM Mono,monospace"}}>
                {vla!==null?`${vla>=0?"+":""}${vla}%`:"—"}
              </div>
              <div style={{fontSize:10.5,color:"#9ca3af",marginTop:2}}>VLA error</div>
              {s.label && <div style={{fontSize:10.5,color:"#9ca3af",marginTop:6,fontStyle:"italic"}}>{s.label}</div>}
            </div>
          );
        })}
      </div>

      {/* Metric tabs */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {METRICS.map(m => {
          const a=metric===m;
          return (
            <button key={m} onClick={()=>setMetric(m)} style={{
              padding:"7px 16px",borderRadius:100,border:"none",fontSize:13,fontWeight:a?700:500,
              background:a?"#1a6bff":"rgba(0,0,0,.06)",color:a?"#fff":"#555",cursor:"pointer",transition:"all .15s",
            }}>{METRIC_META[m]?.label??m}</button>
          );
        })}
      </div>

      {/* Main comparison chart */}
      <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,.06)",boxShadow:"0 1px 8px rgba(0,0,0,.05)",padding:"20px 20px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:13.5,fontWeight:700}}>Shot-by-Shot Error — {METRIC_META[metric]?.label??metric}</span>
          <span style={{fontSize:11,color:"#9ca3af"}}>Dashed = session mean · Green band = ±1%</span>
        </div>
        <div style={{display:"flex",gap:14,marginBottom:14,flexWrap:"wrap"}}>
          {selected.map((s,i) => {
            const idx = sessions.indexOf(s);
            const st = calcSessionStats(s);
            const mv = st[metric]?.mean ?? null;
            return (
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:VERSION_COLORS[idx%VERSION_COLORS.length]}}/>
                <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:VERSION_COLORS[idx%VERSION_COLORS.length]}}>{s.version}</span>
                <span style={{color:"#9ca3af"}}>μ={mv!==null?`${mv>=0?"+":""}${mv}%`:"—"}</span>
              </div>
            );
          })}
        </div>

        {chartData.filter(d=>Object.keys(d).length>1).length === 0 ? (
          <div style={{height:250,display:"flex",alignItems:"center",justifyContent:"center",color:"#9ca3af",fontSize:13}}>No TrackMan comparison data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{top:8,right:16,left:4,bottom:24}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false}/>
              <ReferenceArea y1={-1} y2={1} fill="rgba(34,197,94,.06)"/>
              <ReferenceLine y={1}  stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5}/>
              <ReferenceLine y={-1} stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5}/>
              <ReferenceLine y={0}  stroke="#e5e7eb" strokeWidth={1.5}/>
              <XAxis dataKey="shot" tick={{fontSize:10.5,fill:"#9ca3af"}} axisLine={false} tickLine={false}
                label={{value:"Shot Number →",position:"insideBottom",offset:-14,fontSize:11,fill:"#9ca3af"}}/>
              <YAxis tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}
                tickFormatter={v=>`${v>=0?"+":""}${v}%`} width={44}/>
              <Tooltip content={<CmpTooltip/>} cursor={{stroke:"#e5e7eb",strokeWidth:1}}/>
              {selected.map((s) => {
                const idx = sessions.indexOf(s);
                return (
                  <Line key={s.id} type="monotone" dataKey={s.version}
                    stroke={VERSION_COLORS[idx%VERSION_COLORS.length]} strokeWidth={2}
                    dot={{r:3,strokeWidth:0}} activeDot={{r:5}}
                    connectNulls animationDuration={400}/>
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-metric summary table */}
      <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,.06)",boxShadow:"0 1px 8px rgba(0,0,0,.05)",padding:"20px 20px 16px"}}>
        <div style={{fontSize:13.5,fontWeight:700,marginBottom:16}}>Per-Metric Mean Error — All Sessions</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                <th style={{textAlign:"left",padding:"8px 12px",color:"#9ca3af",fontWeight:600,fontSize:11}}>Version</th>
                {METRICS.map(m=>(
                  <th key={m} style={{textAlign:"right",padding:"8px 12px",color:"#9ca3af",fontWeight:600,fontSize:11}}>{METRIC_META[m]?.label??m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s,i) => {
                const st = calcSessionStats(s);
                return (
                  <tr key={s.id} style={{borderTop:"1px solid #f5f6fa"}}>
                    <td style={{padding:"10px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:VERSION_COLORS[i%VERSION_COLORS.length],flexShrink:0}}/>
                        <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:12,color:VERSION_COLORS[i%VERSION_COLORS.length]}}>{s.version}</span>
                        <span style={{color:"#9ca3af",fontSize:11}}>{formatDateShort(s.date)}</span>
                      </div>
                    </td>
                    {METRICS.map(m=>{
                      const mv = st[m]?.mean ?? null;
                      const pass = mv!==null&&Math.abs(mv)<=1;
                      return (
                        <td key={m} style={{textAlign:"right",padding:"10px 12px"}}>
                          <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:12,color:mv===null?"#9ca3af":pass?"#16a34a":"#ef4444"}}>
                            {mv!==null?`${mv>=0?"+":""}${mv}%`:"—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
