import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "md";
}

const VARIANTS: Record<string, React.CSSProperties> = {
  default: { background: "#fff",     color: "#374151", border: "1px solid #e5e7eb" },
  primary: { background: "#1a6bff", color: "#fff",     border: "1px solid #1a6bff" },
  danger:  { background: "#fff",     color: "#ef4444", border: "1px solid #fee2e2" },
  ghost:   { background: "transparent", color: "#6b7280", border: "none" },
};

const SIZES: Record<string, React.CSSProperties> = {
  sm: { padding: "5px 10px", fontSize: 12 },
  md: { padding: "8px 16px", fontSize: 13 },
};

export function Button({
  variant = "default",
  size = "md",
  style,
  children,
  ...props
}: ButtonProps) {
  const base: React.CSSProperties = {
    borderRadius: 10,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "DM Sans, sans-serif",
    transition: "opacity 0.15s",
    ...VARIANTS[variant],
    ...SIZES[size],
    ...style,
  };

  return (
    <button style={base} {...props}>
      {children}
    </button>
  );
}
