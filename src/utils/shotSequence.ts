const MPS_TO_MPH = 2.2369362920544;
const MPH_TO_MPS = 0.44704;
const M_TO_YD = 1.09361;
const M_TO_FT = 3.28084;
const GRAVITY = 9.81;
const AIR_RHO = 1.225;
const BALL_MASS = 0.04593;
const BALL_RADIUS_M = 0.02134;
const BALL_AREA = Math.PI * BALL_RADIUS_M * BALL_RADIUS_M;
const CL_EST = 0.15;
const CAMERA_TILT_RAD = (2.0 * Math.PI) / 180.0;
const BALL_DIAMETER_M = 0.04267;
const GOLF_BALL_RADIUS_M = BALL_DIAMETER_M / 2.0;

const FRAME_KEYS = ["frame", "index", "idx"];
const TIME_KEYS = ["tms", "time_ms", "timems", "timestamp", "time", "ms"];
const X_KEYS = ["_px", "px", "x", "ballx"];
const Y_KEYS = ["_py", "py", "y", "bally"];
const LATERAL_KEYS = ["lateral", "z", "side", "lateralpx"];
const CONF_KEYS = ["conf", "confidence", "score"];
const IS_REAL_KEYS = ["isreal", "real"];
const DIST_FIT_KEYS = ["dfitm", "_dfitm", "_dfit", "dfit", "distancefitm", "d_fit"];
const DIST_RAW_KEYS = ["drawm", "_drawm", "_draw", "draw", "distancem", "d_raw", "distancerawm"];
const RADIUS_KEYS = ["_r", "r", "radius", "ballradius", "rad"];
const BOX_WIDTH_KEYS = ["bboxwidth", "boxwidth", "boxw", "w", "width"];
const BOX_HEIGHT_KEYS = ["bboxheight", "boxheight", "boxh", "h", "height"];
const FRAME_WIDTH_KEYS = ["framewidth", "imagewidth", "imgwidth", "imgw", "sourcewidth", "sensorwidth"];
const FRAME_HEIGHT_KEYS = ["frameheight", "imageheight", "imgheight", "imgh", "sourceheight", "sensorheight"];

export interface SequencePoint {
  frame: number;
  tMs?: number;
  x: number;
  y: number;
  lateral?: number;
  conf?: number;
  isReal?: boolean;
  dFitM?: number;
  dRawM?: number;
  radiusPx?: number;
  boxWidthPx?: number;
  boxHeightPx?: number;
  frameWidthPx?: number;
  frameHeightPx?: number;
}

interface NormalizedPoint {
  t: number;
  xPx: number;
  yPx: number;
  lateralPx?: number;
  conf?: number;
  isReal?: boolean;
  dFitM?: number;
  dRawM?: number;
  radiusPx?: number;
  frameWidthPx?: number;
  frameHeightPx?: number;
}

interface DepthModel {
  dRaw: number[];
  dFit: number[];
  fitDepthSpeed: number;
  fitD0: number;
  fitValid: boolean;
  focalPixels: number | null;
  cx: number | null;
  cy: number | null;
  depthSource: "provided" | "radius" | "pixels";
}

interface WorldPoint {
  t: number;
  x: number;
  y: number;
  z: number;
  isReal: boolean;
}

interface SpeedEstimate {
  speed3d: number;
  depthSpeed: number;
  vertSpeed: number;
  latSpeed: number;
  dt: number;
  label: string;
  priority: number;
}

interface CarryResult {
  carryYards: number;
  totalYards: number;
  apexYards: number;
  landingAngleDeg: number;
  hangTime: number;
  trajectory: FlightPoint[];
}

export interface FlightPoint {
  x: number;
  y: number;
}

export interface AnalyzeSequenceOptions {
  fps: number;
  pixelsPerMeter: number;
  useOnlyReal: boolean;
  useDistanceForX: boolean;
}

export interface SequenceMetrics {
  speed: number;
  vla: number;
  hla: number;
  spin: number;
  carry: number;
  apex: number;
  observedApex: number;
  flightTime: number;
  fitError: number;
  pointsUsed: number;
  spinMode: "lift-fit" | "fallback";
  observedFlight: FlightPoint[];
  fittedFlight: FlightPoint[];
  projectedFlight: FlightPoint[];
}

interface LinearFit {
  slope: number;
  intercept: number;
  rmse: number;
}

interface QuadraticFit {
  a: number;
  b: number;
  c: number;
  rmse: number;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(v)) return true;
    if (["0", "false", "no", "n"].includes(v)) return false;
  }
  return undefined;
}

function lowerCaseRecord(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(rec).forEach(([k, v]) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

function getNumber(rec: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = toNumber(rec[key]);
    if (v != null) return v;
  }
  return null;
}

function getBoolean(rec: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const v = toBoolean(rec[key]);
    if (v !== undefined) return v;
  }
  return undefined;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      cells.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  cells.push(cur);
  return cells;
}

function detectDelimiter(header: string): string {
  const candidates = [",", "\t", ";"];
  let best = ",";
  let bestCount = 0;
  candidates.forEach((candidate) => {
    const count = splitDelimitedLine(header, candidate).length;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  });
  return best;
}

function coercePoint(raw: unknown, fallbackFrame: number): SequencePoint | null {
  const rec = toRecord(raw);
  if (!rec) return null;
  const lc = lowerCaseRecord(rec);

  const x = getNumber(lc, X_KEYS);
  const y = getNumber(lc, Y_KEYS);
  if (x == null || y == null) return null;

  const frame = getNumber(lc, FRAME_KEYS) ?? fallbackFrame;
  const tMs = getNumber(lc, TIME_KEYS) ?? undefined;
  const rawBoxWidth = getNumber(lc, BOX_WIDTH_KEYS);
  const rawBoxHeight = getNumber(lc, BOX_HEIGHT_KEYS);
  const boxWidthPx = rawBoxWidth != null && rawBoxWidth > 0 && rawBoxWidth <= 500 ? rawBoxWidth : undefined;
  const boxHeightPx = rawBoxHeight != null && rawBoxHeight > 0 && rawBoxHeight <= 500 ? rawBoxHeight : undefined;
  const radiusParsed = getNumber(lc, RADIUS_KEYS);
  const radiusRaw = radiusParsed != null && radiusParsed > 0 && radiusParsed <= 300 ? radiusParsed : null;
  const radiusFromBox = boxWidthPx != null && boxHeightPx != null
    ? (Math.max(0, (boxWidthPx + boxHeightPx) * 0.25))
    : undefined;

  return {
    frame: Math.round(frame),
    tMs,
    x,
    y,
    lateral: getNumber(lc, LATERAL_KEYS) ?? undefined,
    conf: getNumber(lc, CONF_KEYS) ?? undefined,
    isReal: getBoolean(lc, IS_REAL_KEYS),
    dFitM: getNumber(lc, DIST_FIT_KEYS) ?? undefined,
    dRawM: getNumber(lc, DIST_RAW_KEYS) ?? undefined,
    radiusPx: radiusRaw ?? radiusFromBox,
    boxWidthPx,
    boxHeightPx,
    frameWidthPx: getNumber(lc, FRAME_WIDTH_KEYS) ?? undefined,
    frameHeightPx: getNumber(lc, FRAME_HEIGHT_KEYS) ?? undefined,
  };
}

function extractJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = toRecord(value);
  if (!rec) return [];

  const directKeys = ["TrackPoints", "trackPoints", "trackpoints", "points", "frames", "trajectory"];
  for (const key of directKeys) {
    const candidate = rec[key];
    if (Array.isArray(candidate)) return candidate;
  }

  const shot = toRecord(rec.shot);
  if (shot) {
    for (const key of directKeys) {
      const candidate = shot[key];
      if (Array.isArray(candidate)) return candidate;
    }
  }

  return [];
}

function parseCsv(raw: string): SequencePoint[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());

  return lines
    .slice(1)
    .map((line, idx) => {
      const cells = splitDelimitedLine(line, delimiter);
      const rec: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        rec[h] = (cells[i] ?? "").trim();
      });
      return coercePoint(rec, idx);
    })
    .filter((p): p is SequencePoint => p !== null);
}

export function parseSequenceInput(raw: string): SequencePoint[] {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Input is empty.");

  const startsJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!startsJson) {
    const csvPoints = parseCsv(raw);
    if (!csvPoints.length) {
      throw new Error("Unable to parse input. Provide JSON or CSV with frame/x/y fields.");
    }
    return csvPoints;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Invalid JSON.");
  }

  const arr = extractJsonArray(parsed);
  if (!arr.length) throw new Error("No frame array found. Expected TrackPoints/points/frames/trajectory.");

  const points = arr
    .map((row, idx) => coercePoint(row, idx))
    .filter((p): p is SequencePoint => p !== null);

  if (!points.length) throw new Error("No valid points found. Expected x/y coordinates per frame.");
  return points;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) * 0.5 : sorted[mid];
}

function normalizePoints(points: SequencePoint[], options: AnalyzeSequenceOptions): NormalizedPoint[] {
  const filtered = options.useOnlyReal
    ? points.filter((p) => p.isReal !== false)
    : points;

  if (filtered.length < 5) {
    throw new Error("Need at least 5 points after filtering.");
  }

  const timed = filtered.map((p) => {
    const ms = p.tMs ?? (p.frame * 1000) / options.fps;
    return { ...p, _ms: ms };
  });
  timed.sort((a, b) => a._ms - b._ms);

  const t0 = timed[0]._ms;
  const normalized: NormalizedPoint[] = [];
  let lastT = -Infinity;

  timed.forEach((p) => {
    const t = (p._ms - t0) / 1000;
    if (!Number.isFinite(t) || t <= lastT) return;

    normalized.push({
      t,
      xPx: p.x,
      yPx: p.y,
      lateralPx: p.lateral,
      conf: p.conf,
      isReal: p.isReal,
      dFitM: p.dFitM,
      dRawM: p.dRawM,
      radiusPx: p.radiusPx,
      frameWidthPx: p.frameWidthPx,
      frameHeightPx: p.frameHeightPx,
    });
    lastT = t;
  });

  if (normalized.length < 5) {
    throw new Error("Need at least 5 unique timestamps after normalization.");
  }

  return normalized;
}

function fitLinear(xs: number[], ys: number[]): LinearFit {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXX = xs.reduce((a, b) => a + b * b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const denom = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-10) {
    throw new Error("Linear fit failed (degenerate data).");
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const rmse = Math.sqrt(xs.reduce((acc, x, i) => {
    const err = ys[i] - (slope * x + intercept);
    return acc + err * err;
  }, 0) / n);

  return { slope, intercept, rmse };
}

function solve3x3(a: number[][], b: number[]): [number, number, number] {
  const m = a.map((row, i) => [...row, b[i]]);
  const n = 3;

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(m[pivot][col]) < 1e-12) {
      throw new Error("Quadratic fit failed (singular matrix).");
    }
    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot], m[col]];
    }

    const div = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let c = col; c <= n; c++) {
        m[row][c] -= factor * m[col][c];
      }
    }
  }

  return [m[0][n], m[1][n], m[2][n]];
}

function fitQuadratic(ts: number[], ys: number[]): QuadraticFit {
  const n = ts.length;
  const st = ts.reduce((a, b) => a + b, 0);
  const st2 = ts.reduce((a, b) => a + b * b, 0);
  const st3 = ts.reduce((a, b) => a + b * b * b, 0);
  const st4 = ts.reduce((a, b) => a + b * b * b * b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sty = ts.reduce((a, t, i) => a + t * ys[i], 0);
  const st2y = ts.reduce((a, t, i) => a + t * t * ys[i], 0);

  const [a, b, c] = solve3x3(
    [
      [n, st, st2],
      [st, st2, st3],
      [st2, st3, st4],
    ],
    [sy, sty, st2y]
  );

  const rmse = Math.sqrt(ts.reduce((acc, t, i) => {
    const pred = a + b * t + c * t * t;
    const err = ys[i] - pred;
    return acc + err * err;
  }, 0) / n);

  return { a, b, c, rmse };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function buildDepthModel(points: NormalizedPoint[], options: AnalyzeSequenceOptions): DepthModel {
  const dProvided = points.map((p) => p.dFitM ?? p.dRawM).filter((v): v is number => v != null && Number.isFinite(v));
  const hasProvidedDepth = options.useDistanceForX && dProvided.length >= 2;

  const widths = points.map((p) => p.frameWidthPx).filter((v): v is number => v != null && Number.isFinite(v) && v > 32);
  const heights = points.map((p) => p.frameHeightPx).filter((v): v is number => v != null && Number.isFinite(v) && v > 32);
  const frameW = widths.length ? median(widths) : null;
  const frameH = heights.length ? median(heights) : null;

  const dRaw = new Array(points.length).fill(0);
  const dFit = new Array(points.length).fill(0);

  if (hasProvidedDepth) {
    const ts: number[] = [];
    const ds: number[] = [];
    points.forEach((p, i) => {
      const d = p.dFitM ?? p.dRawM;
      if (d != null && Number.isFinite(d)) {
        ts.push(p.t);
        ds.push(d);
        dRaw[i] = p.dRawM ?? d;
      }
    });

    const reg = fitLinear(ts, ds);
    const fitDepthSpeed = reg.slope;
    const fitD0 = reg.intercept;
    points.forEach((p, i) => {
      const direct = p.dFitM ?? p.dRawM;
      dFit[i] = direct != null ? direct : Math.max(0.2, fitD0 + fitDepthSpeed * p.t);
      if (!dRaw[i]) dRaw[i] = p.dRawM ?? dFit[i];
    });

    let focalPixels: number | null = null;
    if (frameW != null) {
      focalPixels = frameW / (2.0 * Math.tan((37.0 * Math.PI) / 180.0));
    } else {
      focalPixels = Math.max(120, mean(dFit.slice(0, Math.min(dFit.length, 3))) * options.pixelsPerMeter);
    }

    const cx = frameW != null ? frameW * 0.5 : points[0].xPx;
    const cy = frameH != null ? frameH * 0.5 : points[0].yPx;

    return {
      dRaw,
      dFit,
      fitDepthSpeed,
      fitD0,
      fitValid: Number.isFinite(fitDepthSpeed) && Math.abs(fitDepthSpeed) > 0.05,
      focalPixels,
      cx,
      cy,
      depthSource: "provided",
    };
  }

  const radiusIdx = points
    .map((p, idx) => ({ idx, r: p.radiusPx ?? 0 }))
    .filter((r) => Number.isFinite(r.r) && r.r > 1.5);

  const canUseRadius = options.useDistanceForX && radiusIdx.length >= 2;
  if (canUseRadius) {
    const focalPixels = frameW != null
      ? frameW / (2.0 * Math.tan((37.0 * Math.PI) / 180.0))
      : Math.max(120, options.pixelsPerMeter * 1.5);

    const K = GOLF_BALL_RADIUS_M * focalPixels;

    const lock = radiusIdx[0];
    const lockR = Math.max(lock.r, 2.0);
    const lockDepth = K / lockR;

    type RegPoint = { idx: number; t: number; r: number; weight: number; label: string };
    const regPts: RegPoint[] = radiusIdx.map(({ idx, r }, i) => ({
      idx,
      t: Math.max(0, points[idx].t - points[lock.idx].t),
      r,
      weight: r * r,
      label: i === 0 ? "lock" : `pt[${i - 1}]`,
    }));

    let kfDepth = lockDepth;
    let kfVel = 0.0;
    let kfP00 = 0.01;
    let kfP01 = 0.0;
    let kfP10 = 0.0;
    let kfP11 = 100.0;
    const qDepth = 0.01;
    const qVel = 2.0;
    let kalmanDepthSpeed = 0.0;
    let kalmanValid = false;
    let lastKfTime = 0.0;
    let kalmanSkippedPt0 = false;

    for (const rp of regPts) {
      const dRawPt = K / Math.max(rp.r, 2.0);
      const dt = rp.t - lastKfTime;

      if (rp.label === "lock") {
        kfDepth = dRawPt;
        lastKfTime = rp.t;
        continue;
      }

      if (!kalmanSkippedPt0 && rp.r >= lockR * 0.8) {
        kalmanSkippedPt0 = true;
        continue;
      }
      kalmanSkippedPt0 = true;
      if (dt <= 0.001) continue;

      const predDepth = kfDepth + kfVel * dt;
      const predVel = kfVel;
      const p00 = kfP00 + 2 * dt * kfP01 + dt * dt * kfP11 + qDepth * dt;
      const p01 = kfP01 + dt * kfP11;
      const p10 = p01;
      const p11 = kfP11 + qVel * dt;

      const sigmaR = 0.7;
      const rVal = Math.max(rp.r, 2.0);
      const dKdr = K / (rVal * rVal);
      const R = dKdr * dKdr * sigmaR * sigmaR;

      const innovation = dRawPt - predDepth;
      const S = p00 + R;
      const gate = 3.0 * Math.sqrt(Math.max(S, 1e-8));

      if (Math.abs(innovation) > gate) {
        kfDepth = predDepth;
        kfVel = predVel;
        kfP00 = p00;
        kfP01 = p01;
        kfP10 = p10;
        kfP11 = p11;
        lastKfTime = rp.t;
        continue;
      }

      const K0 = p00 / S;
      const K1 = p10 / S;

      kfDepth = predDepth + K0 * innovation;
      kfVel = predVel + K1 * innovation;

      kfP00 = (1 - K0) * p00;
      kfP01 = (1 - K0) * p01;
      kfP10 = p10 - K1 * p00;
      kfP11 = p11 - K1 * p01;

      lastKfTime = rp.t;
    }

    kalmanDepthSpeed = kfVel;
    kalmanValid = kfVel > 0.5 && kfVel < 80;

    let regPtsForFit = [...regPts];
    if (regPtsForFit.length >= 3) {
      const firstFlight = regPtsForFit[1];
      if (firstFlight.r >= lockR * 0.8) {
        regPtsForFit.splice(1, 1);
      }
    }

    let sumW = 0;
    let sumWt = 0;
    let sumWd = 0;
    let sumWtt = 0;
    let sumWtd = 0;
    regPtsForFit.forEach((p) => {
      const dRawPt = K / Math.max(p.r, 2.0);
      sumW += p.weight;
      sumWt += p.weight * p.t;
      sumWd += p.weight * dRawPt;
      sumWtt += p.weight * p.t * p.t;
      sumWtd += p.weight * p.t * dRawPt;
    });

    const regDenom = sumW * sumWtt - sumWt * sumWt;
    let fitDepthSpeed = 0.0;
    let fitD0 = lockDepth;
    let fitValid = false;

    if (regPtsForFit.length >= 2 && Math.abs(regDenom) > 1e-12) {
      fitDepthSpeed = (sumW * sumWtd - sumWt * sumWd) / regDenom;
      fitD0 = (sumWd * sumWtt - sumWt * sumWtd) / regDenom;
      fitValid = fitDepthSpeed > 0.5;
    }

    if (!fitValid && regPtsForFit.length >= 2) {
      const lastPt = regPtsForFit[regPtsForFit.length - 1];
      const dLast = K / Math.max(lastPt.r, 2.0);
      const dtTotal = lastPt.t;
      if (dtTotal > 0.005) {
        fitDepthSpeed = (dLast - lockDepth) / dtTotal;
        fitD0 = lockDepth;
        fitValid = fitDepthSpeed > 0.5;
      }
    }

    if (kalmanValid) {
      fitDepthSpeed = kalmanDepthSpeed;
      fitD0 = lockDepth;
      fitValid = true;
    }

    const flightRegPts = regPts.filter((p) => p.label !== "lock");
    const pairDepthSpeeds: number[] = [];

    for (const fp of flightRegPts) {
      const dtPair = fp.t;
      if (dtPair > 0.010) {
        const speed = (K / Math.max(fp.r, 2.0) - lockDepth) / dtPair;
        if (speed > 1.0 && speed < 100) pairDepthSpeeds.push(speed);
      }
    }

    for (let i = 0; i < Math.max(flightRegPts.length - 1, 0); i++) {
      const a = flightRegPts[i];
      const b = flightRegPts[i + 1];
      const dtPair = b.t - a.t;
      if (dtPair <= 0.005) continue;
      const speed = (K / Math.max(b.r, 2.0) - K / Math.max(a.r, 2.0)) / dtPair;
      if (speed > 1.0 && speed < 100) pairDepthSpeeds.push(speed);
    }

    if (pairDepthSpeeds.length >= 3) {
      const medianSpeed = median(pairDepthSpeeds);
      if (medianSpeed > fitDepthSpeed * 1.3) {
        fitDepthSpeed = medianSpeed;
        fitD0 = lockDepth;
        fitValid = true;
      }
    }

    points.forEach((p, i) => {
      const r = p.radiusPx;
      if (r != null && Number.isFinite(r) && r > 1.5) {
        dRaw[i] = K / Math.max(r, 2.0);
      } else {
        dRaw[i] = i > 0 ? dRaw[i - 1] : lockDepth;
      }
      dFit[i] = fitValid ? Math.max(fitD0 + fitDepthSpeed * (p.t - points[lock.idx].t), 0.3) : dRaw[i];
    });

    const cx = frameW != null ? frameW * 0.5 : points[lock.idx].xPx;
    const cy = frameH != null ? frameH * 0.5 : points[lock.idx].yPx;

    return {
      dRaw,
      dFit,
      fitDepthSpeed,
      fitD0,
      fitValid,
      focalPixels,
      cx,
      cy,
      depthSource: "radius",
    };
  }

  const x0 = points[0].xPx;
  const ppm = Math.max(1, options.pixelsPerMeter);
  const ts = points.map((p) => p.t);
  const zs = points.map((p) => (p.xPx - x0) / ppm);
  const reg = fitLinear(ts, zs);
  points.forEach((p, i) => {
    const z = (p.xPx - x0) / ppm;
    dRaw[i] = z;
    dFit[i] = z;
  });

  return {
    dRaw,
    dFit,
    fitDepthSpeed: reg.slope,
    fitD0: reg.intercept,
    fitValid: true,
    focalPixels: null,
    cx: null,
    cy: null,
    depthSource: "pixels",
  };
}

function worldPointsFromDepth(points: NormalizedPoint[], depth: DepthModel, ppm: number): WorldPoint[] {
  const x0 = points[0].xPx;
  const y0 = points[0].yPx;
  const lateral0 = points[0].lateralPx ?? 0;
  const d0 = depth.dFit[0] ?? 0;

  const canProject =
    depth.focalPixels != null &&
    Number.isFinite(depth.focalPixels) &&
    Math.abs(depth.focalPixels) > 1e-6 &&
    depth.cx != null &&
    depth.cy != null &&
    depth.depthSource !== "pixels";

  return points.map((p, i) => {
    const d = depth.dFit[i];
    if (canProject && depth.cx != null && depth.cy != null && depth.focalPixels != null) {
      return {
        t: p.t,
        x: ((p.xPx - depth.cx) * d) / depth.focalPixels,
        y: ((depth.cy - p.yPx) * d) / depth.focalPixels,
        z: d,
        isReal: p.isReal !== false,
      };
    }

    return {
      t: p.t,
      x: ((p.lateralPx ?? lateral0) - lateral0) / ppm,
      y: (y0 - p.yPx) / ppm,
      z: depth.depthSource === "pixels" ? (p.xPx - x0) / ppm : (d - d0),
      isReal: p.isReal !== false,
    };
  });
}

function bestSpeedEstimate(world: WorldPoint[], fitDepthSpeed: number): SpeedEstimate {
  const estimates: SpeedEstimate[] = [];
  if (world.length < 2) {
    return {
      speed3d: 0,
      depthSpeed: 0,
      vertSpeed: 0,
      latSpeed: 0,
      dt: 0,
      label: "insufficient",
      priority: 99,
    };
  }

  const speed3d = (a: WorldPoint, b: WorldPoint, label: string, priority: number): SpeedEstimate | null => {
    const dt = b.t - a.t;
    if (dt <= 0.003) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const s = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
    if (!Number.isFinite(s) || s <= 0.5 || s >= 100) return null;
    return {
      speed3d: s,
      depthSpeed: dz / dt,
      vertSpeed: dy / dt,
      latSpeed: dx / dt,
      dt,
      label,
      priority,
    };
  };

  for (let i = 1; i < world.length; i++) {
    const dtMs = (world[i].t - world[0].t) * 1000;
    const priority = dtMs >= 15 && dtMs <= 80 ? 1 : dtMs > 80 ? 2 : 3;
    const est = speed3d(world[0], world[i], `p0->p${i}`, priority);
    if (est) estimates.push(est);
  }

  for (let i = 0; i < world.length - 1; i++) {
    const est = speed3d(world[i], world[i + 1], `p${i}->p${i + 1}`, 4);
    if (est) estimates.push(est);
  }

  if (Number.isFinite(fitDepthSpeed) && fitDepthSpeed > 0.5 && fitDepthSpeed < 100) {
    estimates.push({
      speed3d: fitDepthSpeed,
      depthSpeed: fitDepthSpeed,
      vertSpeed: 0,
      latSpeed: 0,
      dt: 0,
      label: "regression_fit",
      priority: 5,
    });
  }

  if (!estimates.length) {
    return {
      speed3d: 0,
      depthSpeed: 0,
      vertSpeed: 0,
      latSpeed: 0,
      dt: 0,
      label: "none",
      priority: 99,
    };
  }

  const bestPriority = Math.min(...estimates.map((e) => e.priority));
  let best = estimates
    .filter((e) => e.priority === bestPriority)
    .reduce((acc, cur) => (cur.speed3d > acc.speed3d ? cur : acc));

  const reg = estimates.find((e) => e.label === "regression_fit");
  if (reg && reg.speed3d > best.speed3d * 1.3 && reg.speed3d < 90) {
    best = {
      ...reg,
      label: "regression_fit(floor)",
    };
  }

  return best;
}

function weightedSlope(valuesT: number[], valuesY: number[], weights: number[]): { slope: number; intercept: number } | null {
  if (valuesT.length < 2 || valuesY.length !== valuesT.length || weights.length !== valuesT.length) return null;
  let sw = 0;
  let swt = 0;
  let swy = 0;
  let swtt = 0;
  let swty = 0;

  for (let i = 0; i < valuesT.length; i++) {
    const w = weights[i];
    const t = valuesT[i];
    const y = valuesY[i];
    sw += w;
    swt += w * t;
    swy += w * y;
    swtt += w * t * t;
    swty += w * t * y;
  }

  const denom = sw * swtt - swt * swt;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return null;

  const slope = (sw * swty - swt * swy) / denom;
  const intercept = (swy - slope * swt) / sw;
  return { slope, intercept };
}

function estimateLaunchAngles(
  points: NormalizedPoint[],
  depth: DepthModel,
  depthSpeedMps: number,
  vertSpeedMps: number,
  latSpeedMps: number,
  ppm: number
): { vla: number; hla: number } {
  const fallbackVLA = (Math.atan2(Math.abs(vertSpeedMps), Math.max(Math.abs(depthSpeedMps), 0.1)) * 180) / Math.PI;
  const fallbackHLA = (Math.atan2(latSpeedMps, Math.max(Math.abs(depthSpeedMps), 0.1)) * 180) / Math.PI;

  const early = points.filter((p) => p.t > 0.001 && p.t <= 0.040);
  if (early.length < 2) {
    return { vla: fallbackVLA, hla: fallbackHLA };
  }

  const earlyN = Math.min(early.length, 5);
  const tVals: number[] = [];
  const xVals: number[] = [];
  const yVals: number[] = [];
  const wVals: number[] = [];

  tVals.push(0);
  xVals.push(points[0].xPx);
  yVals.push(points[0].yPx);
  wVals.push(2.0);

  for (let i = 0; i < earlyN; i++) {
    const ep = early[i];
    tVals.push(ep.t);
    xVals.push(ep.xPx);
    yVals.push(ep.yPx);
    wVals.push(1.0 / Math.max(ep.t, 0.004));
  }

  const fitX = weightedSlope(tVals, xVals, wVals);
  const fitY = weightedSlope(tVals, yVals, wVals);
  if (!fitX || !fitY) {
    return { vla: fallbackVLA, hla: fallbackHLA };
  }

  const avgEarlyT = mean(early.slice(0, earlyN).map((p) => p.t));
  const earlyDepth = depth.fitValid ? Math.max(depth.fitD0 + depth.fitDepthSpeed * avgEarlyT, 0.5) : Math.max(depth.dFit[0], 0.5);

  let earlyVxPhys = fitX.slope / ppm;
  let earlyVyPhys = -fitY.slope / ppm;

  if (depth.focalPixels != null && depth.depthSource !== "pixels") {
    earlyVxPhys = (fitX.slope * earlyDepth) / depth.focalPixels;
    earlyVyPhys = (-fitY.slope * earlyDepth) / depth.focalPixels;
  }

  const earlyVertWorld = earlyVyPhys * Math.cos(CAMERA_TILT_RAD) + depthSpeedMps * Math.sin(CAMERA_TILT_RAD);
  const earlyDepthWorld = depthSpeedMps * Math.cos(CAMERA_TILT_RAD) - earlyVyPhys * Math.sin(CAMERA_TILT_RAD);

  const vla = (Math.atan2(Math.abs(earlyVertWorld), Math.max(Math.abs(earlyDepthWorld), 0.1)) * 180) / Math.PI;
  const hla = (Math.atan2(earlyVxPhys, Math.max(Math.abs(earlyDepthWorld), 0.1)) * 180) / Math.PI;

  if (vla > 0 && vla < 50) {
    return { vla, hla };
  }
  return { vla: fallbackVLA, hla: fallbackHLA };
}

function estimateSpin(speedMph: number, vla: number, ay: number): { spin: number; mode: "lift-fit" | "fallback" } {
  const fallback = clamp(
    2200 + Math.max(0, vla - 10) * 260 + Math.max(0, 110 - speedMph) * 35,
    1000,
    12000
  );

  const speedMps = Math.max(5, speedMph / MPS_TO_MPH);
  const liftAcc = Math.max(0, ay + GRAVITY);
  const omega = (liftAcc * BALL_MASS) / (0.5 * AIR_RHO * speedMps * CL_EST * BALL_AREA * BALL_RADIUS_M);
  const fromLift = omega * (60 / (2 * Math.PI));

  if (!Number.isFinite(fromLift) || liftAcc < 0.3) {
    return { spin: fallback, mode: "fallback" };
  }

  const blended = clamp(fromLift * 0.7 + fallback * 0.3, 1000, 12000);
  return { spin: blended, mode: "lift-fit" };
}

function simulateCarry(ballSpeedMPH: number, launchAngleDeg: number, spinRPM: number, hlaDeg = 0): CarryResult {
  const v0 = ballSpeedMPH * MPH_TO_MPS;
  const theta = (launchAngleDeg * Math.PI) / 180;
  const phi = (hlaDeg * Math.PI) / 180;
  const omegaRad = (spinRPM * 2 * Math.PI) / 60;
  let rOmega = omegaRad * BALL_RADIUS_M;

  let vx = v0 * Math.cos(theta) * Math.cos(phi);
  let vy = v0 * Math.sin(theta);
  let vz = v0 * Math.cos(theta) * Math.sin(phi);
  let x = 0;
  let y = 0;
  let z = 0;
  const dt = 0.001;
  let apex = 0;
  let landAngle = 30;
  let hangTime = 0;

  const trajectory: FlightPoint[] = [{ x: 0, y: 0 }];

  for (let i = 0; i < 30000; i++) {
    const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (v <= 0.5) break;

    const S = rOmega / Math.max(v, 0.01);
    const Cd = 0.25 + 0.18 * S + 0.10 * S * S;
    const Cl = Math.min(0.38, 2.2 * S);

    const q = 0.5 * AIR_RHO * v * v;
    const dragAccel = (Cd * q * BALL_AREA) / BALL_MASS;
    const liftAccel = (Cl * q * BALL_AREA) / BALL_MASS;

    let ax = (-dragAccel * vx) / v;
    let ay = (-dragAccel * vy) / v - GRAVITY;
    let az = (-dragAccel * vz) / v;

    const vH = Math.sqrt(vx * vx + vz * vz);
    if (v > 0.5 && vH > 0.1) {
      ax += (liftAccel * (-vy * vx)) / (v * v);
      ay += (liftAccel * vH) / v;
      az += (liftAccel * (-vy * vz)) / (v * v);
    }

    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    apex = Math.max(apex, y);
    hangTime += dt;

    if (i % 20 === 0) {
      trajectory.push({
        x: Math.sqrt(x * x + z * z) * M_TO_YD,
        y: Math.max(0, y) * M_TO_FT,
      });
    }

    const tau = 1.0 / Math.max((0.00002 * v) / BALL_RADIUS_M, 0.001);
    rOmega *= Math.exp(-dt / tau);

    if (y < 0 && i > 50) {
      const vHland = Math.sqrt(vx * vx + vz * vz);
      landAngle = (Math.atan2(-vy, Math.max(vHland, 0.1)) * 180) / Math.PI;
      break;
    }
  }

  const carryM = Math.sqrt(x * x + z * z);
  const carryYd = carryM * M_TO_YD;
  const apexYd = apex * M_TO_YD;

  let rollPct = 0.18;
  if (landAngle > 50) rollPct = 0.02;
  else if (landAngle > 45) rollPct = 0.04;
  else if (landAngle > 40) rollPct = 0.06;
  else if (landAngle > 35) rollPct = 0.08;
  else if (landAngle > 25) rollPct = 0.12;

  trajectory.push({ x: carryYd, y: 0 });

  return {
    carryYards: carryYd,
    totalYards: carryYd * (1 + rollPct),
    apexYards: apexYd,
    landingAngleDeg: landAngle,
    hangTime,
    trajectory,
  };
}

export function analyzeSequence(points: SequencePoint[], options: AnalyzeSequenceOptions): SequenceMetrics {
  const normalized = normalizePoints(points, options);
  const ppm = Math.max(1, options.pixelsPerMeter);

  const depth = buildDepthModel(normalized, options);
  const world = worldPointsFromDepth(normalized, depth, ppm);

  const best = bestSpeedEstimate(world, depth.fitDepthSpeed);
  if (!Number.isFinite(best.speed3d) || best.speed3d <= 0) {
    throw new Error("Could not estimate speed from sequence.");
  }

  const vertWorld = best.vertSpeed * Math.cos(CAMERA_TILT_RAD) + best.depthSpeed * Math.sin(CAMERA_TILT_RAD);
  const depthWorld = best.depthSpeed * Math.cos(CAMERA_TILT_RAD) - best.vertSpeed * Math.sin(CAMERA_TILT_RAD);
  const latWorld = best.latSpeed;

  const speedWorld = Math.sqrt(vertWorld * vertWorld + depthWorld * depthWorld + latWorld * latWorld);
  const speedMph = speedWorld * MPS_TO_MPH;

  const launch = estimateLaunchAngles(normalized, depth, depthWorld, vertWorld, latWorld, ppm);

  const yRel = world.map((p) => p.y - world[0].y);
  const tVals = world.map((p) => p.t);

  let ay = 0;
  try {
    const fitY = fitQuadratic(tVals, yRel);
    ay = 2 * fitY.c;
  } catch {
    ay = -GRAVITY;
  }

  const spinEstimate = estimateSpin(speedMph, launch.vla, ay);
  const carrySim = simulateCarry(speedMph, launch.vla, spinEstimate.spin, launch.hla);

  const horizontal = world.map((p) => {
    const dx = p.x - world[0].x;
    const dz = p.z - world[0].z;
    return Math.sqrt(dx * dx + dz * dz);
  });

  let xFit: LinearFit;
  let yFit: QuadraticFit;
  try {
    xFit = fitLinear(tVals, horizontal);
    yFit = fitQuadratic(tVals, yRel);
  } catch {
    xFit = { slope: 0, intercept: 0, rmse: 0 };
    yFit = { a: 0, b: 0, c: 0, rmse: 0 };
  }

  const observedFlight: FlightPoint[] = horizontal.map((x, i) => ({
    x: x * M_TO_YD,
    y: Math.max(0, yRel[i]) * M_TO_FT,
  }));

  const fittedFlight: FlightPoint[] = tVals.map((t) => {
    const xf = xFit.intercept + xFit.slope * t;
    const yf = yFit.a + yFit.b * t + yFit.c * t * t;
    return {
      x: Math.max(0, xf) * M_TO_YD,
      y: Math.max(0, yf) * M_TO_FT,
    };
  });

  const observedApex = observedFlight.length ? Math.max(...observedFlight.map((p) => p.y)) : 0;

  return {
    speed: +speedMph.toFixed(1),
    vla: +launch.vla.toFixed(2),
    hla: +launch.hla.toFixed(2),
    spin: +spinEstimate.spin.toFixed(0),
    carry: +carrySim.carryYards.toFixed(1),
    apex: +(carrySim.apexYards * 3).toFixed(1),
    observedApex: +observedApex.toFixed(1),
    flightTime: +carrySim.hangTime.toFixed(2),
    fitError: +Math.sqrt(xFit.rmse * xFit.rmse + yFit.rmse * yFit.rmse).toFixed(3),
    pointsUsed: normalized.length,
    spinMode: spinEstimate.mode,
    observedFlight,
    fittedFlight,
    projectedFlight: carrySim.trajectory,
  };
}

export function estimateApexFromMetrics(speedMph: number, vla: number, spinRpm: number): number {
  const sim = simulateCarry(speedMph, vla, spinRpm, 0);
  return +(sim.apexYards * 3).toFixed(1);
}
