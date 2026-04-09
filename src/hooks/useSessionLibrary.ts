import { useCallback, useEffect, useMemo, useState } from "react";
import { VERSION_COLORS } from "../constants";
import type { Shot } from "../types";

interface StartSessionOptions {
  title?: string;
  club?: string;
  color?: string;
}

interface SessionLibraryState {
  activeSessionId: string | null;
  buckets: SessionLibraryBucket[];
}

export interface SessionLibraryBucket {
  id: string;
  kind: "misc" | "session";
  title: string;
  club: string;
  color: string;
  source: string;
  shotCount: number;
  createdAt: number;
  updatedAt: number;
  shots: Shot[];
  isActive: boolean;
}

const SESSION_LIBRARY_KEY = "prorange_session_library_v1";
const MISC_BUCKET_ID = "misc";

function randomSessionColor() {
  return VERSION_COLORS[Math.floor(Math.random() * VERSION_COLORS.length)];
}

function normalizeShot(shot: Shot): Shot {
  return {
    ...shot,
    capturedAt: shot.capturedAt ?? Date.now(),
    pr: {
      ...shot.pr,
      total: shot.pr.total ?? shot.pr.carry,
    },
    tm: shot.tm
      ? {
          ...shot.tm,
          total: shot.tm.total ?? shot.tm.carry,
        }
      : null,
  };
}

function compareShots(left: Shot, right: Shot) {
  const timeDelta = (left.capturedAt ?? 0) - (right.capturedAt ?? 0);
  if (timeDelta !== 0) return timeDelta;
  return String(left.id).localeCompare(String(right.id));
}

function createMiscBucket(): SessionLibraryBucket {
  return {
    id: MISC_BUCKET_ID,
    kind: "misc",
    title: "Misc",
    club: "Mixed",
    color: "#262930",
    source: "app",
    shotCount: 0,
    createdAt: 0,
    updatedAt: 0,
    shots: [],
    isActive: false,
  };
}

function normalizeBucket(
  bucket: Partial<SessionLibraryBucket> | undefined,
  activeClub: string,
  activeSessionId: string | null
): SessionLibraryBucket {
  const kind = bucket?.kind === "session" ? "session" : "misc";
  const shots = Array.isArray(bucket?.shots) ? bucket!.shots.map(normalizeShot).sort(compareShots) : [];
  const firstCapturedAt = shots[0]?.capturedAt ?? 0;
  const lastCapturedAt = shots[shots.length - 1]?.capturedAt ?? firstCapturedAt;
  const createdAt = typeof bucket?.createdAt === "number" && Number.isFinite(bucket.createdAt)
    ? bucket.createdAt
    : firstCapturedAt;
  const updatedAt = typeof bucket?.updatedAt === "number" && Number.isFinite(bucket.updatedAt)
    ? bucket.updatedAt
    : lastCapturedAt || createdAt;
  const club = typeof bucket?.club === "string" && bucket.club.trim()
    ? bucket.club
    : kind === "misc"
      ? "Mixed"
      : shots[shots.length - 1]?.club ?? activeClub;

  return {
    id: typeof bucket?.id === "string" && bucket.id.trim() ? bucket.id : MISC_BUCKET_ID,
    kind,
    title: kind === "misc"
      ? "Misc"
      : typeof bucket?.title === "string" && bucket.title.trim()
        ? bucket.title
        : `${club} Session`,
    club,
    color: kind === "misc"
      ? "#262930"
      : typeof bucket?.color === "string" && bucket.color.trim()
        ? bucket.color
        : randomSessionColor(),
    source: typeof bucket?.source === "string" && bucket.source.trim() ? bucket.source : "app",
    shotCount: Math.max(
      typeof bucket?.shotCount === "number" && Number.isFinite(bucket.shotCount) ? bucket.shotCount : 0,
      shots.length
    ),
    createdAt,
    updatedAt,
    shots,
    isActive: kind === "session" && bucket?.id === activeSessionId,
  };
}

function normalizeBuckets(rawBuckets: unknown, activeClub: string, activeSessionId: string | null) {
  const sourceBuckets = Array.isArray(rawBuckets) ? rawBuckets : [];
  const rawMiscBucket = sourceBuckets.find((bucket) => {
    return Boolean(bucket) && typeof bucket === "object" && "id" in bucket && (bucket as { id?: unknown }).id === MISC_BUCKET_ID;
  });

  const miscBucket = normalizeBucket(rawMiscBucket as Partial<SessionLibraryBucket> | undefined, activeClub, activeSessionId);

  const sessionBuckets = sourceBuckets
    .filter((bucket) => {
      return Boolean(bucket)
        && typeof bucket === "object"
        && "kind" in bucket
        && (bucket as { kind?: unknown }).kind === "session";
    })
    .map((bucket) => normalizeBucket(bucket as Partial<SessionLibraryBucket>, activeClub, activeSessionId))
    .filter((bucket) => bucket.id !== MISC_BUCKET_ID)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  return [miscBucket, ...sessionBuckets];
}

function loadState(activeClub: string): { state: SessionLibraryState; error: string | null } {
  if (typeof window === "undefined") {
    return {
      state: { activeSessionId: null, buckets: [createMiscBucket()] },
      error: null,
    };
  }

  try {
    const raw = window.localStorage.getItem(SESSION_LIBRARY_KEY);
    if (!raw) {
      return {
        state: { activeSessionId: null, buckets: [createMiscBucket()] },
        error: null,
      };
    }

    const parsed = JSON.parse(raw) as Partial<SessionLibraryState>;
    const activeSessionId = typeof parsed?.activeSessionId === "string" ? parsed.activeSessionId : null;

    return {
      state: {
        activeSessionId,
        buckets: normalizeBuckets(parsed?.buckets, activeClub, activeSessionId),
      },
      error: null,
    };
  } catch (error) {
    console.error("[SessionLibrary] Failed to read local session library:", error);

    return {
      state: { activeSessionId: null, buckets: [createMiscBucket()] },
      error: "We couldn't read your saved app sessions on this device.",
    };
  }
}

function saveState(state: SessionLibraryState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_LIBRARY_KEY, JSON.stringify(state));
}

export function useSessionLibrary(_uid: string | null | undefined, activeClub: string) {
  const initial = useMemo(() => loadState(activeClub), [activeClub]);
  const [state, setState] = useState<SessionLibraryState>(initial.state);
  const [error, setError] = useState<string | null>(initial.error);

  const buckets = useMemo(() => {
    return normalizeBuckets(state.buckets, activeClub, state.activeSessionId);
  }, [activeClub, state.activeSessionId, state.buckets]);

  useEffect(() => {
    try {
      saveState({ activeSessionId: state.activeSessionId, buckets });
    } catch (storageError) {
      console.error("[SessionLibrary] Failed to persist local session library:", storageError);
      setError("We couldn't save your app sessions on this device.");
    }
  }, [buckets, state.activeSessionId]);

  const startSession = useCallback(async (options?: StartSessionOptions) => {
    const createdAt = Date.now();
    const sessionId = `session-${createdAt}`;
    const sessionClub = options?.club?.trim() || activeClub;
    const title =
      options?.title?.trim() ||
      `${sessionClub} Session ${new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

    setState((current) => ({
      activeSessionId: sessionId,
      buckets: [
        {
          id: sessionId,
          kind: "session",
          title,
          club: sessionClub,
          color: options?.color?.trim() || randomSessionColor(),
          source: "app",
          shotCount: 0,
          createdAt,
          updatedAt: createdAt,
          shots: [],
          isActive: true,
        },
        ...normalizeBuckets(current.buckets, activeClub, current.activeSessionId).filter((bucket) => bucket.id !== sessionId),
      ],
    }));

    return sessionId;
  }, [activeClub]);

  const endSession = useCallback(async () => {
    setState((current) => ({
      ...current,
      activeSessionId: null,
    }));
  }, []);

  const deleteBucket = useCallback(async (bucketId: string) => {
    setState((current) => {
      const nextBuckets = normalizeBuckets(current.buckets, activeClub, current.activeSessionId);

      if (bucketId === MISC_BUCKET_ID) {
        return {
          ...current,
          buckets: nextBuckets.map((bucket) => {
            if (bucket.id !== MISC_BUCKET_ID) return bucket;
            return {
              ...bucket,
              shotCount: 0,
              updatedAt: 0,
              shots: [],
            };
          }),
        };
      }

      return {
        activeSessionId: current.activeSessionId === bucketId ? null : current.activeSessionId,
        buckets: nextBuckets.filter((bucket) => bucket.id !== bucketId),
      };
    });
  }, [activeClub]);

  const recordShot = useCallback((shot: Shot) => {
    const normalizedShot = normalizeShot(shot);

    setState((current) => {
      const nextBuckets = normalizeBuckets(current.buckets, activeClub, current.activeSessionId);
      const targetId = current.activeSessionId ?? MISC_BUCKET_ID;
      const targetIndex = nextBuckets.findIndex((bucket) => bucket.id === targetId);
      if (targetIndex < 0) return current;

      const targetBucket = nextBuckets[targetIndex];
      const existingIndex = targetBucket.shots.findIndex((existingShot) => String(existingShot.id) === String(normalizedShot.id));

      const nextShots = existingIndex >= 0
        ? targetBucket.shots.map((existingShot, index) => (index === existingIndex ? normalizedShot : existingShot)).sort(compareShots)
        : [...targetBucket.shots, normalizedShot].sort(compareShots);
      const updatedAt = nextShots[nextShots.length - 1]?.capturedAt ?? Date.now();

      nextBuckets[targetIndex] = {
        ...targetBucket,
        club: targetBucket.kind === "session" ? targetBucket.club || normalizedShot.club : "Mixed",
        shotCount: Math.max(targetBucket.shotCount, nextShots.length),
        updatedAt,
        createdAt: targetBucket.createdAt || nextShots[0]?.capturedAt || updatedAt,
        shots: nextShots,
      };

      return {
        ...current,
        buckets: nextBuckets,
      };
    });
  }, [activeClub]);

  return {
    buckets,
    activeSessionId: state.activeSessionId,
    loading: false,
    error,
    startSession,
    endSession,
    deleteBucket,
    recordShot,
  };
}
