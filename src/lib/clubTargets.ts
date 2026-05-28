export interface ClubBaseline {
  label: string;
  carryRange: [number, number];
  launchRange: [number, number];
  launchBullseyeRange?: [number, number];
  speedRange: [number, number];
  spinRange: [number, number];
  hlaGoodMax: number;
  hlaOkayMax: number;
  scoring: "distance" | "stock" | "control";
}

// Baselines use the app's TrackMan-derived club distributions so the target
// rings match the same club windows used by the rest of the dashboard.
export const CLUB_BASELINES: Record<string, ClubBaseline> = {
  "Driver": {
    label: "Driver",
    carryRange: [230, 290],
    launchRange: [10, 14],
    speedRange: [135, 170],
    spinRange: [1800, 2800],
    hlaGoodMax: 2,
    hlaOkayMax: 3,
    scoring: "distance",
  },
  "3-Wood": {
    label: "3-Wood",
    carryRange: [205, 250],
    launchRange: [9, 13],
    speedRange: [125, 155],
    spinRange: [2800, 4200],
    hlaGoodMax: 2,
    hlaOkayMax: 3.8,
    scoring: "distance",
  },
  "5-Wood": {
    label: "5-Wood",
    carryRange: [190, 230],
    launchRange: [10, 15],
    speedRange: [115, 145],
    spinRange: [3500, 5000],
    hlaGoodMax: 2,
    hlaOkayMax: 3.8,
    scoring: "distance",
  },
  "Hybrid": {
    label: "Hybrid",
    carryRange: [175, 215],
    launchRange: [13, 17],
    speedRange: [105, 135],
    spinRange: [3500, 5000],
    hlaGoodMax: 2,
    hlaOkayMax: 4,
    scoring: "stock",
  },
  "3-Iron": {
    label: "3-Iron",
    carryRange: [185, 215],
    launchRange: [12, 15],
    speedRange: [108, 130],
    spinRange: [3200, 4400],
    hlaGoodMax: 2,
    hlaOkayMax: 4.5,
    scoring: "stock",
  },
  "4-Iron": {
    label: "4-Iron",
    carryRange: [175, 210],
    launchRange: [11, 15],
    speedRange: [120, 145],
    spinRange: [3500, 5000],
    hlaGoodMax: 2,
    hlaOkayMax: 4.5,
    scoring: "stock",
  },
  "5-Iron": {
    label: "5-Iron",
    carryRange: [165, 195],
    launchRange: [12, 16],
    speedRange: [115, 140],
    spinRange: [4000, 5500],
    hlaGoodMax: 2,
    hlaOkayMax: 4.8,
    scoring: "stock",
  },
  "6-Iron": {
    label: "6-Iron",
    carryRange: [155, 185],
    launchRange: [14, 18],
    speedRange: [110, 132],
    spinRange: [4800, 6200],
    hlaGoodMax: 2,
    hlaOkayMax: 4.8,
    scoring: "stock",
  },
  "7-Iron": {
    label: "7-Iron",
    carryRange: [145, 175],
    launchRange: [16, 19],
    speedRange: [105, 125],
    spinRange: [5500, 6500],
    hlaGoodMax: 2,
    hlaOkayMax: 5,
    scoring: "stock",
  },
  "8-Iron": {
    label: "8-Iron",
    carryRange: [130, 160],
    launchRange: [18, 22],
    speedRange: [95, 118],
    spinRange: [6500, 8000],
    hlaGoodMax: 2,
    hlaOkayMax: 5,
    scoring: "stock",
  },
  "9-Iron": {
    label: "9-Iron",
    carryRange: [115, 145],
    launchRange: [20, 25],
    speedRange: [85, 110],
    spinRange: [7500, 9000],
    hlaGoodMax: 2.2,
    hlaOkayMax: 5.2,
    scoring: "stock",
  },
  "PW": {
    label: "PW",
    carryRange: [30, 140],
    launchRange: [6, 35],
    speedRange: [61.3, 102.8],
    spinRange: [1000, 10500],
    hlaGoodMax: 2.2,
    hlaOkayMax: 5.5,
    scoring: "control",
  },
  "GW": {
    label: "GW",
    carryRange: [20, 115],
    launchRange: [6, 37],
    speedRange: [64, 82],
    spinRange: [1000, 10500],
    hlaGoodMax: 2.4,
    hlaOkayMax: 6,
    scoring: "control",
  },
  "SW": {
    label: "SW",
    carryRange: [10, 95],
    launchRange: [6, 40],
    speedRange: [58, 76],
    spinRange: [1000, 11000],
    hlaGoodMax: 2.5,
    hlaOkayMax: 6,
    scoring: "control",
  },
  "LW": {
    label: "LW",
    carryRange: [5, 80],
    launchRange: [8, 45],
    speedRange: [52, 70],
    spinRange: [1000, 11500],
    hlaGoodMax: 2.8,
    hlaOkayMax: 6.5,
    scoring: "control",
  },
};

const CLUB_ALIASES: Record<string, string> = {
  driver: "Driver",
  "3-wood": "3-Wood",
  "3 wood": "3-Wood",
  "5-wood": "5-Wood",
  "5 wood": "5-Wood",
  hybrid: "Hybrid",
  "3-hybrid": "Hybrid",
  "3 hybrid": "Hybrid",
  "3-iron": "3-Iron",
  "3 iron": "3-Iron",
  "4-iron": "4-Iron",
  "4 iron": "4-Iron",
  "5-iron": "5-Iron",
  "5 iron": "5-Iron",
  "6-iron": "6-Iron",
  "6 iron": "6-Iron",
  "7-iron": "7-Iron",
  "7 iron": "7-Iron",
  "8-iron": "8-Iron",
  "8 iron": "8-Iron",
  "9-iron": "9-Iron",
  "9 iron": "9-Iron",
  pw: "PW",
  "pitching wedge": "PW",
  gw: "GW",
  "gap wedge": "GW",
  sw: "SW",
  "sand wedge": "SW",
  lw: "LW",
  "lob wedge": "LW",
};

export function normalizeClubBaselineKey(club: string) {
  return CLUB_ALIASES[club.trim().toLowerCase()] ?? "7-Iron";
}

export function getClubBaseline(club: string): ClubBaseline {
  const key = normalizeClubBaselineKey(club);
  return CLUB_BASELINES[key] ?? CLUB_BASELINES["7-Iron"];
}

export function rangeCenter([min, max]: [number, number]) {
  return (min + max) / 2;
}

export function rangeRadius([min, max]: [number, number]) {
  return Math.max((max - min) / 2, 0.001);
}

export function baselineGoodRadius(range: [number, number]) {
  return Math.max(rangeRadius(range) * 0.45, 0.001);
}
