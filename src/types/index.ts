// ─── METRIC TYPES ─────────────────────────────────────────────────────────────

export type MetricKey = "speed" | "vla" | "hla" | "carry" | "spin";
export type ClubName = "Driver" | "3-Wood" | "5-Wood" | "4-Iron" | "5-Iron" | "6-Iron" | "7-Iron" | "8-Iron" | "9-Iron" | "PW";
export type TabId =
  | "dashboard"
  | "trajectory"
  | "physics"
  | "kalman"
  | "accuracy"
  | "shots"
  | "input"
  | "progress"
  | "trend"
  | "compare"
  | "sessions"
  | "frames";

// ─── SHOT DATA ────────────────────────────────────────────────────────────────

export interface MetricSet {
  speed: number;
  vla: number;
  hla: number;
  carry: number;
  spin: number;
}

export interface TrajectoryPoint {
  x: number;        // carry distance (yards) — for trajectory chart
  y: number;        // height (feet) — for trajectory chart
  // Raw sensor data from iOS TrackPoints
  _px?: number;     // raw pixel X on sensor (0-1920)
  _py?: number;     // raw pixel Y on sensor (0-1080)
  _r?:  number;     // bounding box radius in pixels
  _dRaw?: number;   // DRawM — raw distance from camera (meters)
  _dFit?: number;   // DFitM — fitted distance from camera (meters)
  frame?: number;   // camera frame index
  tMs?: number;     // time in ms from launch
  isReal?: boolean; // true = YOLO detection, false = predicted
  label?: string;   // "pt[0]", "lock", etc.
}

export interface Shot {
  id: number | string;
  club: string;
  timestamp: string;
  pr: MetricSet;
  tm: Partial<MetricSet> | null;
  trackPts: number | null;
  trajectory?: TrajectoryPoint[];
  trueTraj?: TrajectoryPoint[];
}

// ─── SESSION DATA ─────────────────────────────────────────────────────────────

export interface SessionShot {
  id: string;
  shotNum: number;
  pr: MetricSet;
  tm: Partial<MetricSet> | null;
  trackPts: number | null;
}

export interface Session {
  id: string;
  date: string;
  version: string;
  label: string;
  club: string;
  shots: SessionShot[];
  createdAt: number;
}

// ─── STATS ────────────────────────────────────────────────────────────────────

export interface MetricStats {
  mean: number;
  std: number;
  passRate: number;
  n: number;
}

export type SessionStatsResult = Partial<Record<MetricKey, MetricStats | null>>;

// ─── CONFIG ───────────────────────────────────────────────────────────────────

export interface ClubConfig {
  expectedSpeed: [number, number];
  expectedVLA: [number, number];
  expectedCarry: [number, number];
  expectedSpin: [number, number];
}

export interface MetricMeta {
  label: string;
  unit: string;
  tolerance: string;
  color: string;
}

// ─── UI ───────────────────────────────────────────────────────────────────────

export interface Notification {
  msg: string;
  type: "ok" | "err";
}

export interface PhysicsTestResult {
  name: string;
  got: string;
  expected: string;
  err: string;
  pass: boolean;
}

export interface ManualShotRow {
  pr_speed: string;
  pr_vla: string;
  pr_hla: string;
  pr_carry: string;
  pr_spin: string;
  tm_speed: string;
  tm_vla: string;
  tm_hla: string;
  tm_carry: string;
  tm_spin: string;
}

export interface NewSessionForm {
  date: string;
  version: string;
  label: string;
  club: string;
}
