import React from "react";

type BadgeColor = "green" | "blue" | "orange" | "red" | "gray";

interface BadgeProps {
  pass?: boolean;
  na?: boolean;
  color?: BadgeColor;
  children: React.ReactNode;
}

const BADGE_COLORS: Record<BadgeColor, { background: string; color: string }> = {
  green: { background: "#f0fdf4", color: "#16a34a" },
  blue: { background: "#eff6ff", color: "#2563eb" },
  orange: { background: "#fff7ed", color: "#ea580c" },
  red: { background: "#fef2f2", color: "#ef4444" },
  gray: { background: "#f3f4f6", color: "#9ca3af" },
};

export function Badge({ pass, na, color, children }: BadgeProps) {
  const resolvedColor: BadgeColor = color ?? (na ? "gray" : pass ? "green" : "red");
  const palette = BADGE_COLORS[resolvedColor];

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: palette.background,
    color: palette.color,
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
