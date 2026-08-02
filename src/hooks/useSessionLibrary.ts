import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc } from "firebase/firestore";
import { VERSION_COLORS } from "../constants";
import { db } from "../lib/firebase";
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
  const pr = shot.pr ?? {
    speed: 0,
    vla: 0,
    hla: 0,
    carry: 0,
    spin: 0,
  };

  return {
    ...shot,
    capturedAt: shot.capturedAt ?? Date.now(),
    pr: {
      ...pr,
      total: pr.total ?? pr.carry,
      clubSpeed: pr.clubSpeed,
      clubHeadSpeedMph: pr.clubHeadSpeedMph,
      smashFactor: pr.smashFactor,
      spinAxisDeg: pr.spinAxisDeg,
      clubPathDeg: pr.clubPathDeg,
      faceAngleDeg: pr.faceAngleDeg,
      faceToPathDeg: pr.faceToPathDeg,
    },
    tm: shot.tm
      ? {
          ...shot.tm,
          total: shot.tm.total ?? shot.tm.carry,
          clubSpeed: shot.tm.clubSpeed,
          clubHeadSpeedMph: shot.tm.clubHeadSpeedMph,
          smashFactor: shot.tm.smashFactor,
          spinAxisDeg: shot.tm.spinAxisDeg,
          clubPathDeg: shot.tm.clubPathDeg,
          faceAngleDeg: shot.tm.faceAngleDeg,
          faceToPathDeg: shot.tm.faceToPathDeg,
        }
      : null,
  };
}

function compareShots(left: Shot, right: Shot) {
  const timeDelta = (left.capturedAt ?? 0) - (right.capturedAt ?? 0);
  if (timeDelta !== 0) return timeDelta;
  return String(left.id).localeCompare(String(right.id));
}

function sameShotIdentity(left: Shot, right: Shot) {
  if (String(left.id) === String(right.id)) return true;
  return (left.capturedAt ?? 0) === (right.capturedAt ?? 0) && left.club === right.club;
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

function serializeBucket(bucket: SessionLibraryBucket) {
  return {
    kind: bucket.kind,
    title: bucket.title,
    club: bucket.club,
    color: bucket.color,
    source: bucket.source,
    shotCount: bucket.shotCount,
    createdAt: bucket.createdAt,
    updatedAt: bucket.updatedAt,
    isActive: bucket.isActive,
    shots: bucket.shots.map(serializeFirestoreShot),
  };
}

function serializeSessionShot(shot: Shot) {
  return serializeFirestoreShot(shot);
}

function cleanNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function serializeFirestoreShot(shot: Shot) {
  const normalizedShot = normalizeShot(shot);
  const pr = {
    speed: cleanNumber(normalizedShot.pr.speed),
    vla: cleanNumber(normalizedShot.pr.vla),
    hla: cleanNumber(normalizedShot.pr.hla),
    carry: cleanNumber(normalizedShot.pr.carry),
    spin: cleanNumber(normalizedShot.pr.spin),
    total: cleanNumber(normalizedShot.pr.total, cleanNumber(normalizedShot.pr.carry)),
    clubSpeed: cleanOptionalNumber(normalizedShot.pr.clubSpeed),
    clubHeadSpeedMph: cleanOptionalNumber(normalizedShot.pr.clubHeadSpeedMph),
    smashFactor: cleanOptionalNumber(normalizedShot.pr.smashFactor),
    spinAxisDeg: cleanOptionalNumber(normalizedShot.pr.spinAxisDeg),
    clubPathDeg: cleanOptionalNumber(normalizedShot.pr.clubPathDeg),
    faceAngleDeg: cleanOptionalNumber(normalizedShot.pr.faceAngleDeg),
    faceToPathDeg: cleanOptionalNumber(normalizedShot.pr.faceToPathDeg),
  };
  const tm = normalizedShot.tm
    ? {
        speed: cleanOptionalNumber(normalizedShot.tm.speed),
        vla: cleanOptionalNumber(normalizedShot.tm.vla),
        hla: cleanOptionalNumber(normalizedShot.tm.hla),
        carry: cleanOptionalNumber(normalizedShot.tm.carry),
        spin: cleanOptionalNumber(normalizedShot.tm.spin),
        total: cleanOptionalNumber(normalizedShot.tm.total),
        clubSpeed: cleanOptionalNumber(normalizedShot.tm.clubSpeed),
        clubHeadSpeedMph: cleanOptionalNumber(normalizedShot.tm.clubHeadSpeedMph),
        smashFactor: cleanOptionalNumber(normalizedShot.tm.smashFactor),
        spinAxisDeg: cleanOptionalNumber(normalizedShot.tm.spinAxisDeg),
        clubPathDeg: cleanOptionalNumber(normalizedShot.tm.clubPathDeg),
        faceAngleDeg: cleanOptionalNumber(normalizedShot.tm.faceAngleDeg),
        faceToPathDeg: cleanOptionalNumber(normalizedShot.tm.faceToPathDeg),
      }
    : null;

  return {
    id: String(normalizedShot.id),
    club: normalizedShot.club,
    timestamp: normalizedShot.timestamp,
    capturedAt: cleanNumber(normalizedShot.capturedAt, Date.now()),
    pr,
    tm,
    trackPts: normalizedShot.trackPts ?? null,
  };
}

function sessionShotDocId(shot: Shot) {
  return encodeURIComponent(String(shot.id));
}

async function deleteSessionShotDocs(uid: string, bucketId: string) {
  const shotsCollection = collection(db, "users", uid, "dashboard-sessions", bucketId, "shots");
  const snapshot = await getDocs(shotsCollection);
  if (snapshot.empty) return;
  await Promise.all(snapshot.docs.map((shotDoc) => deleteDoc(shotDoc.ref)));
}

async function deleteNamedSessionShotDocs(uid: string, bucketId: string, shotIds: string[]) {
  if (!shotIds.length) return;
  await Promise.all(
    shotIds.map((shotId) =>
      deleteDoc(doc(db, "users", uid, "dashboard-sessions", bucketId, "shots", encodeURIComponent(shotId)))
    )
  );
}

function candidateShotKeys(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value);
    return normalized ? [normalized] : [];
  }
  return [];
}

function firstPresent(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function readNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toMillis(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
  }
  return null;
}

function metricFingerprint(shot: Shot) {
  const normalizedShot = normalizeShot(shot);
  return [
    normalizedShot.club.trim().toLowerCase(),
    normalizedShot.pr.speed.toFixed(1),
    normalizedShot.pr.vla.toFixed(1),
    normalizedShot.pr.hla.toFixed(1),
    Math.round(normalizedShot.pr.carry),
    Math.round(normalizedShot.pr.total ?? normalizedShot.pr.carry),
    Math.round(normalizedShot.pr.spin),
    normalizedShot.trackPts ?? "",
  ].join("|");
}

function cloudDocAsComparableShot(data: Record<string, unknown>, docId: string): Shot {
  const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
  const legacyMetadata = data.Metadata && typeof data.Metadata === "object" ? data.Metadata as Record<string, unknown> : {};
  const ball = data.BallData && typeof data.BallData === "object" ? data.BallData as Record<string, unknown> : data.ballData && typeof data.ballData === "object" ? data.ballData as Record<string, unknown> : {};
  const pr = data.pr && typeof data.pr === "object" ? data.pr as Record<string, unknown> : {};
  const payload = data as Record<string, unknown>;
  const capturedAt = firstPresent(
    data.capturedAt,
    payload.createdAt,
    payload.CreatedAt,
    data.timestamp,
    payload.Timestamp,
    metadata.timestamp,
    metadata.Timestamp,
    metadata.createdAt,
    metadata.CreatedAt,
    legacyMetadata.timestamp,
    legacyMetadata.Timestamp,
    legacyMetadata.createdAt,
    legacyMetadata.CreatedAt
  );

  return normalizeShot({
    id: String(firstPresent(data.id, data.shotID, data.shotId, metadata.shotID, metadata.shotId, metadata.ShotID, legacyMetadata.shotID, legacyMetadata.shotId, legacyMetadata.ShotID, docId)),
    club: String(firstPresent(metadata.club, metadata.Club, legacyMetadata.club, legacyMetadata.Club, data.club, payload.Club, "7-Iron")),
    timestamp: typeof data.timestamp === "string" ? data.timestamp : "",
    capturedAt: toMillis(capturedAt) ?? undefined,
    pr: {
      speed: readNumber(firstPresent(pr.speed, pr.ballSpeed, data.ballSpeedMPH, payload.ballSpeedMph, payload.ballSpeed, ball.Speed, ball.BallSpeed, ball.speed, ball.ballSpeed)),
      vla: readNumber(firstPresent(pr.vla, data.launchAngleDeg, payload.launchAngle, payload.vla, ball.VLA, ball.LaunchAngle, ball.launchAngle, ball.vla)),
      hla: readNumber(firstPresent(pr.hla, data.launchDirectionDeg, payload.launchDirection, payload.hla, ball.HLA, ball.LaunchDirection, ball.launchDirection, ball.hla)),
      carry: readNumber(firstPresent(pr.carry, data.carryYards, payload.carryDistance, payload.carry, ball.CarryDistance, ball.Carry, ball.carryDistance, ball.carry)),
      spin: readNumber(firstPresent(pr.spin, data.spinRPM, payload.spin, payload.spinRate, payload.totalSpin, ball.TotalSpin, ball.BackSpin, ball.SpinRate, ball.spin, ball.spinRate)),
      total: readOptionalNumber(firstPresent(pr.total, data.totalYards, payload.totalDistance, payload.total, ball.TotalDistance, ball.Total, ball.totalDistance, ball.total)),
      clubSpeed: readOptionalNumber(firstPresent(pr.clubSpeed, payload.clubSpeed, payload.clubSpeedMPH, ball.ClubSpeed, ball.clubSpeed)),
      clubHeadSpeedMph: readOptionalNumber(firstPresent(pr.clubHeadSpeedMph, pr.clubHeadSpeedMPH, data.clubHeadSpeedMPH, payload.clubHeadSpeedMph, payload.clubHeadSpeedMPH, ball.ClubHeadSpeed, ball.clubHeadSpeed, ball.clubHeadSpeedMPH)),
      smashFactor: readOptionalNumber(firstPresent(pr.smashFactor, payload.smashFactor, ball.SmashFactor, ball.smashFactor)),
      spinAxisDeg: readOptionalNumber(firstPresent(pr.spinAxisDeg, data.spinAxisDeg, payload.spinAxisDeg, payload.spinAxis, ball.SpinAxis, ball.spinAxis)),
      clubPathDeg: readOptionalNumber(firstPresent(pr.clubPathDeg, data.clubPathDeg, payload.clubPathDeg, payload.clubPath, ball.ClubPath, ball.clubPath)),
      faceAngleDeg: readOptionalNumber(firstPresent(pr.faceAngleDeg, data.faceAngleDeg, payload.faceAngleDeg, payload.faceAngle, ball.FaceAngle, ball.faceAngle)),
      faceToPathDeg: readOptionalNumber(firstPresent(pr.faceToPathDeg, data.faceToPathDeg, payload.faceToPathDeg, payload.faceToPath, ball.FaceToPath, ball.faceToPath)),
    },
    tm: null,
    trackPts: readNullableNumber(firstPresent(metadata.framesCaptured, metadata.trackPts, data.framesCaptured, data.trackPts, payload.TrackPointsCount)),
  });
}

function shotsMatchForDeletion(left: Shot, right: Shot) {
  if (sameShotIdentity(left, right)) return true;
  if (metricFingerprint(left) !== metricFingerprint(right)) return false;

  if (left.capturedAt && right.capturedAt) {
    return Math.abs(left.capturedAt - right.capturedAt) <= 60_000;
  }

  return true;
}

function cloudShotDocKeys(data: Record<string, unknown>, docId: string) {
  const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
  const legacyMetadata = data.Metadata && typeof data.Metadata === "object" ? data.Metadata as Record<string, unknown> : {};
  return new Set([
    ...candidateShotKeys(docId),
    ...candidateShotKeys(data.id),
    ...candidateShotKeys(data.shotID),
    ...candidateShotKeys(data.shotId),
    ...candidateShotKeys(metadata.shotID),
    ...candidateShotKeys(metadata.shotId),
    ...candidateShotKeys(metadata.ShotID),
    ...candidateShotKeys(legacyMetadata.shotID),
    ...candidateShotKeys(legacyMetadata.shotId),
    ...candidateShotKeys(legacyMetadata.ShotID),
  ]);
}

async function deleteUserShotDocs(uid: string, shots: Shot[]) {
  const targets = shots.map(normalizeShot);
  if (!targets.length) return;

  const shotsCollection = collection(db, "users", uid, "shots");
  const snapshot = await getDocs(shotsCollection);
  if (snapshot.empty) return;

  const consumedTargetIndexes = new Set<number>();
  const docsToDelete = snapshot.docs.filter((snapshotDoc) => {
    const data = snapshotDoc.data() as Record<string, unknown>;
    const keys = cloudShotDocKeys(data, snapshotDoc.id);
    let matchedTargetIndex = -1;

    for (let index = 0; index < targets.length; index += 1) {
      if (consumedTargetIndexes.has(index)) continue;
      if (keys.has(String(targets[index].id))) {
        matchedTargetIndex = index;
        break;
      }
    }

    if (matchedTargetIndex < 0) {
      const comparableShot = cloudDocAsComparableShot(data, snapshotDoc.id);
      for (let index = 0; index < targets.length; index += 1) {
        if (consumedTargetIndexes.has(index)) continue;
        if (shotsMatchForDeletion(targets[index], comparableShot)) {
          matchedTargetIndex = index;
          break;
        }
      }
    }

    if (matchedTargetIndex >= 0) {
      consumedTargetIndexes.add(matchedTargetIndex);
      return true;
    }

    return false;
  });

  if (docsToDelete.length !== targets.length) {
    console.warn("[SessionLibrary] Firestore shot delete matched fewer docs than requested.", {
      requested: targets.length,
      matched: docsToDelete.length,
    });
  }

  if (!docsToDelete.length) return;
  await Promise.all(docsToDelete.map((snapshotDoc) => deleteDoc(snapshotDoc.ref)));
}

function sessionUpdatedAt(bucket: Partial<SessionLibraryBucket>) {
  return typeof bucket.updatedAt === "number" && Number.isFinite(bucket.updatedAt) ? bucket.updatedAt : 0;
}

function normalizeBucket(
  bucket: Partial<SessionLibraryBucket> | undefined,
  activeClub: string,
  activeSessionId: string | null
): SessionLibraryBucket {
  const kind = bucket?.kind === "session" ? "session" : "misc";
  const rawShots = Array.isArray(bucket?.shots) ? bucket!.shots.map(normalizeShot).sort(compareShots) : [];
  const firstCapturedAt = rawShots[0]?.capturedAt ?? 0;
  const lastCapturedAt = rawShots[rawShots.length - 1]?.capturedAt ?? firstCapturedAt;
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
      : rawShots[rawShots.length - 1]?.club ?? activeClub;
  const shots = kind === "session"
    ? rawShots.map((shot) => ({ ...shot, club }))
    : rawShots;

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

export function useSessionLibrary(uid: string | null | undefined, activeClub: string) {
  const initial = useMemo<{ state: SessionLibraryState; error: string | null }>(
    () => uid
      ? { state: { activeSessionId: null, buckets: [createMiscBucket()] }, error: null }
      : loadState(activeClub),
    [activeClub, uid]
  );
  const [state, setState] = useState<SessionLibraryState>(initial.state);
  const [error, setError] = useState<string | null>(initial.error);
  const activeSessionIdRef = useRef<string | null>(initial.state.activeSessionId);
  const signedInUidRef = useRef<string | null>(uid ?? null);

  const buckets = useMemo(() => {
    return normalizeBuckets(state.buckets, activeClub, state.activeSessionId);
  }, [activeClub, state.activeSessionId, state.buckets]);

  useEffect(() => {
    activeSessionIdRef.current = state.activeSessionId;
  }, [state.activeSessionId]);

  useEffect(() => {
    if (!uid) {
      signedInUidRef.current = null;
      return;
    }

    if (signedInUidRef.current === uid) return;

    signedInUidRef.current = uid;
    activeSessionIdRef.current = null;
    setState({ activeSessionId: null, buckets: [createMiscBucket()] });
  }, [uid]);

  useEffect(() => {
    try {
      saveState({ activeSessionId: state.activeSessionId, buckets });
    } catch (storageError) {
      console.error("[SessionLibrary] Failed to persist local session library:", storageError);
      setError("We couldn't save your app sessions on this device.");
    }
  }, [buckets, state.activeSessionId]);

  useEffect(() => {
    if (!uid) return;

    const sessionsQuery = query(collection(db, "users", uid, "dashboard-sessions"));
    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        const remoteSessionDocs = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          data: snapshotDoc.data() as Partial<SessionLibraryBucket>,
        }));
        const remoteActiveSessionId = remoteSessionDocs
          .filter(({ data }) => data.isActive === true)
          .sort((left, right) => sessionUpdatedAt(right.data) - sessionUpdatedAt(left.data))[0]?.id ?? null;

        activeSessionIdRef.current = remoteActiveSessionId;

        const remoteSessionBuckets = remoteSessionDocs
          .map(({ id, data }) =>
            normalizeBucket(
              {
                ...data,
                id,
                kind: "session",
              },
              activeClub,
              remoteActiveSessionId
            )
          )
          .filter((bucket) => bucket.id !== MISC_BUCKET_ID)
          .sort((left, right) => right.updatedAt - left.updatedAt);

        setState((current) => {
          const currentBuckets = normalizeBuckets(current.buckets, activeClub, remoteActiveSessionId);
          const miscBucket = currentBuckets.find((bucket) => bucket.id === MISC_BUCKET_ID) ?? createMiscBucket();

          return {
            activeSessionId: remoteActiveSessionId,
            buckets: [miscBucket, ...remoteSessionBuckets],
          };
        });

        setError(null);
      },
      (snapshotError) => {
        console.error("[SessionLibrary] Failed to read dashboard sessions from Firestore:", snapshotError);
        setError("We couldn't load your dashboard sessions from the cloud.");
      }
    );

    return () => unsubscribe();
  }, [activeClub, uid]);

  const startSession = useCallback(async (options?: StartSessionOptions) => {
    const createdAt = Date.now();
    const sessionId = `session-${createdAt}`;
    const previousActiveSessionId = activeSessionIdRef.current;
    const sessionClub = options?.club?.trim() || activeClub;
    const title =
      options?.title?.trim() ||
      `${sessionClub} Session ${new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

    const nextBucket: SessionLibraryBucket = {
      id: sessionId,
      kind: "session",
      title,
      club: sessionClub,
      color: options?.color?.trim() || randomSessionColor(),
      source: "dashboard-session",
      shotCount: 0,
      createdAt,
      updatedAt: createdAt,
      shots: [],
      isActive: true,
    };

    activeSessionIdRef.current = sessionId;

    setState((current) => ({
      activeSessionId: sessionId,
      buckets: [
        nextBucket,
        ...normalizeBuckets(current.buckets, activeClub, current.activeSessionId).filter((bucket) => bucket.id !== sessionId),
      ],
    }));

    if (uid) {
      try {
        const writes: Promise<void>[] = [];
        if (previousActiveSessionId && previousActiveSessionId !== sessionId) {
          writes.push(setDoc(
            doc(db, "users", uid, "dashboard-sessions", previousActiveSessionId),
            { isActive: false },
            { merge: true }
          ));
        }
        writes.push(setDoc(doc(db, "users", uid, "dashboard-sessions", sessionId), serializeBucket(nextBucket)));
        await Promise.all(writes);
      } catch (writeError) {
        console.error("[SessionLibrary] Failed to create dashboard session in Firestore:", writeError);
        setError("We couldn't save your new dashboard session.");
      }
    }

    return sessionId;
  }, [activeClub, uid]);

  const endSession = useCallback(async () => {
    const sessionIdToEnd = activeSessionIdRef.current;
    activeSessionIdRef.current = null;
    setState((current) => ({
      ...current,
      activeSessionId: null,
    }));

    if (uid && sessionIdToEnd) {
      try {
        await setDoc(
          doc(db, "users", uid, "dashboard-sessions", sessionIdToEnd),
          { isActive: false, updatedAt: Date.now() },
          { merge: true }
        );
      } catch (writeError) {
        console.error("[SessionLibrary] Failed to end dashboard session in Firestore:", writeError);
        setError("We couldn't end that dashboard session in the cloud.");
      }
    }
  }, [uid]);

  const clearBucketShots = useCallback(async (bucketId: string) => {
    let bucketToSync: SessionLibraryBucket | null = null;
    let deletedShots: Shot[] = [];
    let deletedShotIds: string[] = [];

    setState((current) => {
      const nextBuckets = normalizeBuckets(current.buckets, activeClub, current.activeSessionId);
      const targetIndex = nextBuckets.findIndex((bucket) => bucket.id === bucketId);
      if (targetIndex < 0) return current;

      const targetBucket = nextBuckets[targetIndex];
      deletedShots = targetBucket.shots.map((shot) => normalizeShot(shot));
      deletedShotIds = targetBucket.shots.map((shot) => String(shot.id)).filter(Boolean);
      const clearedBucket: SessionLibraryBucket = {
        ...targetBucket,
        shotCount: 0,
        updatedAt: targetBucket.createdAt || 0,
        shots: [],
      };

      nextBuckets[targetIndex] = clearedBucket;
      bucketToSync = clearedBucket.kind === "session" ? clearedBucket : null;

      return {
        ...current,
        buckets: nextBuckets,
      };
    });

    if (uid && deletedShots.length) {
      try {
        const writes: Promise<unknown>[] = [deleteUserShotDocs(uid, deletedShots)];
        if (bucketToSync) {
          writes.push(deleteSessionShotDocs(uid, bucketId));
        }
        await Promise.all(writes);
        if (bucketToSync) {
          await setDoc(doc(db, "users", uid, "dashboard-sessions", bucketId), serializeBucket(bucketToSync));
        }
      } catch (writeError) {
        console.error("[SessionLibrary] Failed to clear dashboard session shots in Firestore:", writeError);
        setError("We couldn't clear the shots from that session.");
      }
    }
  }, [activeClub, uid]);

  const deleteShotsFromBucket = useCallback(async (bucketId: string, shotIds: string[]) => {
    const normalizedIds = Array.from(new Set(shotIds.map(String))).filter(Boolean);
    if (!normalizedIds.length) return;

    let bucketToSync: SessionLibraryBucket | null = null;
    let deletedShots: Shot[] = [];
    let deletedSessionShotIds: string[] = [];

    setState((current) => {
      const nextBuckets = normalizeBuckets(current.buckets, activeClub, current.activeSessionId);
      const targetIndex = nextBuckets.findIndex((bucket) => bucket.id === bucketId);
      if (targetIndex < 0) return current;

      const targetBucket = nextBuckets[targetIndex];
      const nextShots = targetBucket.shots.filter((shot) => !normalizedIds.includes(String(shot.id)));
      if (nextShots.length === targetBucket.shots.length) return current;

      deletedShots = targetBucket.shots
        .filter((shot) => normalizedIds.includes(String(shot.id)))
        .map((shot) => normalizeShot(shot));
      deletedSessionShotIds = deletedShots.map((shot) => String(shot.id));

      const updatedBucket: SessionLibraryBucket = {
        ...targetBucket,
        shotCount: nextShots.length,
        updatedAt: nextShots[nextShots.length - 1]?.capturedAt ?? targetBucket.createdAt ?? 0,
        shots: nextShots,
      };

      nextBuckets[targetIndex] = updatedBucket;
      bucketToSync = updatedBucket.kind === "session" ? updatedBucket : null;

      return {
        ...current,
        buckets: nextBuckets,
      };
    });

    if (uid && deletedShots.length) {
      try {
        const writes: Promise<unknown>[] = [deleteUserShotDocs(uid, deletedShots)];
        if (bucketToSync) {
          writes.push(deleteNamedSessionShotDocs(uid, bucketId, deletedSessionShotIds));
        }
        await Promise.all(writes);
        if (bucketToSync) {
          await setDoc(doc(db, "users", uid, "dashboard-sessions", bucketId), serializeBucket(bucketToSync));
        }
      } catch (writeError) {
        console.error("[SessionLibrary] Failed to delete selected dashboard session shots in Firestore:", writeError);
        setError("We couldn't delete the selected shots from that session.");
      }
    }
  }, [activeClub, uid]);

  const deleteBucket = useCallback(async (bucketId: string) => {
    const existingBucket = normalizeBuckets(state.buckets, activeClub, activeSessionIdRef.current).find((bucket) => bucket.id === bucketId) ?? null;
    const deletedShots = existingBucket?.shots.map((shot) => normalizeShot(shot)) ?? [];
    const deletedShotIds = existingBucket?.shots.map((shot) => String(shot.id)).filter(Boolean) ?? [];

    if (bucketId !== MISC_BUCKET_ID && activeSessionIdRef.current === bucketId) {
      activeSessionIdRef.current = null;
    }
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

    if (uid) {
      try {
        const writes: Promise<unknown>[] = [];
        if (deletedShots.length) {
          writes.push(deleteUserShotDocs(uid, deletedShots));
        }
        if (bucketId !== MISC_BUCKET_ID) {
          writes.push(deleteSessionShotDocs(uid, bucketId));
          writes.push(deleteDoc(doc(db, "users", uid, "dashboard-sessions", bucketId)));
        }
        await Promise.all(writes);
      } catch (deleteError) {
        console.error("[SessionLibrary] Failed to delete dashboard session from Firestore:", deleteError);
        setError("We couldn't delete that dashboard session.");
      }
    }
  }, [activeClub, state.buckets, uid]);

  const recordShot = useCallback((shot: Shot) => {
    const normalizedShot = normalizeShot(shot);
    const resolvedActiveSessionId = activeSessionIdRef.current;
    const currentBuckets = normalizeBuckets(state.buckets, activeClub, resolvedActiveSessionId);
    const targetId = resolvedActiveSessionId ?? MISC_BUCKET_ID;
    const targetIndex = currentBuckets.findIndex((bucket) => bucket.id === targetId);
    const targetBucket = targetIndex >= 0 ? currentBuckets[targetIndex] : null;

    let nextSessionBucket: SessionLibraryBucket | null = null;
    if (targetBucket) {
      const existingIndex = targetBucket.shots.findIndex((existingShot) => sameShotIdentity(existingShot, normalizedShot));
      const nextShots = existingIndex >= 0
        ? targetBucket.shots.map((existingShot, index) => (index === existingIndex ? normalizedShot : existingShot)).sort(compareShots)
        : [...targetBucket.shots, normalizedShot].sort(compareShots);
      const updatedAt = nextShots[nextShots.length - 1]?.capturedAt ?? Date.now();

      nextSessionBucket = {
        ...targetBucket,
        club: targetBucket.kind === "session" ? targetBucket.club || normalizedShot.club : "Mixed",
        shotCount: Math.max(targetBucket.shotCount, nextShots.length),
        updatedAt,
        createdAt: targetBucket.createdAt || nextShots[0]?.capturedAt || updatedAt,
        shots: nextShots,
      };
    }

    const sessionDocIdToSync = nextSessionBucket?.kind === "session" ? nextSessionBucket.id : null;
    const sessionPayloadToSync =
      nextSessionBucket?.kind === "session" ? serializeBucket(nextSessionBucket) : null;
    const sessionShotPayloadToSync =
      nextSessionBucket?.kind === "session" ? serializeSessionShot(normalizedShot) : null;

    setState((current) => {
      const currentResolvedActiveSessionId = activeSessionIdRef.current;
      const nextBuckets = normalizeBuckets(current.buckets, activeClub, currentResolvedActiveSessionId);
      const currentTargetId = currentResolvedActiveSessionId ?? MISC_BUCKET_ID;
      const currentTargetIndex = nextBuckets.findIndex((bucket) => bucket.id === currentTargetId);
      if (currentTargetIndex < 0) return current;

      const currentTargetBucket = nextBuckets[currentTargetIndex];
      const existingIndex = currentTargetBucket.shots.findIndex((existingShot) => sameShotIdentity(existingShot, normalizedShot));
      const nextShots = existingIndex >= 0
        ? currentTargetBucket.shots.map((existingShot, index) => (index === existingIndex ? normalizedShot : existingShot)).sort(compareShots)
        : [...currentTargetBucket.shots, normalizedShot].sort(compareShots);
      const updatedAt = nextShots[nextShots.length - 1]?.capturedAt ?? Date.now();

      nextBuckets[currentTargetIndex] = {
        ...currentTargetBucket,
        club: currentTargetBucket.kind === "session" ? currentTargetBucket.club || normalizedShot.club : "Mixed",
        shotCount: Math.max(currentTargetBucket.shotCount, nextShots.length),
        updatedAt,
        createdAt: currentTargetBucket.createdAt || nextShots[0]?.capturedAt || updatedAt,
        shots: nextShots,
      };

      if (currentResolvedActiveSessionId) {
        const miscIndex = nextBuckets.findIndex((bucket) => bucket.id === MISC_BUCKET_ID);
        if (miscIndex >= 0) {
          const miscBucket = nextBuckets[miscIndex];
          const filteredMiscShots = miscBucket.shots.filter((existingShot) => !sameShotIdentity(existingShot, normalizedShot));
          if (filteredMiscShots.length !== miscBucket.shots.length) {
            nextBuckets[miscIndex] = {
              ...miscBucket,
              shotCount: filteredMiscShots.length,
              updatedAt: filteredMiscShots[filteredMiscShots.length - 1]?.capturedAt ?? 0,
              shots: filteredMiscShots,
            };
          }
        }
      }

      return {
        ...current,
        buckets: nextBuckets,
      };
    });

    if (uid && sessionDocIdToSync && sessionPayloadToSync) {
      const sessionDocRef = doc(db, "users", uid, "dashboard-sessions", sessionDocIdToSync);
      const sessionShotRef = sessionShotPayloadToSync
        ? doc(db, "users", uid, "dashboard-sessions", sessionDocIdToSync, "shots", sessionShotDocId(normalizedShot))
        : null;

      const writes = [setDoc(sessionDocRef, sessionPayloadToSync)];
      if (sessionShotRef && sessionShotPayloadToSync) {
        writes.push(setDoc(sessionShotRef, sessionShotPayloadToSync));
      }

      void Promise.all(writes)
        .catch((writeError) => {
          console.error("[SessionLibrary] Failed to sync dashboard session shot to Firestore:", writeError);
          setError("We couldn't sync the latest dashboard shot into its session.");
        });
    }
  }, [activeClub, state.buckets, uid]);

  return {
    buckets,
    activeSessionId: state.activeSessionId,
    loading: false,
    error,
    startSession,
    endSession,
    clearBucketShots,
    deleteShotsFromBucket,
    deleteBucket,
    recordShot,
  };
}
