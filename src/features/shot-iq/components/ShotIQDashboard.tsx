import React, { useEffect, useMemo, useState } from "react";
import { METRIC_META } from "../../../constants";
import { calcSessionStats } from "../../../utils/stats";
import type { MetricKey, Session, Shot } from "../../../types";
import {
  baselineGoodRadius,
  getClubBaseline,
  normalizeClubBaselineKey,
  rangeCenter,
  rangeRadius,
} from "../../../lib/clubTargets";

type Tone = "good" | "warn" | "bad" | "neutral";
type ShotGrade = "good" | "okay" | "bad";

interface ShotIQDashboardProps {
  shots: Shot[];
  sessions: Session[];
  activeSessionId?: string | null;
  tmReady?: boolean;
}

interface MetricSummary {
  key: MetricKey;
  label: string;
  meanError: number;
  meanAbsError: number;
  latestError: number;
  passRate: number;
  score: number;
  tone: Tone;
  sampleSize: number;
}

interface TendencyCard {
  id: string;
  label: string;
  detail: string;
  tone: Tone;
}

interface DashboardData {
  clubLabel: string;
  effectiveShots: Shot[];
  previewMode: boolean;
  overallScore: number;
  metricRows: MetricSummary[];
  trendLabel: string;
  trendTone: Tone;
  tendencies: TendencyCard[];
  prompt: string;
  focusNote: string;
}

interface TargetScatterPoint {
  key: string;
  x: number;
  y: number;
  latest: boolean;
  grade: ShotGrade;
  label: string;
  tooltipTitle: string;
  tooltipLines: string[];
}

interface TargetScatterData {
  carryDelta: number;
  vlaDelta: number;
  startLineBias: number;
  bullseyeHits: number;
  evaluatedShotCount: number;
  targetLimit: number;
  targetCarry: number;
  targetVla: number;
  targetClub: string;
  points: TargetScatterPoint[];
  biasLabel: string;
}

const FOCUS_METRICS: MetricKey[] = ["carry", "speed", "vla", "spin", "hla"];
const TARGET_SCATTER_LIMIT = 30;

export default function ShotIQDashboard({ sessions, activeSessionId }: ShotIQDashboardProps) {
  const [focusMetric, setFocusMetric] = useState<MetricKey>("carry");
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (left, right) => right.createdAt - left.createdAt || right.date.localeCompare(left.date)
      ),
    [sessions]
  );
  const activeSession = useMemo(
    () => sortedSessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sortedSessions]
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    activeSession?.id ?? sortedSessions[0]?.id ?? null
  );

  useEffect(() => {
    if (!sortedSessions.length) {
      setSelectedSessionId(null);
      return;
    }

    setSelectedSessionId((current) =>
      current && sortedSessions.some((session) => session.id === current)
        ? current
        : activeSession?.id ?? sortedSessions[0].id
    );
  }, [activeSession?.id, sortedSessions]);

  const selectedSession =
    sortedSessions.find((session) => session.id === selectedSessionId) ?? sortedSessions[0] ?? null;
  const analysisShots = useMemo(
    () => (selectedSession ? sessionToShots(selectedSession) : []),
    [selectedSession]
  );
  const data = useMemo(() => buildDashboardData(analysisShots), [analysisShots]);
  const targetScatter = useMemo(() => buildTargetScatter(analysisShots), [analysisShots]);
  const focusRow = data.metricRows.find((row) => row.key === focusMetric) ?? data.metricRows[0];
  const selectedBaseline = getClubBaseline(targetScatter.targetClub || data.clubLabel);

  return (
    <div className="shotiq-shell">
      <div className="shotiq-toolbar">
        <div className="shotiq-toolbar-center">
          <span>Session intelligence</span>
          <strong>{selectedSession ? `${selectedSession.club} session IQ` : "Shot IQ"}</strong>
          <em>
            {selectedSession
              ? `${selectedSession.label || selectedSession.version} · ${selectedSession.shots.length} shots · ${formatSessionStamp(
                  selectedSession.createdAt
                )}`
              : "Save a session to unlock a true target view"}
          </em>
        </div>
      </div>

      <div className="shotiq-workbench">
        <aside className="shotiq-column shotiq-column-left">
          <section className="shotiq-panel shotiq-session-picker-panel">
            <div className="shotiq-panel-head">
              <span>Recent sessions</span>
              <strong>{sortedSessions.length}</strong>
            </div>

            <p className="shotiq-session-picker-copy">
              {sortedSessions.length
                ? "Newest first. Pick a saved session and every readout on this page will use only those shots."
                : "Saved sessions will appear here once you log your first practice run."}
            </p>

            {activeSession ? (
              <div className="shotiq-session-feature">
                <div className="shotiq-session-feature-head">
                  <span className="shotiq-session-feature-label">Active session</span>
                  <span
                    className="shotiq-session-color-dot"
                    style={{ background: activeSession.color ?? "#6ad87c" }}
                  />
                </div>
                <strong>{activeSession.label || activeSession.version}</strong>
                <p>{activeSession.version} · {activeSession.club} · {activeSession.shots.length} shots</p>
              </div>
            ) : null}

            <div className="shotiq-session-list">
              {sortedSessions.length ? sortedSessions.map((session, index) => {
                const stats = calcSessionStats(session);
                const primaryStat = stats.carry ?? stats.vla ?? stats.speed ?? stats.spin ?? stats.hla ?? null;
                const carryMean = average(session.shots.map((shot) => shot.pr.carry));
                const isActive = session.id === selectedSession?.id;
                const isDbActive = session.id === activeSession?.id;

                return (
                  <button
                    key={session.id}
                    className={`shotiq-session-card ${isActive ? "is-active" : ""}`}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <div className="shotiq-session-card-top">
                      <span className="shotiq-session-rank">
                        {isDbActive ? "Active" : index === 0 ? "Latest" : `#${String(index + 1).padStart(2, "0")}`}
                      </span>
                      <div className="shotiq-session-card-meta-top">
                        <span
                          className="shotiq-session-color-dot"
                          style={{ background: session.color ?? "#6ad87c" }}
                        />
                        <span className="shotiq-session-stamp">{formatSessionStamp(session.createdAt)}</span>
                      </div>
                    </div>

                    <strong>{session.label || session.version}</strong>
                    <p>{session.version} · {session.club}</p>

                    <div className="shotiq-session-meta">
                      <span>{session.shots.length} shots</span>
                      <span>{Math.round(carryMean)} yd</span>
                      <span className={`shotiq-session-pass is-${primaryStat?.passRate && primaryStat.passRate >= 72 ? "good" : "neutral"}`}>
                        {primaryStat ? `${Math.round(primaryStat.passRate)}% pass` : "Session"}
                      </span>
                    </div>
                  </button>
                );
              }) : (
                <button className="shotiq-session-empty" onClick={() => {}} type="button" disabled>
                  <strong>No saved sessions yet</strong>
                  <span>Save a session to drive the target, scoring, and insight panels.</span>
                </button>
              )}
            </div>
          </section>
        </aside>

        <main className="shotiq-stage">
          <div className="shotiq-stage-topline">
            <div className="shotiq-floating-card">
              <span className="shotiq-floating-label">Focus metric</span>
              <div className="shotiq-metric-chip-row">
                {FOCUS_METRICS.map((metric) => (
                  <button
                    key={metric}
                    className={`shotiq-metric-chip ${focusMetric === metric ? "is-active" : ""}`}
                    onClick={() => setFocusMetric(metric)}
                  >
                    {METRIC_META[metric].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="shotiq-hero-score">
              <span>overall fit</span>
              <strong>{data.overallScore}</strong>
              <em className={`is-${data.trendTone}`}>{data.trendLabel}</em>
            </div>

            <div className="shotiq-floating-card shotiq-floating-card-pulse">
              <span className="shotiq-floating-label">Club baseline</span>
              <div className="shotiq-badge-stack">
                <span className="shotiq-mini-badge is-good">{formatRange(selectedBaseline.carryRange, "yd")}</span>
                <span className="shotiq-mini-badge is-neutral">{formatRange(selectedBaseline.launchRange, "°")}</span>
                <span className="shotiq-mini-badge is-neutral">HLA ±{selectedBaseline.hlaOkayMax.toFixed(1)}°</span>
              </div>
              <span className="shotiq-floating-ai">{selectedBaseline.label}</span>
            </div>
          </div>

          <div className="shotiq-stage-body">
            <div className="shotiq-stage-tag-stack">
              <div className="shotiq-hero-tag">
                <span>{focusRow.label}</span>
                <strong>{formatMetricValue(focusRow.key, focusRow.latestError)}</strong>
                <em>{formatGoalLabel(focusMetric, selectedSession?.club ?? data.clubLabel)}</em>
              </div>
            </div>

            <div className="shotiq-drift-field">
              <div className="shotiq-hero-blob" />
              <ShotTargetScatter
                key={selectedSession?.id ?? "preview-target"}
                map={targetScatter}
                showPoints={targetScatter.points.length > 0}
              />
              <div className="shotiq-drift-caption">
                <span>Session target</span>
                <strong>{targetScatter.biasLabel}</strong>
                <em>{targetScatter.bullseyeHits}/{targetScatter.targetLimit} hit the target · showing latest {targetScatter.evaluatedShotCount} shots</em>
                <div className="shotiq-drift-legend">
                  <span className="is-good">
                    <i className="shotiq-drift-legend-dot is-good" />
                    Good shot
                  </span>
                  <span className="is-okay">
                    <i className="shotiq-drift-legend-dot is-okay" />
                    Okay shot
                  </span>
                  <span className="is-bad">
                    <i className="shotiq-drift-legend-dot is-bad" />
                    Bad shot
                  </span>
                </div>
              </div>
            </div>

            <div className="shotiq-stage-tag-stack is-right">
              <div className="shotiq-hero-tag">
                <span>pass rate</span>
                <strong>{focusRow.passRate}%</strong>
                <em>{focusRow.sampleSize} session shots inside the goal window</em>
              </div>
            </div>
          </div>

          <div className="shotiq-prompt-card">
            <button className="shotiq-prompt-close" aria-label="Collapse insight">×</button>
            <div className="shotiq-prompt-head">
              <strong>ShotIQ Insight</strong>
              <span>{selectedSession ? selectedSession.version : "Session target"}</span>
            </div>
            <p>{data.prompt}</p>
            <div className="shotiq-prompt-subcopy">{data.focusNote}</div>
            <div className="shotiq-prompt-footer">
              <span className={`shotiq-status-dot is-${data.trendTone}`} />
              <span>{data.previewMode ? "Waiting for a saved session" : "Session target active"}</span>
              <button className="shotiq-prompt-send" aria-label="Send prompt">↗</button>
            </div>
          </div>
        </main>

        <aside className="shotiq-column shotiq-column-right">
          <section className="shotiq-panel">
            <div className="shotiq-panel-head">
              <span>Session target</span>
              <strong>{targetScatter.bullseyeHits}/{targetScatter.targetLimit}</strong>
            </div>
            <div className="shotiq-target-metric-grid">
              <div className="shotiq-target-metric-card">
                <span>Carry delta</span>
                <strong>{formatMetricValue("carry", targetScatter.carryDelta)}</strong>
              </div>
              <div className="shotiq-target-metric-card">
                <span>Launch delta</span>
                <strong>{formatMetricValue("vla", targetScatter.vlaDelta)}</strong>
              </div>
              <div className="shotiq-target-metric-card">
                <span>Start line</span>
                <strong>{formatMetricValue("hla", targetScatter.startLineBias)}</strong>
              </div>
              <div className="shotiq-target-metric-card">
                <span>Bullseye hits</span>
                <strong>{targetScatter.bullseyeHits}/{targetScatter.targetLimit}</strong>
              </div>
            </div>
          </section>

          <section className="shotiq-panel">
            <div className="shotiq-panel-head">
              <span>Session fit</span>
              <strong>{data.effectiveShots.length}</strong>
            </div>
            <div className="shotiq-summary-list">
              {data.metricRows.map((row) => (
                <div key={row.key} className="shotiq-summary-row">
                  <div className="shotiq-summary-head">
                    <strong>{row.label}</strong>
                    <span className={`shotiq-summary-delta is-${row.tone}`}>{formatMetricValue(row.key, row.meanError)}</span>
                  </div>
                  <div className="shotiq-summary-bar">
                    <span className={`is-${row.tone}`} style={{ width: `${Math.max(8, row.score)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="shotiq-panel">
            <div className="shotiq-panel-head">
              <span>Baseline window</span>
              <strong>{targetScatter.targetClub}</strong>
            </div>
            <div className="shotiq-control-grid">
              <div className="shotiq-grid-control is-active">Carry {formatRange(selectedBaseline.carryRange, "yd")}</div>
              <div className="shotiq-grid-control is-active">Launch {formatRange(selectedBaseline.launchRange, "°")}</div>
              <div className="shotiq-grid-control is-active">Spin {formatRange(selectedBaseline.spinRange, "rpm")}</div>
              <div className="shotiq-grid-control is-active">Start line ±{selectedBaseline.hlaOkayMax.toFixed(1)}°</div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ShotTargetScatter({ map, showPoints }: { map: TargetScatterData; showPoints: boolean }) {
  const [hoveredPointKey, setHoveredPointKey] = useState<string | null>(null);
  const hoveredPoint = showPoints ? map.points.find((point) => point.key === hoveredPointKey) ?? null : null;

  return (
    <div className="shotiq-drift-map-shell">
      <svg
        className="shotiq-drift-map"
        viewBox="0 0 420 320"
        role="img"
        aria-label={`${map.targetClub} session target scatter`}
      >
        <defs>
          <radialGradient id="shotiqTargetGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(106,216,124,0.22)" />
            <stop offset="100%" stopColor="rgba(106,216,124,0)" />
          </radialGradient>
        </defs>

        <circle cx="210" cy="160" r="118" className="shotiq-target-ring is-outer" />
        <circle cx="210" cy="160" r="78" className="shotiq-target-ring is-mid" />
        <circle cx="210" cy="160" r="42" className="shotiq-target-ring is-inner" />
        <circle cx="210" cy="160" r="17" className="shotiq-target-core" />
        <circle cx="210" cy="160" r="88" fill="url(#shotiqTargetGlow)" />

        {showPoints ? (
          <g className="shotiq-target-points">
            {map.points.map((point) => (
              <g
                key={point.key}
                transform={`translate(${point.x} ${point.y})`}
                className={`shotiq-target-point ${hoveredPointKey === point.key ? "is-hovered" : ""}`}
                onPointerEnter={() => setHoveredPointKey(point.key)}
                onPointerLeave={() => setHoveredPointKey((current) => (current === point.key ? null : current))}
                aria-label={point.tooltipTitle}
              >
                <circle className="shotiq-target-hit-area" r="22" />
                {point.latest ? <circle r="18" className={`shotiq-target-shot-glow is-${point.grade}`} /> : null}
                <circle className={`shotiq-target-shot-dot is-${point.grade}`} r="11" />
                <text className="shotiq-target-shot-label" y="4">{point.label}</text>
              </g>
            ))}
          </g>
        ) : null}

        <text x="210" y="30" textAnchor="middle" className="shotiq-target-axis-label">High launch</text>
        <text x="210" y="308" textAnchor="middle" className="shotiq-target-axis-label">Low launch</text>
        <text x="44" y="164" textAnchor="start" className="shotiq-target-axis-label">Left</text>
        <text x="376" y="164" textAnchor="end" className="shotiq-target-axis-label">Right</text>
      </svg>

      {hoveredPoint ? (
        <div className="shotiq-drift-tooltip-card" aria-hidden="true">
          <div className="shotiq-drift-tooltip-title">{hoveredPoint.tooltipTitle}</div>
          {hoveredPoint.tooltipLines.map((line, index) => (
            <div key={`${hoveredPoint.key}-${index}`} className="shotiq-drift-tooltip-line">
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildTargetScatter(shots: Shot[]): TargetScatterData {
  const visibleShots = shots.slice(-TARGET_SCATTER_LIMIT);
  const firstVisibleShotNumber = shots.length - visibleShots.length + 1;
  const profile = getClubTargetProfile(visibleShots[visibleShots.length - 1]?.club ?? "7-Iron");
  const centerX = 210;
  const centerY = 160;
  const spreadX = 104;
  const spreadY = 88;
  const points = visibleShots.map((shot, index, list) => {
    const shotProfile = getClubTargetProfile(shot.club);
    const evaluation = evaluateShotForClub(shot);
    const normalizedX = clamp(shot.pr.hla / Math.max(shotProfile.hlaOkayMax * 1.15, 0.001), -1.15, 1.15);
    const normalizedY = clamp((shot.pr.vla - shotProfile.launchCenter) / Math.max(shotProfile.launchOkayRadius * 1.15, 0.001), -1.15, 1.15);

    const shotNumber = firstVisibleShotNumber + index;

    return {
      key: String(shot.id),
      x: centerX + normalizedX * spreadX,
      y: centerY - normalizedY * spreadY,
      latest: index === list.length - 1,
      grade: evaluation.grade,
      label: String(shotNumber),
      tooltipTitle: `Shot ${shotNumber} · ${shot.club} · ${evaluation.grade.toUpperCase()}`,
      tooltipLines: formatShotTooltipLines(shot),
    };
  });

  const carryDelta = visibleShots.length ? +(average(visibleShots.map((shot) => {
    const shotProfile = getClubTargetProfile(shot.club);
    return shot.pr.carry - shotProfile.carryCenter;
  })).toFixed(0)) : 0;
  const vlaDelta = visibleShots.length ? +(average(visibleShots.map((shot) => {
    const shotProfile = getClubTargetProfile(shot.club);
    return shot.pr.vla - shotProfile.launchCenter;
  })).toFixed(1)) : 0;
  const startLineBias = visibleShots.length ? +(average(visibleShots.map((shot) => shot.pr.hla))).toFixed(1) : 0;
  const bullseyeHits = points.filter((point) => point.grade === "good").length;
  const horizontalLabel = Math.abs(startLineBias) < 0.25 ? "center" : startLineBias > 0 ? "right" : "left";
  const verticalLabel = Math.abs(vlaDelta) < 0.35 ? "center" : vlaDelta > 0 ? "high" : "low";
  const biasLabel =
    visibleShots.length === 0
      ? "Awaiting session shots"
      : horizontalLabel === "center" && verticalLabel === "center"
        ? "Centered strike window"
        : `${verticalLabel === "center" ? "" : `${verticalLabel}-`}${horizontalLabel}`;

  return {
    carryDelta,
    vlaDelta,
    startLineBias,
    bullseyeHits,
    evaluatedShotCount: visibleShots.length,
    targetLimit: TARGET_SCATTER_LIMIT,
    targetCarry: profile.carryCenter,
    targetVla: profile.launchCenter,
    targetClub: profile.club,
    points,
    biasLabel,
  };
}

function sessionToShots(session: Session): Shot[] {
  return session.shots.map((shot, index) => ({
    id: shot.id,
    club: session.club,
    timestamp: new Date(session.createdAt + index * 45000).toISOString(),
    pr: shot.pr,
    tm: shot.tm,
    trackPts: shot.trackPts,
  }));
}

function buildDashboardData(shots: Shot[]): DashboardData {
  const effectiveShots = shots.slice(-30);
  const previewMode = !effectiveShots.length;
  const clubLabel = effectiveShots[effectiveShots.length - 1]?.club ?? "7-Iron";
  const metricRows = FOCUS_METRICS.map((metric) => summarizeMetric(metric, effectiveShots));
  const scoreWeights = getMetricWeights(clubLabel);
  const weightedScoreTotal = metricRows.reduce((sum, row) => sum + row.score * scoreWeights[row.key], 0);
  const weightTotal = metricRows.reduce((sum, row) => sum + scoreWeights[row.key], 0);
  const overallScore = effectiveShots.length
    ? Math.round(weightedScoreTotal / Math.max(weightTotal, 0.001))
    : 0;
  const tendencies = buildTendencies(effectiveShots);
  const focusMetric = metricRows.find((row) => row.key === "carry") ?? metricRows[0];
  const recentMeanAbs = average(metricRows.map((row) => row.meanAbsError));
  const trendTone = toneFromMagnitude(recentMeanAbs, 0.6, 1.6);
  const trendLabel = trendTone === "good" ? "centered" : trendTone === "warn" ? "workable" : "drifting";

  return {
    clubLabel,
    effectiveShots,
    previewMode,
    overallScore,
    metricRows,
    trendLabel,
    trendTone,
    tendencies,
    prompt: buildPrompt(metricRows, tendencies[0], overallScore, previewMode),
    focusNote: previewMode
      ? "Save and select a session to score your pattern against the club's target window."
      : `${focusMetric.label} is averaging ${formatMetricValue(focusMetric.key, focusMetric.meanError)} with ${focusMetric.passRate}% of session shots inside the goal window.`,
  };
}

function summarizeMetric(metric: MetricKey, shots: Shot[]): MetricSummary {
  const targets = shots.map((shot) => getClubTargetProfile(shot.club));
  const errors = shots.map((shot, index) => metricError(metric, shot.pr[metric], targets[index]));
  const meanError = shots.length ? average(errors) : 0;
  const meanAbsError = shots.length ? average(errors.map((value) => Math.abs(value))) : 0;
  const latestError = errors[errors.length - 1] ?? 0;
  const passRate = shots.length
    ? Math.round((errors.filter((value, index) => Math.abs(value) <= metricPassThreshold(metric, targets[index])).length / shots.length) * 100)
    : 0;
  const meanOkayWindow = targets.length
    ? average(targets.map((target) => metricScoreScale(metric, target)))
    : metricScoreScale(metric, getClubTargetProfile("7-Iron"));
  const latestTarget = targets[targets.length - 1] ?? getClubTargetProfile("7-Iron");
  const score = shots.length
    ? Math.max(34, Math.round(100 - Math.min(meanAbsError / Math.max(meanOkayWindow, 0.001), 1) * 62))
    : 0;
  const toneThresholds = metricToneThresholds(metric, latestTarget);

  return {
    key: metric,
    label: METRIC_META[metric].label,
    meanError: +meanError.toFixed(1),
    meanAbsError: +meanAbsError.toFixed(1),
    latestError: +latestError.toFixed(1),
    passRate,
    score,
    tone: toneFromMagnitude(meanAbsError, toneThresholds.good, toneThresholds.warn),
    sampleSize: shots.length,
  };
}

function buildTendencies(shots: Shot[]): TendencyCard[] {
  if (!shots.length) {
    return [{
      id: "empty",
      label: "Awaiting session",
      detail: "Start or select a saved session and Shot IQ will score its pattern against the club baseline.",
      tone: "neutral",
    }];
  }

  const speedSeries = shots.slice(-5).map((shot) => shot.pr.speed);
  const spinSeries = shots.slice(-5).map((shot) => shot.pr.spin);
  const hlaSeries = shots.slice(-5).map((shot) => shot.pr.hla);
  const tendencies: TendencyCard[] = [];

  if (spinSeries.length >= 3 && average(spinSeries.slice(-3)) > average(spinSeries) + 120) {
    tendencies.push({
      id: "spin-rise",
      label: "Spin climb",
      detail: "Spin is climbing above the current club window. Check strike height before chasing a swing rebuild.",
      tone: "warn",
    });
  }

  if (speedSeries.length >= 4 && Math.max(...speedSeries) - Math.min(...speedSeries) < 1.2) {
    tendencies.push({
      id: "speed-plateau",
      label: "Speed plateau",
      detail: "Ball speed is very flat. Keep the same strike feel and look for cleaner launch before adding effort.",
      tone: "neutral",
    });
  }

  if (hlaSeries.length >= 4 && average(hlaSeries.slice(-4)) > 0.8) {
    tendencies.push({
      id: "right-start",
      label: "Right-start pattern",
      detail: "Your start line is living right of center. Keep the launch window and move face delivery back toward zero.",
      tone: "bad",
    });
  }

  if (!tendencies.length) {
    tendencies.push({
      id: "stable-window",
      label: "Stable window",
      detail: "Your latest shots are living in a repeatable window. Keep the same intent and pressure the center.",
      tone: "good",
    });
  }

  return tendencies;
}

function buildPrompt(
  metrics: MetricSummary[],
  tendency: TendencyCard,
  overallScore: number,
  previewMode: boolean
) {
  const bestMetric = [...metrics].sort((left, right) => right.score - left.score)[0];
  const riskMetric = [...metrics].sort((left, right) => left.score - right.score)[0];

  if (previewMode) {
    return "Save a session, then select it here. Shot IQ will score only those shots against the selected club window.";
  }

  return `Session fit is ${overallScore}. ${riskMetric.label} is the biggest leak right now, while ${bestMetric.label} is the closest to center. ${tendency.detail}`;
}

function toneFromMagnitude(value: number, goodMax: number, warnMax: number): Tone {
  if (value <= goodMax) return "good";
  if (value <= warnMax) return "warn";
  return "bad";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatMetricValue(metric: MetricKey, value: number) {
  switch (metric) {
    case "speed":
      return `${value > 0 ? "+" : ""}${value.toFixed(1)} mph`;
    case "vla":
    case "hla":
      return `${value > 0 ? "+" : ""}${value.toFixed(1)}°`;
    case "carry":
      return `${value > 0 ? "+" : ""}${value.toFixed(0)} yd`;
    case "spin":
      return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()} rpm`;
    default:
      return `${value}`;
  }
}

function formatRange(range: [number, number], unit: string) {
  return `${range[0]}-${range[1]} ${unit}`;
}

function formatGoalLabel(metric: MetricKey, club: string) {
  const target = getClubTargetProfile(club);
  switch (metric) {
    case "carry":
      return `goal ${formatRange(target.carryRange, "yd")}`;
    case "speed":
      return `goal ${formatRange(target.speedRange, "mph")}`;
    case "vla":
      return `goal ${formatRange(target.launchRange, "°")}`;
    case "spin":
      return `goal ${formatRange(target.spinRange, "rpm")}`;
    case "hla":
      return `goal ±${target.hlaOkayMax.toFixed(1)}°`;
    default:
      return "goal window";
  }
}

function metricError(metric: MetricKey, value: number, target: ReturnType<typeof getClubTargetProfile>) {
  switch (metric) {
    case "speed":
      return value - target.speedCenter;
    case "vla":
      return value - target.launchCenter;
    case "hla":
      return value;
    case "carry":
      return value - target.carryCenter;
    case "spin":
      return value - target.spinCenter;
    default:
      return value;
  }
}

function metricPassThreshold(metric: MetricKey, target: ReturnType<typeof getClubTargetProfile>) {
  switch (metric) {
    case "speed":
      return target.speedGoodRadius;
    case "vla":
      return target.launchGoodRadius;
    case "hla":
      return target.hlaGoodMax;
    case "carry":
      return target.carryGoodRadius;
    case "spin":
      return target.spinGoodRadius;
    default:
      return 0;
  }
}

function metricScoreScale(metric: MetricKey, target: ReturnType<typeof getClubTargetProfile>) {
  switch (metric) {
    case "speed":
      return target.speedOkayRadius;
    case "vla":
      return target.launchOkayRadius;
    case "hla":
      return target.hlaOkayMax;
    case "carry":
      return target.carryOkayRadius;
    case "spin":
      return target.spinOkayRadius;
    default:
      return 1;
  }
}

function metricToneThresholds(metric: MetricKey, target: ReturnType<typeof getClubTargetProfile>) {
  return {
    good: metricPassThreshold(metric, target),
    warn: metricScoreScale(metric, target),
  };
}

function formatSessionStamp(createdAt: number) {
  const date = new Date(createdAt);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return `${day} · ${time}`;
}

function formatShotTooltipLines(shot: Shot) {
  return [
    `Speed: ${shot.pr.speed.toFixed(1)} mph`,
    `VLA: ${shot.pr.vla.toFixed(1)}°`,
    `HLA: ${shot.pr.hla.toFixed(1)}°`,
    `Carry: ${shot.pr.carry.toFixed(1)} yd`,
    `Spin: ${Math.round(shot.pr.spin)} rpm`,
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function evaluateShotForClub(shot: Shot) {
  const target = getClubTargetProfile(shot.club);
  const launchGood = Math.abs(shot.pr.vla - target.launchCenter) <= target.launchGoodRadius;
  const launchOkay = Math.abs(shot.pr.vla - target.launchCenter) <= target.launchOkayRadius;
  const lineGood = Math.abs(shot.pr.hla) <= target.hlaGoodMax;
  const lineOkay = Math.abs(shot.pr.hla) <= target.hlaOkayMax;

  if (target.scoring === "control") {
    if (launchGood && lineGood) return { grade: "good" as ShotGrade };
    if (launchOkay && lineOkay) return { grade: "okay" as ShotGrade };
    return { grade: "bad" as ShotGrade };
  }

  const checks = [
    Math.abs(shot.pr.carry - target.carryCenter) <= target.carryGoodRadius,
    launchGood,
    lineGood,
    Math.abs(shot.pr.speed - target.speedCenter) <= target.speedGoodRadius,
    Math.abs(shot.pr.spin - target.spinCenter) <= target.spinGoodRadius,
  ];
  const okayChecks = [
    Math.abs(shot.pr.carry - target.carryCenter) <= target.carryOkayRadius,
    launchOkay,
    lineOkay,
    Math.abs(shot.pr.speed - target.speedCenter) <= target.speedOkayRadius,
    Math.abs(shot.pr.spin - target.spinCenter) <= target.spinOkayRadius,
  ];

  if (checks.every(Boolean)) return { grade: "good" as ShotGrade };
  if (okayChecks.every(Boolean)) return { grade: "okay" as ShotGrade };
  return { grade: "bad" as ShotGrade };
}

function getClubTargetProfile(club: string) {
  const baseline = getClubBaseline(club);
  return {
    club: normalizeClubBaselineKey(club),
    carryRange: baseline.carryRange,
    launchRange: baseline.launchRange,
    speedRange: baseline.speedRange,
    spinRange: baseline.spinRange,
    carryCenter: rangeCenter(baseline.carryRange),
    launchCenter: rangeCenter(baseline.launchRange),
    speedCenter: rangeCenter(baseline.speedRange),
    spinCenter: rangeCenter(baseline.spinRange),
    carryGoodRadius: baselineGoodRadius(baseline.carryRange),
    launchGoodRadius: baselineGoodRadius(baseline.launchRange),
    speedGoodRadius: baselineGoodRadius(baseline.speedRange),
    spinGoodRadius: baselineGoodRadius(baseline.spinRange),
    carryOkayRadius: rangeRadius(baseline.carryRange),
    launchOkayRadius: rangeRadius(baseline.launchRange),
    speedOkayRadius: rangeRadius(baseline.speedRange),
    spinOkayRadius: rangeRadius(baseline.spinRange),
    hlaGoodMax: baseline.hlaGoodMax,
    hlaOkayMax: baseline.hlaOkayMax,
    scoring: baseline.scoring,
  };
}

function getMetricWeights(club: string): Record<MetricKey, number> {
  const scoring = getClubTargetProfile(club).scoring;

  if (scoring === "control") {
    return {
      vla: 0.38,
      hla: 0.38,
      spin: 0.12,
      speed: 0.07,
      carry: 0.05,
    };
  }

  if (scoring === "distance") {
    return {
      speed: 0.25,
      carry: 0.25,
      vla: 0.2,
      spin: 0.18,
      hla: 0.12,
    };
  }

  return {
    speed: 0.2,
    carry: 0.22,
    vla: 0.25,
    hla: 0.22,
    spin: 0.11,
  };
}
