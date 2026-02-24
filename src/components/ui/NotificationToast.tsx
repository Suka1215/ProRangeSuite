import React from "react";
import type { Notification } from "../../types";

interface NotificationToastProps {
  notification: Notification | null;
}

export function NotificationToast({ notification }: NotificationToastProps) {
  if (!notification) return null;

  const isErr = notification.type === "err";

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        padding: "10px 16px",
        borderRadius: 10,
        background: isErr ? "#fef2f2" : "#f0fdf4",
        border: `1px solid ${isErr ? "#fecaca" : "#bbf7d0"}`,
        color: isErr ? "#dc2626" : "#16a34a",
        fontWeight: 600,
        fontSize: 13,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        animation: "fadeIn 0.2s ease",
      }}
    >
      {notification.msg}
    </div>
  );
}
