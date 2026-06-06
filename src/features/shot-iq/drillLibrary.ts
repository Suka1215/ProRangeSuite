import type { Shot } from "../../types";
import { baselineGoodRadius, getClubBaseline, normalizeClubBaselineKey, rangeCenter } from "../../lib/clubTargets";
import drillsJson from "./shotiq_drills.json";

type ClubGroup = "driver" | "wood" | "hybrid" | "long_iron" | "mid_iron" | "iron" | "wedge";
type PatternBand = "high" | "normal" | "low";
type LineBand = "left" | "center" | "right";
type CarryBand = "short" | "normal" | "long";
type ConditionValue<T extends string> = T | "any";

export interface DrillScatterInput {
  carryDelta: number;
  evaluatedShotCount: number;
  startLineBias: number;
  targetClub: string;
  vlaDelta: number;
}

interface DrillPattern {
  carry: CarryBand;
  club: string;
  clubGroup: ClubGroup;
  hla: LineBand;
  spin: PatternBand;
  spinDelta: number;
  vla: PatternBand;
}

interface DrillRule {
  clubGroups: Array<ClubGroup | "any">;
  conditions: {
    carry?: ConditionValue<CarryBand>;
    hla?: ConditionValue<LineBand>;
    spin?: ConditionValue<PatternBand>;
    vla?: ConditionValue<PatternBand>;
  };
  cue: string;
  drill?: string;
  id: string;
  priority: number;
  problem?: string;
  reps: string;
  setup?: string;
  title: string;
  why?: string;
}

export interface DrillRecommendation {
  cue: string;
  id: string;
  pattern: string;
  reps: string;
  setup: string;
  title: string;
  why: string;
}

const DRILL_LIBRARY: DrillRule[] = [
  {
    id: "iron-high-launch-compression",
    title: "Low Tee Compression",
    clubGroups: ["iron", "wedge"],
    conditions: { vla: "high", hla: "any", spin: "any" },
    cue: "Handle leads, chest covers it, finish with the club exiting under the lead shoulder.",
    setup: "Tee the ball barely above the turf and clip the tee without adding scoop.",
    reps: "2 sets of 8 shots",
    why: "High launch with scoring clubs usually needs cleaner low point and less added loft.",
    priority: 9,
  },
  {
    id: "iron-low-launch-window",
    title: "Launch Ladder",
    clubGroups: ["iron", "wedge"],
    conditions: { vla: "low", hla: "any", spin: "any" },
    cue: "Keep speed through the ball and let the chest finish tall.",
    setup: "Hit three waist-high finish shots, three chest-high finish shots, then three full-window shots.",
    reps: "9 shot ladder",
    why: "Low launch needs a higher exit window without throwing the face open.",
    priority: 8,
  },
  {
    id: "right-start-face-gate",
    title: "Start-Line Gate",
    clubGroups: ["iron", "wedge", "wood", "driver"],
    conditions: { hla: "right", vla: "any" },
    cue: "Start the ball through the gate before chasing curvature.",
    setup: "Place two tees 3 feet ahead of the ball just wider than a ball, aimed at the target line.",
    reps: "12 balls, reset after every miss",
    why: "A right cluster means face or delivery is starting the ball right of the target window.",
    priority: 9,
  },
  {
    id: "left-start-rail",
    title: "Lead-Rail Start Line",
    clubGroups: ["iron", "wedge", "wood", "driver"],
    conditions: { hla: "left", vla: "any" },
    cue: "Hold the face from over-closing and send the first 10 feet down the rail.",
    setup: "Lay an alignment stick just outside the ball-to-target line and start shots parallel to it.",
    reps: "10 controlled shots",
    why: "A left cluster needs face control before speed or launch changes matter.",
    priority: 9,
  },
  {
    id: "high-right-iron-flight",
    title: "Covered Exit Drill",
    clubGroups: ["iron", "wedge"],
    conditions: { vla: "high", hla: "right" },
    cue: "Turn through with a covered chest and keep the face looking at the ball longer.",
    setup: "Make half swings to a low balanced finish, then add length while keeping the start line centered.",
    reps: "6 half, 6 full",
    why: "High-right iron patterns often combine added loft with an open face.",
    priority: 12,
  },
  {
    id: "low-left-iron-reset",
    title: "Tall Finish Reset",
    clubGroups: ["iron", "wedge"],
    conditions: { vla: "low", hla: "left" },
    cue: "Let the club release up, not around, while the face stays quiet.",
    setup: "Pause at lead-arm-parallel on the through swing, then finish tall.",
    reps: "10 paused shots",
    why: "Low-left clusters often need more launch window and less face roll.",
    priority: 11,
  },
  {
    id: "driver-high-spin-contact",
    title: "High-Face Strike Ladder",
    clubGroups: ["driver", "wood"],
    conditions: { spin: "high", vla: "any" },
    cue: "Sweep it from a higher tee and feel contact slightly above center.",
    setup: "Spray the face, tee it high, and keep only shots struck center or above-center.",
    reps: "3 groups of 5 balls",
    why: "High spin in longer clubs is usually strike-location and attack-window related.",
    priority: 8,
  },
  {
    id: "driver-low-launch-tee",
    title: "Tee Height Launch Builder",
    clubGroups: ["driver", "wood"],
    conditions: { vla: "low", hla: "any" },
    cue: "Trail shoulder stays lower through impact while the club works upward.",
    setup: "Tee the ball half a ball higher and make slow-to-fast swings without moving the start line.",
    reps: "10 balls",
    why: "Low launch with long clubs needs a better upward delivery window.",
    priority: 8,
  },
  {
    id: "driver-high-right-anti-slice",
    title: "Face-First Driver Gate",
    clubGroups: ["driver", "wood"],
    conditions: { vla: "high", hla: "right" },
    cue: "Close the face to the start gate before adding speed.",
    setup: "Set a start gate 5 yards left of the final target and hit smooth drivers through it.",
    reps: "8 smooth, 4 normal",
    why: "High-right long-club patterns need start-line control before launch optimization.",
    priority: 12,
  },
  {
    id: "carry-short-center-strike",
    title: "Contact First Ladder",
    clubGroups: ["any"],
    conditions: { carry: "short", hla: "any", vla: "any" },
    cue: "Find center contact before adding effort.",
    setup: "Spray the face, hit 5 at 70%, 5 at 80%, 5 at normal speed. Keep only centered strikes.",
    reps: "15 balls",
    why: "Short carry with a repeatable pattern is usually strike quality or delivered speed.",
    priority: 7,
  },
  {
    id: "carry-long-distance-control",
    title: "Three-Window Distance Control",
    clubGroups: ["iron", "wedge"],
    conditions: { carry: "long", hla: "any", vla: "any" },
    cue: "Own a shorter finish before changing the swing.",
    setup: "Hit the same club to 75%, 85%, and stock finish windows with the same start line.",
    reps: "3 rounds of 3 balls",
    why: "Long carry can be useful, but the session target wants predictable distance.",
    priority: 7,
  },
  {
    id: "wedge-high-spin-flight",
    title: "Flighted Wedge Window",
    clubGroups: ["wedge"],
    conditions: { vla: "high", spin: "high" },
    cue: "Lower the handle exit and keep the pivot moving.",
    setup: "Use a three-quarter backswing and finish with hands below chest height.",
    reps: "12 wedge shots",
    why: "High-launch, high-spin wedge shots can balloon and miss carry windows.",
    priority: 11,
  },
  {
    id: "wedge-low-spin-brush",
    title: "Brush-The-Grass Spin Builder",
    clubGroups: ["wedge"],
    conditions: { spin: "low", vla: "any" },
    cue: "Brush the grass after the ball and keep speed through the strike.",
    setup: "Draw a chalk line under the ball and brush the target side of the line.",
    reps: "2 sets of 6",
    why: "Low wedge spin needs cleaner friction and a more predictable low point.",
    priority: 8,
  },
  {
    id: "centered-pattern-pressure",
    title: "Pressure The Center",
    clubGroups: ["any"],
    conditions: { vla: "normal", hla: "center", spin: "any" },
    cue: "Keep the same pattern and shrink the target.",
    setup: "Use a narrower start gate and call the carry window before each shot.",
    reps: "10 scored balls",
    why: "A centered scatter should be trained under a tighter constraint, not rebuilt.",
    priority: 6,
  },
  {
    id: "spin-low-iron-speed",
    title: "Hold-Speed Strike",
    clubGroups: ["iron"],
    conditions: { spin: "low", vla: "any" },
    cue: "Maintain speed through impact with a shallow divot after the ball.",
    setup: "Hit punch-to-stock shots, keeping a small divot on the target side.",
    reps: "8 balls",
    why: "Low iron spin often needs friction and stable dynamic loft, not more effort.",
    priority: 7,
  },
  {
    id: "spin-high-iron-clean-low-point",
    title: "Towel Low-Point Check",
    clubGroups: ["iron"],
    conditions: { spin: "high", vla: "any" },
    cue: "Ball first, turf second, with no handle stall.",
    setup: "Place a towel one grip behind the ball and miss the towel while striking the ball.",
    reps: "10 balls",
    why: "High iron spin can come from steep or heavy delivery that adds loft and friction inconsistently.",
    priority: 7,
  },
];

const JSON_DRILL_LIBRARY = ((drillsJson as { drills?: DrillRule[] }).drills ?? []) as DrillRule[];

export function recommendShotIqDrills(
  scatter: DrillScatterInput,
  shots: Shot[],
  limit = 2
): DrillRecommendation[] {
  if (!scatter.evaluatedShotCount || !shots.length) {
    return [];
  }

  const pattern = classifyPattern(scatter, shots);
  const library = JSON_DRILL_LIBRARY.length ? JSON_DRILL_LIBRARY : DRILL_LIBRARY;
  const scored = library
    .map((drill) => scoreDrill(drill, pattern))
    .filter((item): item is { drill: DrillRule; score: number } => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return scored.map(({ drill }) => ({
    cue: drill.cue,
    id: drill.id,
    pattern: formatPattern(pattern),
    reps: drill.reps,
    setup: drill.drill ?? drill.setup ?? "",
    title: drill.title,
    why: drill.problem ?? drill.why ?? "",
  }));
}

function classifyPattern(scatter: DrillScatterInput, shots: Shot[]): DrillPattern {
  const club = normalizeClubBaselineKey(scatter.targetClub || shots[shots.length - 1]?.club || "7-Iron");
  const baseline = getClubBaseline(club);
  const spinCenter = rangeCenter(baseline.spinRange);
  const spinDelta = average(shots.slice(-30).map((shot) => shot.pr.spin - spinCenter));
  const launchThreshold = baselineGoodRadius(baseline.launchRange);
  const spinThreshold = baselineGoodRadius(baseline.spinRange);
  const carryThreshold = baselineGoodRadius(baseline.carryRange);

  return {
    carry: scatter.carryDelta > carryThreshold ? "long" : scatter.carryDelta < -carryThreshold ? "short" : "normal",
    club,
    clubGroup: classifyClubGroup(club),
    hla: scatter.startLineBias > baseline.hlaGoodMax ? "right" : scatter.startLineBias < -baseline.hlaGoodMax ? "left" : "center",
    spin: spinDelta > spinThreshold ? "high" : spinDelta < -spinThreshold ? "low" : "normal",
    spinDelta,
    vla: scatter.vlaDelta > launchThreshold ? "high" : scatter.vlaDelta < -launchThreshold ? "low" : "normal",
  };
}

function scoreDrill(drill: DrillRule, pattern: DrillPattern) {
  let score = drill.priority;

  if (drill.clubGroups.includes(pattern.clubGroup)) {
    score += 2;
  } else if (drill.clubGroups.includes("any")) {
    score += 0.5;
  } else {
    return null;
  }

  const weights = { carry: 1.4, hla: 2.8, spin: 1.4, vla: 3.2 };
  const conditions = Object.entries(drill.conditions) as Array<[keyof DrillRule["conditions"], string]>;

  for (const [key, expected] of conditions) {
    if (expected === "any") {
      score += 0.15;
      continue;
    }

    if (pattern[key] !== expected) {
      return null;
    }

    score += weights[key];
  }

  return { drill, score };
}

function classifyClubGroup(club: string): ClubGroup {
  if (club === "Driver") return "driver";
  if (club.includes("Wood")) return "wood";
  if (club === "Hybrid") return "hybrid";
  if (club === "PW" || club === "GW" || club === "SW" || club === "LW") return "wedge";
  if (club === "3-Iron" || club === "4-Iron" || club === "5-Iron") return "long_iron";
  return "mid_iron";
}

function formatPattern(pattern: DrillPattern) {
  const launch = pattern.vla === "normal" ? "center launch" : `${pattern.vla} launch`;
  const line = pattern.hla === "center" ? "center line" : `${pattern.hla} start`;
  const spin = pattern.spin === "normal" ? "neutral spin" : `${pattern.spin} spin`;
  return `${pattern.club} / ${launch} / ${line} / ${spin}`;
}

function average(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}
