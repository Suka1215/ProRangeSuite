import type { TrajectoryPoint } from "../types";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const GRAVITY   = 9.81;   // m/s²
const AIR_RHO   = 1.225;  // kg/m³
const BALL_MASS = 0.04593;// kg
const BALL_RAD  = 0.02135;// m
const BALL_AREA = Math.PI * BALL_RAD * BALL_RAD;
const CD        = 0.23;   // drag coefficient
const CL        = 0.15;   // lift coefficient
const DT        = 0.05;   // time step (s)

// ─── FLIGHT SIMULATION ────────────────────────────────────────────────────────

/**
 * Simulates ball flight physics using drag + Magnus effect.
 * Returns trajectory points in yards (x) and feet (y).
 */
export function simulateFlight(
  speedMph: number,
  vlaRad: number,
  spinRpm: number,
  steps = 120
): TrajectoryPoint[] {
  const vms    = speedMph * 0.44704;
  const omega  = (spinRpm * 2 * Math.PI) / 60;
  let vx       = vms * Math.cos(vlaRad);
  let vy       = vms * Math.sin(vlaRad);
  let x        = 0;
  let y        = 0;
  const pts: TrajectoryPoint[] = [{ x: 0, y: 0 }];

  for (let i = 0; i < steps; i++) {
    const v    = Math.sqrt(vx * vx + vy * vy);
    const drag = 0.5 * AIR_RHO * v * v * CD * BALL_AREA;
    const lift = 0.5 * AIR_RHO * v * omega * CL * BALL_AREA * BALL_RAD;

    const ax = -(drag * vx / v) / BALL_MASS;
    const ay = (lift - drag * vy / v) / BALL_MASS - GRAVITY;

    vx += ax * DT;
    vy += ay * DT;
    x  += vx * DT;
    y  += vy * DT;

    pts.push({
      x: x * 1.09361,  // metres → yards
      y: y * 3.28084,  // metres → feet
    });

    if (y < -0.1 && i > 5) break;
  }

  return pts;
}

// ─── ANGLE HELPERS ────────────────────────────────────────────────────────────

export function degreesToRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radiansToDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ─── RANDOM HELPERS ───────────────────────────────────────────────────────────

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
