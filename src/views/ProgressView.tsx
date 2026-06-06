import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { METRIC_META, PASS_THRESHOLD, VERSION_COLORS } from "../constants";
import { formatDateFull, formatDateShort } from "../utils/dates";
import type { MetricKey, MetricStats, Session, TabId } from "../types";

interface Props {
  sessions: Session[];
  onOpenTab?: (tab: TabId) => void;
}

type PanelTab = "total" | "session" | "forecast";
type TimeScope = "year" | "recent";

interface BenchmarkSnapshot {
  avgError: number;
  createdAt: number;
  passRate: number;
  score: number;
  sessions: number;
}

const METRIC_KEYS: MetricKey[] = ["speed", "vla", "hla", "carry", "spin"];
const BENCHMARK_KEY = "pr-progress-benchmark-v1";

export default function ProgressView({ sessions, onOpenTab }: Props) {
  const [panelTab, setPanelTab] = useState<PanelTab>("forecast");
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("carry");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [timeScope, setTimeScope] = useState<TimeScope>("year");
  const [impactPercent, setImpactPercent] = useState(55);
  const [benchmark, setBenchmark] = useState<BenchmarkSnapshot | null>(() => readBenchmark());

  const dashboard = useMemo(
    () => buildProgressDashboard(sessions, selectedMetric, timeScope),
    [sessions, selectedMetric, timeScope]
  );
  const {
    rows,
    chartData,
    metricBreakdown,
    latest,
    previous,
    totals,
    forecast,
    recentRows,
    panelChartData,
  } = dashboard;

  useEffect(() => {
    if (!rows.length) {
      setSelectedSessionId(null);
      return;
    }

    setSelectedSessionId((current) => (current && rows.some((row) => row.id === current) ? current : rows[rows.length - 1].id));
  }, [rows]);

  const selectedSession = rows.find((row) => row.id === selectedSessionId) ?? latest;
  const spotlight = getSpotlight(panelTab, dashboard, selectedSession);
  const activeMetric = metricBreakdown.find((metric) => metric.key === selectedMetric) ?? metricBreakdown[0];
  const impact = buildImpactPreview(latest, activeMetric, impactPercent);
  const missions = buildMissionCards(selectedSession, activeMetric, impact, {
    onBoost: () => {
      setImpactPercent((current) => Math.max(current, 75));
      setPanelTab("forecast");
    },
    onForecast: () => setPanelTab("forecast"),
    onSession: () => setPanelTab("session"),
  });
  const benchmarkDelta = benchmark && latest
    ? {
        score: latest.score - benchmark.score,
        passRate: latest.passRate - benchmark.passRate,
        avgError: benchmark.avgError - latest.avgError,
      }
    : null;

  function handleBenchmark() {
    const snapshot: BenchmarkSnapshot = {
      avgError: latest?.avgError ?? 0,
      createdAt: Date.now(),
      passRate: latest?.passRate ?? 0,
      score: latest?.score ?? 0,
      sessions: rows.length,
    };
    saveBenchmark(snapshot);
    setBenchmark(snapshot);
    setPanelTab("total");
  }

  function cycleMetric() {
    const index = METRIC_KEYS.indexOf(selectedMetric);
    setSelectedMetric(METRIC_KEYS[(index + 1) % METRIC_KEYS.length]);
    setPanelTab("forecast");
  }

  return (
    <section className="pr-progress-board is-command-center">
      <div className="pr-progress-main">
        <div className="pr-progress-topbar">
          <div className="pr-progress-titleblock">
            <span>Progress command center</span>
            <h1>Overview</h1>
            <p>Live calibration health, session drift, and a next-move forecast from your saved practice data.</p>
          </div>

          <div className="pr-progress-top-actions">
            <button
              className={`pr-progress-scope ${timeScope === "recent" ? "is-active" : ""}`}
              onClick={() => setTimeScope((current) => (current === "year" ? "recent" : "year"))}
            >
              {timeScope === "year" ? "This year" : "Last 90"}
            </button>
            <button className="pr-progress-new" onClick={handleBenchmark}>
              New benchmark
            </button>
          </div>
        </div>

        <section className="pr-progress-hero">
          <div className="pr-progress-score-orb" style={{ "--progress-score": `${latest?.score ?? 0}%` } as React.CSSProperties}>
            <span>Fit score</span>
            <strong>{formatPercent(latest?.score ?? 0)}</strong>
            <em>{latest && previous ? formatDelta(latest.score - previous.score) : "Live baseline"}</em>
          </div>

          <div className="pr-progress-briefing">
            <span>Coach readout</span>
            <h2>{forecast.title}</h2>
            <p>{forecast.coachCopy}</p>
            <div className="pr-progress-briefing-actions">
              <button onClick={() => onOpenTab?.("accuracy")}>Open Shot IQ</button>
              <button onClick={() => onOpenTab?.("shots")}>Review shots</button>
            </div>
          </div>

          <div className="pr-progress-dna">
            {dashboard.dna.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{formatPercent(item.value)}</strong>
                <em style={{ width: `${item.value}%`, background: item.color }} />
              </div>
            ))}
          </div>
        </section>

        <div className="pr-progress-statgrid">
          <SummaryCard
            label="Approved Shots"
            value={formatNumber(totals.passed)}
            delta={totals.passDelta}
            tone={totals.passDelta >= 0 ? "good" : "bad"}
          />
          <SummaryCard
            label="Declined Shots"
            value={formatNumber(totals.failed)}
            delta={-totals.failDelta}
            tone={totals.failDelta <= 0 ? "good" : "bad"}
          />
          <SummaryCard
            label="Improved Sessions"
            value={formatNumber(totals.improvedSessions)}
            delta={totals.improvementDelta}
            tone="good"
          />
          <SummaryCard
            label="Active Clubs"
            value={formatNumber(totals.activeClubs)}
            delta={totals.clubDelta}
            tone={totals.clubDelta >= 0 ? "good" : "bad"}
          />
        </div>

        <section className="pr-progress-chartblock">
          <div className="pr-progress-section-head">
            <div>
              <h2>Progress</h2>
              <div className="pr-progress-legend">
                <span className="is-blue" />
                <div>
                  <small>Accuracy Score</small>
                  <strong>{formatPercent(latest?.score ?? 0)}</strong>
                  <em>{formatDelta(latest && previous ? latest.score - previous.score : 0)} last session</em>
                </div>
                <span className="is-gray" />
                <div>
                  <small>Consistency Index</small>
                  <strong>{formatPercent(latest?.consistency ?? 0)}</strong>
                  <em>{formatDelta(latest && previous ? latest.consistency - previous.consistency : 0)} last session</em>
                </div>
              </div>
            </div>

            <div className="pr-progress-selectors" aria-label="Progress chart filters">
              <button onClick={() => setTimeScope((current) => (current === "year" ? "recent" : "year"))}>
                {timeScope === "year" ? "This year" : "Last 90"}
              </button>
              <button onClick={cycleMetric}>{METRIC_META[selectedMetric].label}</button>
            </div>
          </div>

          <div className="pr-progress-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#eef0f4" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#9b9ca6", fontSize: 11 }} />
                <YAxis yAxisId="score" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#9b9ca6", fontSize: 11 }} width={34} />
                <YAxis yAxisId="shots" orientation="right" hide domain={[0, "dataMax + 8"]} />
                <Tooltip content={<ProgressTooltip />} />
                <Bar yAxisId="shots" dataKey="shots" fill="#e6eaf0" radius={[3, 3, 0, 0]} barSize={10} isAnimationActive={false} />
                <Line
                  yAxisId="score"
                  type="monotone"
                  dataKey="score"
                  stroke="#4f5cff"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#4f5cff", stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#111217", stroke: "#fff", strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line yAxisId="score" type="monotone" dataKey="consistency" stroke="#cfd4de" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                <Line
                  yAxisId="score"
                  type="monotone"
                  dataKey="forecastScore"
                  stroke="#111217"
                  strokeWidth={2.4}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="pr-progress-lab-grid">
          <div className="pr-progress-impact-lab">
            <span>What-if lab</span>
            <h2>Correct {activeMetric?.label ?? "metric"} by {impactPercent}%</h2>
            <p>
              If the next session trims that error by this amount, projected fit moves from
              {" "}<strong>{formatPercent(latest?.score ?? 0)}</strong> to <strong>{formatPercent(impact.projectedScore)}</strong>.
            </p>
            <input
              aria-label="Correction percent"
              max={100}
              min={10}
              onChange={(event) => setImpactPercent(Number(event.target.value))}
              step={5}
              type="range"
              value={impactPercent}
            />
            <div className="pr-progress-impact-row">
              <span>Score lift</span>
              <strong>{formatDelta(impact.scoreLift)}</strong>
            </div>
          </div>

          <div className="pr-progress-mission">
            <span>Next 5 shot mission</span>
            {missions.map((mission) => (
              <button key={mission.title} onClick={mission.onClick}>
                <em>{mission.kicker}</em>
                <strong>{mission.title}</strong>
                <small>{mission.copy}</small>
              </button>
            ))}
          </div>

          <div className="pr-progress-benchmark">
            <span>Saved benchmark</span>
            {benchmark ? (
              <>
                <strong>{formatPercent(benchmark.score)}</strong>
                <p>Saved {new Date(benchmark.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} from {benchmark.sessions} sessions.</p>
                <div>
                  <span>Score {benchmarkDelta ? formatDelta(benchmarkDelta.score) : "+0.00%"}</span>
                  <span>Pass {benchmarkDelta ? formatDelta(benchmarkDelta.passRate) : "+0.00%"}</span>
                  <span>Error {benchmarkDelta ? formatDelta(benchmarkDelta.avgError) : "+0.00%"}</span>
                </div>
              </>
            ) : (
              <>
                <strong>No baseline yet</strong>
                <p>Hit New benchmark to freeze today's score and make future sessions compare against it.</p>
                <button onClick={handleBenchmark}>Save baseline</button>
              </>
            )}
          </div>
        </section>

        <section className="pr-progress-ledger">
          <div className="pr-progress-ledger-head">
            <h2>Sessions</h2>
            <p>Click a session to load its details into the side panel and jump the forecast to its weakest metric.</p>
          </div>

          <div className="pr-progress-table">
            <div className="pr-progress-row is-head">
              <span>Session ID</span>
              <span>Type</span>
              <span>Status</span>
              <span>Pass Rate</span>
              <span>Session Date</span>
              <span>Avg Error</span>
            </div>

            {recentRows.length ? (
              recentRows.map((row) => (
                <button
                  className={`pr-progress-row ${selectedSession?.id === row.id ? "is-selected" : ""}`}
                  key={row.id}
                  onClick={() => {
                    setSelectedSessionId(row.id);
                    setSelectedMetric(row.focusMetric);
                    setPanelTab("session");
                  }}
                >
                  <span className="pr-progress-session">
                    <span className="pr-progress-avatar" style={{ background: row.color }}>
                      {row.initial}
                    </span>
                    <span>{row.name}</span>
                  </span>
                  <span>{row.club}</span>
                  <span>
                    <em className={`pr-progress-status is-${row.statusTone}`}>{row.status}</em>
                  </span>
                  <span>{formatPercent(row.passRate)}</span>
                  <span>{row.fullDate}</span>
                  <span>{row.avgError.toFixed(2)}%</span>
                </button>
              ))
            ) : (
              <div className="pr-progress-row is-empty">
                <span>No sessions yet</span>
                <span>Start a session</span>
                <span>
                  <em className="pr-progress-status is-review">Waiting</em>
                </span>
                <span>0%</span>
                <span>--</span>
                <span>0.00%</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <aside className="pr-progress-side">
        <div className="pr-progress-tabs">
          {(["total", "session", "forecast"] as PanelTab[]).map((tab) => (
            <button
              key={tab}
              className={panelTab === tab ? "is-active" : ""}
              onClick={() => setPanelTab(tab)}
            >
              {tab === "total" ? "Total" : tab === "session" ? "Session" : "Forecast"}
            </button>
          ))}
        </div>

        <div className={`pr-progress-spotlight is-${panelTab}`}>
          <strong>{spotlight.value}</strong>
          <p>{spotlight.copy}</p>
        </div>

        <div className="pr-progress-mini">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={panelChartData} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e4e6eb" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#9b9ca6", fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis hide domain={[0, 100]} />
              <Tooltip content={<ProgressTooltip compact />} />
              <Line type="monotone" dataKey="score" stroke="#d7d9df" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="forecastScore" stroke="#111217" strokeWidth={2.2} dot={false} strokeDasharray="4 4" connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <PanelDetail
          activeMetric={activeMetric}
          dashboard={dashboard}
          impact={impact}
          panelTab={panelTab}
          selectedSession={selectedSession}
        />

        <section className="pr-progress-metrics">
          <div className="pr-progress-metrics-head">
            <h2>Accuracy by Metric</h2>
            <div>
              <button aria-label="Show total panel" onClick={() => setPanelTab("total")}>=</button>
              <button aria-label="Cycle metric" onClick={cycleMetric}>+</button>
            </div>
          </div>

          <div className="pr-progress-metric-list">
            {metricBreakdown.map((metric) => (
              <button
                key={metric.key}
                className={`pr-progress-metric ${selectedMetric === metric.key ? "is-active" : ""}`}
                onClick={() => {
                  setSelectedMetric(metric.key);
                  setPanelTab("forecast");
                }}
              >
                <span>
                  <i style={{ background: metric.color }} />
                  {metric.label}
                </span>
                <strong>{metric.mean === null ? "--" : `${formatSigned(metric.mean)}%`}</strong>
                <em style={{ width: `${metric.barWidth}%`, background: metric.color }} />
              </button>
            ))}
          </div>
        </section>

        <section className="pr-progress-forecast">
          <span>Breakthrough Forecast</span>
          <strong>{forecast.title}</strong>
          <p>{forecast.copy}</p>
          <div className="pr-progress-forecast-strip">
            <span>{activeMetric?.label ?? "Metric"}</span>
            <strong>{forecast.nextMove}</strong>
          </div>
        </section>

        <div className="pr-progress-side-actions">
          <button onClick={() => exportProgressCsv(rows)}>Export</button>
          <button onClick={() => downloadProgressReport(dashboard, benchmark, impact)}>Create Report</button>
        </div>
      </aside>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: number;
  tone: "good" | "bad";
}) {
  return (
    <div className="pr-progress-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <em className={tone === "good" ? "is-good" : "is-bad"}>{formatDelta(delta)}</em>
    </div>
  );
}

function PanelDetail({
  activeMetric,
  dashboard,
  impact,
  panelTab,
  selectedSession,
}: {
  activeMetric: ReturnType<typeof buildMetricBreakdown>[number] | undefined;
  dashboard: ReturnType<typeof buildProgressDashboard>;
  impact: ReturnType<typeof buildImpactPreview>;
  panelTab: PanelTab;
  selectedSession: ReturnType<typeof buildSessionRow> | null;
}) {
  if (panelTab === "session") {
    return (
      <section className="pr-progress-panel-detail">
        <span>Selected session</span>
        <strong>{selectedSession?.name ?? "No session"}</strong>
        <div className="pr-progress-panel-grid">
          <div>
            <em>Club</em>
            <b>{selectedSession?.club ?? "--"}</b>
          </div>
          <div>
            <em>Shots</em>
            <b>{selectedSession?.shots ?? 0}</b>
          </div>
          <div>
            <em>Fit</em>
            <b>{formatPercent(selectedSession?.score ?? 0)}</b>
          </div>
          <div>
            <em>Weakest</em>
            <b>{selectedSession ? METRIC_META[selectedSession.focusMetric].label : "--"}</b>
          </div>
        </div>
      </section>
    );
  }

  if (panelTab === "total") {
    return (
      <section className="pr-progress-panel-detail">
        <span>Total data health</span>
        <strong>{formatPercent(dashboard.totals.avgScore)}</strong>
        <p>{dashboard.rows.length} sessions, {dashboard.totals.activeClubs} active clubs, and {dashboard.totals.passed} approved metric checks.</p>
        <div className="pr-progress-panel-grid">
          <div>
            <em>Avg error</em>
            <b>{dashboard.totals.avgError.toFixed(2)}%</b>
          </div>
          <div>
            <em>Improved</em>
            <b>{dashboard.totals.improvedSessions}</b>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pr-progress-panel-detail">
      <span>Forecast lab</span>
      <strong>{activeMetric?.label ?? "Metric"} impact</strong>
      <p>{impactPercentCopy(impact)} The best next move is to reduce {activeMetric?.label.toLowerCase() ?? "metric"} error before chasing secondary metrics.</p>
      <div className="pr-progress-panel-grid">
        <div>
          <em>Projected</em>
          <b>{formatPercent(impact.projectedScore)}</b>
        </div>
        <div>
          <em>Lift</em>
          <b>{formatDelta(impact.scoreLift)}</b>
        </div>
      </div>
    </section>
  );
}

function ProgressTooltip({ active, payload, label, compact }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className={`pr-progress-tooltip ${compact ? "is-compact" : ""}`}>
      <span>{label}</span>
      {payload
        .filter((item: any) => item.value != null)
        .map((item: any) => (
          <strong key={item.dataKey} style={{ color: item.color }}>
            {item.name || item.dataKey}: {typeof item.value === "number" ? item.value.toFixed(1) : item.value}
          </strong>
        ))}
    </div>
  );
}

function buildProgressDashboard(sessions: Session[], selectedMetric: MetricKey, timeScope: TimeScope) {
  const allRows = sessions
    .map((session, index) => buildSessionRow(session, index))
    .sort((left, right) => left.createdAt - right.createdAt);
  const rows = filterRowsByScope(allRows, timeScope);
  const latest = rows[rows.length - 1] ?? null;
  const previous = rows[rows.length - 2] ?? null;
  const first = rows[0] ?? null;
  const metricBreakdown = buildMetricBreakdown(rows, latest);
  const forecast = buildForecast(rows, selectedMetric);
  const historicalChart = rows.map((row) => ({
    label: row.shortDate,
    score: row.score,
    consistency: row.consistency,
    shots: row.shots,
    forecastScore: null as number | null,
  }));
  const chartData = [
    ...historicalChart,
    ...forecast.points.map((point) => ({
      label: point.label,
      score: null as number | null,
      consistency: null as number | null,
      shots: 0,
      forecastScore: point.score,
    })),
  ];
  const panelChartData = [
    ...historicalChart.map((point) => ({ label: point.label, score: point.score, forecastScore: null as number | null })),
    ...forecast.points.map((point) => ({ label: point.label, score: null as number | null, forecastScore: point.score })),
  ];
  const passed = Math.round(rows.reduce((sum, row) => sum + row.passed, 0));
  const matched = Math.round(rows.reduce((sum, row) => sum + row.matched, 0));
  const failed = Math.max(0, matched - passed);
  const improvedSessions = rows.reduce((sum, row, index) => {
    if (index === 0) return sum;
    return row.avgError < rows[index - 1].avgError ? sum + 1 : sum;
  }, 0);
  const activeClubs = new Set(rows.map((row) => row.club)).size;
  const avgScore = average(rows.map((row) => row.score));
  const avgError = average(rows.map((row) => row.avgError));
  const avgPass = average(rows.map((row) => row.passRate));
  const avgConsistency = average(rows.map((row) => row.consistency));
  const totals = {
    passed,
    failed,
    improvedSessions,
    activeClubs,
    passDelta: latest && previous ? latest.passRate - previous.passRate : latest ? latest.passRate : 0,
    failDelta: latest && previous ? (100 - latest.passRate) - (100 - previous.passRate) : 0,
    improvementDelta: first && latest ? first.avgError - latest.avgError : 0,
    clubDelta: activeClubs ? 1.23 : 0,
    avgScore,
    avgError,
    avgPass,
    avgConsistency,
  };
  const dna = [
    { label: "Accuracy", value: avgScore, color: "#4f5cff" },
    { label: "Consistency", value: avgConsistency, color: "#7adf8d" },
    { label: "Pass rate", value: avgPass, color: "#20c875" },
    { label: "Recovery", value: clamp(100 - avgError * 5, 0, 100), color: "#ffb84d" },
  ];

  return {
    allRows,
    rows,
    chartData,
    metricBreakdown,
    latest,
    previous,
    first,
    totals,
    forecast,
    recentRows: rows.slice(-6).reverse(),
    panelChartData,
    dna,
    timeScope,
  };
}

function buildSessionRow(session: Session, index: number) {
  const metrics = METRIC_KEYS.reduce((result, key) => {
    result[key] = calcSafeMetricStats(session, key);
    return result;
  }, {} as Record<MetricKey, MetricStats | null>);
  const usableMetrics = METRIC_KEYS.map((key) => metrics[key]).filter((metric): metric is MetricStats => Boolean(metric));
  const avgError = average(usableMetrics.map((metric) => Math.abs(metric.mean)));
  const avgStd = average(usableMetrics.map((metric) => metric.std));
  const passRate = average(usableMetrics.map((metric) => metric.passRate));
  const matched = usableMetrics.reduce((sum, metric) => sum + metric.n, 0);
  const passed = usableMetrics.reduce((sum, metric) => sum + metric.n * (metric.passRate / 100), 0);
  const score = clamp(100 - avgError * 10.5 - avgStd * 2.2, 0, 100);
  const consistency = clamp(100 - avgStd * 14, 0, 100);
  const statusTone = passRate >= 80 ? "approved" : passRate >= 55 ? "review" : "declined";
  const focusMetric = getFocusMetric(metrics);

  return {
    id: session.id,
    name: session.version || session.label || `Session ${index + 1}`,
    initial: (session.version || session.label || "S").slice(0, 1).toUpperCase(),
    club: session.club,
    color: session.color ?? VERSION_COLORS[index % VERSION_COLORS.length],
    createdAt: session.createdAt || new Date(`${session.date}T12:00:00`).getTime(),
    shortDate: formatDateShort(session.date),
    fullDate: formatDateFull(session.date),
    shots: session.shots.length,
    metrics,
    avgError,
    avgStd,
    passRate,
    matched,
    passed,
    score,
    consistency,
    status: statusTone === "approved" ? "Approved" : statusTone === "review" ? "Review" : "Declined",
    statusTone,
    focusMetric,
  };
}

function calcSafeMetricStats(session: Session, key: MetricKey): MetricStats | null {
  const errors = session.shots
    .map((shot) => {
      const reference = shot.tm?.[key];
      const measured = shot.pr[key];

      if (reference == null || !Number.isFinite(reference) || !Number.isFinite(measured)) {
        return null;
      }

      if (key === "hla") {
        return measured - reference;
      }

      if (Math.abs(reference) < 0.000001) {
        return null;
      }

      return ((measured - reference) / reference) * 100;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!errors.length) {
    return null;
  }

  const mean = average(errors);
  const variance = average(errors.map((value) => (value - mean) ** 2));
  const std = Math.sqrt(variance);
  const passRate = (errors.filter((error) => Math.abs(error) <= PASS_THRESHOLD).length / errors.length) * 100;

  return {
    mean: +mean.toFixed(2),
    std: +std.toFixed(2),
    passRate: +passRate.toFixed(0),
    n: errors.length,
  };
}

function buildMetricBreakdown(rows: ReturnType<typeof buildSessionRow>[], latest: ReturnType<typeof buildSessionRow> | null) {
  return METRIC_KEYS.map((key) => {
    const latestMetric = latest?.metrics[key] ?? null;
    const historicalValues = rows
      .map((row) => row.metrics[key]?.mean)
      .filter((value): value is number => typeof value === "number");
    const mean = latestMetric?.mean ?? null;
    const absMean = mean === null ? null : Math.abs(mean);
    const barWidth = absMean === null ? 8 : clamp((1 - Math.min(absMean, 8) / 8) * 100, 8, 100);

    return {
      key,
      label: METRIC_META[key].label,
      mean,
      average: average(historicalValues),
      passRate: latestMetric?.passRate ?? 0,
      color: METRIC_META[key].color,
      barWidth,
    };
  });
}

function buildForecast(rows: ReturnType<typeof buildSessionRow>[], selectedMetric: MetricKey) {
  const latest = rows[rows.length - 1] ?? null;
  const latestMetric = latest?.metrics[selectedMetric] ?? null;
  const latestAbs = latestMetric ? Math.abs(latestMetric.mean) : 0;
  const values = rows
    .map((row) => row.metrics[selectedMetric]?.mean)
    .filter((value): value is number => typeof value === "number")
    .map((value) => Math.abs(value));
  const firstAbs = values[0] ?? latestAbs;
  const totalImprovement = Math.max(0, firstAbs - latestAbs);
  const observedGain = values.length > 1 ? totalImprovement / (values.length - 1) : 0;
  const perSessionGain = Math.max(observedGain, latestAbs > PASS_THRESHOLD ? latestAbs * 0.16 : 0.18, 0.12);
  const sessionsToTarget = latestAbs <= PASS_THRESHOLD ? 0 : Math.ceil((latestAbs - PASS_THRESHOLD) / perSessionGain);
  const bias = latestMetric?.mean ?? 0;
  const direction = bias > 0 ? "lower" : bias < 0 ? "raise" : "hold";
  const correctionAmount = Math.min(Math.max(latestAbs - PASS_THRESHOLD, 0), perSessionGain);
  const nextMove =
    latestAbs <= PASS_THRESHOLD
      ? "Protect the window"
      : `${direction} ${METRIC_META[selectedMetric].label.toLowerCase()} by ${correctionAmount.toFixed(1)}%`;
  const points = Array.from({ length: 5 }, (_, index) => {
    const projectedError = Math.max(0.25, latestAbs - perSessionGain * (index + 1));
    return {
      label: `F${index + 1}`,
      score: clamp(100 - projectedError * 10.5, 0, 100),
      projectedError,
    };
  });

  return {
    sessionsToTarget,
    title: sessionsToTarget === 0 ? "Target locked" : `${sessionsToTarget} sessions to target`,
    coachCopy:
      latestAbs <= PASS_THRESHOLD
        ? `${METRIC_META[selectedMetric].label} is inside the target window. Keep the same pattern and protect consistency.`
        : `The biggest gain is available by moving ${METRIC_META[selectedMetric].label.toLowerCase()} ${direction === "raise" ? "up" : direction === "lower" ? "down" : "steady"} by about ${correctionAmount.toFixed(1)}%.`,
    copy:
      latestAbs <= PASS_THRESHOLD
        ? `${METRIC_META[selectedMetric].label} is already inside the +/-1% window.`
        : `Projected from the last ${Math.max(values.length, 1)} matched sessions and current ${formatSigned(bias)}% bias.`,
    nextMove,
    points,
    selectedMetric,
    latestAbs,
  };
}

function buildImpactPreview(
  latest: ReturnType<typeof buildSessionRow> | null,
  activeMetric: ReturnType<typeof buildMetricBreakdown>[number] | undefined,
  impactPercent: number
) {
  const currentScore = latest?.score ?? 0;
  const currentAbs = activeMetric?.mean == null ? 0 : Math.abs(activeMetric.mean);
  const correctedAbs = Math.max(0, currentAbs * (1 - impactPercent / 100));
  const scoreLift = clamp((currentAbs - correctedAbs) * 2.8, 0, 34);
  const projectedScore = clamp(currentScore + scoreLift, 0, 100);

  return {
    currentAbs,
    correctedAbs,
    projectedScore,
    scoreLift,
  };
}

function buildMissionCards(
  selectedSession: ReturnType<typeof buildSessionRow> | null,
  activeMetric: ReturnType<typeof buildMetricBreakdown>[number] | undefined,
  impact: ReturnType<typeof buildImpactPreview>,
  actions: {
    onBoost: () => void;
    onForecast: () => void;
    onSession: () => void;
  }
) {
  return [
    {
      kicker: "Fix first",
      title: activeMetric ? `${activeMetric.label} bias` : "Metric bias",
      copy: activeMetric?.mean == null ? "Capture a matched session to unlock a correction target." : `Current read is ${formatSigned(activeMetric.mean)}%. Push it toward zero before changing the rest.`,
      onClick: actions.onForecast,
    },
    {
      kicker: "Session cue",
      title: selectedSession?.club ?? "No club",
      copy: selectedSession ? `${selectedSession.name} has ${selectedSession.shots} shots and a ${formatPercent(selectedSession.passRate)} pass rate.` : "Start a saved session and this card becomes a live mission.",
      onClick: actions.onSession,
    },
    {
      kicker: "Projected payoff",
      title: `${formatDelta(impact.scoreLift)} lift`,
      copy: `A focused correction can move the fit score to ${formatPercent(impact.projectedScore)}.`,
      onClick: actions.onBoost,
    },
  ];
}

function filterRowsByScope(rows: ReturnType<typeof buildSessionRow>[], timeScope: TimeScope) {
  if (timeScope === "year") {
    const currentYear = new Date().getFullYear();
    const scoped = rows.filter((row) => new Date(row.createdAt).getFullYear() === currentYear);
    return scoped.length ? scoped : rows;
  }

  const latestTime = rows[rows.length - 1]?.createdAt ?? Date.now();
  const cutoff = latestTime - 90 * 24 * 60 * 60 * 1000;
  const scoped = rows.filter((row) => row.createdAt >= cutoff);
  return scoped.length ? scoped : rows.slice(-4);
}

function getSpotlight(
  panelTab: PanelTab,
  dashboard: ReturnType<typeof buildProgressDashboard>,
  selectedSession: ReturnType<typeof buildSessionRow> | null
) {
  if (panelTab === "session") {
    return {
      value: selectedSession ? formatPercent(selectedSession.score) : "0.0%",
      copy: selectedSession
        ? `${selectedSession.name} is ${selectedSession.status.toLowerCase()} with ${formatPercent(selectedSession.passRate)} pass rate.`
        : "No completed sessions yet.",
    };
  }

  if (panelTab === "forecast") {
    return {
      value: dashboard.forecast.sessionsToTarget === 0 ? "Locked" : `${dashboard.forecast.sessionsToTarget}`,
      copy:
        dashboard.forecast.sessionsToTarget === 0
          ? "The selected metric is inside the target band."
          : `sessions projected for ${METRIC_META[dashboard.forecast.selectedMetric].label} to reach +/-1%.`,
    };
  }

  return {
    value: formatPercent(dashboard.totals.avgScore),
    copy: `Total accuracy across ${dashboard.rows.length} saved ${dashboard.rows.length === 1 ? "session" : "sessions"}.`,
  };
}

function getFocusMetric(metrics: Record<MetricKey, MetricStats | null>): MetricKey {
  return METRIC_KEYS.reduce((worst, key) => {
    const current = metrics[key]?.mean;
    const worstValue = metrics[worst]?.mean;
    if (current == null) return worst;
    if (worstValue == null) return key;
    return Math.abs(current) > Math.abs(worstValue) ? key : worst;
  }, "vla" as MetricKey);
}

function exportProgressCsv(rows: ReturnType<typeof buildSessionRow>[]) {
  const header = ["Session", "Club", "Date", "Score", "Consistency", "Pass Rate", "Avg Error", "Matched"];
  const body = rows.map((row) => [
    csvCell(row.name),
    csvCell(row.club),
    csvCell(row.fullDate),
    row.score.toFixed(1),
    row.consistency.toFixed(1),
    row.passRate.toFixed(1),
    row.avgError.toFixed(2),
    String(row.matched),
  ]);
  downloadText("progress-export.csv", [header, ...body].map((line) => line.join(",")).join("\n"), "text/csv");
}

function downloadProgressReport(
  dashboard: ReturnType<typeof buildProgressDashboard>,
  benchmark: BenchmarkSnapshot | null,
  impact: ReturnType<typeof buildImpactPreview>
) {
  const lines = [
    "ProRange Progress Report",
    "",
    `Sessions: ${dashboard.rows.length}`,
    `Average score: ${formatPercent(dashboard.totals.avgScore)}`,
    `Average error: ${dashboard.totals.avgError.toFixed(2)}%`,
    `Breakthrough forecast: ${dashboard.forecast.title}`,
    `Next move: ${dashboard.forecast.nextMove}`,
    `What-if projected score: ${formatPercent(impact.projectedScore)} (${formatDelta(impact.scoreLift)} lift)`,
    benchmark ? `Saved benchmark score: ${formatPercent(benchmark.score)}` : "Saved benchmark score: none",
    "",
    "Recent sessions:",
    ...dashboard.recentRows.map((row) => `${row.name} | ${row.club} | ${formatPercent(row.score)} | ${row.avgError.toFixed(2)}% avg error`),
  ];
  downloadText("progress-report.txt", lines.join("\n"), "text/plain");
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readBenchmark(): BenchmarkSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(BENCHMARK_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as BenchmarkSnapshot;
  } catch {
    window.localStorage.removeItem(BENCHMARK_KEY);
    return null;
  }
}

function saveBenchmark(snapshot: BenchmarkSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BENCHMARK_KEY, JSON.stringify(snapshot));
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function impactPercentCopy(impact: ReturnType<typeof buildImpactPreview>) {
  return `Correcting the selected miss projects a ${formatDelta(impact.scoreLift)} fit-score lift.`;
}

function average(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function formatDelta(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
