import { CLUBS, CLUB_TM_STATS, TM_CLUB_NAME_MAP } from "../constants";
import { simulateFlight, rand, degreesToRadians } from "./physics";
import type { Shot, Session, SessionShot, ClubName } from "../types";

// Box-Muller transform — sample from normal distribution
function randn(mean: number, std: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

// ─── SYNTHETIC SHOT GENERATOR — uses real TrackMan distributions ──────────────

export function generateSyntheticShot(club: string = "7-Iron", addNoise = true): Shot {
  const clubKey = club as ClubName;
  const tm_s    = CLUB_TM_STATS[clubKey] ?? CLUB_TM_STATS["7-Iron"];

  // True shot from TrackMan distribution
  const speed = Math.max(50, randn(tm_s.speed[0], tm_s.speed[1]));
  const vla   = Math.max(1,  randn(tm_s.vla[0],   tm_s.vla[1]));
  const hla   = randn(tm_s.hla[0], tm_s.hla[1]);
  const spin  = Math.max(500, randn(tm_s.spin[0],  tm_s.spin[1]));

  // Carry: no carry column in TM data — estimate with loft-adjusted factor
  const carryFactor = 1.55 + (vla / 40) * 0.35;
  const trueCarry   = speed * carryFactor;

  // ProRange measurement noise — simulates current calibration state
  const noise = addNoise
    ? {
        speed: randn(0, 1.5),        // ±1.5 mph RMS
        vla:   randn(11.5, 1.8),     // systematic +~12° VLA offset (current bug)
        hla:   randn(0, 0.5),
        carry: randn(0, 4),
        spin:  randn(0, 180),
      }
    : { speed:0, vla:0, hla:0, carry:0, spin:0 };

  return {
    id:        Date.now() + Math.random(),
    club,
    timestamp: new Date().toLocaleTimeString(),
    pr: {
      speed: +(speed + noise.speed).toFixed(1),
      vla:   +(vla   + noise.vla  ).toFixed(1),
      hla:   +(hla   + noise.hla  ).toFixed(1),
      carry: +(trueCarry + noise.carry).toFixed(0),
      spin:  +(spin  + noise.spin ).toFixed(0),
    },
    tm: {
      speed: +speed.toFixed(1),
      vla:   +vla.toFixed(1),
      hla:   +hla.toFixed(1),
      carry: +trueCarry.toFixed(0),
      spin:  +spin.toFixed(0),
    },
    trackPts:  Math.floor(rand(10, 16)),
    trajectory: simulateFlight(speed + noise.speed, degreesToRadians(vla + noise.vla), spin + noise.spin),
    trueTraj:   simulateFlight(speed, degreesToRadians(vla), spin),
  };
}

// ─── TRACKMAN CSV IMPORTER ────────────────────────────────────────────────────
// Accepts the pga_precision_10k_v8.csv format directly:
// Club, Ball, Club Speed, ..., Ball Speed, ..., Launch Angle, Launch Direction, Spin Rate, ...

export interface TMImportResult {
  shots:    Shot[];
  skipped:  number;
  clubs:    Record<string, number>;
}

export function importTrackManCSV(text: string, filterClub?: string): TMImportResult {
  const lines   = text.trim().split("\n");
  const rawHdrs = lines[0].split(",").map(h => h.trim());

  // Build column index lookup
  const col: Record<string, number> = {};
  rawHdrs.forEach((h, i) => { col[h] = i; });

  // Required columns
  const required = ["Club", "Ball Speed", "Launch Angle", "Launch Direction", "Spin Rate"];
  const missing   = required.filter(c => col[c] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing TrackMan columns: ${missing.join(", ")}`);
  }

  const shots: Shot[] = [];
  const clubCounts: Record<string, number> = {};
  let skipped = 0;

  lines.slice(1).forEach((line, i) => {
    if (!line.trim()) return;
    const vals = line.split(",");

    const rawClub = vals[col["Club"]]?.trim() ?? "";
    const club    = TM_CLUB_NAME_MAP[rawClub];

    if (!club) { skipped++; return; }
    if (filterClub && club !== filterClub) return;

    const ballSpeed    = parseFloat(vals[col["Ball Speed"]]);
    const launchAngle  = parseFloat(vals[col["Launch Angle"]]);
    const launchDir    = parseFloat(vals[col["Launch Direction"]]);
    const spinRate     = parseFloat(vals[col["Spin Rate"]]);

    if ([ballSpeed, launchAngle, spinRate].some(isNaN)) { skipped++; return; }

    const carryFactor = 1.55 + (launchAngle / 40) * 0.35;
    const carry       = +(ballSpeed * carryFactor).toFixed(0);

    clubCounts[club] = (clubCounts[club] ?? 0) + 1;

    shots.push({
      id:        `tm-${i}`,
      club,
      timestamp: `TM #${i + 1}`,
      source:    "trackman-import",
      pr:        { speed:0, vla:0, hla:0, carry:0, spin:0 }, // no ProRange data yet
      tm: {
        speed: +ballSpeed.toFixed(1),
        vla:   +launchAngle.toFixed(1),
        hla:   +launchDir.toFixed(1),
        carry,
        spin:  +spinRate.toFixed(0),
      },
      trackPts: 0,
    } as unknown as Shot);
  });

  return { shots, skipped, clubs: clubCounts };
}

// ─── CSV EXPORTER ─────────────────────────────────────────────────────────────

export function exportShotsToCSV(shots: Shot[]): void {
  const header = "shot,club,timestamp,pr_speed,pr_vla,pr_hla,pr_carry,pr_spin,tm_speed,tm_vla,tm_hla,tm_carry,tm_spin,track_pts";
  const rows = shots.map((s, i) =>
    [
      i + 1, s.club, s.timestamp,
      s.pr.speed, s.pr.vla, s.pr.hla, s.pr.carry, s.pr.spin,
      s.tm?.speed ?? "", s.tm?.vla ?? "", s.tm?.hla ?? "", s.tm?.carry ?? "", s.tm?.spin ?? "",
      s.trackPts,
    ].join(",")
  );
  downloadCSV([header, ...rows].join("\n"), `prorange-shots-${Date.now()}.csv`);
}

function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv" });
  const a    = Object.assign(document.createElement("a"), {
    href:     URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
}

// ─── SEED DATA — uses real TrackMan 7-iron distribution ───────────────────────

interface SeedDay {
  date: string; version: string; label: string;
  vlaOffset: number; spdBias: number;
}

const SEED_DAYS: SeedDay[] = [
  { date:"2026-02-10", version:"v22.74", label:"Pre-regression baseline",  vlaOffset:12.4, spdBias: 0.8  },
  { date:"2026-02-12", version:"v22.77", label:"Broke speed calc",         vlaOffset:12.8, spdBias:-15.0 },
  { date:"2026-02-14", version:"v22.79", label:"Reverted to v22.74",       vlaOffset:12.1, spdBias: 0.6  },
  { date:"2026-02-17", version:"v22.86", label:"ROI fix + trajectory pts", vlaOffset:11.9, spdBias: 0.4  },
  { date:"2026-02-20", version:"v22.86", label:"Indoor snow day session",  vlaOffset:12.3, spdBias: 0.3  },
];

export function makeSeedSessions(): Session[] {
  const tm7 = CLUB_TM_STATS["7-Iron"];

  return SEED_DAYS.map((day, di) => {
    const shots: SessionShot[] = Array.from(
      { length: 12 + Math.floor(Math.random() * 8) },
      (_, i) => {
        // Draw from real 7-iron TrackMan distribution
        const tmSpeed = Math.max(60, randn(tm7.speed[0], tm7.speed[1]));
        const tmVla   = Math.max(10, randn(tm7.vla[0],   tm7.vla[1]));
        const tmHla   = randn(0, 1.5);
        const tmSpin  = Math.max(3000, randn(tm7.spin[0], tm7.spin[1]));
        const carryF  = 1.55 + (tmVla / 40) * 0.35;
        const tmCarry = tmSpeed * carryF;

        return {
          id:      `${di}-${i}`,
          shotNum: i + 1,
          pr: {
            speed: +(tmSpeed + day.spdBias + randn(0, 1.2)).toFixed(1),
            vla:   +(tmVla + day.vlaOffset + randn(0, 1.5)).toFixed(1),
            hla:   +(tmHla + randn(0, 0.4)).toFixed(1),
            carry: +(tmCarry + randn(0, 5)).toFixed(0),
            spin:  +(tmSpin  + randn(0, 200)).toFixed(0),
          },
          tm: {
            speed: +tmSpeed.toFixed(1),
            vla:   +tmVla.toFixed(1),
            hla:   +tmHla.toFixed(1),
            carry: +tmCarry.toFixed(0),
            spin:  +tmSpin.toFixed(0),
          },
          trackPts: 10 + Math.floor(Math.random() * 6),
        };
      }
    );

    return {
      id:        `session-${di}`,
      date:      day.date,
      version:   day.version,
      label:     day.label,
      club:      "7-Iron",
      shots,
      createdAt: new Date(day.date + "T10:00:00").getTime(),
    };
  });
}
