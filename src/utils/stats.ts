import { PASS_THRESHOLD } from "../constants";
import type { MetricKey, Session, SessionStatsResult } from "../types";

// ─── ERROR CALCULATION ────────────────────────────────────────────────────────

export function pctError(pr: number, tm: number): number {
  return ((pr - tm) / tm) * 100;
}

export function isPassing(pr: number, tm: number): boolean {
  return Math.abs(pctError(pr, tm)) <= PASS_THRESHOLD;
}

// ─── SESSION STATISTICS ───────────────────────────────────────────────────────

export function calcSessionStats(session: Session): SessionStatsResult {
  const result: SessionStatsResult = {};

  const metrics: MetricKey[] = ["speed", "vla", "hla", "carry", "spin"];

  metrics.forEach((m) => {
    const errors = session.shots
      .filter((s) => s.tm && s.tm[m] != null)
      .map((s) => pctError(s.pr[m], s.tm![m] as number));

    if (!errors.length) {
      result[m] = null;
      return;
    }

    const mean     = errors.reduce((a, b) => a + b, 0) / errors.length;
    const variance = errors.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / errors.length;
    const std      = Math.sqrt(variance);
    const passRate = (errors.filter((e) => Math.abs(e) <= PASS_THRESHOLD).length / errors.length) * 100;

    result[m] = {
      mean:     +mean.toFixed(2),
      std:      +std.toFixed(2),
      passRate: +passRate.toFixed(0),
      n:        errors.length,
    };
  });

  return result;
}

// ─── ARRAY HELPERS ────────────────────────────────────────────────────────────

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.map((v) => (v - m) ** 2).reduce((a, b) => a + b, 0) / values.length);
}
