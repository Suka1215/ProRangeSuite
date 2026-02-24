import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer, LabelList,
  Area, AreaChart, ComposedChart,
} from "recharts";
import { METRIC_META, VERSION_COLORS } from "../constants";
import { calcSessionStats, pctError } from "../utils/stats";
import { formatDateShort, formatDateFull } from "../utils/dates";
import type { Session, MetricKey } from "../types";

interface Props { sessions: Session[]; }

/* ── shared tooltip ── */
const PctTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#fff",borderRadius:10,padding:"10px 14px",boxShadow:"0 4px 20px rgba(0,0,0,.12)",border:"1px solid #f0f2f7",fontSize:12}}>
      <div style={{color:"#9ca3af",marginBottom:4}}>{label}</div>
      {payload.map((p: any) => {
        const pass = Math.abs(p.value) <= 1;
        return (
          <div key={p.dataKey} style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:p.color,flexShrink:0}}/>
            <span style={{fontWeight:700,color:pass?"#16a34a":"#ef4444",fontFamily:"DM Mono,monospace"}}>
              {p.value>=0?"+":""}{typeof p.value==="number"?p.value.toFixed(1):"—"}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

const CustomVlaDot = (props: any) => {
  const { cx, cy, payload } = props;
  const pass = Math.abs(payload.value) <= 1;
  return <circle cx={cx} cy={cy} r={6} fill={pass?"#22c55e":"#ef4444"} stroke="#fff" strokeWidth={2}/>;
};

export default function ProgressView({ sessions }: Props) {
  const latest     = sessions[sessions.length - 1];
  const latestStat = latest ? calcSessionStats(latest) : {};
  const latestVla  = latestStat.vla?.mean ?? null;

  /* VLA trend per session */
  const vlaSessionData = sessions.map(s => ({
    label: formatDateShort(s.date),
    version: s.version,
    value: calcSessionStats(s).vla?.mean ?? null,
  })).filter((d): d is typeof d & {value:number} => d.value !== null);

  /* Shot-by-shot VLA across all sessions */
  const shotByShot = sessions.flatMap((s, si) =>
    s.shots.filter(sh => sh.tm?.vla != null).map((sh, i) => ({
      idx: i + 1,
      session: s.version,
      error: parseFloat(pctError(sh.pr.vla, sh.tm!.vla!).toFixed(2)),
      color: VERSION_COLORS[si % VERSION_COLORS.length],
    }))
  );

  /* Combined shot-by-shot chart data grouped by shot index */
  const maxShots = Math.max(...sessions.map(s => s.shots.length), 0);
  const shotData = Array.from({ length: maxShots }, (_, i) => {
    const pt: Record<string, any> = { shot: i + 1 };
    sessions.forEach((s, si) => {
      const sh = s.shots[i];
      if (sh?.tm?.vla != null) {
        pt[s.version] = parseFloat(pctError(sh.pr.vla, sh.tm.vla).toFixed(2));
      }
    });
    return pt;
  });

  /* Per-metric progress */
  const metricKeys: MetricKey[] = ["speed", "vla", "hla", "carry", "spin"];
  const metricProgress = metricKeys.map(k => {
    const wt = latest?.shots.filter(s => s.tm?.[k] != null) ?? [];
    const errs = wt.map(s => pctError(s.pr[k], s.tm![k]!));
    const avg = errs.length ? errs.reduce((a,b)=>a+b,0)/errs.length : null;
    return { key: k, label: METRIC_META[k]?.label ?? k, mean: avg, pass: avg!==null&&Math.abs(avg)<=1, color: METRIC_META[k]?.color ?? "#6b7280" };
  });

  const improving = vlaSessionData.length >= 2
    && Math.abs(vlaSessionData[vlaSessionData.length-1].value) < Math.abs(vlaSessionData[0].value);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div>
        <h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-.4px"}}>Calibration Progress</h1>
        <p style={{color:"#6b7280",fontSize:13,marginTop:4}}>Journey to ±1% accuracy · {sessions.length} sessions logged</p>
      </div>

      {/* ── VLA Hero Card ── */}
      <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,.06)",boxShadow:"0 1px 8px rgba(0,0,0,.05)",padding:"22px 22px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>VLA Error Over Time</div>
            <div style={{display:"flex",alignItems:"baseline",gap:12}}>
              <span style={{fontSize:34,fontWeight:800,color:latestVla!==null&&Math.abs(latestVla)<=1?"#16a34a":"#ef4444",fontFamily:"DM Mono,monospace",letterSpacing:"-.5px"}}>
                {latestVla!==null?`${latestVla>=0?"+":""}${latestVla}%`:"—"}
              </span>
              <span style={{fontSize:14,color:"#9ca3af",fontWeight:500}}>current (target ±1%)</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,color:"#9ca3af"}}>Latest: <strong style={{color:"#374151"}}>{latest?.version ?? "—"}</strong></div>
            <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{latest?formatDateFull(latest.date):"—"}</div>
            {vlaSessionData.length>=2 && (
              <div style={{marginTop:6,fontSize:12,fontWeight:700,color:improving?"#16a34a":"#ef4444"}}>
                {improving?"↓ Improving":"↑ Getting worse"} since first session
              </div>
            )}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={vlaSessionData} margin={{top:16,right:20,left:4,bottom:4}}>
            <defs>
              <linearGradient id="vlaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity={0.15}/>
                <stop offset="100%" stopColor="#f97316" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false}/>
            <ReferenceArea y1={-1} y2={1} fill="rgba(34,197,94,.06)"/>
            <ReferenceLine y={1}  stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5}/>
            <ReferenceLine y={-1} stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5}/>
            <ReferenceLine y={0}  stroke="#e5e7eb" strokeWidth={1.5}/>
            <XAxis dataKey="label" tick={{fontSize:11,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v>=0?"+":""}${v}%`} width={46}/>
            <Tooltip content={<PctTooltip/>}/>
            <Area dataKey="value" fill="url(#vlaGrad)" stroke="none" isAnimationActive={false}/>
            <Line dataKey="value" stroke="#f97316" strokeWidth={2.5} dot={<CustomVlaDot/>} activeDot={{r:8,fill:"#f97316",stroke:"#fff",strokeWidth:2}} isAnimationActive={false}>
              <LabelList dataKey="value" position="top" formatter={(v: number) => `${v>=0?"+":""}${v}%`} style={{fontSize:10,fontWeight:700,fill:"#ef4444",fontFamily:"DM Mono,monospace"}}/>
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Shot-by-Shot VLA + Per-metric ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* Shot-by-shot multi-session */}
        <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,.06)",boxShadow:"0 1px 8px rgba(0,0,0,.05)",padding:"20px 20px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:13.5,fontWeight:700}}>Shot-by-Shot Error — VLA</span>
            <span style={{fontSize:11,color:"#9ca3af"}}>Dashed = session mean · Green band = ±1%</span>
          </div>
          <div style={{marginBottom:12,display:"flex",flexWrap:"wrap",gap:6}}>
            {sessions.map((s,i) => (
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#555"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:VERSION_COLORS[i%VERSION_COLORS.length]}}/>
                <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:VERSION_COLORS[i%VERSION_COLORS.length]}}>{s.version}</span>
                <span style={{color:"#9ca3af"}}>μ={calcSessionStats(s).vla?.mean!==null?`${(calcSessionStats(s).vla?.mean??0)>=0?"+":""}${calcSessionStats(s).vla?.mean}%`:"—"}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={shotData} margin={{top:8,right:8,left:4,bottom:20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false}/>
              <ReferenceArea y1={-1} y2={1} fill="rgba(34,197,94,.06)"/>
              <ReferenceLine y={1}  stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1}/>
              <ReferenceLine y={-1} stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1}/>
              <ReferenceLine y={0}  stroke="#e5e7eb" strokeWidth={1}/>
              <XAxis dataKey="shot" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false} label={{value:"Shot Number →",position:"insideBottom",offset:-12,fontSize:11,fill:"#9ca3af"}}/>
              <YAxis tick={{fontSize:9.5,fill:"#9ca3af"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v>=0?"+":""}${v}%`} width={42}/>
              <Tooltip content={<PctTooltip/>} cursor={{stroke:"#e5e7eb",strokeWidth:1}}/>
              {sessions.map((s,i) => (
                <Line key={s.id} dataKey={s.version} stroke={VERSION_COLORS[i%VERSION_COLORS.length]} strokeWidth={1.8} dot={{r:3,strokeWidth:0}} activeDot={{r:5}} connectNulls animationDuration={400}/>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Per-metric progress */}
        <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,.06)",boxShadow:"0 1px 8px rgba(0,0,0,.05)",padding:"20px 20px 20px"}}>
          <div style={{fontSize:13.5,fontWeight:700,marginBottom:4}}>📊 Progress to ±1% — All Metrics</div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:20}}>Based on latest session: {latest?.version ?? "—"}</div>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {metricProgress.map(({key,label,mean,pass,color}) => {
              const pct = mean!==null ? Math.min(Math.abs(mean)/20*100,100) : 0;
              const firstMean = sessions.length>0 ? calcSessionStats(sessions[0])[key]?.mean ?? null : null;
              const delta = mean!==null&&firstMean!==null ? Math.abs(firstMean)-Math.abs(mean) : null;
              return (
                <div key={key}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:color}}/>
                      <span style={{fontSize:13,fontWeight:700}}>{label}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {delta!==null&&(
                        <span style={{fontSize:11,color:delta>0?"#16a34a":"#ef4444",fontWeight:600}}>
                          {delta>0?"↓":""}{delta<0?"↑":""}{Math.abs(delta).toFixed(1)}%
                        </span>
                      )}
                      <span style={{fontSize:12,fontFamily:"DM Mono,monospace",fontWeight:700,color:pass?"#16a34a":"#ef4444"}}>
                        {mean!==null?`${mean>=0?"+":""}${mean}%`:"—"}
                      </span>
                      <span style={{fontSize:9.5,fontWeight:800,padding:"2px 8px",borderRadius:20,background:mean===null?"#f3f4f6":pass?"#f0fdf4":"#fef2f2",color:mean===null?"#9ca3af":pass?"#16a34a":"#ef4444"}}>
                        {mean===null?"N/A":pass?"PASS":"FAIL"}
                      </span>
                    </div>
                  </div>
                  <div style={{height:8,background:"#f3f4f6",borderRadius:4,overflow:"hidden",position:"relative"}}>
                    <div style={{height:"100%",width:`${pct}%`,borderRadius:4,background:mean===null?"#bfdbfe":pass?"#22c55e":"#ef4444",transition:"width .7s ease"}}/>
                    {/* ±1% target marker */}
                    <div style={{position:"absolute",top:0,left:"5%",width:1,height:"100%",background:"rgba(34,197,94,.5)"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
