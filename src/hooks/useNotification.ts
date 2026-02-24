import { useState, useCallback } from "react";
import type { Notification } from "../types";

export function useNotification() {
  const [notification, setNotification] = useState<Notification | null>(null);

  const notify = useCallback((msg: string, type: Notification["type"] = "ok") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  return { notification, notify };
}
