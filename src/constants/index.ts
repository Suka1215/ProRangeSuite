import type { ClubConfig, ClubName, MetricKey, MetricMeta } from "../types";

// ─── CLUBS — sourced from pga_precision_10k_v8.csv TrackMan dataset ──────────
// [min, max] ranges derived from real 1,000-shot distributions per club
// speed = Ball Speed (mph), vla = Launch Angle (°), spin = Spin Rate (rpm)
// carry estimated from speed × carry factor (no carry column in source data)

export const CLUBS: Record<ClubName, ClubConfig> = {
  "Driver":  { expectedSpeed:[108.8,188.8], expectedVLA:[5.3,12.5],  expectedCarry:[220,310], expectedSpin:[1752,3645] },
  "3-Wood":  { expectedSpeed:[100.7,168.9], expectedVLA:[6.8,14.0],  expectedCarry:[190,275], expectedSpin:[2358,4711] },
  "5-Wood":  { expectedSpeed:[91.5, 159.8], expectedVLA:[8.7,15.2],  expectedCarry:[175,255], expectedSpin:[2762,5328] },
  "4-Iron":  { expectedSpeed:[89.9, 142.3], expectedVLA:[10.9,17.1], expectedCarry:[160,230], expectedSpin:[3288,5600] },
  "5-Iron":  { expectedSpeed:[84.0, 139.1], expectedVLA:[12.0,18.8], expectedCarry:[150,220], expectedSpin:[3921,6398] },
  "6-Iron":  { expectedSpeed:[80.0, 130.0], expectedVLA:[13.8,20.7], expectedCarry:[135,205], expectedSpin:[4590,7480] },
  "7-Iron":  { expectedSpeed:[76.2, 124.0], expectedVLA:[16.7,23.8], expectedCarry:[125,195], expectedSpin:[5202,8708] },
  "8-Iron":  { expectedSpeed:[70.5, 117.5], expectedVLA:[19.6,26.8], expectedCarry:[110,180], expectedSpin:[6041,9237] },
  "9-Iron":  { expectedSpeed:[65.3, 109.9], expectedVLA:[22.5,29.8], expectedCarry:[95, 165], expectedSpin:[6429,10330] },
  "PW":      { expectedSpeed:[61.3, 102.8], expectedVLA:[24.6,33.9], expectedCarry:[80, 150], expectedSpin:[6700,10903] },
};

// TrackMan mean ± std for each club — used for realistic shot simulation
// Format: [mean, std]   source: pga_precision_10k_v8.csv  n=1000 per club
export const CLUB_TM_STATS: Record<ClubName, {
  speed:[number,number]; vla:[number,number]; hla:[number,number]; spin:[number,number];
}> = {
  "Driver":  { speed:[148.4,21.3], vla:[8.5,1.1],  hla:[0.0,1.5],  spin:[2541,328]  },
  "3-Wood":  { speed:[134.4,18.9], vla:[9.9,1.1],  hla:[0.0,1.5],  spin:[3492,350]  },
  "5-Wood":  { speed:[124.3,18.7], vla:[11.8,1.1], hla:[0.0,1.5],  spin:[4177,375]  },
  "4-Iron":  { speed:[115.3,13.9], vla:[13.9,1.1], hla:[0.0,1.5],  spin:[4258,383]  },
  "5-Iron":  { speed:[110.2,14.5], vla:[15.2,1.1], hla:[0.0,1.5],  spin:[5144,428]  },
  "6-Iron":  { speed:[105.1,13.7], vla:[17.3,1.1], hla:[0.0,1.5],  spin:[6017,471]  },
  "7-Iron":  { speed:[99.8,12.9],  vla:[20.1,1.1], hla:[0.0,1.5],  spin:[6796,537]  },
  "8-Iron":  { speed:[93.5,12.4],  vla:[22.9,1.1], hla:[0.0,1.5],  spin:[7535,590]  },
  "9-Iron":  { speed:[86.9,11.9],  vla:[25.6,1.1], hla:[0.0,1.5],  spin:[8233,634]  },
  "PW":      { speed:[81.6,11.2],  vla:[28.4,1.1], hla:[0.0,1.5],  spin:[8872,667]  },
};

export const CLUB_NAMES = Object.keys(CLUBS) as ClubName[];

// TrackMan CSV column name → internal field mapping
export const TM_CSV_COLUMNS = {
  club:      "Club",
  ballSpeed: "Ball Speed",
  vla:       "Launch Angle",
  hla:       "Launch Direction",
  spin:      "Spin Rate",
  clubSpeed: "Club Speed",
  // Carry not in this dataset — estimated from speed
} as const;

// Map TrackMan CSV club name → ProRange club name
export const TM_CLUB_NAME_MAP: Record<string, ClubName> = {
  "Driver (10.5 deg)": "Driver",
  "3 Wood":  "3-Wood",
  "5 Wood":  "5-Wood",
  "4 Iron":  "4-Iron",
  "5 Iron":  "5-Iron",
  "6 Iron":  "6-Iron",
  "7 Iron":  "7-Iron",
  "8 Iron":  "8-Iron",
  "9 Iron":  "9-Iron",
  "PW":      "PW",
};

// ─── METRICS ──────────────────────────────────────────────────────────────────

export const METRICS: MetricKey[] = ["speed", "vla", "hla", "carry", "spin"];

export const METRIC_LABELS: Record<MetricKey, string> = {
  speed: "Ball Speed (mph)",
  vla:   "VLA (°)",
  hla:   "HLA (°)",
  carry: "Carry (yd)",
  spin:  "Spin (rpm)",
};

export const METRIC_META: Record<MetricKey, MetricMeta> = {
  speed: { label: "Ball Speed", unit: "mph", tolerance: "±0.9 mph", color: "#1a6bff" },
  vla:   { label: "VLA",        unit: "°",   tolerance: "±0.17°",   color: "#f97316" },
  hla:   { label: "HLA",        unit: "°",   tolerance: "±0.03°",   color: "#8b5cf6" },
  carry: { label: "Carry",      unit: "yd",  tolerance: "±1.6 yd",  color: "#22c55e" },
  spin:  { label: "Spin",       unit: "rpm", tolerance: "±70 rpm",  color: "#06b6d4" },
};

// ─── CHART COLORS ─────────────────────────────────────────────────────────────

export const VERSION_COLORS: string[] = [
  "#1a6bff", "#f97316", "#22c55e", "#8b5cf6",
  "#06b6d4", "#ec4899", "#eab308",
];

// ─── TOLERANCES ───────────────────────────────────────────────────────────────

export const PASS_THRESHOLD = 1.0; // ±1%

// ─── STORAGE ──────────────────────────────────────────────────────────────────

export const STORAGE_KEY       = "prorange_sessions_v2";
export const LIVE_SESSION_ID   = "live-session";          // fixed id for the auto session
export const LIVE_SHOTS_KEY    = "prorange_live_shots_v1"; // persists shots[] across refreshes
