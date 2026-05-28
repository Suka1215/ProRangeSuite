import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEY, LIVE_SESSION_ID, LIVE_SHOTS_KEY } from "../constants";
import { calcSessionStats } from "../utils/stats";
import { loadTMIndex, findTMRef } from "../utils/tmMatcher";
import type { Session, SessionShot, Shot, SessionStatsResult } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function firstPresent(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function asNumber(value: unknown, fallback = Number.NaN) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asOptionalNumber(value: unknown) {
  const parsed = asNumber(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asNullableNumber(value: unknown) {
  const parsed = asNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStoredShot(value: unknown, index = 0): Shot | null {
  if (!isRecord(value)) return null;

  const pr = isRecord(value.pr) ? value.pr : {};
  const tm = isRecord(value.tm) ? value.tm : null;
  const ball = isRecord(value.BallData)
    ? value.BallData
    : isRecord(value.ballData)
      ? value.ballData
      : {};
  const metadata = isRecord(value.metadata)
    ? value.metadata
    : isRecord(value.Metadata)
      ? value.Metadata
      : {};

  const speed = asNumber(firstPresent(pr.speed, pr.ballSpeed, value.ballSpeedMPH, value.ballSpeedMph, value.ballSpeed, ball.Speed, ball.BallSpeed, ball.speed, ball.ballSpeed));
  const vla = asNumber(firstPresent(pr.vla, value.launchAngleDeg, value.launchAngle, value.vla, ball.VLA, ball.LaunchAngle, ball.launchAngle, ball.vla));
  const hla = asNumber(firstPresent(pr.hla, value.launchDirectionDeg, value.launchDirection, value.hla, ball.HLA, ball.LaunchDirection, ball.launchDirection, ball.hla), 0);
  const carry = asNumber(firstPresent(pr.carry, value.carryYards, value.carryDistance, value.carry, ball.CarryDistance, ball.Carry, ball.carryDistance, ball.carry), 0);
  const spin = asNumber(firstPresent(pr.spin, value.spinRPM, value.spin, value.spinRate, value.totalSpin, ball.TotalSpin, ball.BackSpin, ball.SpinRate, ball.spin, ball.spinRate), 0);

  if (!Number.isFinite(speed) || !Number.isFinite(vla)) {
    return null;
  }

  const capturedAt = asOptionalNumber(firstPresent(value.capturedAt, value.createdAt, value.timestamp, metadata.timestamp)) ?? Date.now() + index;

  return {
    id: String(firstPresent(value.id, metadata.shotID, metadata.shotId, `local-shot-${capturedAt}-${index}`)),
    club: String(firstPresent(metadata.club, value.club, "7-Iron")),
    timestamp: typeof value.timestamp === "string" ? value.timestamp : new Date(capturedAt).toLocaleTimeString(),
    capturedAt,
    pr: {
      speed,
      vla,
      hla,
      carry,
      spin,
      total: asOptionalNumber(firstPresent(pr.total, value.totalYards, value.totalDistance, ball.TotalDistance, ball.Total)),
      clubSpeed: asOptionalNumber(firstPresent(pr.clubSpeed, value.clubSpeed, value.clubSpeedMPH, ball.ClubSpeed)),
      smashFactor: asOptionalNumber(firstPresent(pr.smashFactor, value.smashFactor, ball.SmashFactor)),
    },
    tm: tm
      ? {
          speed: asOptionalNumber(tm.speed),
          vla: asOptionalNumber(tm.vla),
          hla: asOptionalNumber(tm.hla),
          carry: asOptionalNumber(tm.carry),
          spin: asOptionalNumber(tm.spin),
          total: asOptionalNumber(tm.total),
          clubSpeed: asOptionalNumber(tm.clubSpeed),
          smashFactor: asOptionalNumber(tm.smashFactor),
        }
      : null,
    trackPts: asNullableNumber(firstPresent(value.trackPts, value.framesCaptured, metadata.trackPts, metadata.framesCaptured)),
  };
}

function normalizeStoredSession(value: unknown, index = 0): Session | null {
  if (!isRecord(value)) return null;
  const shots = Array.isArray(value.shots)
    ? value.shots.map((shot, shotIndex) => normalizeStoredShot(shot, shotIndex)).filter((shot): shot is Shot => Boolean(shot))
    : [];
  const createdAt = asOptionalNumber(value.createdAt) ?? Date.now() + index;

  return {
    id: String(firstPresent(value.id, `session-${createdAt}-${index}`)),
    date: typeof value.date === "string" ? value.date : new Date(createdAt).toISOString().slice(0, 10),
    version: String(firstPresent(value.version, value.title, "Saved session")),
    label: String(firstPresent(value.label, "Saved session")),
    club: String(firstPresent(value.club, shots[shots.length - 1]?.club, "7-Iron")),
    color: typeof value.color === "string" ? value.color : undefined,
    shots: shots.map(shotToSessionShot),
    createdAt,
  };
}

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredSession).filter((session): session is Session => Boolean(session));
  } catch {
    return [];
  }
}
function saveSessions(s: Session[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
function loadLiveShots(): Shot[] {
  try {
    const raw = localStorage.getItem(LIVE_SHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredShot).filter((shot): shot is Shot => Boolean(shot));
  } catch {
    return [];
  }
}
function saveLiveShots(s: Shot[]) {
  try { localStorage.setItem(LIVE_SHOTS_KEY, JSON.stringify(s)); } catch {}
}

function shotToSessionShot(shot: Shot, idx: number): SessionShot {
  return {
    id: String(shot.id), shotNum: idx + 1,
    club: shot.club,
    pr: {
      speed: shot.pr.speed,
      vla: shot.pr.vla,
      hla: shot.pr.hla,
      carry: shot.pr.carry,
      spin: shot.pr.spin,
      clubSpeed: shot.pr.clubSpeed,
      smashFactor: shot.pr.smashFactor,
    },
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
