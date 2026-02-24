import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer, Legend,
} from "recharts";
import { VERSION_COLORS } from "../../constants";
import { pctError } from "../../utils/stats";
import type { Session, MetricKey } from "../../types";

interface SessionCompareChartProps {
  sessions: Session[];
  selectedIds: string[];
  metric: MetricKey;
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "12px 16px",
      boxShadow: "0 4px 20px rgba(0,0,0,.13)", border: "1px solid #f0f2f7",
      fontSize: 12, fontFamily: "DM Sans, sans-serif", minWidth: 140,
    }}>
      <div style={{ color: "#9ca3af", marginBottom: 8, fontSize: 11 }}>Shot #{label}</div>
      {payload.map((entry: any) => {
        const pass = Math.abs(entry.value) <= 1;
        return (
          <div key={entry.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
            <span style={{ color: "#374151", flex: 1 }}>{entry.name}</span>
            <span style={{ fontWeight: 700, color: pass ? "#16a34a" : "#ef4444", fontFamily: "DM Mono, monospace" }}>
              {entry.value >= 0 ? "+" : ""}{entry.value?.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

export function SessionCompareChart({ sessions, selectedIds, metric, height = 260 }: SessionCompareChartProps) {
  const selected = sessions.filter(s => selectedIds.includes(s.id));
  if (!selected.length) return null;

  // Build data keyed by shot index
  const maxShots = Math.max(...selected.map(s => s.shots.length), 0);
  const data = Array.from({ length: maxShots }, (_, i) => {
    const pt: Record<string, any> = { shot: i + 1 };
    selected.forEach(s => {
      const shot = s.shots[i];
      if (shot?.tm?.[metric] != null) {
        pt[s.version] = parseFloat(pctError(shot.pr[metric], shot.tm![metric]!).toFixed(1));
      }
    });
    return pt;
  }).filter(pt => Object.keys(pt).length > 1);

  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13, background: "#f8faff", borderRadius: 10 }}>
        No TrackMan comparison data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 16, right: 16, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" vertical={false} />

        <ReferenceArea y1={-1} y2={1} fill="rgba(34,197,94,0.07)" />
        <ReferenceLine y={0}  stroke="#e5e7eb" strokeWidth={1.5} />
        <ReferenceLine y={1}  stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: "+1%", position: "right", fontSize: 9, fill: "#22c55e" }} />
        <ReferenceLine y={-1} stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: "-1%", position: "right", fontSize: 9, fill: "#22c55e" }} />

        <XAxis
          dataKey="shot"
          label={{ value: "Shot Number →", position: "insideBottom", offset: -12, fontSize: 11, fill: "#9ca3af" }}
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `${v >= 0 ? "+" : ""}${v}%`}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#e5e7eb", strokeWidth: 1 }} />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }}
        />

        {selected.map((s, i) => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={s.version}
            stroke={VERSION_COLORS[sessions.indexOf(s) % VERSION_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            connectNulls
            animationDuration={500}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
