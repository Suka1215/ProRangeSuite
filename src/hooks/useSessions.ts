import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEY, LIVE_SESSION_ID, LIVE_SHOTS_KEY } from "../constants";
import { calcSessionStats } from "../utils/stats";
import { loadTMIndex, findTMRef } from "../utils/tmMatcher";
import type { Session, SessionShot, Shot, SessionStatsResult } from "../types";

function loadSessions(): Session[] {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveSessions(s: Session[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
function loadLiveShots(): Shot[] {
  try { const r = localStorage.getItem(LIVE_SHOTS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveLiveShots(s: Shot[]) {
  try { localStorage.setItem(LIVE_SHOTS_KEY, JSON.stringify(s)); } catch {}
}

function shotToSessionShot(shot: Shot, idx: number): SessionShot {
  return {
    id: String(shot.id), shotNum: idx + 1,
    pr: { speed: shot.pr.speed, vla: shot.pr.vla, hla: shot.pr.hla, carry: shot.pr.carry, spin: shot.pr.spin },
    tm: shot.tm ?? null,
    trackPts: shot.trackPts,
  };
}

function buildLiveSession(shots: Shot[], version: string): Session {
  return {
    id: LIVE_SESSION_ID,
    date: new Date().toISOString().slice(0, 10),
    version,
    label: "Live iPhone shots",
    club:  shots[shots.length - 1]?.club ?? "7-Iron",
    shots: shots.map(shotToSessionShot),
    createdAt: Date.now(),
  };
}

export function useSessions(currentVersion = "v22.86") {
  const [sessions,  setSessions]  = useState<Session[]>(() => loadSessions());
  const [liveShots, setLiveShots] = useState<Shot[]>(() => loadLiveShots());
  const [tmReady,   setTmReady]   = useState(false);

  useEffect(() => { saveSessions(sessions); }, [sessions]);
  useEffect(() => { saveLiveShots(liveShots); }, [liveShots]);

  // On mount: load TM CSV and retroactively enrich any shot with tm: null
  useEffect(() => {
    loadTMIndex().then(rows => {
      if (rows.length === 0) { setTmReady(true); return; }

      // Enrich live shots
      setLiveShots(prev => {
        const anyMissing = prev.some(s => !s.tm);
        if (!anyMissing) { setTmReady(true); return prev; }
        const patched = prev.map(s => {
          if (s.tm) return s;
          const tm = findTMRef(s.pr.speed, s.pr.vla, rows);
          return { ...s, tm };
        });
        const enriched = patched.filter(s => s.tm).length;
        console.log(`[TM] Retroactively enriched ${enriched}/${prev.length} live shots`);
        setTmReady(true);
        return patched;
      });

      // Enrich named sessions too
      setSessions(prev => prev.map(session => ({
        ...session,
        shots: session.shots.map(sh => {
          if (sh.tm) return sh;
          const tm = findTMRef(sh.pr.speed, sh.pr.vla, rows);
          return { ...sh, tm };
        }),
      })));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When a new live shot arrives, immediately attach TM reference
  const addLiveShot = useCallback((shot: Shot) => {
    if (shot.tm) {
      setLiveShots(prev => [...prev, shot]);
      return;
    }
    loadTMIndex().then(rows => {
      const tm = findTMRef(shot.pr.speed, shot.pr.vla, rows);
      setLiveShots(prev => [...prev, { ...shot, tm }]);
    });
  }, []);

  const clearLiveShots = () => setLiveShots([]);

  const addSession = (session: Session) =>
    setSessions(prev => [...prev.filter(s => s.id !== LIVE_SESSION_ID), session]);

  const deleteSession = (id: string) => {
    if (id === LIVE_SESSION_ID) clearLiveShots();
    else setSessions(prev => prev.filter(s => s.id !== id));
  };

  const resetToSeed = () => { setSessions([]); setLiveShots([]); };

  const liveSession: Session | null =
    liveShots.length > 0 ? buildLiveSession(liveShots, currentVersion) : null;

  const allSessions: Session[] = liveSession ? [...sessions, liveSession] : sessions;

  return {
    sessions: allSessions,
    namedSessions: sessions,
    liveShots,
    liveSession,
    tmReady,
    addSession,
    deleteSession,
    resetToSeed,
    addLiveShot,
    clearLiveShots,
    getStats: calcSessionStats,
  };
}
