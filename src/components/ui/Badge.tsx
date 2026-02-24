import React from "react";

interface BadgeProps {
  pass?: boolean;
  na?: boolean;
  children: React.ReactNode;
}

export function Badge({ pass, na, children }: BadgeProps) {
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: na ? "#f3f4f6" : pass ? "#f0fdf4" : "#fef2f2",
    color:      na ? "#9ca3af" : pass ? "#16a34a" : "#ef4444",
  };
  return <span style={style}>{children}</span>;
}

interface ChipProps {
  pass: boolean;
}

export function Chip({ pass }: ChipProps) {
  return (
    <Badge pass={pass}>
      {pass ? "PASS" : "FAIL"}
    </Badge>
  );
}
