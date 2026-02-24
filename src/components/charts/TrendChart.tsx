import React from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer, LabelList,
} from "recharts";
import { METRIC_META } from "../../constants";
import { calcSessionStats } from "../../utils/stats";
import { formatDateShort } from "../../utils/dates";
import type { MetricKey, Session } from "../../types";

interface TrendChartProps {
  sessions: Session[];
  metric: MetricKey;
  height?: number;
}

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!cx || !cy) return null;
  const pass = Math.abs(payload.value) <= 1;
  return <circle cx={cx} cy={cy} r={6} fill={pass?"#22c55e":"#ef4444"} stroke="#fff" strokeWidth={2.5}/>;
};

const TrendTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val  = payload[0]?.value;
  const pass = Math.abs(val) <= 1;
  return (
    <div style={{
      background:"#fff", borderRadius:10, padding:"10px 14px",
      boxShadow:"0 4px 20px rgba(0,0,0,.12)", border:"1px solid #f0f2f7",
      fontSize:12, fontFamily:"DM Sans, sans-serif",
    }}>
      <div style={{color:"#9ca3af", marginBottom:4}}>{label}</div>
      <div style={{fontWeight:800, fontSize:16, color:pass?"#16a34a":"#dc2626", fontFamily:"DM Mono, monospace"}}>
        {val>=0?"+":""}{val?.toFixed(2)}%
      </div>
      <div style={{color:pass?"#16a34a":"#ef4444", marginTop:2, fontSize:11}}>
        {pass?"✓ Within ±1% target":"✗ Outside ±1% target"}
      </div>
    </div>
  );
};

export function TrendChart({ sessions, metric, height = 180 }: TrendChartProps) {
  const data = sessions
    .map(s => ({
      label: `${s.version}\n${formatDateShort(s.date)}`,
      xLabel: formatDateShort(s.date),
      version: s.version,
      value: calcSessionStats(s)[metric]?.mean ?? null,
    }))
    .filter((d): d is typeof d & { value: number } => d.value !== null);

  if (!data.length) {
    return (
      <div style={{
        height, display:"flex", alignItems:"center", justifyContent:"center",
        color:"#9ca3af", fontSize:13, background:"#f9fafc", borderRadius:10,
        border:"1px solid #eef0f5",
      }}>No session data yet</div>
    );
  }

  const vals   = data.map(d => d.value);
  const minVal = Math.floor(Math.min(...vals, -4));
  const maxVal = Math.ceil(Math.max(...vals, 4));
  const color  = METRIC_META[metric]?.color ?? "#1a6bff";

  // Area fill under/over zero
  const areaData = data.map(d => ({ ...d, area: d.value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 22, right: 24, left: 4, bottom: 4 }}>
        <defs>
          <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.12}/>
            <stop offset="100%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false}/>

        {/* ±1% tolerance band — green fill */}
        <ReferenceArea y1={-1} y2={1} fill="rgba(34,197,94,0.07)" ifOverflow="visible"/>

        {/* Zero line */}
        <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1.5}/>

        {/* ±1% dashed guide lines */}
        <ReferenceLine y={1}  stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5}/>
        <ReferenceLine y={-1} stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5}/>

        <XAxis
          dataKey="xLabel"
          tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: "DM Sans" }}
          axisLine={false} tickLine={false}
          dy={6}
        />
        <YAxis
          domain={[minVal, maxVal]}
          tick={{ fontSize: 10.5, fill: "#9ca3af", fontFamily: "DM Sans" }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `${v>=0?"+":""}${v}%`}
          width={46}
        />
        <Tooltip content={<TrendTooltip/>} cursor={{ stroke: "#e5e9f5", strokeWidth: 1 }}/>

        {/* Area fill */}
        <Area
          dataKey="value"
          fill={`url(#grad-${metric})`}
          stroke="none"
          isAnimationActive={false}
        />

        {/* Main line */}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          dot={<CustomDot/>}
          activeDot={{ r: 8, fill: color, stroke: "#fff", strokeWidth: 2 }}
          animationDuration={700}
        >
          <LabelList
            dataKey="value"
            position="top"
            formatter={(v: number) => `${v>=0?"+":""}${v}%`}
            style={{
              fontSize: 10, fontWeight: 700, fill: "#374151",
              fontFamily: "DM Mono, monospace",
            }}
          />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
