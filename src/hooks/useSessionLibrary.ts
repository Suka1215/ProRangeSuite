import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { VERSION_COLORS } from "../constants";
import { db } from "../lib/firebase";
import type { Shot } from "../types";
import { findTMRef, loadTMIndex } from "../utils/tmMatcher";

interface CloudBallData {
  Speed?: number;
  TotalSpin?: number;
  HLA?: number;
  VLA?: number;
  CarryDistance?: number;
  TotalDistance?: number;
}

interface CloudShotMetadata {
  shotID?: string;
  club?: string;
  timestamp?: unknown;
  framesCaptured?: number;
  source?: string;
}

interface CloudShotPayload {
  ShotNumber?: number;
  BallData?: CloudBallData;
  metadata?: CloudShotMetadata;
}

interface CloudShotDoc {
  id: string;
  data: CloudShotPayload;
}

interface CloudSessionData {
  title?: string;
  source?: string;
  club?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  shotCount?: number;
  color?: string;
  endedAt?: unknown;
}

interface CloudSessionDoc {
  id: string;
  data: CloudSessionData;
}

interface StartSessionOptions {
  title?: string;
  club?: string;
  color?: string;
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

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

function toMillis(value: unknown, fallback = 0) {
  return toDate(value)?.getTime() ?? fallback;
}

function formatTimestamp(value: unknown, shotNumber?: number) {
  const date = toDate(value);
  if (!date) return shotNumber != null ? `Shot #${shotNumber}` : "Awaiting timestamp";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapCloudShot(doc: CloudShotDoc, tmRows: Awaited<ReturnType<typeof loadTMIndex>>): Shot {
  const { data } = doc;
  const ball = data.BallData ?? {};
  const metadata = data.metadata ?? {};
  const capturedDate = toDate(metadata.timestamp);

  const speed = asNumber(ball.Speed);
  const vla = asNumber(ball.VLA);
  const hla = asNumber(ball.HLA);
  const carry = asNumber(ball.CarryDistance);
  const spin = asNumber(ball.TotalSpin);
  const total = asNumber(ball.TotalDistance, carry);

  return {
    id: metadata.shotID ?? doc.id,
    club: metadata.club ?? "7-Iron",
    timestamp: formatTimestamp(metadata.timestamp, data.ShotNumber),
    capturedAt: capturedDate?.getTime() ?? 0,
    pr: { speed, vla, hla, carry, spin, total },
    tm: tmRows.length ? findTMRef(speed, vla, tmRows) : null,
    trackPts: asNullableNumber(metadata.framesCaptured),
  };
}

function randomSessionColor() {
  return VERSION_COLORS[Math.floor(Math.random() * VERSION_COLORS.length)];
}

async function deleteCollectionInChunks(path: string[]) {
  while (true) {
    const snapshot = await getDocs(query(collection(db, path.join("/")), limit(200)));
    if (snapshot.empty) break;

    const batch = writeBatch(db);
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();

    if (snapshot.size < 200) break;
  }
}

export function useSessionLibrary(uid: string | null | undefined, activeClub: string) {
  const [sessionDocs, setSessionDocs] = useState<CloudSessionDoc[]>([]);
  const [sessionShotDocs, setSessionShotDocs] = useState<Record<string, CloudShotDoc[]>>({});
  const [miscShotDocs, setMiscShotDocs] = useState<CloudShotDoc[]>([]);
  const [tmRows, setTmRows] = useState<Awaited<ReturnType<typeof loadTMIndex>>>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const childListenersRef = useRef(new Map<string, () => void>());
  const pendingColorSyncRef = useRef(new Set<string>());

  useEffect(() => {
    let active = true;

    loadTMIndex()
      .then((rows) => {
        if (active) setTmRows(rows);
      })
      .catch(() => {
        if (active) setTmRows([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!uid) {
      setSessionDocs([]);
      setSessionShotDocs({});
      setMiscShotDocs([]);
      setActiveSessionId(null);
      setLoading(false);
      setError(null);
      childListenersRef.current.forEach((unsubscribe) => unsubscribe());
      childListenersRef.current.clear();
      return;
    }

    setLoading(true);
    setError(null);

    const sessionsQuery = query(
      collection(db, "users", uid, "sessions"),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsubscribeSessions = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((item) => ({ id: item.id, data: item.data() as CloudSessionData }));
        setSessionDocs(docs);

        docs.forEach((sessionDoc) => {
          if (!sessionDoc.data.color && !pendingColorSyncRef.current.has(sessionDoc.id)) {
            pendingColorSyncRef.current.add(sessionDoc.id);
            void setDoc(
              doc(db, "users", uid, "sessions", sessionDoc.id),
              { color: randomSessionColor() },
              { merge: true }
            ).finally(() => {
              pendingColorSyncRef.current.delete(sessionDoc.id);
            });
          }
        });

        const liveIds = new Set(docs.map((item) => item.id));

        childListenersRef.current.forEach((unsubscribe, sessionId) => {
          if (liveIds.has(sessionId)) return;
          unsubscribe();
          childListenersRef.current.delete(sessionId);
          setSessionShotDocs((current) => {
            if (!(sessionId in current)) return current;
            const next = { ...current };
            delete next[sessionId];
            return next;
          });
        });

        docs.forEach((sessionDoc) => {
          if (childListenersRef.current.has(sessionDoc.id)) return;

          const sessionShotsQuery = query(collection(db, "users", uid, "sessions", sessionDoc.id, "shots"), limit(500));

          const unsubscribeChild = onSnapshot(
            sessionShotsQuery,
            (childSnapshot) => {
              setSessionShotDocs((current) => ({
                ...current,
                [sessionDoc.id]: childSnapshot.docs.map((item) => ({
                  id: item.id,
                  data: item.data() as CloudShotPayload,
                })),
              }));
            },
            (sessionError) => {
              console.error("[SessionLibrary] Failed to load session shots:", sessionError);
              setError("We couldn't load one of your session shot feeds.");
            }
          );

          childListenersRef.current.set(sessionDoc.id, unsubscribeChild);
        });

        setLoading(false);
      },
      (sessionError) => {
        console.error("[SessionLibrary] Failed to load sessions:", sessionError);
        setError("We couldn't load your sessions.");
        setLoading(false);
      }
    );

    const unsubscribeMisc = onSnapshot(
      query(collection(db, "users", uid, "shots"), limit(500)),
      (snapshot) => {
        setMiscShotDocs(
          snapshot.docs.map((item) => ({
            id: item.id,
            data: item.data() as CloudShotPayload,
          }))
        );
      },
      (miscError) => {
        console.error("[SessionLibrary] Failed to load misc shots:", miscError);
        setError("We couldn't load your misc shots.");
      }
    );

    const unsubscribeSessionState = onSnapshot(
      doc(db, "users", uid, "sessionState", "current"),
      (snapshot) => {
        const data = snapshot.data() as { sessionId?: string } | undefined;
        setActiveSessionId(data?.sessionId ?? null);
      }
    );

    return () => {
      unsubscribeSessions();
      unsubscribeMisc();
      unsubscribeSessionState();
      childListenersRef.current.forEach((unsubscribe) => unsubscribe());
      childListenersRef.current.clear();
    };
  }, [uid]);

  const buckets = useMemo<SessionLibraryBucket[]>(() => {
    const mappedMiscShots = miscShotDocs
      .map((item) => mapCloudShot(item, tmRows))
      .sort((left, right) => (left.capturedAt ?? 0) - (right.capturedAt ?? 0));
    const miscUpdatedAt = mappedMiscShots.length
      ? mappedMiscShots[mappedMiscShots.length - 1]?.capturedAt ?? 0
      : 0;

    const miscBucket: SessionLibraryBucket = {
      id: "misc",
      kind: "misc",
      title: "Misc",
      club: "Mixed",
      color: "#262930",
      source: "gspro",
      shotCount: mappedMiscShots.length,
      createdAt: mappedMiscShots[0]?.capturedAt ?? miscUpdatedAt,
      updatedAt: miscUpdatedAt,
      shots: mappedMiscShots,
      isActive: false,
    };

    const sessionBuckets = sessionDocs.map((sessionDoc) => {
      const mappedShots = (sessionShotDocs[sessionDoc.id] ?? [])
        .map((item) => mapCloudShot(item, tmRows))
        .sort((left, right) => (left.capturedAt ?? 0) - (right.capturedAt ?? 0));
      const createdAt = toMillis(sessionDoc.data.createdAt, mappedShots[0]?.capturedAt ?? 0);
      const updatedAt = toMillis(
        sessionDoc.data.updatedAt,
        mappedShots[mappedShots.length - 1]?.capturedAt ?? createdAt
      );

      return {
        id: sessionDoc.id,
        kind: "session" as const,
        title: sessionDoc.data.title ?? sessionDoc.id,
        club: sessionDoc.data.club ?? mappedShots[mappedShots.length - 1]?.club ?? activeClub,
        color: sessionDoc.data.color ?? VERSION_COLORS[0],
        source: sessionDoc.data.source ?? "session",
        shotCount: Math.max(sessionDoc.data.shotCount ?? 0, mappedShots.length),
        createdAt,
        updatedAt,
        shots: mappedShots,
        isActive: activeSessionId === sessionDoc.id,
      };
    });

    return [miscBucket, ...sessionBuckets].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "misc" ? -1 : 1;
      return right.updatedAt - left.updatedAt;
    });
  }, [activeClub, activeSessionId, miscShotDocs, sessionDocs, sessionShotDocs, tmRows]);

  async function startSession(options?: StartSessionOptions) {
    if (!uid) return null;

    const createdAt = new Date();
    const sessionId = `session-${createdAt.getTime()}`;
    const sessionClub = options?.club?.trim() || activeClub;
    const title =
      options?.title?.trim() ||
      `${sessionClub} Session ${createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    const color = options?.color ?? randomSessionColor();

    await setDoc(doc(db, "users", uid, "sessions", sessionId), {
      title,
      source: "suite",
      club: sessionClub,
      color,
      shotCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, "users", uid, "sessionState", "current"), {
      sessionId,
      title,
      club: sessionClub,
      source: "suite",
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return sessionId;
  }

  async function endSession() {
    if (!uid || !activeSessionId) return;

    await setDoc(
      doc(db, "users", uid, "sessions", activeSessionId),
      { updatedAt: serverTimestamp(), endedAt: serverTimestamp() },
      { merge: true }
    );
    await deleteDoc(doc(db, "users", uid, "sessionState", "current"));
  }

  async function deleteBucket(bucketId: string) {
    if (!uid) return;

    if (bucketId === "misc") {
      await deleteCollectionInChunks(["users", uid, "shots"]);
      return;
    }

    await deleteCollectionInChunks(["users", uid, "sessions", bucketId, "shots"]);
    await deleteDoc(doc(db, "users", uid, "sessions", bucketId));

    if (activeSessionId === bucketId) {
      await deleteDoc(doc(db, "users", uid, "sessionState", "current"));
    }
  }

  return {
    buckets,
    activeSessionId,
    loading,
    error,
    startSession,
    endSession,
    deleteBucket,
  };
}
