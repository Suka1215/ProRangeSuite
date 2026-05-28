import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Shot } from "../types";
import { findTMRef, loadTMIndex } from "../utils/tmMatcher";

interface CloudBallData {
  Speed?: number;
  BallSpeed?: number;
  TotalSpin?: number;
  BackSpin?: number;
  HLA?: number;
  VLA?: number;
  CarryDistance?: number;
  Carry?: number;
  TotalDistance?: number;
  Total?: number;
}

interface CloudShotMetadata {
  shotID?: string;
  shotId?: string;
  club?: string;
  timestamp?: unknown;
  framesCaptured?: number;
  trackPts?: number;
}

interface CloudShotPayload {
  ShotNumber?: number;
  shotNumber?: number;
  BallData?: CloudBallData;
  ballData?: CloudBallData;
  metadata?: CloudShotMetadata;
  Metadata?: CloudShotMetadata;
  id?: string | number;
  club?: string;
  timestamp?: unknown;
  trackPts?: number;
  capturedAt?: unknown;
  ballSpeedMPH?: unknown;
  launchAngleDeg?: unknown;
  launchDirectionDeg?: unknown;
  carryYards?: unknown;
  totalYards?: unknown;
  spinRPM?: unknown;
  framesCaptured?: unknown;
  pr?: {
    speed?: unknown;
    vla?: unknown;
    hla?: unknown;
    carry?: unknown;
    spin?: unknown;
    total?: unknown;
  };
  tm?: {
    speed?: unknown;
    vla?: unknown;
    hla?: unknown;
    carry?: unknown;
    spin?: unknown;
    total?: unknown;
  } | null;
}

interface CloudShotDoc {
  id: string;
  data: CloudShotPayload;
  receivedAt: number;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function firstPresent(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function asStringId(value: unknown, fallback: string) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return fallback;
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
  const appPr = (data.pr ?? {}) as Record<string, unknown>;
  const appTm = (data.tm ?? null) as Record<string, unknown> | null;
  const ball = (data.BallData ?? data.ballData ?? {}) as Record<string, unknown>;
  const metadata = (data.metadata ?? data.Metadata ?? {}) as Record<string, unknown>;
  const payload = data as Record<string, unknown>;
  const timestampValue = firstPresent(
    metadata.timestamp,
    metadata.Timestamp,
    metadata.createdAt,
    metadata.CreatedAt,
    metadata.date,
    metadata.time,
    data.capturedAt,
    payload.createdAt,
    payload.CreatedAt,
    data.timestamp,
    payload.Timestamp
  );
  const capturedDate = toDate(timestampValue);

  const speed = asNumber(firstPresent(
    appPr.speed,
    appPr.ballSpeed,
    data.ballSpeedMPH,
    payload.ballSpeedMph,
    payload.ballSpeed,
    ball.Speed,
    ball.BallSpeed,
    ball.speed,
    ball.ballSpeed
  ));
  const vla = asNumber(firstPresent(
    appPr.vla,
    data.launchAngleDeg,
    payload.launchAngle,
    payload.vla,
    ball.VLA,
    ball.LaunchAngle,
    ball.launchAngle,
    ball.vla
  ));
  const hla = asNumber(firstPresent(
    appPr.hla,
    data.launchDirectionDeg,
    payload.launchDirection,
    payload.hla,
    ball.HLA,
    ball.LaunchDirection,
    ball.launchDirection,
    ball.hla
  ));
  const carry = asNumber(firstPresent(
    appPr.carry,
    data.carryYards,
    payload.carryDistance,
    payload.carry,
    ball.CarryDistance,
    ball.Carry,
    ball.carryDistance,
    ball.carry
  ));
  const spin = asNumber(firstPresent(
    appPr.spin,
    data.spinRPM,
    payload.spin,
    payload.spinRate,
    payload.totalSpin,
    ball.TotalSpin,
    ball.BackSpin,
    ball.SpinRate,
    ball.spin,
    ball.spinRate
  ));
  const total = asNumber(firstPresent(
    appPr.total,
    data.totalYards,
    payload.totalDistance,
    payload.total,
    ball.TotalDistance,
    ball.Total,
    ball.totalDistance,
    ball.total
  ), carry);
  const shotNumber = asNumber(data.ShotNumber ?? data.shotNumber, 0) || undefined;
  const tm =
    appTm && typeof appTm === "object"
      ? {
          speed: asNumber(appTm.speed),
          vla: asNumber(appTm.vla),
          hla: asNumber(appTm.hla),
          carry: asNumber(appTm.carry),
          spin: asNumber(appTm.spin),
          total: asNumber(appTm.total, asNumber(appTm.carry)),
          clubSpeed: asOptionalNumber(appTm.clubSpeed),
          smashFactor: asOptionalNumber(appTm.smashFactor),
        }
      : tmRows.length
        ? findTMRef(speed, vla, tmRows)
        : null;

  return {
    id: asStringId(firstPresent(data.id, metadata.shotID, metadata.shotId, metadata.ShotID, payload.shotID, payload.shotId), doc.id),
    club: String(metadata.club ?? metadata.Club ?? data.club ?? payload.Club ?? "7-Iron"),
    timestamp: formatTimestamp(timestampValue, shotNumber),
    capturedAt: capturedDate?.getTime() ?? doc.receivedAt,
    pr: {
      speed,
      vla,
      hla,
      carry,
      spin,
      total,
      clubSpeed: asOptionalNumber(firstPresent(appPr.clubSpeed, payload.clubSpeed, payload.clubSpeedMPH, ball.ClubSpeed, ball.clubSpeed)),
      smashFactor: asOptionalNumber(firstPresent(appPr.smashFactor, payload.smashFactor, ball.SmashFactor, ball.smashFactor)),
    },
    tm,
    trackPts: asNullableNumber(firstPresent(
      metadata.framesCaptured,
      metadata.trackPts,
      metadata.TrackPointsCount,
      data.framesCaptured,
      data.trackPts,
      payload.TrackPointsCount
    )),
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

    const shotsQuery = query(collection(db, "users", uid, "shots"), limit(500));

    const unsubscribe = onSnapshot(
      shotsQuery,
      (snapshot) => {
        const receivedAt = Date.now();
        setCloudDocs(snapshot.docs.map((doc) => ({
          id: doc.id,
          data: doc.data() as CloudShotPayload,
          receivedAt,
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
    return [...cloudDocs]
      .map((doc) => mapCloudShot(doc, tmRows))
      .sort((left, right) => {
        const timeDelta = (left.capturedAt ?? 0) - (right.capturedAt ?? 0);
        if (timeDelta !== 0) return timeDelta;
        return String(left.id).localeCompare(String(right.id));
      });
  }, [cloudDocs, tmRows]);

  return { shots, loading, error };
}
