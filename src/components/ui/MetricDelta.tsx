import React from "react";
import { PASS_THRESHOLD } from "../../constants";
import { pctError } from "../../utils/stats";

interface MetricDeltaProps {
  pr: number;
  tm: number | null | undefined;
}

export function MetricDelta({ pr, tm }: MetricDeltaProps) {
  if (tm == null) {
    return <span style={{ color: "#9ca3af" }}>—</span>;
  }

  const err  = pctError(pr, tm);
  const pass = Math.abs(err) <= PASS_THRESHOLD;

  return (
    <span
      style={{
        color: pass ? "#16a34a" : "#ef4444",
        fontWeight: 600,
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      {err >= 0 ? "+" : ""}{err.toFixed(1)}%
    </span>
  );
}
