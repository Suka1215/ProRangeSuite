import React from "react";
import { TrendChart } from "../components/charts/TrendChart";
import { METRIC_META } from "../constants";
import { calcSessionStats } from "../utils/stats";
import { formatDateShort } from "../utils/dates";
import type { Session, MetricKey } from "../types";

interface Props { sessions: Session[]; }

const METRIC_KEYS: MetricKey[] = ["vla","speed","hla","carry","spin"];

export default function TrendView({ sessions }: Props) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div>
        <h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-.4px"}}>Trend Charts</h1>
        <p style={{color:"#6b7280",fontSize:13,marginTop:4}}>Mean error per metric across sessions — green band = ±1% target</p>
      </div>

      {METRIC_KEYS.map(key => {
        const meta = METRIC_META[key];
        const sessionValues = sessions.map(s => ({
          session: s,
          val: calcSessionStats(s)[key]?.mean ?? null,
        })).filter((d): d is {session:Session;val:number} => d.val !== null);

        return (
          <div key={key} style={{
            background:"#fff", borderRadius:18,
            border:"1px solid rgba(0,0,0,.06)",
            boxShadow:"0 1px 8px rgba(0,0,0,.05)",
            padding:"18px 20px 14px",
          }}>
            {/* Card header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:meta.color}}/>
                <span style={{fontSize:14,fontWeight:700,color:"#1a1d2e"}}>{meta.label}</span>
              </div>
              <div style={{display:"flex",gap:14,flexWrap:"wrap",justifyContent:"flex-end"}}>
                {sessionValues.map(({session,val}) => (
                  <span key={session.id} style={{
                    fontSize:11.5,fontFamily:"DM Mono,monospace",fontWeight:600,
                    color:Math.abs(val)<=1?"#16a34a":"#ef4444",
                  }}>
                    {session.version} ({formatDateShort(session.date)}): {val>=0?"+":""}{val}%
                  </span>
                ))}
              </div>
            </div>

            <TrendChart sessions={sessions} metric={key} height={160}/>
          </div>
        );
      })}
    </div>
  );
}
