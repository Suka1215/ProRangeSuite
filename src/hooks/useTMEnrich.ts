/**
 * useTMEnrich
 * On mount, finds all stored live shots that have tm:null and fetches
 * the nearest TrackMan reference from the server's /api/tm-lookup-batch.
 * Updates localStorage directly so they persist across refreshes.
 */
import { useEffect } from "react";
import { LIVE_SHOTS_KEY } from "../constants";
import type { Shot } from "../types";

export function useTMEnrich(liveShots: Shot[], onEnriched: (shots: Shot[]) => void) {
  useEffect(() => {
    const missing = liveShots.filter(s => s.tm === null && s.pr.speed > 0);
    if (missing.length === 0) return;

    const serverBase = `${window.location.protocol}//${window.location.hostname}:3000`;

    fetch(`${serverBase}/api/tm-lookup-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(missing.map(s => ({ id: s.id, speed: s.pr.speed, vla: s.pr.vla }))),
    })
      .then(r => r.json())
      .then(({ results }: { results: { id: string | number; tm: Shot["tm"] }[] }) => {
        const tmMap = new Map(results.map(r => [String(r.id), r.tm]));
        const enriched = liveShots.map(s => {
          const tm = tmMap.get(String(s.id));
          return tm ? { ...s, tm } : s;
        });
        // Persist back to localStorage
        try { localStorage.setItem(LIVE_SHOTS_KEY, JSON.stringify(enriched)); } catch {}
        onEnriched(enriched);
        console.log(`[TM-Enrich] Enriched ${results.filter(r => r.tm).length}/${missing.length} shots`);
      })
      .catch(e => console.warn("[TM-Enrich] Server not reachable:", e.message));
  // Only run once on mount (when liveShots first load from storage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
