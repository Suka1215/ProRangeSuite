import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { METRIC_META, PASS_THRESHOLD } from "../constants";
import { pctError } from "../utils/stats";
import type { Shot, MetricKey } from "../types";

interface AccuracyViewProps { shots: Shot[]; tmReady?: boolean; }

const METRIC_LIST: MetricKey[] = ["speed","vla","hla","carry","spin"];

const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const pass = Math.abs(val) <= 1;
  return (
    <div style={{background:"#fff",borderRadius:10,padding:"10px 14px",boxShadow:"0 4px 20px rgba(0,0,0,.12)",border:"1px solid #f0f2f7",fontSize:12}}>
      <div style={{color:"#9ca3af",marginBottom:4}}>Shot #{label}</div>
      <div style={{fontWeight:800,fontSize:15,color:pass?"#16a34a":"#dc2626",fontFamily:"DM Mono,monospace"}}>{val>=0?"+":""}{val?.toFixed(1)}%</div>
      <div style={{fontSize:11,color:pass?"#16a34a":"#ef4444",marginTop:2}}>{pass?"✓ Within ±1%":"✗ Outside ±1%"}</div>
    </div>
  );
};

export default function AccuracyView({ shots, tmReady }: AccuracyViewProps) {
  const [metric, setMetric] = useState<MetricKey>("vla");

  const withTM   = shots.filter(s => s.tm?.[metric] != null);
  const errors   = withTM.map(s => parseFloat(pctError(s.pr[metric], s.tm![metric]!).toFixed(2)));
  const mean     = errors.length ? parseFloat((errors.reduce((a,b)=>a+b,0)/errors.length).toFixed(2)) : null;
  const std      = mean!==null&&errors.length>1 ? parseFloat(Math.sqrt(errors.map(v=>(v-mean)**2).reduce((a,b)=>a+b,0)/errors.length).toFixed(2)) : null;
  const passRate = errors.length ? parseFloat((errors.filter(e=>Math.abs(e)<=PASS_THRESHOLD).length/errors.length*100).toFixed(1)) : null;

  const barData = withTM.map((s,i) => ({
    shot: i+1,
    error: parseFloat(pctError(s.pr[metric], s.tm![metric]!).toFixed(2)),
  }));

  const summaryRows = METRIC_LIST.map(m => {
    const wt = shots.filter(s => s.tm?.[m] != null);
    const errs = wt.map(s => pctError(s.pr[m], s.tm![m]!));
    const avg = errs.length ? errs.reduce((a,b)=>a+b,0)/errs.length : null;
    return { key: m, label: METRIC_META[m]?.label ?? m, mean: avg!==null ? parseFloat(avg.toFixed(2)) : null, pass: avg!==null&&Math.abs(avg)<=1 };
  });

  return (
    <div>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-.4px"}}>Accuracy Dashboard</h1>
        <p style={{color:"#6b7280",fontSize:13,marginTop:4}}>ProRange vs TrackMan — per-shot error analysis</p>
      </div>
      {/* TM source banner */}
      {tmReady && shots.some(s=>s.tm) && (
        <div style={{background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.25)",borderRadius:12,padding:"10px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:10,fontSize:12}}>
          <span style={{fontSize:16}}>📊</span>
          <span><b style={{color:"#16a34a"}}>TrackMan reference active</b> — each shot is compared to the nearest matching shot from the 10,000-shot PGA TrackMan dataset by club + ball speed.</span>
        </div>
      )}
      {!tmReady && (
        <div style={{background:"rgba(251,146,60,.08)",border:"1px solid rgba(251,146,60,.25)",borderRadius:12,padding:"10px 16px",marginBottom:18,fontSize:12,color:"#92400e"}}>
          ⏳ Loading TrackMan reference database…
        </div>
      )}

      {/* Stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
        {[
          {label:"Mean Error",    val:mean!==null?`${mean>=0?"+":""}${mean}%`:"—",  ok:mean!==null&&Math.abs(mean)<=1},
          {label:"Std Dev",       val:std!==null?`±${std}%`:"—",                    ok:std!==null&&std<=1},
          {label:"Pass Rate",     val:passRate!==null?`${passRate}%`:"—",           ok:passRate!==null&&passRate>=95},
          {label:"Shots w/ TM",  val:`${withTM.length} / ${shots.length}`,          ok:withTM.length>0},
        ].map(({label,val,ok}) => (
          <div key={label} style={{background:"#fff",borderRadius:16,padding:"16px 18px",border:"1px solid rgba(0,0,0,.06)",boxShadow:"0 1px 6px rgba(0,0,0,.05)"}}>
            <div style={{fontSize:10.5,color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>{label}</div>
            <div style={{fontSize:22,fontWeight:800,color:ok?"#16a34a":"#ef4444",fontFamily:"DM Mono,monospace"}}>{val}</div>
          </div>
        ))}
      </div>

      {/* Metric tabs */}
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {METRIC_LIST.map(m => {
          const a=metric===m;
          return (
            <button key={m} onClick={()=>setMetric(m)} style={{
              padding:"7px 16px",borderRadius:100,border:"none",fontSize:13,fontWeight:a?700:500,
              background:a?"#1a6bff":"rgba(0,0,0,.06)",color:a?"#fff":"#555",cursor:"pointer",transition:"all .15s",
            }}>{METRIC_META[m]?.label??m}</button>
          );
        })}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
        {/* Bar chart */}
        <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,.06)",boxShadow:"0 1px 8px rgba(0,0,0,.05)",padding:"20px 16px 12px"}}>
          <div style={{fontSize:13.5,fontWeight:700,marginBottom:4}}>Error Per Shot — {METRIC_META[metric]?.label??metric}</div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:16}}>Green band = ±1% target</div>
          {barData.length===0 ? (
            <div style={{height:240,display:"flex",alignItems:"center",justifyContent:"center",color:"#9ca3af",fontSize:13}}>No TrackMan data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} margin={{top:8,right:8,left:0,bottom:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false}/>
                <ReferenceLine y={1}  stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5}/>
                <ReferenceLine y={-1} stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5}/>
                <ReferenceLine y={0}  stroke="#e5e7eb" strokeWidth={1.5}/>
                <XAxis dataKey="shot" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v>=0?"+":""}${v}%`} width={44}/>
                <Tooltip content={<BarTooltip/>} cursor={{fill:"rgba(0,0,0,.03)"}}/>
                <Bar dataKey="error" radius={[4,4,0,0]} maxBarSize={24} animationDuration={500}>
                  {barData.map((d,i)=>(
                    <Cell key={i} fill={Math.abs(d.error)<=1?"#22c55e":"#ef4444"} fillOpacity={0.8}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* All-metrics summary */}
        <div style={{background:"#fff",borderRadius:18,border:"1px solid rgba(0,0,0,.06)",boxShadow:"0 1px 8px rgba(0,0,0,.05)",padding:"20px 20px 16px"}}>
          <div style={{fontSize:13.5,fontWeight:700,marginBottom:4}}>All Metrics Summary</div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:20}}>Mean error vs TrackMan across all shots</div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {summaryRows.map(({key,label,mean:mv,pass}) => {
              const pct=mv!==null?Math.min(Math.abs(mv)/20*100,100):0;
              return (
                <div key={key}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:13,fontWeight:700}}>{label}</span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:12,fontFamily:"DM Mono,monospace",fontWeight:700,color:pass?"#16a34a":"#ef4444"}}>
                        {mv!==null?`${mv>=0?"+":""}${mv}%`:"—"}
                      </span>
                      <span style={{fontSize:9.5,fontWeight:800,padding:"2px 8px",borderRadius:20,background:mv===null?"#f3f4f6":pass?"#f0fdf4":"#fef2f2",color:mv===null?"#9ca3af":pass?"#16a34a":"#ef4444"}}>
                        {mv===null?"N/A":pass?"PASS":"FAIL"}
                      </span>
                    </div>
                  </div>
                  <div style={{height:7,background:"#f3f4f6",borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,borderRadius:4,background:mv===null?"#bfdbfe":pass?"#22c55e":"#ef4444",transition:"width .6s ease"}}/>
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
