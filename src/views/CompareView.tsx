import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { METRIC_META, VERSION_COLORS } from "../constants";
import { formatDateShort } from "../utils/dates";
import type { MetricKey, Session, SessionShot } from "../types";

interface Props {
  sessions: Session[];
  selectedIds: string[];
  onToggleSession: (id: string) => void;
}

interface MetricRollup {
  metric: MetricKey;
  mean: number | null;
  absMean: number | null;
  std: number | null;
  passRate: number | null;
  n: number;
}

interface SessionRollup {
  id: string;
  session: Session;
  color: string;
  metrics: Record<MetricKey, MetricRollup>;
  avgPassRate: number | null;
  avgAbsError: number | null;
  bestMetric: MetricRollup | null;
  worstMetric: MetricRollup | null;
}

const METRICS: MetricKey[] = ["carry", "speed", "vla", "hla", "spin"];
const METRIC_TOLERANCE: Record<MetricKey, number> = {
  speed: 0.9,
  vla: 0.17,
  hla: 0.3,
  carry: 1.6,
  spin: 70,
};
const METRIC_DECIMALS: Record<MetricKey, number> = {
  speed: 1,
  vla: 2,
  hla: 2,
  carry: 1,
  spin: 0,
};
const CHART_TREND_WINDOW = 7;
const SPIVOT_COMPARE_COLORS = ["#6ad87c", "#262930", "#92ef9f", "#4c535f", "#b7f7c0", "#171a20", "#7dde8a"];
const SPIVOT_METRIC_COLORS: Record<MetricKey, string> = {
  carry: "#6ad87c",
  speed: "#262930",
  vla: "#58bd68",
  hla: "#343944",
  spin: "#8ced98",
};

export default function CompareView({ sessions, selectedIds, onToggleSession }: Props) {
  const [metric, setMetric] = useState<MetricKey>("carry");
  const [localSelected, setLocalSelected] = useState<string[]>(
    selectedIds.length ? selectedIds : sessions.map((session) => session.id)
  );

  useEffect(() => {
    setLocalSelected((current) => {
      const liveIds = new Set(sessions.map((session) => session.id));
      const kept = current.filter((id) => liveIds.has(id));
      return kept.length ? kept : sessions.map((session) => session.id);
    });
  }, [sessions]);

  const rollups = useMemo(() => buildSessionRollups(sessions), [sessions]);
  const selectedRollups = rollups.filter((rollup) => localSelected.includes(rollup.id));
  const selectedSessions = selectedRollups.map((rollup) => rollup.session);
  const activeMetricRollups = selectedRollups
    .map((rollup) => rollup.metrics[metric])
    .filter((rollup) => rollup.n > 0);
  const chartData = useMemo(() => buildChartData(selectedSessions, metric), [selectedSessions, metric]);
  const metricBoard = useMemo(() => buildMetricBoard(selectedRollups), [selectedRollups]);
  const bestSession = selectedRollups
    .filter((rollup) => rollup.avgPassRate !== null)
    .sort((left, right) => (right.avgPassRate ?? -1) - (left.avgPassRate ?? -1))[0] ?? null;
  const watchMetric = metricBoard
    .filter((item) => item.mean !== null)
    .sort((left, right) => (right.absMean ?? -1) - (left.absMean ?? -1))[0] ?? null;
  const selectedShotCount = selectedSessions.reduce((sum, session) => sum + session.shots.length, 0);
  const totalSamples = metricBoard.reduce((sum, item) => sum + item.n, 0);
  const avgPassRate = average(selectedRollups.map((rollup) => rollup.avgPassRate).filter(isNumber));
  const avgAbsError = average(selectedRollups.map((rollup) => rollup.avgAbsError).filter(isNumber));
  const trendSummary = buildTrendSummary(activeMetricRollups, metric);

  function toggleSession(id: string) {
    setLocalSelected((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
    onToggleSession(id);
  }

  function selectAll() {
    setLocalSelected(sessions.map((session) => session.id));
  }

  if (!sessions.length) {
    return (
      <section className="pr-compare-empty">
        <span>Session Comparison</span>
        <h1>No saved sessions yet</h1>
        <p>Capture or save a session, then this page will compare every measured metric against TrackMan reference data.</p>
      </section>
    );
  }

  return (
    <section className="pr-compare">
      <header className="pr-compare-hero">
        <div className="pr-compare-hero-copy">
          <span>Session comparison</span>
          <h1>Calibration command center</h1>
          <p>
            Compare saved sessions by real TrackMan deltas, pass rates, sample size, and the metric that needs the next fix.
          </p>
          <div className="pr-compare-hero-meta">
            <b>{selectedRollups.length}</b> sessions selected
            <i />
            <b>{selectedShotCount}</b> shots reviewed
            <i />
            <b>{totalSamples}</b> reference samples
          </div>
        </div>

        <div className="pr-compare-hero-cards">
          <HeroStat
            label="Accuracy score"
            value={avgPassRate === null ? "--" : `${avgPassRate.toFixed(0)}%`}
            delta={avgPassRate === null ? "Waiting for TrackMan refs" : "Average metric pass rate"}
            tone={toneFromPassRate(avgPassRate)}
          />
          <HeroStat
            label="Mean drift"
            value={avgAbsError === null ? "--" : formatCompactMetric(avgAbsError)}
            delta="Average absolute tolerance drift"
            tone={avgAbsError === null ? "neutral" : avgAbsError <= 1 ? "good" : "warn"}
          />
          <HeroStat
            label="Best session"
            value={bestSession?.session.version ?? "--"}
            delta={bestSession?.avgPassRate === null || !bestSession ? "No winner yet" : `${bestSession.avgPassRate.toFixed(0)}% pass rate`}
            tone="good"
          />
          <HeroStat
            label="Watch first"
            value={watchMetric ? METRIC_META[watchMetric.metric].label : "--"}
            delta={watchMetric?.mean === null || !watchMetric ? "No drift detected" : formatDelta(watchMetric.metric, watchMetric.mean)}
            tone={watchMetric ? "warn" : "neutral"}
          />
        </div>
      </header>

      <div className="pr-compare-workspace">
        <aside className="pr-compare-panel pr-compare-sessions">
          <div className="pr-compare-panel-head">
            <div>
              <span>All sessions</span>
              <h2>Compare set</h2>
            </div>
            <button type="button" onClick={selectAll}>All</button>
          </div>

          <div className="pr-compare-session-list">
            {rollups.map((rollup) => {
              const selected = localSelected.includes(rollup.id);
              return (
                <button
                  type="button"
                  key={rollup.id}
                  className={`pr-compare-session-card ${selected ? "is-selected" : ""}`}
                  style={{ "--session-color": rollup.color } as React.CSSProperties}
                  onClick={() => toggleSession(rollup.id)}
                >
                  <span className="pr-compare-session-dot" />
                  <strong>{rollup.session.version}</strong>
                  <em>{rollup.session.club || "Mixed clubs"} - {formatDateShort(rollup.session.date)}</em>
                  <b>{rollup.session.shots.length} shots</b>
                  <small>
                    {rollup.avgPassRate === null ? "No reference" : `${rollup.avgPassRate.toFixed(0)}% pass`}
                  </small>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="pr-compare-chart-panel">
          <div className="pr-compare-chart-head">
            <div>
              <span>Shot-by-shot error</span>
              <h2>{METRIC_META[metric].label} delta</h2>
              <p>{trendSummary}</p>
            </div>
            <div className="pr-compare-tabs" aria-label="Comparison metric">
              {METRICS.map((key) => (
                <button
                  type="button"
                  key={key}
                  className={metric === key ? "is-active" : ""}
                  onClick={() => setMetric(key)}
                >
                  {METRIC_META[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className="pr-compare-chart">
            {chartData.some((row) => Object.keys(row).length > 1) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 18, right: 18, left: 2, bottom: 22 }}>
                  <CartesianGrid stroke="rgba(38,41,48,.08)" strokeDasharray="3 6" vertical={false} />
                  <ReferenceArea
                    y1={-METRIC_TOLERANCE[metric]}
                    y2={METRIC_TOLERANCE[metric]}
                    fill="rgba(106,216,124,.11)"
                  />
                  <ReferenceLine y={0} stroke="rgba(38,41,48,.32)" strokeWidth={1.5} />
                  <ReferenceLine
                    y={METRIC_TOLERANCE[metric]}
                    stroke="rgba(106,216,124,.7)"
                    strokeDasharray="4 5"
                  />
                  <ReferenceLine
                    y={-METRIC_TOLERANCE[metric]}
                    stroke="rgba(106,216,124,.7)"
                    strokeDasharray="4 5"
                  />
                  <XAxis
                    dataKey="shot"
                    interval="preserveStartEnd"
                    minTickGap={16}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "rgba(38,41,48,.48)" }}
                    label={{ value: "Shot number", position: "insideBottom", offset: -14, fontSize: 11, fill: "rgba(38,41,48,.48)" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tick={{ fontSize: 11, fill: "rgba(38,41,48,.48)" }}
                    tickFormatter={(value) => formatAxis(metric, Number(value))}
                  />
                  <Tooltip
                    content={<CompareTooltip metric={metric} rollups={selectedRollups} />}
                    cursor={{ stroke: "rgba(38,41,48,.16)", strokeWidth: 1 }}
                  />
                  {selectedRollups.map((rollup) => (
                    <Line
                      key={`${rollup.id}-trend`}
                      type="monotone"
                      dataKey={trendKey(rollup.id)}
                      name={`${rollup.session.version} trend`}
                      stroke={rollup.color}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="pr-compare-no-data">
                <strong>No TrackMan reference samples for {METRIC_META[metric].label}</strong>
                <span>Select another metric or compare sessions with matched reference shots.</span>
              </div>
            )}
          </div>

          <div className="pr-compare-chart-foot">
            {selectedRollups.map((rollup) => {
              const active = rollup.metrics[metric];
              return (
                <div key={rollup.id} className="pr-compare-chart-legend">
                  <i style={{ background: rollup.color }} />
                  <span>{rollup.session.version}</span>
                  <b>{active.mean === null ? "--" : formatDelta(metric, active.mean)}</b>
                </div>
              );
            })}
          </div>
        </main>

        <aside className="pr-compare-panel pr-compare-metric-board">
          <div className="pr-compare-panel-head">
            <div>
              <span>Accuracy by metric</span>
              <h2>Full readout</h2>
            </div>
            <b>{metricBoard.length}</b>
          </div>

          <div className="pr-compare-metric-list">
            {metricBoard.map((item) => (
              <button
                type="button"
                key={item.metric}
                className={`pr-compare-metric-row ${metric === item.metric ? "is-active" : ""}`}
                onClick={() => setMetric(item.metric)}
              >
                <span>
                  <i style={{ background: SPIVOT_METRIC_COLORS[item.metric] }} />
                  {METRIC_META[item.metric].label}
                </span>
                <b>{item.mean === null ? "--" : formatDelta(item.metric, item.mean)}</b>
                <em>{item.passRate === null ? "No refs" : `${item.passRate.toFixed(0)}% pass`}</em>
                <small>
                  <span style={{ width: `${Math.max(4, item.passRate ?? 0)}%` }} />
                </small>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <section className="pr-compare-detail">
        <div className="pr-compare-detail-copy">
          <span>All accurate metrics</span>
          <h2>Session metric matrix</h2>
          <p>Each cell uses native TrackMan deltas with the tolerance window for that metric.</p>
        </div>
        <div className="pr-compare-table-wrap">
          <table className="pr-compare-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Shots</th>
                <th>Score</th>
                {METRICS.map((key) => (
                  <th key={key}>{METRIC_META[key].label}</th>
                ))}
                <th>Needs work</th>
              </tr>
            </thead>
            <tbody>
              {rollups.map((rollup) => (
                <tr key={rollup.id}>
                  <td>
                    <span className="pr-compare-table-session" style={{ "--session-color": rollup.color } as React.CSSProperties}>
                      <i />
                      <b>{rollup.session.version}</b>
                      <em>{formatDateShort(rollup.session.date)}</em>
                    </span>
                  </td>
                  <td>{rollup.session.shots.length}</td>
                  <td>{rollup.avgPassRate === null ? "--" : `${rollup.avgPassRate.toFixed(0)}%`}</td>
                  {METRICS.map((key) => {
                    const value = rollup.metrics[key];
                    return (
                      <td key={key} className={toneClass(value)}>
                        <b>{value.mean === null ? "--" : formatDelta(key, value.mean)}</b>
                        <small>{value.n ? `${value.passRate?.toFixed(0)}% pass - n${value.n}` : "no refs"}</small>
                      </td>
                    );
                  })}
                  <td>{rollup.worstMetric ? METRIC_META[rollup.worstMetric.metric].label : "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function HeroStat({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  return (
    <div className={`pr-compare-hero-stat is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{delta}</em>
    </div>
  );
}

function CompareTooltip({
  active,
  payload,
  label,
  metric,
  rollups,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: number;
  metric: MetricKey;
  rollups: SessionRollup[];
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="pr-compare-tooltip">
      <span>Shot {label}</span>
      {payload.map((item) => {
        const rollup = rollups.find((candidate) => trendKey(candidate.id) === item.dataKey);
        const pass = Math.abs(item.value) <= METRIC_TOLERANCE[metric];
        return (
          <div key={item.dataKey}>
            <i style={{ background: item.color }} />
            <b>{rollup?.session.version ?? item.dataKey}</b>
            <em className={pass ? "is-good" : "is-bad"}>{formatDelta(metric, item.value)}</em>
          </div>
        );
      })}
    </div>
  );
}

function buildSessionRollups(sessions: Session[]): SessionRollup[] {
  return sessions.map((session, index) => {
    const color = SPIVOT_COMPARE_COLORS[index % SPIVOT_COMPARE_COLORS.length] ?? VERSION_COLORS[index % VERSION_COLORS.length];
    const metricEntries = METRICS.map((metric) => [metric, buildMetricRollup(session.shots, metric)] as const);
    const metrics = Object.fromEntries(metricEntries) as Record<MetricKey, MetricRollup>;
    const populated = metricEntries.map(([, rollup]) => rollup).filter((rollup) => rollup.n > 0);
    const avgPassRate = average(populated.map((rollup) => rollup.passRate).filter(isNumber));
    const avgAbsError = average(populated.map((rollup) => normalizeError(rollup.metric, rollup.absMean)).filter(isNumber));
    const sorted = [...populated].sort(
      (left, right) => normalizeError(right.metric, right.absMean) - normalizeError(left.metric, left.absMean)
    );
    const bestMetric = [...populated].sort(
      (left, right) => normalizeError(left.metric, left.absMean) - normalizeError(right.metric, right.absMean)
    )[0] ?? null;

    return {
      id: session.id,
      session,
      color,
      metrics,
      avgPassRate,
      avgAbsError,
      bestMetric,
      worstMetric: sorted[0] ?? null,
    };
  });
}

function buildMetricRollup(shots: SessionShot[], metric: MetricKey): MetricRollup {
  const values = shots.map((shot) => getShotDelta(shot, metric)).filter(isNumber);
  if (!values.length) {
    return { metric, mean: null, absMean: null, std: null, passRate: null, n: 0 };
  }

  const meanValue = mean(values);
  const absMean = mean(values.map((value) => Math.abs(value)));
  const stdValue = stdDev(values);
  const passRate = (values.filter((value) => Math.abs(value) <= METRIC_TOLERANCE[metric]).length / values.length) * 100;

  return {
    metric,
    mean: round(meanValue, METRIC_DECIMALS[metric]),
    absMean: round(absMean, METRIC_DECIMALS[metric]),
    std: round(stdValue, METRIC_DECIMALS[metric]),
    passRate: round(passRate, 0),
    n: values.length,
  };
}

function buildMetricBoard(rollups: SessionRollup[]): MetricRollup[] {
  return METRICS.map((metric) => {
    const values = rollups.flatMap((rollup) =>
      rollup.session.shots.map((shot) => getShotDelta(shot, metric)).filter(isNumber)
    );

    if (!values.length) {
      return { metric, mean: null, absMean: null, std: null, passRate: null, n: 0 };
    }

    const passRate = (values.filter((value) => Math.abs(value) <= METRIC_TOLERANCE[metric]).length / values.length) * 100;
    return {
      metric,
      mean: round(mean(values), METRIC_DECIMALS[metric]),
      absMean: round(mean(values.map((value) => Math.abs(value))), METRIC_DECIMALS[metric]),
      std: round(stdDev(values), METRIC_DECIMALS[metric]),
      passRate: round(passRate, 0),
      n: values.length,
    };
  });
}

function buildChartData(sessions: Session[], metric: MetricKey) {
  const maxShots = Math.max(0, ...sessions.map((session) => session.shots.length));
  const smoothedBySession = new Map(
    sessions.map((session) => {
      const values = Array.from({ length: maxShots }, (_, index) => {
        const shot = session.shots[index];
        return shot ? getShotDelta(shot, metric) : null;
      });
      return [session.id, smoothSeries(values, CHART_TREND_WINDOW)] as const;
    })
  );

  return Array.from({ length: maxShots }, (_, index) => {
    const row: Record<string, number | null> & { shot: number } = { shot: index + 1 };

    for (const session of sessions) {
      const shot = session.shots[index];
      row[session.id] = shot ? getShotDelta(shot, metric) : null;
      row[trendKey(session.id)] = smoothedBySession.get(session.id)?.[index] ?? null;
    }

    return row;
  });
}

function smoothSeries(values: Array<number | null>, windowSize: number) {
  const radius = Math.max(1, Math.floor(windowSize / 2));
  return values.map((value, index) => {
    if (value === null) return null;
    const neighbors = values
      .slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1))
      .filter(isNumber);
    return neighbors.length ? round(mean(neighbors), 2) : null;
  });
}

function trendKey(id: string) {
  return `${id}__trend`;
}

function buildTrendSummary(rollups: MetricRollup[], metric: MetricKey) {
  if (!rollups.length) {
    return `No matched ${METRIC_META[metric].label} samples are available yet.`;
  }

  const combined = average(rollups.map((rollup) => rollup.mean).filter(isNumber));
  const passRate = average(rollups.map((rollup) => rollup.passRate).filter(isNumber));
  const direction = combined === null ? "neutral" : combined > 0 ? "high" : combined < 0 ? "low" : "centered";
  return `${METRIC_META[metric].label} is trending ${direction} at ${combined === null ? "--" : formatDelta(metric, combined)} with ${passRate === null ? "--" : `${passRate.toFixed(0)}%`} inside tolerance.`;
}

function getShotDelta(shot: SessionShot, metric: MetricKey) {
  const prValue = shot.pr?.[metric];
  const tmValue = shot.tm?.[metric];
  if (!isNumber(prValue) || !isNumber(tmValue)) return null;
  return round(prValue - tmValue, METRIC_DECIMALS[metric]);
}

function formatDelta(metric: MetricKey, value: number) {
  const decimals = METRIC_DECIMALS[metric];
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(decimals)} ${METRIC_META[metric].unit}`;
}

function formatAxis(metric: MetricKey, value: number) {
  if (metric === "spin") return `${value > 0 ? "+" : ""}${Math.round(value)}`;
  return `${value > 0 ? "+" : ""}${value.toFixed(metric === "carry" || metric === "speed" ? 1 : 2)}`;
}

function formatCompactMetric(value: number) {
  return `${value.toFixed(1)}x`;
}

function normalizeError(metric: MetricKey, value: number | null) {
  if (value === null) return 0;
  return value / METRIC_TOLERANCE[metric];
}

function toneClass(rollup: MetricRollup) {
  if (rollup.passRate === null) return "";
  if (rollup.passRate >= 80) return "is-good";
  if (rollup.passRate >= 50) return "is-warn";
  return "is-bad";
}

function toneFromPassRate(passRate: number | null): "good" | "warn" | "bad" | "neutral" {
  if (passRate === null) return "neutral";
  if (passRate >= 80) return "good";
  if (passRate >= 50) return "warn";
  return "bad";
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const center = mean(values);
  return Math.sqrt(values.map((value) => (value - center) ** 2).reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
