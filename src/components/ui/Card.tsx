import React from "react";

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

interface CardHeaderProps {
  title: React.ReactNode;
  action?: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const cardBase: React.CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  boxShadow: "0 2px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
  border: "1px solid #f0f2f7",
};

export function Card({ children, style }: CardProps) {
  return <div style={{ ...cardBase, ...style }}>{children}</div>;
}

export function CardHeader({ title, action }: CardHeaderProps) {
  return (
    <div style={{
      padding: "18px 22px",
      borderBottom: "1px solid #f5f6fa",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <span style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8, color: "#1a1d2e" }}>
        {title}
      </span>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardBody({ children, style }: CardBodyProps) {
  return <div style={{ padding: 22, ...style }}>{children}</div>;
}
