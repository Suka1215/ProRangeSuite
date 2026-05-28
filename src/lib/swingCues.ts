import type { Shot } from "../types";
import {
  baselineGoodRadius,
  getClubBaseline,
  rangeCenter,
  rangeRadius,
} from "./clubTargets";

export type SwingDnaTone = "good" | "watch" | "miss";

export interface SwingCue {
  id: string;
  label: string;
  cue: string;
  reason: string;
  tone: SwingDnaTone;
  priority: number;
}

export interface SwingDnaMetric {
  key: "launch" | "line" | "carry" | "speed" | "spin";
  label: string;
  value: string;
  target: string;
  delta: string;
  score: number;
  tone: SwingDnaTone;
}

export interface SwingDnaSnapshot {
  shotCount: number;
  headline: string;
  subhead: string;
  dnaCode: string;
  matchScore: number;
  bullseyeHits: number;
  bullseyeLabel: string;
  traits: string[];
  cues: SwingCue[];
  metrics: SwingDnaMetric[];
  clubWindow: {
    carry: number;
    launch: number;
    launchRange: [number, number];
  };
}

type ClubFamily = "driver" | "wood" | "hybrid" | "iron" | "wedge";
type BiasState = "low" | "high" | "neutral";
type LineState = "left" | "right" | "neutral";

interface SwingCueContext {
  club: string;
  family: ClubFamily;
  shotCount: number;
  means: {
    speed: number;
    vla: number;
    hla: number;
    carry: number;
    spin: number;
  };
  targets: {
    speed: number;
    vla: number;
    hla: number;
    carry: number;
    spin: number;
  };
  deltas: {
    speed: number;
    vla: number;
    hla: number;
    carry: number;
    spin: number;
  };
  radii: {
    speedGood: number;
    speedOkay: number;
    vlaGood: number;
    vlaOkay: number;
    hlaGood: number;
    hlaOkay: number;
    carryGood: number;
    carryOkay: number;
    spinGood: number;
    spinOkay: number;
  };
  ranges: {
    launchBullseye: [number, number];
  };
  launchState: BiasState;
  lineState: LineState;
  carryState: BiasState;
  speedState: BiasState;
  spinState: BiasState;
  launchTone: SwingDnaTone;
  lineTone: SwingDnaTone;
  carryTone: SwingDnaTone;
  speedTone: SwingDnaTone;
  spinTone: SwingDnaTone;
  dispersion: number;
  launchSpread: number;
  bullseyeHits: number;
  bullseyeRate: number;
  matchScore: number;
  scoring: "distance" | "stock" | "control";
}

interface SwingCueTemplate {
  id: string;
  label: string;
  priority: number;
  tone: SwingDnaTone;
  families?: ClubFamily[];
  when: (context: SwingCueContext) => boolean;
  cue: (context: SwingCueContext) => string;
  reason: (context: SwingCueContext) => string;
}

const DEG = "deg";

export function buildSwingDnaSnapshot(club: string, shots: Shot[]): SwingDnaSnapshot {
  const context = buildCueContext(club, shots);
  const metrics = buildDnaMetrics(context);
  const cues = selectSessionCues(context);
  const traits = buildTraits(context);

  return {
    shotCount: context.shotCount,
    headline: buildHeadline(context),
    subhead: buildSubhead(context),
    dnaCode: buildDnaCode(context),
    matchScore: context.matchScore,
    bullseyeHits: context.bullseyeHits,
    bullseyeLabel: context.shotCount
      ? `${context.bullseyeHits}/${context.shotCount} bullseye`
      : "Ready",
    traits,
    cues,
    metrics,
    clubWindow: {
      carry: context.targets.carry,
      launch: context.targets.vla,
      launchRange: context.ranges.launchBullseye,
    },
  };
}

function buildCueContext(club: string, shots: Shot[]): SwingCueContext {
  const baseline = getClubBaseline(club);
  const launchBullseyeRange = baseline.launchBullseyeRange ?? baseline.launchRange;
  const targetSpeed = rangeCenter(baseline.speedRange);
  const targetVla = rangeCenter(launchBullseyeRange);
  const targetCarry = rangeCenter(baseline.carryRange);
  const targetSpin = rangeCenter(baseline.spinRange);
  const shotCount = shots.length;
  const means = {
    speed: average(shots.map((shot) => shot.pr.speed), targetSpeed),
    vla: average(shots.map((shot) => shot.pr.vla), targetVla),
    hla: average(shots.map((shot) => shot.pr.hla), 0),
    carry: average(shots.map((shot) => shot.pr.carry), targetCarry),
    spin: average(shots.map((shot) => shot.pr.spin), targetSpin),
  };
  const radii = {
    speedGood: baselineGoodRadius(baseline.speedRange),
    speedOkay: rangeRadius(baseline.speedRange),
    vlaGood: rangeRadius(launchBullseyeRange),
    vlaOkay: rangeRadius(baseline.launchRange),
    hlaGood: baseline.hlaGoodMax,
    hlaOkay: baseline.hlaOkayMax,
    carryGood: baselineGoodRadius(baseline.carryRange),
    carryOkay: rangeRadius(baseline.carryRange),
    spinGood: baselineGoodRadius(baseline.spinRange),
    spinOkay: rangeRadius(baseline.spinRange),
  };
  const deltas = {
    speed: means.speed - targetSpeed,
    vla: means.vla - targetVla,
    hla: means.hla,
    carry: means.carry - targetCarry,
    spin: means.spin - targetSpin,
  };
  const bullseyeHits = shots.filter((shot) => {
    const launchGood = Math.abs(shot.pr.vla - targetVla) <= radii.vlaGood;
    const lineGood = Math.abs(shot.pr.hla) <= radii.hlaGood;
    if (baseline.scoring === "control") return launchGood && lineGood;
    return launchGood && lineGood && Math.abs(shot.pr.carry - targetCarry) <= radii.carryGood;
  }).length;
  const metricScores = {
    speed: scoreFromDelta(Math.abs(deltas.speed), radii.speedOkay),
    vla: scoreFromDelta(Math.abs(deltas.vla), radii.vlaOkay),
    hla: scoreFromDelta(Math.abs(deltas.hla), radii.hlaOkay),
    carry: scoreFromDelta(Math.abs(deltas.carry), radii.carryOkay),
    spin: scoreFromDelta(Math.abs(deltas.spin), radii.spinOkay),
  };
  const scoreWeights = baseline.scoring === "control"
    ? { speed: 0.07, vla: 0.38, hla: 0.38, carry: 0.05, spin: 0.12 }
    : baseline.scoring === "distance"
      ? { speed: 0.25, vla: 0.2, hla: 0.12, carry: 0.25, spin: 0.18 }
      : { speed: 0.2, vla: 0.25, hla: 0.22, carry: 0.22, spin: 0.11 };
  const weightedScore = Object.entries(metricScores).reduce((sum, [key, score]) => {
    return sum + score * scoreWeights[key as keyof typeof scoreWeights];
  }, 0);
  const totalWeight = Object.values(scoreWeights).reduce((sum, weight) => sum + weight, 0);

  return {
    club,
    family: getClubFamily(club),
    shotCount,
    means,
    targets: {
      speed: targetSpeed,
      vla: targetVla,
      hla: 0,
      carry: targetCarry,
      spin: targetSpin,
    },
    deltas,
    radii,
    ranges: {
      launchBullseye: launchBullseyeRange,
    },
    launchState: biasState(deltas.vla, Math.min(radii.vlaGood, 0.55)),
    lineState: lineState(deltas.hla, Math.min(radii.hlaGood, 0.45)),
    carryState: biasState(deltas.carry, radii.carryGood),
    speedState: biasState(deltas.speed, radii.speedGood),
    spinState: biasState(deltas.spin, radii.spinGood),
    launchTone: toneFromDelta(Math.abs(deltas.vla), radii.vlaGood, radii.vlaOkay),
    lineTone: toneFromDelta(Math.abs(deltas.hla), radii.hlaGood, radii.hlaOkay),
    carryTone: toneFromDelta(Math.abs(deltas.carry), radii.carryGood, radii.carryOkay),
    speedTone: toneFromDelta(Math.abs(deltas.speed), radii.speedGood, radii.speedOkay),
    spinTone: toneFromDelta(Math.abs(deltas.spin), radii.spinGood, radii.spinOkay),
    dispersion: standardDeviation(shots.map((shot) => shot.pr.hla)),
    launchSpread: standardDeviation(shots.map((shot) => shot.pr.vla)),
    bullseyeHits,
    bullseyeRate: shotCount ? bullseyeHits / shotCount : 0,
    matchScore: Math.round(weightedScore / Math.max(totalWeight, 0.001)),
    scoring: baseline.scoring,
  };
}

const SWING_CUE_LIBRARY: SwingCueTemplate[] = [
  {
    id: "session-capture-baseline",
    label: "Baseline",
    priority: 120,
    tone: "watch",
    when: (context) => context.shotCount === 0,
    cue: () => "Capture five normal stock swings before changing the motion.",
    reason: () => "A cue needs a measured pattern, not a single guess.",
  },
  {
    id: "session-empty-window",
    label: "Window",
    priority: 118,
    tone: "good",
    when: (context) => context.shotCount === 0,
    cue: (context) => `Start with the ${context.ranges.launchBullseye[0].toFixed(1)}-${context.ranges.launchBullseye[1].toFixed(1)} ${DEG} launch window.`,
    reason: (context) => `${formatClubLabel(context.club)} bullseye is loaded and ready for the first shot.`,
  },
  {
    id: "session-empty-setup",
    label: "Setup",
    priority: 116,
    tone: "good",
    when: (context) => context.shotCount === 0,
    cue: () => "Set face, feet, then ball position before the first swing.",
    reason: () => "A clean setup makes the first trend useful.",
  },
  {
    id: "session-small-sample",
    label: "Sample",
    priority: 112,
    tone: "watch",
    when: (context) => context.shotCount > 0 && context.shotCount < 5,
    cue: () => "Keep the same target and collect at least five shots before chasing a fix.",
    reason: (context) => `${context.shotCount} shot sample is still thin for a reliable session cue.`,
  },
  {
    id: "wedge-control-line-first",
    label: "Face",
    priority: 111,
    tone: "watch",
    families: ["wedge"],
    when: (context) => context.shotCount > 0 && context.scoring === "control" && context.lineTone !== "good",
    cue: () => "For the next wedge ball, score start line first: face at the landing spot, body set around it.",
    reason: (context) => `Wedge start line is ${absFixed(context.deltas.hla, DEG)} ${context.lineState} of center; carry is secondary here.`,
  },
  {
    id: "wedge-control-launch-low",
    label: "Launch",
    priority: 109,
    tone: "watch",
    families: ["wedge"],
    when: (context) => context.shotCount > 0 && context.scoring === "control" && context.launchState === "low",
    cue: () => "Add a little loft feel and brush the turf longer; keep the same landing spot.",
    reason: (context) => `Launch is ${absFixed(context.deltas.vla, DEG)} under the wedge control window.`,
  },
  {
    id: "wedge-control-launch-high",
    label: "Launch",
    priority: 109,
    tone: "watch",
    families: ["wedge"],
    when: (context) => context.shotCount > 0 && context.scoring === "control" && context.launchState === "high",
    cue: () => "Flight the wedge down: handle slightly forward, chest turning, finish shorter.",
    reason: (context) => `Launch is ${absFixed(context.deltas.vla, DEG)} above the wedge control window.`,
  },
  {
    id: "wedge-control-window-good",
    label: "Control",
    priority: 107,
    tone: "good",
    families: ["wedge"],
    when: (context) => context.shotCount > 0 && context.scoring === "control" && context.launchTone === "good" && context.lineTone === "good",
    cue: () => "Keep the wedge pattern. VLA and start line are doing the job; vary carry only by length of swing.",
    reason: () => "Wedge scoring is prioritizing launch window and HLA over raw distance.",
  },
  {
    id: "wedge-spin-control-low",
    label: "Spin",
    priority: 83,
    tone: "watch",
    families: ["wedge"],
    when: (context) => context.shotCount > 0 && context.spinState === "low" && context.launchState !== "low",
    cue: () => "Clean the face, use a premium ball, and keep speed through the strike for more check.",
    reason: () => "Launch is playable, but wedge spin is low for stopping power.",
  },
  {
    id: "stock-iron-speed-window",
    label: "Speed",
    priority: 106,
    tone: "watch",
    families: ["iron"],
    when: (context) => context.scoring === "stock" && context.speedState === "low" && context.carryState === "low",
    cue: () => "Find centered strike before adding effort: tee-height brush, balanced finish, same tempo.",
    reason: (context) => `Ball speed and carry are both below the ${context.club} stock window.`,
  },
  {
    id: "stock-iron-launch-window",
    label: "Window",
    priority: 105,
    tone: "watch",
    families: ["iron"],
    when: (context) => context.scoring === "stock" && context.launchTone !== "good" && context.lineTone === "good",
    cue: () => "Keep the face work, then move launch with ball position and finish height.",
    reason: () => "Start line is usable; the iron miss is mostly vertical launch.",
  },
  {
    id: "stock-iron-start-line-window",
    label: "Start",
    priority: 105,
    tone: "watch",
    families: ["iron"],
    when: (context) => context.scoring === "stock" && context.lineTone !== "good" && context.launchTone === "good",
    cue: () => "Do not change loft yet. Set a two-tee start gate and match the face to that gate.",
    reason: () => "Launch is in range; the iron miss is face/start-line control.",
  },
  {
    id: "stock-iron-spin-too-low",
    label: "Hold",
    priority: 81,
    tone: "watch",
    families: ["iron"],
    when: (context) => context.scoring === "stock" && context.spinState === "low" && context.carryState !== "low",
    cue: () => "Keep distance, add stopping power: cleaner grooves, slightly steeper brush, no flip.",
    reason: () => "Carry is serviceable but spin is under the stock iron holding window.",
  },
  {
    id: "distance-club-launch-spin",
    label: "Flight",
    priority: 102,
    tone: "watch",
    families: ["driver", "wood"],
    when: (context) => context.scoring === "distance" && context.launchTone !== "good" && context.spinTone !== "good",
    cue: () => "Tune launch and spin together: tee/ball position first, then strike height.",
    reason: () => "Long-club distance depends on launch and spin matching, not just speed.",
  },
  {
    id: "distance-club-line-control",
    label: "Line",
    priority: 91,
    tone: "watch",
    families: ["driver", "wood"],
    when: (context) => context.scoring === "distance" && context.lineTone === "miss",
    cue: () => "Start the ball inside a wider fairway gate before chasing more carry.",
    reason: (context) => `Start line is ${absFixed(context.deltas.hla, DEG)} off center.`,
  },
  {
    id: "distance-club-speed-good",
    label: "Speed",
    priority: 77,
    tone: "good",
    families: ["driver", "wood"],
    when: (context) => context.scoring === "distance" && context.speedTone === "good",
    cue: () => "Speed is enough; protect strike and launch window before swinging harder.",
    reason: () => "The distance-club speed window is already usable.",
  },
  {
    id: "high-left-start-gate",
    label: "Pattern",
    priority: 104,
    tone: "miss",
    when: (context) => context.launchState === "high" && context.lineState === "left",
    cue: () => "Set a start gate just right of target and feel the face return square without adding loft.",
    reason: (context) => `Launch is ${absFixed(context.deltas.vla, DEG)} high and start line is ${absFixed(context.deltas.hla, DEG)} left.`,
  },
  {
    id: "high-right-start-gate",
    label: "Pattern",
    priority: 104,
    tone: "miss",
    when: (context) => context.launchState === "high" && context.lineState === "right",
    cue: () => "Use a left-edge start gate and finish with the chest rotating through, not hanging back.",
    reason: (context) => `Launch is ${absFixed(context.deltas.vla, DEG)} high and start line is ${absFixed(context.deltas.hla, DEG)} right.`,
  },
  {
    id: "low-left-start-gate",
    label: "Pattern",
    priority: 104,
    tone: "miss",
    when: (context) => context.launchState === "low" && context.lineState === "left",
    cue: () => "Open the launch window first, then return the face to a center start gate.",
    reason: (context) => `Launch is ${absFixed(context.deltas.vla, DEG)} low and start line is ${absFixed(context.deltas.hla, DEG)} left.`,
  },
  {
    id: "low-right-start-gate",
    label: "Pattern",
    priority: 104,
    tone: "miss",
    when: (context) => context.launchState === "low" && context.lineState === "right",
    cue: () => "Move the strike window higher, then match the face to a center start gate.",
    reason: (context) => `Launch is ${absFixed(context.deltas.vla, DEG)} low and start line is ${absFixed(context.deltas.hla, DEG)} right.`,
  },
  {
    id: "launch-low-iron-low-point",
    label: "Launch",
    priority: 98,
    tone: "watch",
    families: ["iron", "wedge", "hybrid"],
    when: (context) => context.launchState === "low",
    cue: () => "Brush the turf after the ball and let the handle lead without trapping the face shut.",
    reason: (context) => `Session launch is ${absFixed(context.deltas.vla, DEG)} below the club window.`,
  },
  {
    id: "launch-low-driver-tee",
    label: "Launch",
    priority: 98,
    tone: "watch",
    families: ["driver"],
    when: (context) => context.launchState === "low",
    cue: () => "Tee it a touch higher, ball forward, and feel the trail shoulder stay lower through strike.",
    reason: (context) => `Driver launch is ${absFixed(context.deltas.vla, DEG)} below its window.`,
  },
  {
    id: "launch-low-wood-sweep",
    label: "Launch",
    priority: 96,
    tone: "watch",
    families: ["wood"],
    when: (context) => context.launchState === "low",
    cue: () => "Sweep the club through a shallow low point and finish tall through the strike.",
    reason: (context) => `Fairway launch is ${absFixed(context.deltas.vla, DEG)} below the club window.`,
  },
  {
    id: "launch-low-finish-window",
    label: "Launch",
    priority: 91,
    tone: "watch",
    when: (context) => context.launchState === "low",
    cue: () => "Rehearse a chest-high finish and keep speed moving through the ball.",
    reason: (context) => `Average launch is under the ${context.club} bullseye.`,
  },
  {
    id: "launch-low-ball-position",
    label: "Launch",
    priority: 88,
    tone: "watch",
    when: (context) => context.launchState === "low" && context.family !== "wedge",
    cue: () => "Move ball position one ball forward for the next three stock swings.",
    reason: (context) => `Measured launch is low by ${absFixed(context.deltas.vla, DEG)}.`,
  },
  {
    id: "launch-high-iron-cover",
    label: "Flight",
    priority: 98,
    tone: "watch",
    families: ["iron", "wedge", "hybrid"],
    when: (context) => context.launchState === "high",
    cue: () => "Cover the ball with the chest and feel the handle stay ahead through impact.",
    reason: (context) => `Session launch is ${absFixed(context.deltas.vla, DEG)} above the club window.`,
  },
  {
    id: "launch-high-driver-tee",
    label: "Flight",
    priority: 98,
    tone: "watch",
    families: ["driver"],
    when: (context) => context.launchState === "high",
    cue: () => "Lower the tee half a ball and keep the sternum moving through the strike.",
    reason: (context) => `Driver launch is ${absFixed(context.deltas.vla, DEG)} above its window.`,
  },
  {
    id: "launch-high-finish-low",
    label: "Flight",
    priority: 92,
    tone: "watch",
    when: (context) => context.launchState === "high",
    cue: () => "Hit a three-quarter flighted finish with the hands exiting low and left.",
    reason: (context) => `Average launch is above the ${context.club} bullseye.`,
  },
  {
    id: "launch-high-ball-position",
    label: "Flight",
    priority: 88,
    tone: "watch",
    when: (context) => context.launchState === "high" && context.family !== "driver",
    cue: () => "Move ball position one ball back and keep tempo at 80 percent.",
    reason: (context) => `Measured launch is high by ${absFixed(context.deltas.vla, DEG)}.`,
  },
  {
    id: "line-left-face-gate",
    label: "Start line",
    priority: 99,
    tone: "watch",
    when: (context) => context.lineState === "left",
    cue: () => "Aim the clubface at an intermediate gate before setting the feet.",
    reason: (context) => `Average start line is ${absFixed(context.deltas.hla, DEG)} left of center.`,
  },
  {
    id: "line-left-hold-face",
    label: "Start line",
    priority: 93,
    tone: "watch",
    when: (context) => context.lineState === "left",
    cue: () => "Make a waist-high rehearsal with the face looking at the target longer.",
    reason: (context) => `The ball is starting left before curve is considered.`,
  },
  {
    id: "line-left-finish-balance",
    label: "Start line",
    priority: 85,
    tone: "watch",
    when: (context) => context.lineState === "left" && context.dispersion > context.radii.hlaGood,
    cue: () => "Hold the finish until the ball lands and check that the chest faces target.",
    reason: () => "Start line and dispersion are both asking for face control.",
  },
  {
    id: "line-right-face-gate",
    label: "Start line",
    priority: 99,
    tone: "watch",
    when: (context) => context.lineState === "right",
    cue: () => "Set the face to a center gate first, then let the body align around it.",
    reason: (context) => `Average start line is ${absFixed(context.deltas.hla, DEG)} right of center.`,
  },
  {
    id: "line-right-release",
    label: "Start line",
    priority: 92,
    tone: "watch",
    when: (context) => context.lineState === "right",
    cue: () => "Feel the lead wrist stay flat and the toe of the club pass to square.",
    reason: (context) => `The ${context.club} is starting right before curve is measured.`,
  },
  {
    id: "line-right-body-through",
    label: "Start line",
    priority: 84,
    tone: "watch",
    when: (context) => context.lineState === "right" && context.dispersion > context.radii.hlaGood,
    cue: () => "Keep turning through the ball so the face does not hang open late.",
    reason: () => "Right start line plus spread points to delivery timing.",
  },
  {
    id: "carry-short-center-strike",
    label: "Carry",
    priority: 94,
    tone: "watch",
    when: (context) => context.carryState === "low",
    cue: () => "Chase centered contact before adding speed; hold a balanced finish for two counts.",
    reason: (context) => `Carry is ${absFixed(context.deltas.carry, "yd")} short of the ${context.club} window.`,
  },
  {
    id: "carry-short-smooth-speed",
    label: "Carry",
    priority: 88,
    tone: "watch",
    when: (context) => context.carryState === "low" && context.speedState !== "low",
    cue: () => "Keep the same speed and improve strike location rather than swinging harder.",
    reason: () => "Carry is down while speed is not the main miss.",
  },
  {
    id: "carry-short-launch-match",
    label: "Carry",
    priority: 86,
    tone: "watch",
    when: (context) => context.carryState === "low" && context.launchState !== "neutral",
    cue: () => "Match launch first; carry usually follows when start line and loft return to window.",
    reason: () => "Carry miss is paired with a launch miss.",
  },
  {
    id: "carry-long-club-window",
    label: "Carry",
    priority: 78,
    tone: "good",
    when: (context) => context.carryState === "high",
    cue: () => "Keep the same strike feel and verify the intended club window before changing motion.",
    reason: (context) => `Carry is ${absFixed(context.deltas.carry, "yd")} beyond the stock window.`,
  },
  {
    id: "speed-low-balance",
    label: "Speed",
    priority: 89,
    tone: "watch",
    when: (context) => context.speedState === "low",
    cue: () => "Make a full finish, then let speed build from rhythm instead of extra hit.",
    reason: (context) => `Ball speed is ${absFixed(context.deltas.speed, "mph")} under the club window.`,
  },
  {
    id: "speed-low-ground",
    label: "Speed",
    priority: 82,
    tone: "watch",
    when: (context) => context.speedState === "low" && context.family !== "wedge",
    cue: () => "Feel pressure shift into the lead foot before the club reaches the ball.",
    reason: () => "More usable speed starts with sequencing, not a rushed transition.",
  },
  {
    id: "speed-high-control",
    label: "Speed",
    priority: 80,
    tone: "good",
    when: (context) => context.speedState === "high" && context.carryTone !== "miss",
    cue: () => "Keep the tempo; this speed only needs the face and launch to stay matched.",
    reason: (context) => `Ball speed is strong for the ${context.club} window.`,
  },
  {
    id: "speed-high-tempo",
    label: "Speed",
    priority: 86,
    tone: "watch",
    when: (context) => context.speedState === "high" && (context.lineTone === "miss" || context.launchTone === "miss"),
    cue: () => "Throttle to an 80 percent rehearsal until start line and launch settle.",
    reason: () => "Speed is up, but the delivery pattern is leaking accuracy.",
  },
  {
    id: "spin-low-clean-loft",
    label: "Spin",
    priority: 87,
    tone: "watch",
    when: (context) => context.spinState === "low",
    cue: () => "Clean the grooves, keep face contact centered, and let loft stay on the ball.",
    reason: (context) => `Spin is ${absFixed(context.deltas.spin, "rpm")} below the club window.`,
  },
  {
    id: "spin-low-wedge-brush",
    label: "Spin",
    priority: 90,
    tone: "watch",
    families: ["wedge"],
    when: (context) => context.spinState === "low",
    cue: () => "Brush the turf with speed and keep the face sliding under the ball.",
    reason: (context) => `Wedge spin is ${absFixed(context.deltas.spin, "rpm")} low.`,
  },
  {
    id: "spin-low-driver-launch",
    label: "Spin",
    priority: 83,
    tone: "watch",
    families: ["driver"],
    when: (context) => context.spinState === "low" && context.launchState === "low",
    cue: () => "Raise the launch window before adding effort; low launch plus low spin can fall out of the air.",
    reason: () => "Driver launch and spin are both below window.",
  },
  {
    id: "spin-high-centered",
    label: "Spin",
    priority: 87,
    tone: "watch",
    when: (context) => context.spinState === "high",
    cue: () => "Smooth the transition and strike the center; avoid a glancing delivery.",
    reason: (context) => `Spin is ${absFixed(context.deltas.spin, "rpm")} above the club window.`,
  },
  {
    id: "spin-high-driver-flight",
    label: "Spin",
    priority: 91,
    tone: "watch",
    families: ["driver"],
    when: (context) => context.spinState === "high",
    cue: () => "Feel a sweeping strike with a stable face and finish around the body.",
    reason: (context) => `Driver spin is ${absFixed(context.deltas.spin, "rpm")} high.`,
  },
  {
    id: "spin-high-iron-flight",
    label: "Spin",
    priority: 84,
    tone: "watch",
    families: ["iron", "hybrid"],
    when: (context) => context.spinState === "high" && context.launchState === "high",
    cue: () => "Take one more club and hit a flighted three-quarter shot.",
    reason: () => "Launch and spin are both above stock window.",
  },
  {
    id: "dispersion-start-gate",
    label: "Dispersion",
    priority: 86,
    tone: "watch",
    when: (context) => context.shotCount >= 5 && context.dispersion > context.radii.hlaOkay * 0.55,
    cue: () => "Use two tees as a start gate and score only whether the ball launches through it.",
    reason: (context) => `Start-line spread is ${context.dispersion.toFixed(1)} ${DEG}.`,
  },
  {
    id: "dispersion-slow-rep",
    label: "Dispersion",
    priority: 78,
    tone: "watch",
    when: (context) => context.shotCount >= 5 && context.dispersion > context.radii.hlaGood,
    cue: () => "Make three slow-motion impact rehearsals, then hit one normal-speed ball.",
    reason: () => "The session needs repeatable face delivery.",
  },
  {
    id: "launch-spread-window",
    label: "Height",
    priority: 82,
    tone: "watch",
    when: (context) => context.shotCount >= 5 && context.launchSpread > context.radii.vlaOkay * 0.55,
    cue: () => "Pick one finish height for the next block and repeat it until launch tightens.",
    reason: (context) => `Launch spread is ${context.launchSpread.toFixed(1)} ${DEG}.`,
  },
  {
    id: "bullseye-good-repeat",
    label: "Bullseye",
    priority: 76,
    tone: "good",
    when: (context) => context.shotCount >= 5 && context.bullseyeRate >= 0.6,
    cue: () => "Do not change the motion; repeat the same setup and tempo for the next three balls.",
    reason: (context) => `${Math.round(context.bullseyeRate * 100)}% of this block is in the club bullseye.`,
  },
  {
    id: "bullseye-center-pressure",
    label: "Bullseye",
    priority: 74,
    tone: "good",
    when: (context) => context.matchScore >= 82,
    cue: () => "Add pressure: same cue, smaller target, no mechanical change.",
    reason: (context) => `Session match is ${context.matchScore}%.`,
  },
  {
    id: "iron-stock-tempo",
    label: "Iron",
    priority: 63,
    tone: "good",
    families: ["iron"],
    when: (context) => context.shotCount > 0,
    cue: () => "Stock iron feel: quiet takeaway, brush after the ball, balanced finish.",
    reason: () => "This keeps low point, launch, and face control tied together.",
  },
  {
    id: "wedge-distance-control",
    label: "Wedge",
    priority: 64,
    tone: "good",
    families: ["wedge"],
    when: (context) => context.shotCount > 0,
    cue: () => "Match backswing length to carry number and keep the finish from out-running it.",
    reason: () => "Wedge windows depend on predictable speed and launch.",
  },
  {
    id: "driver-balance-tee",
    label: "Driver",
    priority: 64,
    tone: "good",
    families: ["driver"],
    when: (context) => context.shotCount > 0,
    cue: () => "Driver stock feel: tee height steady, sweep through, finish in balance.",
    reason: () => "The driver window needs launch, spin, and center strike working together.",
  },
  {
    id: "wood-sweep-finish",
    label: "Fairway",
    priority: 62,
    tone: "good",
    families: ["wood", "hybrid"],
    when: (context) => context.shotCount > 0,
    cue: () => "Sweep the sole through the grass and finish with the belt buckle at target.",
    reason: () => "Fairway clubs reward a shallow, centered strike pattern.",
  },
  {
    id: "neutral-start-line",
    label: "Start line",
    priority: 60,
    tone: "good",
    when: (context) => context.lineState === "neutral" && context.shotCount > 0,
    cue: () => "Keep building the setup from clubface first; the start line is doing its job.",
    reason: () => "Average horizontal launch is inside the club bullseye.",
  },
  {
    id: "neutral-launch-window",
    label: "Launch",
    priority: 58,
    tone: "good",
    when: (context) => context.launchState === "neutral" && context.shotCount > 0,
    cue: () => "Protect the same finish height; launch is already in the stock window.",
    reason: () => "Average launch is inside the club bullseye.",
  },
  {
    id: "neutral-carry-window",
    label: "Carry",
    priority: 56,
    tone: "good",
    when: (context) => context.carryState === "neutral" && context.shotCount > 0,
    cue: () => "Keep the same strike rhythm and move the target smaller, not the swing bigger.",
    reason: () => "Carry is matching the club window.",
  },
  {
    id: "stock-setup-reset",
    label: "Setup",
    priority: 48,
    tone: "good",
    when: (context) => context.shotCount > 0,
    cue: () => "Reset grip, face, feet, then ball position in that order before the next swing.",
    reason: () => "A clean setup keeps measured delivery changes meaningful.",
  },
  {
    id: "stock-one-thought",
    label: "Commit",
    priority: 46,
    tone: "good",
    when: (context) => context.shotCount > 0,
    cue: () => "Use one swing thought only; score the ball flight, not the rehearsal.",
    reason: () => "The session needs a repeatable cue, not competing adjustments.",
  },
];

function selectSessionCues(context: SwingCueContext) {
  const seenLabels = new Set<string>();
  return SWING_CUE_LIBRARY
    .filter((cue) => !cue.families || cue.families.includes(context.family))
    .filter((cue) => cue.when(context))
    .sort((left, right) => right.priority - left.priority)
    .filter((cue) => {
      if (!seenLabels.has(cue.label)) {
        seenLabels.add(cue.label);
        return true;
      }
      return cue.priority >= 100;
    })
    .slice(0, 4)
    .map((template) => ({
      id: template.id,
      label: template.label,
      cue: template.cue(context),
      reason: template.reason(context),
      tone: template.tone,
      priority: template.priority,
    }));
}

function buildDnaMetrics(context: SwingCueContext): SwingDnaMetric[] {
  return [
    {
      key: "launch",
      label: "Launch",
      value: `${context.means.vla.toFixed(1)} ${DEG}`,
      target: `${context.targets.vla.toFixed(1)} ${DEG}`,
      delta: signed(context.deltas.vla, DEG),
      score: scoreFromDelta(Math.abs(context.deltas.vla), context.radii.vlaOkay),
      tone: context.launchTone,
    },
    {
      key: "line",
      label: "Start",
      value: `${signed(context.means.hla, DEG)}`,
      target: `0.0 ${DEG}`,
      delta: signed(context.deltas.hla, DEG),
      score: scoreFromDelta(Math.abs(context.deltas.hla), context.radii.hlaOkay),
      tone: context.lineTone,
    },
    {
      key: "carry",
      label: "Carry",
      value: `${Math.round(context.means.carry)} yd`,
      target: `${Math.round(context.targets.carry)} yd`,
      delta: signed(context.deltas.carry, "yd", 0),
      score: scoreFromDelta(Math.abs(context.deltas.carry), context.radii.carryOkay),
      tone: context.carryTone,
    },
    {
      key: "speed",
      label: "Speed",
      value: `${context.means.speed.toFixed(1)} mph`,
      target: `${context.targets.speed.toFixed(1)} mph`,
      delta: signed(context.deltas.speed, "mph"),
      score: scoreFromDelta(Math.abs(context.deltas.speed), context.radii.speedOkay),
      tone: context.speedTone,
    },
    {
      key: "spin",
      label: "Spin",
      value: `${Math.round(context.means.spin).toLocaleString()} rpm`,
      target: `${Math.round(context.targets.spin).toLocaleString()} rpm`,
      delta: signed(context.deltas.spin, "rpm", 0),
      score: scoreFromDelta(Math.abs(context.deltas.spin), context.radii.spinOkay),
      tone: context.spinTone,
    },
  ];
}

function buildHeadline(context: SwingCueContext) {
  const clubLabel = formatClubLabel(context.club);

  if (!context.shotCount) {
    return `${clubLabel} current session is waiting`;
  }

  if (context.launchState === "neutral" && context.lineState === "neutral") {
    return `${clubLabel} is matching the bullseye`;
  }

  const launch = context.launchState === "neutral" ? "windowed" : context.launchState;
  const line = context.lineState === "neutral" ? "centered" : context.lineState;
  return `${clubLabel} is trending ${launch}-${line}`;
}

function buildSubhead(context: SwingCueContext) {
  if (!context.shotCount) {
    return `Club bullseye centered at ${Math.round(context.targets.carry)} yd carry and ${context.targets.vla.toFixed(1)} ${DEG} launch.`;
  }

  return `${context.shotCount} session shots measured against ${context.ranges.launchBullseye[0].toFixed(1)}-${context.ranges.launchBullseye[1].toFixed(1)} ${DEG} launch.`;
}

function buildTraits(context: SwingCueContext) {
  const traits = [
    context.launchState === "neutral" ? "Launch matched" : `${capitalize(context.launchState)} launch`,
    context.lineState === "neutral" ? "Start centered" : `${capitalize(context.lineState)} start`,
    context.carryState === "neutral" ? "Carry fit" : `${capitalize(context.carryState)} carry`,
  ];

  if (context.spinState !== "neutral") {
    traits.push(`${capitalize(context.spinState)} spin`);
  }

  return traits.slice(0, 4);
}

function buildDnaCode(context: SwingCueContext) {
  const familyCode = {
    driver: "DRV",
    wood: "FYW",
    hybrid: "HYB",
    iron: "IRN",
    wedge: "WDG",
  }[context.family];

  return [
    familyCode,
    codeForBias("LA", context.launchState),
    codeForLine(context.lineState),
    codeForBias("SP", context.spinState),
  ].join(" | ");
}

function getClubFamily(club: string): ClubFamily {
  const normalized = club.toLowerCase();
  if (normalized.includes("driver")) return "driver";
  if (normalized.includes("wood")) return "wood";
  if (normalized.includes("hybrid")) return "hybrid";
  if (["pw", "gw", "sw", "lw"].includes(normalized)) return "wedge";
  return "iron";
}

function biasState(delta: number, goodRadius: number): BiasState {
  if (Math.abs(delta) <= goodRadius) return "neutral";
  return delta < 0 ? "low" : "high";
}

function lineState(delta: number, goodRadius: number): LineState {
  if (Math.abs(delta) <= goodRadius) return "neutral";
  return delta < 0 ? "left" : "right";
}

function toneFromDelta(delta: number, goodRadius: number, okayRadius: number): SwingDnaTone {
  if (delta <= goodRadius) return "good";
  if (delta <= okayRadius) return "watch";
  return "miss";
}

function scoreFromDelta(delta: number, okayRadius: number) {
  return Math.max(0, Math.min(100, Math.round(100 - (delta / Math.max(okayRadius * 1.35, 0.001)) * 100)));
}

function average(values: number[], fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return fallback;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function standardDeviation(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return 0;
  const mean = average(clean);
  const variance = average(clean.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function signed(value: number, suffix: string, digits = 1) {
  const rounded = digits === 0 ? Math.round(value).toString() : value.toFixed(digits);
  return `${value >= 0 ? "+" : ""}${rounded} ${suffix}`;
}

function absFixed(value: number, suffix: string, digits = 1) {
  const magnitude = Math.abs(value);
  const formatted = digits === 0 ? Math.round(magnitude).toString() : magnitude.toFixed(digits);
  return `${formatted} ${suffix}`;
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatClubLabel(club: string) {
  return club.replace(/-/g, " ");
}

function codeForBias(prefix: string, value: BiasState) {
  if (value === "neutral") return `${prefix}0`;
  return `${prefix}${value === "high" ? "+" : "-"}`;
}

function codeForLine(value: LineState) {
  if (value === "neutral") return "ST0";
  return `ST${value === "right" ? "R" : "L"}`;
}
