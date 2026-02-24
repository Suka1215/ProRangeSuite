/**
 * Client-side TrackMan reference matcher.
 * Loads pga_precision_10k_v8.csv from /public as a flat array,
 * then matches each ProRange shot by SPEED + VLA euclidean distance.
 * Club is intentionally ignored — the 10k dataset covers the full range.
 */

import type { MetricSet } from "../types";

interface TMRow {
  speed: number;
  vla:   number;
  hla:   number;
  spin:  number;
  carry: number;
}

// Singleton flat array — loaded once
let TM_ALL: TMRow[] | null = null;
let loading = false;
const waiters: Array<(rows: TMRow[]) => void> = [];

export async function loadTMIndex(): Promise<TMRow[]> {
  if (TM_ALL) return TM_ALL;
  if (loading) return new Promise(resolve => waiters.push(resolve));

  loading = true;
  console.log("[TM] Loading 10k reference database…");

  try {
    const res   = await fetch("/pga_precision_10k_v8.csv");
    const text  = await res.text();
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim());
    const col: Record<string, number> = {};
    headers.forEach((h, i) => { col[h] = i; });

    const rows: TMRow[] = [];
    for (const line of lines.slice(1)) {
      const v     = line.split(",");
      const speed = parseFloat(v[col["Ball Speed"]]);
      const vla   = parseFloat(v[col["Launch Angle"]]);
      const hla   = parseFloat(v[col["Launch Direction"]]);
      const spin  = parseFloat(v[col["Spin Rate"]]);
      if (isNaN(speed) || isNaN(vla) || isNaN(spin)) continue;
      const carry = +(speed * (1.55 + (Math.max(0, vla) / 45) * 0.35)).toFixed(0);
      rows.push({ speed: +speed.toFixed(1), vla: +vla.toFixed(1), hla: +hla.toFixed(1), spin: +spin.toFixed(0), carry });
    }

    console.log(`[TM] Loaded ${rows.length} shots (matching by speed+VLA)`);
    TM_ALL = rows;
    waiters.forEach(r => r(rows));
    waiters.length = 0;
    return rows;
  } catch (e) {
    console.error("[TM] Failed to load CSV:", e);
    TM_ALL = [];
    waiters.forEach(r => r([]));
    waiters.length = 0;
    return [];
  }
}

/**
 * Find the closest TrackMan shot by Euclidean distance in (speed, VLA) space.
 * Speed weighted at 2mph = 1 unit, VLA at 1° = 1 unit.
 * Club is ignored — the full 10k range covers all clubs.
 */
export function findTMRef(
  prSpeed: number,
  prVla: number,
  rows: TMRow[]
): Partial<MetricSet> | null {
  if (!rows || rows.length === 0) return null;

  let best = rows[0];
  let bestDist = Infinity;

  for (const row of rows) {
    const ds = (row.speed - prSpeed) / 2.0;  // 2 mph per unit
    const dv = (row.vla   - prVla)   / 1.0;  // 1° per unit
    const dist = ds * ds + dv * dv;
    if (dist < bestDist) { bestDist = dist; best = row; }
  }

  return { speed: best.speed, vla: best.vla, hla: best.hla, spin: best.spin, carry: best.carry };
}

// Pre-load when module first imports
loadTMIndex();
