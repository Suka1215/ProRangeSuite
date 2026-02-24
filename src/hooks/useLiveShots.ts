import { useEffect, useRef, useState, useCallback } from "react";
import type { Shot } from "../types";

export type LiveStatus = "disconnected" | "connecting" | "connected";

interface UseLiveShotsOptions {
  onShot: (shot: Shot) => void;
  onNotify: (msg: string, type?: "ok" | "err") => void;
}

export function useLiveShots({ onShot, onNotify }: UseLiveShotsOptions) {
  const [status,    setStatus]    = useState<LiveStatus>("disconnected");
  const [shotCount, setShotCount] = useState(0);
  const wsRef      = useRef<WebSocket | null>(null);
  const activeRef  = useRef(true);   // start true — we auto-connect on mount
  const reconnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callbacks in refs so WebSocket handlers always call the latest version
  // without needing to recreate the socket on every render
  const onShotRef   = useRef(onShot);
  const onNotifyRef = useRef(onNotify);
  useEffect(() => { onShotRef.current   = onShot;   }, [onShot]);
  useEffect(() => { onNotifyRef.current = onNotify; }, [onNotify]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host  = window.location.hostname;
    // Dev (vite on 5173) → server on 3000; prod → same port
    const port  = window.location.port === "5173" ? "3000" : window.location.port || "3000";
    const url   = `${proto}//${host}:${port}`;

    console.log("[LiveShots] Connecting to", url);
    setStatus("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[LiveShots] Connected");
      setStatus("connected");
      onNotifyRef.current("📡 Live connected — waiting for shots", "ok");
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "shot" && msg.shot) {
          onShotRef.current(msg.shot as Shot);
          setShotCount(n => n + 1);
          onNotifyRef.current(`🏌️ ${msg.shot.pr.speed} mph · VLA ${msg.shot.pr.vla}°`, "ok");
        }
      } catch (e) {
        console.error("[LiveShots] Parse error", e);
      }
    };

    ws.onerror = (e) => {
      console.warn("[LiveShots] WS error", e);
    };

    ws.onclose = () => {
      console.log("[LiveShots] Closed — reconnecting in 2s");
      setStatus("disconnected");
      wsRef.current = null;
      if (activeRef.current) {
        reconnTimer.current = setTimeout(connect, 2000);
      }
    };
  }, []); // stable — uses refs for callbacks

  const disconnect = useCallback(() => {
    activeRef.current = false;
    if (reconnTimer.current) clearTimeout(reconnTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
    onNotifyRef.current("Live disconnected");
  }, []);

  const reconnect = useCallback(() => {
    activeRef.current = true;
    connect();
  }, [connect]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => {
      activeRef.current = false;
      if (reconnTimer.current) clearTimeout(reconnTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, shotCount, connect: reconnect, disconnect };
}
