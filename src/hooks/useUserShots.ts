import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
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

export function useUserShots(uid: string | null | undefined) {
  const [cloudDocs, setCloudDocs] = useState<CloudShotDoc[]>([]);
  const [tmRows, setTmRows] = useState<Awaited<ReturnType<typeof loadTMIndex>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setCloudDocs([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const shotsQuery = query(
      collection(db, "users", uid, "shots"),
      orderBy("metadata.timestamp", "desc"),
      limit(500)
    );

    const unsubscribe = onSnapshot(
      shotsQuery,
      (snapshot) => {
        setCloudDocs(snapshot.docs.map((doc) => ({
          id: doc.id,
          data: doc.data() as CloudShotPayload,
        })));
        setLoading(false);
      },
      (snapshotError) => {
        console.error("[CloudShots] Failed to load user shots:", snapshotError);
        setError("We couldn't load your cloud shots.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  const shots = useMemo(() => {
    return [...cloudDocs].reverse().map((doc) => mapCloudShot(doc, tmRows));
  }, [cloudDocs, tmRows]);

  return { shots, loading, error };
}
