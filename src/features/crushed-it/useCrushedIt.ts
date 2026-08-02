import { useCallback, useState } from "react";
import type { Shot } from "../../types";
import type { CrushedItData } from "./CrushedItPopup";

const SPEED_THRESHOLD_MPH = 160;
const DEFAULT_CLUB_SPEED_MPH = 90;

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildCrushedItData(shot: Shot, history: Shot[]): CrushedItData {
  const clubHistory = history.filter((historyShot) => historyShot.club === shot.club);
  const speed = finiteNumber(shot.pr?.speed);
  const carry = finiteNumber(shot.pr?.carry);
  const total = finiteNumber(shot.pr?.total ?? shot.tm?.total, carry);
  const avgSpeedMph = average(clubHistory.map((historyShot) => finiteNumber(historyShot.pr?.speed, Number.NaN)).filter(Number.isFinite));
  const clubSpeed = finiteNumber(shot.pr?.clubSpeed ?? shot.tm?.clubSpeed, DEFAULT_CLUB_SPEED_MPH);
  const smashFactor = finiteNumber(shot.pr?.smashFactor ?? shot.tm?.smashFactor, speed / Math.max(clubSpeed, 1));

  return {
    ballSpeedMph: speed,
    carryYards: carry,
    totalYards: total,
    smashFactor,
    club: shot.club,
    avgSpeedMph: avgSpeedMph ?? undefined,
  };
}

export function useCrushedIt() {
  const [shotData, setShotData] = useState<CrushedItData | null>(null);

  const triggerIfCrushed = useCallback((shot: Shot, history: Shot[] = []) => {
    if (finiteNumber(shot.pr?.speed) > SPEED_THRESHOLD_MPH) {
      setShotData(buildCrushedItData(shot, history));
    }
  }, []);

  const dismiss = useCallback(() => setShotData(null), []);

  return { shotData, triggerIfCrushed, dismiss };
}
