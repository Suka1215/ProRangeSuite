import React, { useEffect, useMemo, useState } from "react";
import { METRIC_META, METRICS, PASS_THRESHOLD } from "../../../constants";
import { calcSessionStats, pctError } from "../../../utils/stats";
import type { MetricKey, Session, Shot } from "../../../types";

type StudioMode = "drift" | "tendencies" | "calibration";
type Tone = "good" | "warn" | "bad" | "neutral";
type ShotGrade = "good" | "okay" | "bad";

interface ShotIQDashboardProps {
  shots: Shot[];
  sessions: Session[];
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
  spark: number[];
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
  driftBars: { label: string; value: number; tone: Tone }[];
  tendencies: TendencyCard[];
  prompt: string;
  focusNote: string;
}

interface DriftCell {
  key: string;
  x: number;
  y: number;
}

interface DriftPoint {
  key: string;
  x: number;
  y: number;
  latest: boolean;
  grade: ShotGrade;
  label: string;
  tooltipTitle: string;
  tooltipLines: string[];
}

interface DriftMapData {
  cells: DriftCell[];
  points: DriftPoint[];
  biasLabel: string;
}

const MODE_LABELS: Record<StudioMode, { eyebrow: string; title: string; blurb: string }> = {
  drift: {
    eyebrow: "Drift Analysis",
    title: "Shot Drift",
    blurb: "Read your last few matched shots against the current baseline window.",
  },
  tendencies: {
    eyebrow: "Tendency Engine",
    title: "Pattern Read",
    blurb: "Surface the repeated miss patterns building inside the current session.",
  },
  calibration: {
    eyebrow: "Calibration Score",
    title: "TrackMan Fit",
    blurb: "Score the overall match quality and per-metric confidence against TrackMan.",
  },
};

const FOCUS_METRICS: MetricKey[] = ["carry", "speed", "vla", "spin", "hla"];

interface SymmetricRangeThreshold {
  good: [number, number];
  okay: [number, number];
}

interface LaunchAngleThreshold {
  good: [number, number];
  okayLow: [number, number];
  okayHigh: [number, number];
}

interface DirectionThreshold {
  goodMax: number;
  okayMax: number;
}

interface ClubShotThreshold {
  speed: SymmetricRangeThreshold;
  vla: LaunchAngleThreshold;
  hla: DirectionThreshold;
}

const CLUB_SHOT_THRESHOLDS: Record<string, ClubShotThreshold> = {
  "Driver": {
    speed: { good: [145, 167], okay: [125, 144] },
    vla: { good: [10, 13], okayLow: [8, 9], okayHigh: [14, 16] },
    hla: { goodMax: 1.5, okayMax: 3 },
  },
  "3-Wood": {
    speed: { good: [135, 155], okay: [115, 134] },
    vla: { good: [9, 12], okayLow: [7, 8], okayHigh: [13, 15] },
    hla: { goodMax: 2, okayMax: 4 },
  },
  "5-Wood": {
    speed: { good: [128, 148], okay: [108, 127] },
    vla: { good: [10, 13], okayLow: [8, 9], okayHigh: [14, 16] },
    hla: { goodMax: 2, okayMax: 4 },
  },
  "Hybrid": {
    speed: { good: [118, 138], okay: [100, 117] },
    vla: { good: [11, 14], okayLow: [9, 10], okayHigh: [15, 17] },
    hla: { goodMax: 2, okayMax: 4 },
  },
  "3-Iron": {
    speed: { good: [110, 130], okay: [93, 109] },
    vla: { good: [10, 13], okayLow: [8, 9], okayHigh: [14, 16] },
    hla: { goodMax: 2, okayMax: 5 },
  },
  "4-Iron": {
    speed: { good: [106, 126], okay: [90, 105] },
    vla: { good: [11, 14], okayLow: [9, 10], okayHigh: [15, 17] },
    hla: { goodMax: 2, okayMax: 5 },
  },
  "5-Iron": {
    speed: { good: [100, 120], okay: [84, 99] },
    vla: { good: [12, 15], okayLow: [10, 11], okayHigh: [16, 18] },
    hla: { goodMax: 2, okayMax: 5 },
  },
  "6-Iron": {
    speed: { good: [96, 115], okay: [80, 95] },
    vla: { good: [14, 17], okayLow: [12, 13], okayHigh: [18, 20] },
    hla: { goodMax: 2, okayMax: 5 },
  },
  "7-Iron": {
    speed: { good: [90, 110], okay: [75, 89] },
    vla: { good: [16, 19], okayLow: [14, 15], okayHigh: [20, 22] },
    hla: { goodMax: 2, okayMax: 5 },
  },
  "8-Iron": {
    speed: { good: [84, 103], okay: [70, 83] },
    vla: { good: [18, 21], okayLow: [16, 17], okayHigh: [22, 24] },
    hla: { goodMax: 2, okayMax: 5 },
  },
  "9-Iron": {
    speed: { good: [78, 96], okay: [64, 77] },
    vla: { good: [20, 23], okayLow: [18, 19], okayHigh: [24, 26] },
    hla: { goodMax: 2, okayMax: 5 },
  },
  "PW": {
    speed: { good: [72, 88], okay: [58, 71] },
    vla: { good: [24, 27], okayLow: [21, 23], okayHigh: [28, 31] },
    hla: { goodMax: 2, okayMax: 6 },
  },
  "GW": {
    speed: { good: [66, 82], okay: [53, 65] },
    vla: { good: [26, 30], okayLow: [23, 25], okayHigh: [31, 34] },
    hla: { goodMax: 2, okayMax: 6 },
  },
  "SW": {
    speed: { good: [60, 76], okay: [47, 59] },
    vla: { good: [28, 33], okayLow: [25, 27], okayHigh: [34, 37] },
    hla: { goodMax: 2, okayMax: 6 },
  },
  "LW": {
    speed: { good: [54, 70], okay: [42, 53] },
    vla: { good: [31, 35], okayLow: [28, 30], okayHigh: [36, 38] },
    hla: { goodMax: 2, okayMax: 7 },
  },
};

const CLUB_THRESHOLD_ALIASES: Record<string, string> = {
  driver: "Driver",
  "3-wood": "3-Wood",
  "3 wood": "3-Wood",
  "5-wood": "5-Wood",
  "5 wood": "5-Wood",
  hybrid: "Hybrid",
  "3-hybrid": "Hybrid",
  "3 hybrid": "Hybrid",
  "3-iron": "3-Iron",
  "3 iron": "3-Iron",
  "4-iron": "4-Iron",
  "4 iron": "4-Iron",
  "5-iron": "5-Iron",
  "5 iron": "5-Iron",
  "6-iron": "6-Iron",
  "6 iron": "6-Iron",
  "7-iron": "7-Iron",
  "7 iron": "7-Iron",
  "8-iron": "8-Iron",
  "8 iron": "8-Iron",
  "9-iron": "9-Iron",
  "9 iron": "9-Iron",
  pw: "PW",
  "pitching wedge": "PW",
  gw: "GW",
  "gap wedge": "GW",
  sw: "SW",
  "sand wedge": "SW",
  lw: "LW",
  "lob wedge": "LW",
};

export default function ShotIQDashboard({ shots, sessions, tmReady }: ShotIQDashboardProps) {
  const mode: StudioMode = "calibration";
  const [focusMetric, setFocusMetric] = useState<MetricKey>("carry");
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (left, right) => right.createdAt - left.createdAt || right.date.localeCompare(left.date)
      ),
    [sessions]
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sortedSessions[0]?.id ?? null);

  useEffect(() => {
    if (!sortedSessions.length) {
      setSelectedSessionId(null);
      return;
    }

    setSelectedSessionId((current) =>
      current && sortedSessions.some((session) => session.id === current) ? current : sortedSessions[0].id
    );
  }, [sortedSessions]);

  const selectedSession =
    sortedSessions.find((session) => session.id === selectedSessionId) ?? sortedSessions[0] ?? null;
  const analysisShots = useMemo(
    () => (selectedSession ? sessionToShots(selectedSession) : shots),
    [selectedSession, shots]
  );
  const data = useMemo(() => buildDashboardData(analysisShots, tmReady), [analysisShots, tmReady]);
  const driftMap = useMemo(
    () => buildDriftMap(data.effectiveShots, focusMetric),
    [data.effectiveShots, focusMetric]
  );
  const focusRow = data.metricRows.find((row) => row.key === focusMetric) ?? data.metricRows[0];
  const modeCopy = MODE_LABELS[mode];

  return (
    <div className="shotiq-shell">
      <div className="shotiq-toolbar">
        <div className="shotiq-toolbar-center">
          <span>{modeCopy.eyebrow}</span>
          <strong>SHOT IQ STUDIO</strong>
          <em>
            {selectedSession
              ? `${selectedSession.club} · ${selectedSession.shots.length} shots · ${formatSessionStamp(
                  selectedSession.createdAt
                )}`
              : data.previewMode
              ? "Preview calibration layer"
              : "TrackMan matched intelligence"}
          </em>
        </div>
      </div>

      <div className="shotiq-workbench">
        <aside className="shotiq-column shotiq-column-left">
          <button className="shotiq-corner-button" aria-label="Close mode picker">×</button>

          <section className="shotiq-panel shotiq-session-picker-panel">
            <div className="shotiq-panel-head">
              <span>Recent sessions</span>
              <strong>{sortedSessions.length}</strong>
            </div>

            <p className="shotiq-session-picker-copy">
              {sortedSessions.length
                ? "Newest first. Pick a saved session to drive the Shot IQ drift and calibration view."
                : "Saved sessions will appear here once you log your first matched practice run."}
            </p>

            {selectedSession ? (
              <div className="shotiq-session-feature">
                <div className="shotiq-session-feature-head">
                  <span className="shotiq-session-feature-label">Active session</span>
                  <span
                    className="shotiq-session-color-dot"
                    style={{ background: selectedSession.color ?? "#6ad87c" }}
                  />
                </div>
                <strong>{selectedSession.label || selectedSession.version}</strong>
                <p>
                  {selectedSession.version} · {selectedSession.club} · {selectedSession.shots.length} shots
                </p>
              </div>
            ) : null}

            <div className="shotiq-session-list">
              {sortedSessions.length ? sortedSessions.map((session, index) => {
                const stats = calcSessionStats(session);
                const primaryStat = stats.carry ?? stats.vla ?? stats.speed ?? stats.spin ?? stats.hla ?? null;
                const carryMean = average(session.shots.map((shot) => shot.pr.carry));
                const isActive = session.id === selectedSession?.id;

                return (
                  <button
                    key={session.id}
                    className={`shotiq-session-card ${isActive ? "is-active" : ""}`}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <div className="shotiq-session-card-top">
                      <span className="shotiq-session-rank">
                        {index === 0 ? "Latest" : `#${String(index + 1).padStart(2, "0")}`}
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
                    <p>
                      {session.version} · {session.club}
                    </p>

                    <div className="shotiq-session-meta">
                      <span>{session.shots.length} shots</span>
                      <span>{Math.round(carryMean)} yd</span>
                      <span className={`shotiq-session-pass is-${primaryStat?.passRate && primaryStat.passRate >= 72 ? "good" : "neutral"}`}>
                        {primaryStat ? `${Math.round(primaryStat.passRate)}% pass` : "Preview"}
                      </span>
                    </div>
                  </button>
                );
              }) : (
                <button
                  className="shotiq-session-empty"
                  onClick={() => {}}
                  type="button"
                  disabled
                >
                  <strong>No saved sessions yet</strong>
                  <span>Shot IQ will fall back to the live shot feed until you save a session.</span>
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
              <span>overall</span>
              <strong>{data.overallScore}</strong>
              <em className={`is-${data.trendTone}`}>{data.trendLabel}</em>
            </div>

            <div className="shotiq-floating-card shotiq-floating-card-pulse">
              <span className="shotiq-floating-label">Session pulse</span>
              <div className="shotiq-badge-stack">
                {data.driftBars.slice(0, 3).map((bar) => (
                  <span key={bar.label} className={`shotiq-mini-badge is-${bar.tone}`}>
                    {bar.label} {bar.value > 0 ? "+" : ""}
                    {bar.value.toFixed(1)}
                  </span>
                ))}
              </div>
              <span className="shotiq-floating-ai">AI</span>
            </div>
          </div>

          <div className="shotiq-stage-body">
            <div className="shotiq-stage-tag-stack">
              <div className="shotiq-hero-tag">
                <span>{focusRow.label}</span>
                <strong>{formatSigned(focusRow.latestError)}</strong>
                <em>{METRIC_META[focusMetric].tolerance} target window</em>
              </div>
              <div className="shotiq-hero-pip">TM</div>
            </div>

            <div className="shotiq-drift-field">
              <div className="shotiq-hero-blob" />
              <ShotDriftMap map={driftMap} focusMetric={focusMetric} />
              <div className="shotiq-drift-caption">
                <span>Drift field</span>
                <strong>{driftMap.biasLabel}</strong>
                <em>HLA start line against VLA delta from the club target</em>
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
                <em>{focusRow.sampleSize} matched shots in range</em>
              </div>
              <div className="shotiq-hero-pip">IQ</div>
            </div>
          </div>

          <div className="shotiq-prompt-card">
            <button className="shotiq-prompt-close" aria-label="Collapse insight">
              ×
            </button>
            <div className="shotiq-prompt-head">
              <strong>ShotIQ Insight</strong>
              <span>{selectedSession ? selectedSession.version : modeCopy.title}</span>
            </div>
            <p>{data.prompt}</p>
            <div className="shotiq-prompt-subcopy">{data.focusNote}</div>
            <div className="shotiq-prompt-footer">
              <span className={`shotiq-status-dot is-${data.trendTone}`} />
              <span>{data.previewMode ? "Preview baseline active" : "TrackMan reference active"}</span>
              <button className="shotiq-prompt-send" aria-label="Send prompt">
                ↗
              </button>
            </div>
          </div>
        </main>

        <aside className="shotiq-column shotiq-column-right">
          <section className="shotiq-panel">
            <div className="shotiq-panel-head">
              <span>Calibration score</span>
              <strong>1</strong>
            </div>
            <div className="shotiq-score-grid">
              {data.metricRows.map((row) => (
                <button
                  key={row.key}
                  className={`shotiq-score-card ${focusMetric === row.key ? "is-active" : ""}`}
                  onClick={() => setFocusMetric(row.key)}
                >
                  <span>{row.label}</span>
                  <strong>{row.score}</strong>
                  <ScoreDots tone={row.tone} />
                </button>
              ))}
            </div>
          </section>

          <section className="shotiq-panel">
            <div className="shotiq-panel-head">
              <span>TrackMan matched</span>
              <strong>{data.effectiveShots.length}</strong>
            </div>
            <div className="shotiq-summary-list">
              {data.metricRows.map((row) => (
                <div key={row.key} className="shotiq-summary-row">
                  <div className="shotiq-summary-head">
                    <strong>{row.label}</strong>
                    <span className={`shotiq-summary-delta is-${row.tone}`}>{formatSigned(row.meanError)}</span>
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
              <span>Zoom</span>
              <strong>{selectedSession ? "set" : "live"}</strong>
            </div>
            <div className="shotiq-control-grid">
              <button className="shotiq-grid-control">Last 5</button>
              <button className="shotiq-grid-control">Last 10</button>
              <button className="shotiq-grid-control is-active">Matched</button>
              <button className="shotiq-grid-control">Focus</button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ScoreDots({ tone }: { tone: Tone }) {
  return (
    <span className={`shotiq-score-dots is-${tone}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

function ShotDriftMap({ map, focusMetric }: { map: DriftMapData; focusMetric: MetricKey }) {
  const [hoveredPointKey, setHoveredPointKey] = useState<string | null>(null);
  const hoveredPoint = map.points.find((point) => point.key === hoveredPointKey) ?? null;

  return (
    <div className="shotiq-drift-map-shell">
      <svg
        className="shotiq-drift-map"
        viewBox="0 0 520 420"
        role="img"
        aria-label={`${METRIC_META[focusMetric].label} drift map`}
      >
        <defs>
          <filter id="shotiqDriftGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="shotiq-drift-origin" transform="translate(260 210)">
          <circle className="shotiq-drift-origin-halo" r="44" />
          <circle className="shotiq-drift-origin-ring is-outer" r="32" />
          <circle className="shotiq-drift-origin-ring is-inner" r="19" />
          <circle className="shotiq-drift-origin-core" r="9.6" />
        </g>

        <g className="shotiq-drift-points">
          {map.points.map((point) => (
            <g
              key={point.key}
              transform={`translate(${point.x} ${point.y})`}
              className={`shotiq-drift-point ${hoveredPointKey === point.key ? "is-hovered" : ""}`}
              onPointerEnter={() => setHoveredPointKey(point.key)}
              onPointerLeave={() => setHoveredPointKey((current) => (current === point.key ? null : current))}
              aria-label={point.tooltipTitle}
            >
              <circle className="shotiq-drift-hit-area" r="24" />
              {point.latest ? (
                <circle
                  r="18"
                  className={`shotiq-drift-shot-glow is-${point.grade}`}
                  filter="url(#shotiqDriftGlow)"
                />
              ) : null}
              <circle className={`shotiq-drift-shot-dot is-${point.grade}`} r="14" />
              <text className="shotiq-drift-shot-label" y="1">
                {point.label}
              </text>
            </g>
          ))}
        </g>
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

function buildDriftMap(shots: Shot[], focusMetric: MetricKey): DriftMapData {
  const centerX = 260;
  const centerY = 210;
  const spreadX = 120;
  const spreadY = 102;
  const radius = 6;
  const rawPoints = shots.slice(-8).map((shot, index, list) => {
    const evaluation = evaluateShotForClub(shot);
    const thresholdKey = normalizeClubThresholdKey(shot.club);
    const thresholds = CLUB_SHOT_THRESHOLDS[thresholdKey] ?? CLUB_SHOT_THRESHOLDS["7-Iron"];
    const vlaTarget = average(thresholds.vla.good);
    const hlaDelta = shot.pr.hla;
    const vlaDelta = shot.pr.vla - vlaTarget;
    const normalizedX = clamp(hlaDelta / Math.max(thresholds.hla.okayMax, 0.001), -1.15, 1.15);
    const normalizedY = clamp(vlaDelta / vlaSpreadForMap(thresholds.vla), -1.15, 1.15);
    const directionX = normalizedX === 0 && normalizedY === 0 ? 0 : normalizedX;
    const directionY = normalizedX === 0 && normalizedY === 0 ? -0.12 : -normalizedY;
    const angle = Math.atan2(directionY, directionX || 0.0001);
    const radiusBand = radialBandForGrade(evaluation.grade);
    const radiusScale = clamp(evaluation.severity, 0, 1);
    const radiusDistance = radiusBand.min + (radiusBand.max - radiusBand.min) * radiusScale;

    return {
      key: String(shot.id),
      x: centerX + Math.cos(angle) * radiusDistance,
      y: centerY + Math.sin(angle) * radiusDistance,
      latest: index === list.length - 1,
      grade: evaluation.grade,
      label: String(index + 1),
      tooltipTitle: `Shot ${index + 1} · ${shot.club} · ${evaluation.grade.toUpperCase()}`,
      tooltipLines: formatShotTooltipLines(shot),
    };
  });

  const cells: DriftCell[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);

    for (let r = rMin; r <= rMax; r += 1) {
      const { x, y } = axialToPixel(q, r, 14, centerX, centerY);
      const normX = (x - centerX) / spreadX;
      const normY = (y - centerY) / spreadY;
      const radial = Math.max(0, 1 - Math.hypot(normX, normY) / 1.25);

      cells.push({
        key: `${q}:${r}`,
        x,
        y,
      });
    }
  }

  const centerCell = findNearestCell(cells, centerX, centerY);
  const occupied = new Set<string>(centerCell ? [centerCell.key] : []);
  const points = rawPoints.map((point) => {
    const snapped = findAvailableCell(cells, point.x, point.y, occupied);
    occupied.add(snapped.key);

    return {
      ...point,
      x: snapped.x,
      y: snapped.y,
    };
  });

  const meanX = average(points.map((point) => (point.x - centerX) / spreadX));
  const biasLabel =
    Math.abs(meanX) < 0.16 ? "Centered cluster" : meanX > 0 ? "Right-biased cluster" : "Left-biased cluster";

  return {
    cells,
    points,
    biasLabel,
  };
}

function findNearestCell(cells: DriftCell[], x: number, y: number) {
  return [...cells].sort((left, right) => {
    const leftDist = Math.hypot(left.x - x, left.y - y);
    const rightDist = Math.hypot(right.x - x, right.y - y);
    return leftDist - rightDist;
  })[0];
}

function findAvailableCell(cells: DriftCell[], x: number, y: number, occupied: Set<string>) {
  const ranked = [...cells].sort((left, right) => {
    const leftDist = Math.hypot(left.x - x, left.y - y);
    const rightDist = Math.hypot(right.x - x, right.y - y);
    return leftDist - rightDist;
  });

  return ranked.find((cell) => !occupied.has(cell.key)) ?? ranked[0];
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

function buildDashboardData(shots: Shot[], tmReady?: boolean): DashboardData {
  const effectiveShots = buildEffectiveShots(shots);
  const previewMode = !shots.some((shot) => METRICS.some((metric) => shot.tm?.[metric] != null)) || !tmReady;
  const clubLabel = effectiveShots[effectiveShots.length - 1]?.club ?? "7-Iron";

  const metricRows = FOCUS_METRICS.map((metric) => summarizeMetric(metric, effectiveShots));
  const overallScore = Math.round(
    metricRows.reduce((sum, row) => sum + row.score, 0) / Math.max(metricRows.length, 1)
  );

  const recentCarry = effectiveShots.slice(-5).map((shot) => shot.pr.carry);
  const carryMean = average(recentCarry);
  const driftBars = effectiveShots.slice(-5).map((shot, index) => {
    const delta = shot.pr.carry - carryMean;
    return {
      label: `S${index + 1}`,
      value: +delta.toFixed(1),
      tone: toneFromMagnitude(Math.abs(delta), 3.5, 7),
    };
  });

  const speedSeries = effectiveShots.slice(-5).map((shot) => shot.pr.speed);
  const spinSeries = effectiveShots.slice(-5).map((shot) => shot.pr.spin);
  const hlaSeries = effectiveShots.slice(-5).map((shot) => shot.pr.hla);
  const tendencies: TendencyCard[] = [];

  if (spinSeries.length >= 3 && average(spinSeries.slice(-3)) > average(spinSeries) + 120) {
    tendencies.push({
      id: "spin-rise",
      label: "Spin climb",
      detail: "Spin is climbing above your current baseline. Shorten the finish and check strike height.",
      tone: "warn",
    });
  }

  if (speedSeries.length >= 4 && Math.max(...speedSeries) - Math.min(...speedSeries) < 1.2) {
    tendencies.push({
      id: "speed-plateau",
      label: "Speed plateau",
      detail: "Ball speed has flattened across the last few shots. Add intent before changing settings.",
      tone: "neutral",
    });
  }

  if (hlaSeries.length >= 4 && average(hlaSeries.slice(-4)) > 0.8) {
    tendencies.push({
      id: "right-start",
      label: "Right-start pattern",
      detail: "HLA is trending right of center. Recheck start-line alignment and face presentation.",
      tone: "bad",
    });
  }

  if (!tendencies.length) {
    tendencies.push({
      id: "stable-window",
      label: "Stable window",
      detail: "Your latest matched shots are clustering tightly. Stay in the same calibration window.",
      tone: "good",
    });
  }

  const focusMetric = metricRows[0];
  const recentMeanAbs = average(metricRows.map((row) => row.meanAbsError));
  const trendTone = toneFromMagnitude(recentMeanAbs, 0.75, 1.5);
  const trendLabel =
    trendTone === "good" ? "improving" : trendTone === "warn" ? "stable" : "drifting";

  return {
    clubLabel,
    effectiveShots,
    previewMode,
    overallScore,
    metricRows,
    trendLabel,
    trendTone,
    driftBars,
    tendencies,
    prompt: buildPrompt(metricRows, tendencies[0], overallScore, previewMode),
    focusNote: `${focusMetric.label} is averaging ${formatSigned(focusMetric.meanError)} with ${focusMetric.passRate}% of matched shots inside tolerance.`,
  };
}

function summarizeMetric(metric: MetricKey, shots: Shot[]): MetricSummary {
  const matching = shots.filter((shot) => shot.tm?.[metric] != null);
  const errors = matching.map((shot) => pctError(shot.pr[metric], shot.tm![metric] as number));
  const meanError = matching.length ? average(errors) : 0;
  const meanAbsError = matching.length ? average(errors.map((value) => Math.abs(value))) : 0;
  const latestError = errors[errors.length - 1] ?? 0;
  const passRate = matching.length
    ? Math.round((errors.filter((value) => Math.abs(value) <= PASS_THRESHOLD).length / matching.length) * 100)
    : 0;
  const score = matching.length
    ? Math.max(34, Math.round(100 - Math.min(meanAbsError / 3.2, 1) * 62))
    : 42;

  return {
    key: metric,
    label: METRIC_META[metric].label,
    meanError: +meanError.toFixed(1),
    meanAbsError: +meanAbsError.toFixed(1),
    latestError: +latestError.toFixed(1),
    passRate,
    score,
    tone: toneFromMagnitude(meanAbsError, 0.7, 1.35),
    sampleSize: matching.length,
    spark: errors.slice(-6).map((value) => +value.toFixed(1)),
  };
}

function buildEffectiveShots(shots: Shot[]) {
  const matched = shots.filter((shot) => METRICS.some((metric) => shot.tm?.[metric] != null));
  if (matched.length) {
    return matched.slice(-30);
  }

  const baseShots = shots.length ? shots.slice(-30) : buildFallbackShots();
  const speedOffsets = [-1.5, -0.6, 0.2, 0.8, -0.4, 0.6, -0.9, 0.3];
  const vlaOffsets = [-0.4, -0.1, 0.2, 0.4, -0.2, 0.3, -0.3, 0.1];
  const hlaOffsets = [0.2, -0.1, 0.3, -0.2, 0.1, -0.4, 0.2, -0.1];
  const carryOffsets = [-4, -2, 1, 3, -1, 2, -3, 1];
  const spinOffsets = [90, -45, 60, 105, -35, 40, -80, 55];

  return baseShots.map((shot, index) => ({
    ...shot,
    tm: {
      speed: +(shot.pr.speed - speedOffsets[index % speedOffsets.length]).toFixed(1),
      vla: +(shot.pr.vla - vlaOffsets[index % vlaOffsets.length]).toFixed(1),
      hla: +(shot.pr.hla - hlaOffsets[index % hlaOffsets.length]).toFixed(1),
      carry: +(shot.pr.carry - carryOffsets[index % carryOffsets.length]).toFixed(1),
      spin: Math.round(shot.pr.spin - spinOffsets[index % spinOffsets.length]),
    },
  }));
}

function buildFallbackShots(): Shot[] {
  const baseline = {
    speed: 99.2,
    vla: 17.6,
    carry: 165,
    spin: 6750,
  };
  const speedOffsets = [
    -25.4, -3.6, -2.8, -1.4, -0.8, 0.2, 1.1, 2.3, 3.4, -4.4,
    -1.9, 0.8, 1.9, 2.8, 3.8, -3.1, -1.2, 0.4, 1.4, 2.1,
    -24.6, -4.8, -2.2, 0.9, 2.6, 4.1, -3.7, -1.5, 1.7, 3.2,
  ];
  const vlaOffsets = [
    -1.4, -2.2, -1.7, -0.4, -0.1, 0.2, 1.7, 2.1, 4.7, -1.2,
    -0.5, 1.8, 0.4, 2.2, 2.4, -0.9, -0.3, 0.2, -2.0, 2.3,
    -1.7, -1.3, 2.2, 0.3, 4.9, 1.4, -0.8, 2.8, 0.5, -2.3,
  ];
  const hlaOffsets = [
    -1.7, -1.2, -0.8, -0.4, -0.1, 0.1, 0.4, 0.9, 1.4, 1.8,
    -1.5, -0.9, -0.3, 0.2, 0.6, 1.1, -5.6, -1.0, -0.2, 0.3,
    0.8, 1.3, 1.9, -1.4, -0.7, 0.0, 0.5, 1.0, 5.4, -0.5,
  ];
  const carryOffsets = [
    -12, -9, -7, -4, -2, 1, 3, 5, 8, 11,
    -10, -6, -3, 0, 2, 4, 7, 9, -8, -5,
    -14, -11, -6, -1, 3, 6, 10, -4, 2, 8,
  ];
  const spinOffsets = [
    -520, -380, -250, -110, 40, 110, 220, 360, 520, 690,
    -430, -210, -80, 60, 180, 330, 470, 610, -300, -140,
    -640, -500, -220, 70, 240, 420, 640, -260, 120, 510,
  ];

  return speedOffsets.map((speedOffset, index) => ({
    id: `preview-${index + 1}`,
    club: "7-Iron",
    timestamp: new Date(Date.now() - (speedOffsets.length - index) * 36000).toISOString(),
    pr: {
      speed: +(baseline.speed + speedOffset).toFixed(1),
      vla: +(baseline.vla + vlaOffsets[index]).toFixed(1),
      hla: +hlaOffsets[index].toFixed(1),
      carry: +(baseline.carry + carryOffsets[index]).toFixed(1),
      spin: Math.round(baseline.spin + spinOffsets[index]),
    },
    tm: null,
    trackPts: 124 + index * 6,
  }));
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
    return `ShotIQ is running in preview mode, but ${bestMetric.label.toLowerCase()} is already the cleanest match in the stack. Start a matched TrackMan run and keep an eye on ${riskMetric.label.toLowerCase()} first.`;
  }

  return `Calibration is scoring ${overallScore} overall. ${riskMetric.label} is the loosest metric right now, while ${bestMetric.label} is holding the strongest TrackMan fit. ${tendency.detail}`;
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

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
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

function metricDeltaForMap(shot: Shot, metric: MetricKey) {
  const tmValue = shot.tm?.[metric];
  if (tmValue == null) {
    return 0;
  }

  return shot.pr[metric] - tmValue;
}

function driftScaleForMetric(metric: MetricKey) {
  switch (metric) {
    case "speed":
      return 2.6;
    case "vla":
      return 1.1;
    case "hla":
      return 0.55;
    case "carry":
      return 6.5;
    case "spin":
      return 220;
    default:
      return 1;
  }
}

function vlaSpreadForMap(threshold: LaunchAngleThreshold) {
  const center = average(threshold.good);
  const lowSpan = Math.abs(center - threshold.okayLow[0]);
  const highSpan = Math.abs(threshold.okayHigh[1] - center);
  return Math.max(lowSpan, highSpan, 1);
}

function axialToPixel(q: number, r: number, size: number, centerX: number, centerY: number) {
  return {
    x: centerX + Math.sqrt(3) * size * (q + r / 2),
    y: centerY + 1.5 * size * r,
  };
}

function hexPoints(cx: number, cy: number, size: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function evaluateShotForClub(shot: Shot) {
  const thresholdKey = normalizeClubThresholdKey(shot.club);
  const thresholds = CLUB_SHOT_THRESHOLDS[thresholdKey] ?? CLUB_SHOT_THRESHOLDS["7-Iron"];

  const metricChecks = [
    classifySpeedBand(shot.pr.speed, thresholds.speed),
    classifyLaunchBand(shot.pr.vla, thresholds.vla),
    classifyDirectionBand(shot.pr.hla, thresholds.hla),
  ];

  const severity = Math.max(...metricChecks.map((check) => check.normalized));
  const hasBadMetric = metricChecks.some((check) => check.grade === "bad");
  const hasOkayMetric = metricChecks.some((check) => check.grade === "okay");

  if (hasBadMetric) {
    return { grade: "bad" as ShotGrade, severity: clamp(Math.max(severity, 0.8), 0.8, 1) };
  }

  if (hasOkayMetric) {
    return { grade: "okay" as ShotGrade, severity: clamp(Math.max(severity, 0.48), 0.48, 0.78) };
  }

  return {
    grade: "good" as ShotGrade,
    severity: clamp(severity, 0.12, 0.44),
  };
}

function normalizeClubThresholdKey(club: string) {
  return CLUB_THRESHOLD_ALIASES[club.trim().toLowerCase()] ?? "7-Iron";
}

function classifySpeedBand(value: number, threshold: SymmetricRangeThreshold) {
  const [goodMin, goodMax] = threshold.good;
  const [okayMin] = threshold.okay;
  const mirroredOkayMax = goodMax + (goodMin - okayMin);
  const goodCenter = (goodMin + goodMax) / 2;
  const goodHalfWidth = Math.max((goodMax - goodMin) / 2, 0.001);
  const okayWidth = Math.max(goodMin - okayMin, 0.001);

  if (value >= goodMin && value <= goodMax) {
    return {
      grade: "good" as ShotGrade,
      normalized: clamp((Math.abs(value - goodCenter) / goodHalfWidth) * 0.42, 0.08, 0.42),
    };
  }

  if (value >= okayMin && value < goodMin) {
    const offset = (goodMin - value) / okayWidth;
    return { grade: "okay" as ShotGrade, normalized: clamp(0.46 + offset * 0.24, 0.46, 0.74) };
  }

  if (value > goodMax && value <= mirroredOkayMax) {
    const offset = (value - goodMax) / okayWidth;
    return { grade: "okay" as ShotGrade, normalized: clamp(0.46 + offset * 0.24, 0.46, 0.74) };
  }

  if (value < okayMin) {
    const offset = (okayMin - value) / okayWidth;
    return { grade: "bad" as ShotGrade, normalized: clamp(0.8 + offset * 0.18, 0.8, 1) };
  }

  const offset = (value - mirroredOkayMax) / okayWidth;
  return { grade: "bad" as ShotGrade, normalized: clamp(0.8 + offset * 0.18, 0.8, 1) };
}

function classifyLaunchBand(value: number, threshold: LaunchAngleThreshold) {
  const [goodMin, goodMax] = threshold.good;
  const [okayLowMin] = threshold.okayLow;
  const [okayHighMin, okayHighMax] = threshold.okayHigh;
  const goodCenter = (goodMin + goodMax) / 2;
  const goodHalfWidth = Math.max((goodMax - goodMin) / 2, 0.001);
  const lowerOkayWidth = Math.max(goodMin - okayLowMin, 0.001);
  const upperOkayWidth = Math.max(okayHighMax - goodMax, 0.001);

  if (value >= goodMin && value <= goodMax) {
    return {
      grade: "good" as ShotGrade,
      normalized: clamp((Math.abs(value - goodCenter) / goodHalfWidth) * 0.42, 0.08, 0.42),
    };
  }

  if (value >= okayLowMin && value < goodMin) {
    const offset = (goodMin - value) / lowerOkayWidth;
    return { grade: "okay" as ShotGrade, normalized: clamp(0.46 + offset * 0.24, 0.46, 0.74) };
  }

  if (value > goodMax && value <= okayHighMax) {
    const offset = (value - goodMax) / upperOkayWidth;
    return { grade: "okay" as ShotGrade, normalized: clamp(0.46 + offset * 0.24, 0.46, 0.74) };
  }

  if (value < okayLowMin) {
    const offset = (okayLowMin - value) / lowerOkayWidth;
    return { grade: "bad" as ShotGrade, normalized: clamp(0.8 + offset * 0.18, 0.8, 1) };
  }

  const offset = (value - okayHighMax) / upperOkayWidth;
  return { grade: "bad" as ShotGrade, normalized: clamp(0.8 + offset * 0.18, 0.8, 1) };
}

function classifyDirectionBand(value: number, threshold: DirectionThreshold) {
  const magnitude = Math.abs(value);

  if (magnitude <= threshold.goodMax) {
    return {
      grade: "good" as ShotGrade,
      normalized: clamp((magnitude / Math.max(threshold.goodMax, 0.001)) * 0.42, 0.08, 0.42),
    };
  }

  if (magnitude <= threshold.okayMax) {
    const offset = (magnitude - threshold.goodMax) / Math.max(threshold.okayMax - threshold.goodMax, 0.001);
    return { grade: "okay" as ShotGrade, normalized: clamp(0.46 + offset * 0.24, 0.46, 0.74) };
  }

  const offset = (magnitude - threshold.okayMax) / Math.max(threshold.okayMax, 0.001);
  return { grade: "bad" as ShotGrade, normalized: clamp(0.8 + offset * 0.18, 0.8, 1) };
}

function radialBandForGrade(grade: ShotGrade) {
  switch (grade) {
    case "good":
      return { min: 44, max: 74 };
    case "okay":
      return { min: 88, max: 122 };
    case "bad":
      return { min: 132, max: 176 };
    default:
      return { min: 44, max: 74 };
  }
}
