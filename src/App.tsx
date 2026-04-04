import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CLUB_NAMES } from "./constants";
import { NotificationToast } from "./components/ui/NotificationToast";
import { useLiveShots } from "./hooks/useLiveShots";
import type { LiveStatus } from "./hooks/useLiveShots";
import { useNotification } from "./hooks/useNotification";
import { useSessions } from "./hooks/useSessions";
import type { Session, Shot, TabId } from "./types";
import { exportShotsToCSV, generateSyntheticShot } from "./utils/shotData";
import { calcSessionStats, pctError } from "./utils/stats";

const FrameScrubberView = lazy(() => import("./views/FrameScrubberView"));
const TrajectoryView = lazy(() => import("./views/TrajectoryView"));
const AccuracyView = lazy(() => import("./views/AccuracyView"));
const ShotLogView = lazy(() => import("./views/ShotLogView"));
const InputDataView = lazy(() => import("./views/InputDataView"));
const ProgressView = lazy(() => import("./views/ProgressView"));
const TrendView = lazy(() => import("./views/TrendView"));
const CompareView = lazy(() => import("./views/CompareView"));
const AllSessionsView = lazy(() => import("./views/AllSessionsView"));
const PhysicsView = lazy(() =>
  import("./components/modules/PhysicsValidator").then((mod) => ({ default: mod.PhysicsValidator }))
);
const KalmanView = lazy(() =>
  import("./components/modules/KalmanTester").then((mod) => ({ default: mod.KalmanTester }))
);
const ModelView = lazy(() =>
  import("./components/modules/ModelTester").then((mod) => ({ default: mod.ModelTester }))
);
const NewSessionModal = lazy(() => import("./components/modules/NewSessionModal"));

const PRIMARY_NAV = [
  { id: "dashboard", label: "Home", icon: IconCluster },
  { id: "accuracy", label: "Accuracy", icon: IconTarget },
  { id: "shots", label: "Shot Log", icon: IconSheets },
  { id: "compare", label: "Compare", icon: IconCompare },
  { id: "progress", label: "Progress", icon: IconTrend },
  { id: "sessions", label: "Sessions", icon: IconCalendar },
] as const satisfies { id: TabId; label: string; icon: IconComponent }[];

const MORE_NAV = [
  { id: "trajectory", label: "Trajectory Replay", icon: IconOrbit },
  { id: "physics", label: "Physics Validator", icon: IconPulse },
  { id: "kalman", label: "Kalman Tester", icon: IconWave },
  { id: "model", label: "Model Tester", icon: IconModel },
  { id: "trend", label: "Trend Charts", icon: IconTrend },
  { id: "input", label: "Input Lab", icon: IconDots },
  { id: "frames", label: "Frame Scrubber", icon: IconFrames },
] as const satisfies { id: TabId; label: string; icon: IconComponent }[];

const HOME_FILTERS = [
  { id: "all", label: "All" },
  { id: "advice", label: "Advice" },
  { id: "tests", label: "Tests" },
  { id: "labs", label: "Labs" },
  { id: "docs", label: "Docs" },
] as const;

const BRAND_INK = "#262930";
const BRAND_GREEN = "#6ad87c";

const TAB_COPY: Record<TabId, { eyebrow: string; title: string; description: string }> = {
  dashboard: {
    eyebrow: "Landing",
    title: "Performance Home",
    description: "A calmer overview that keeps live capture, validation, and session history within reach.",
  },
  accuracy: {
    eyebrow: "Analysis",
    title: "Accuracy Dashboard",
    description: "Review ProRange error against TrackMan with a cleaner visual frame around the existing tools.",
  },
  shots: {
    eyebrow: "Capture",
    title: "Shot Log",
    description: "Inspect live shots, select a capture, and jump into the deeper replay and validation tools.",
  },
  compare: {
    eyebrow: "Sessions",
    title: "Session Comparison",
    description: "Compare version-to-version behavior and spot where a calibration change actually moved the needle.",
  },
  progress: {
    eyebrow: "Trends",
    title: "Progress View",
    description: "See how recent work stacks up over time without leaving the redesigned shell.",
  },
  sessions: {
    eyebrow: "Archive",
    title: "All Sessions",
    description: "Browse and manage saved runs from the new homepage schedule strip.",
  },
  trajectory: {
    eyebrow: "Replay",
    title: "Trajectory Replay",
    description: "Open the latest shot path and play it back from the sculptural hero into the full trajectory view.",
  },
  physics: {
    eyebrow: "Lab",
    title: "Physics Validator",
    description: "Deep-dive into the physical model when the home surface suggests the calibration needs work.",
  },
  kalman: {
    eyebrow: "Lab",
    title: "Kalman Tester",
    description: "Validate filtering and smoothing behavior inside the same redesigned workspace.",
  },
  model: {
    eyebrow: "Lab",
    title: "Model Tester",
    description: "Check model behavior and confidence when a session looks suspicious from the home page.",
  },
  trend: {
    eyebrow: "Reference",
    title: "Trend Charts",
    description: "Open longer-horizon charts from the same high-level home workflow.",
  },
  input: {
    eyebrow: "Reference",
    title: "Input Lab",
    description: "Create or inspect manual input rows from the new reference-oriented home variants.",
  },
  frames: {
    eyebrow: "Replay",
    title: "Frame Scrubber",
    description: "Jump directly from the home hero into frame-level inspection when you need it.",
  },
};

type HomeFilter = (typeof HOME_FILTERS)[number]["id"];
type IconComponent = (props: IconProps) => React.JSX.Element;

interface IconProps {
  className?: string;
}

interface InsightCardData {
  owner: string;
  role: string;
  title: string;
  meta: string;
  accent: string;
  series: number[];
  onClick: () => void;
}

interface ActionTileData {
  index: string;
  title: string;
  value: string;
  subtitle: string;
  accent: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface HeroActionData {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}

export default function App() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [club, setClub] = useState<string>("7-Iron");
  const [moreOpen, setMoreOpen] = useState(false);
  const [clubOpen, setClubOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeShot, setActiveShot] = useState<Shot | null>(null);
  const [homeFilter, setHomeFilter] = useState<HomeFilter>("all");
  const [weekPage, setWeekPage] = useState(0);

  const {
    sessions,
    liveShots,
    tmReady,
    addSession,
    deleteSession,
    resetToSeed,
    addLiveShot,
    clearLiveShots,
  } = useSessions();
  const { notification, notify } = useNotification();

  const handleLiveShot = (shot: Shot) => {
    addLiveShot(shot);
    setActiveShot(shot);
  };

  const {
    status: liveStatus,
    shotCount: liveShotCount,
    connect: liveConnect,
    disconnect: liveDisconnect,
  } = useLiveShots({ onShot: handleLiveShot, onNotify: notify });

  const shots = liveShots;

  const addShot = () => {
    const shot = generateSyntheticShot(club);
    addLiveShot(shot);
    setActiveShot(shot);
    notify("Synthetic shot logged");
  };

  const openTab = (nextTab: TabId) => {
    setTab(nextTab);
    setClubOpen(false);
    setMoreOpen(false);
  };

  const openTrajectory = () => {
    setPlaying(true);
    openTab("trajectory");
  };

  const toggleLive = () => {
    if (liveStatus === "connected") {
      liveDisconnect();
      return;
    }
    liveConnect();
  };

  const moreActive = MORE_NAV.some((item) => item.id === tab);
  const sectionCopy = TAB_COPY[tab];

  return (
    <div className="pr-page">
      <NotificationToast notification={notification} />

      <div className="pr-shell">
        <div className="pr-frame">
          <HeaderBar
            tab={tab}
            club={club}
            tmReady={tmReady}
            liveStatus={liveStatus}
            liveShotCount={liveShotCount}
            moreActive={moreActive}
            moreOpen={moreOpen}
            clubOpen={clubOpen}
            onOpenTab={openTab}
            onToggleMore={() => {
              setClubOpen(false);
              setMoreOpen((current) => !current);
            }}
            onToggleClub={() => {
              setMoreOpen(false);
              setClubOpen((current) => !current);
            }}
            onSelectClub={(nextClub) => {
              setClub(nextClub);
              setClubOpen(false);
            }}
            onAddShot={addShot}
            onNewSession={() => setModalOpen(true)}
            onToggleLive={toggleLive}
          />

          {tab === "dashboard" ? (
            <HomeView
              filter={homeFilter}
              club={club}
              shots={shots}
              sessions={sessions}
              activeShot={activeShot}
              liveStatus={liveStatus}
              liveShotCount={liveShotCount}
              weekPage={weekPage}
              onFilterChange={setHomeFilter}
              onOpenTab={openTab}
              onOpenTrajectory={openTrajectory}
              onAddShot={addShot}
              onNewSession={() => setModalOpen(true)}
              onExport={() => {
                exportShotsToCSV(shots);
                notify("CSV exported");
              }}
              onToggleLive={toggleLive}
              onPrevWeek={() => setWeekPage((current) => current + 1)}
              onNextWeek={() => setWeekPage((current) => Math.max(0, current - 1))}
            />
          ) : (
            <section className="pr-secondary-stage">
              <div className="pr-secondary-intro">
                <div>
                  <span className="pr-secondary-eyebrow">{sectionCopy.eyebrow}</span>
                  <h1>{sectionCopy.title}</h1>
                  <p>{sectionCopy.description}</p>
                </div>
                <button className="pr-secondary-home" onClick={() => openTab("dashboard")}>
                  <IconChevronLeft />
                  Home
                </button>
              </div>

              <div className="pr-secondary-stage-inner">
                <SecPage
                  tab={tab}
                  shots={shots}
                  sessions={sessions}
                  active={activeShot}
                  playing={playing}
                  club={club}
                  tmReady={tmReady}
                  onSelectShot={(shot) => {
                    setActiveShot(shot);
                    setPlaying(false);
                    openTab("trajectory");
                  }}
                  onPlay={() => setPlaying(true)}
                  onPlayDone={() => setPlaying(false)}
                  onAddShot={(shot) => {
                    addLiveShot(shot);
                    setActiveShot(shot);
                    notify("Shot logged");
                  }}
                  onNotify={notify}
                  onDelete={(id) => {
                    deleteSession(id);
                    notify("Session deleted");
                  }}
                  onReset={() => {
                    resetToSeed();
                    notify("Seed data reset");
                  }}
                  onNew={() => setModalOpen(true)}
                  onClear={() => {
                    clearLiveShots();
                    setActiveShot(null);
                    notify("Live shots cleared");
                  }}
                  onExport={() => {
                    exportShotsToCSV(shots);
                    notify("CSV exported");
                  }}
                />
              </div>
            </section>
          )}

          {modalOpen && (
            <Suspense fallback={null}>
              <NewSessionModal
                onSave={(session) => {
                  addSession(session);
                  setModalOpen(false);
                  notify("Session saved");
                }}
                onClose={() => setModalOpen(false)}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

interface HeaderBarProps {
  tab: TabId;
  club: string;
  tmReady: boolean;
  liveStatus: LiveStatus;
  liveShotCount: number;
  moreActive: boolean;
  moreOpen: boolean;
  clubOpen: boolean;
  onOpenTab: (tab: TabId) => void;
  onToggleMore: () => void;
  onToggleClub: () => void;
  onSelectClub: (club: string) => void;
  onAddShot: () => void;
  onNewSession: () => void;
  onToggleLive: () => void;
}

function HeaderBar({
  tab,
  club,
  tmReady,
  liveStatus,
  liveShotCount,
  moreActive,
  moreOpen,
  clubOpen,
  onOpenTab,
  onToggleMore,
  onToggleClub,
  onSelectClub,
  onAddShot,
  onNewSession,
  onToggleLive,
}: HeaderBarProps) {
  return (
    <header className="pr-header">
      <button className="pr-brand" onClick={() => onOpenTab("dashboard")} aria-label="SpinVOT home">
        <BrandMark />
      </button>

      <div className="pr-header-nav">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`pr-nav-btn ${tab === item.id ? "is-active" : ""}`}
              onClick={() => onOpenTab(item.id)}
              title={item.label}
            >
              <Icon />
            </button>
          );
        })}

        <div className="pr-menu-anchor">
          <button
            className={`pr-nav-btn ${moreActive ? "is-active" : ""}`}
            onClick={onToggleMore}
            title="More tools"
          >
            <IconDots />
          </button>

          {moreOpen && (
            <div className="pr-menu">
              {MORE_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`pr-menu-item ${tab === item.id ? "is-active" : ""}`}
                    onClick={() => onOpenTab(item.id)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="pr-header-actions">
        <button
          className={`pr-live-pill ${
            liveStatus === "connected"
              ? "is-live"
              : liveStatus === "connecting"
              ? "is-connecting"
              : ""
          }`}
          onClick={onToggleLive}
        >
          <span className="pr-live-dot" />
          <span className="pr-live-copy">
            <strong>
              {liveStatus === "connected"
                ? `Live ${liveShotCount}`
                : liveStatus === "connecting"
                ? "Linking"
                : "Live Off"}
            </strong>
            <span>{tmReady ? "TrackMan ready" : "TrackMan loading"}</span>
          </span>
        </button>

        <div className="pr-menu-anchor">
          <button className="pr-club-pill" onClick={onToggleClub}>
            <span>{club}</span>
            <IconChevronDown />
          </button>

          {clubOpen && (
            <div className="pr-menu pr-menu-club">
              {CLUB_NAMES.map((clubName) => (
                <button
                  key={clubName}
                  className={`pr-menu-item ${club === clubName ? "is-active" : ""}`}
                  onClick={() => onSelectClub(clubName)}
                >
                  <IconBall />
                  <span>{clubName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="pr-header-icon" onClick={onAddShot} title="Generate shot">
          <IconPlus />
        </button>

        <button className="pr-header-icon" onClick={onNewSession} title="Create session">
          <IconCalendarPlus />
        </button>

        <button className="pr-profile">
          <span className="pr-profile-copy">
            <strong>Performance Lab</strong>
            <span>{tmReady ? "Indoor bay calibrated" : "Syncing references"}</span>
          </span>
          <span className="pr-avatar">PR</span>
        </button>
      </div>
    </header>
  );
}

interface HomeViewProps {
  filter: HomeFilter;
  club: string;
  shots: Shot[];
  sessions: Session[];
  activeShot: Shot | null;
  liveStatus: LiveStatus;
  liveShotCount: number;
  weekPage: number;
  onFilterChange: (filter: HomeFilter) => void;
  onOpenTab: (tab: TabId) => void;
  onOpenTrajectory: () => void;
  onAddShot: () => void;
  onNewSession: () => void;
  onExport: () => void;
  onToggleLive: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

function HomeView({
  filter,
  club,
  shots,
  sessions,
  activeShot,
  liveStatus,
  liveShotCount,
  weekPage,
  onFilterChange,
  onOpenTab,
  onOpenTrajectory,
  onAddShot,
  onNewSession,
  onExport,
  onToggleLive,
  onPrevWeek,
  onNextWeek,
}: HomeViewProps) {
  const latestShot = activeShot ?? (shots.length ? shots[shots.length - 1] : null);
  const latestSession = sessions.length ? sessions[sessions.length - 1] : null;
  const latestStats = latestSession ? calcSessionStats(latestSession) : null;
  const recentSpeed = lastValues(shots, (shot) => shot.pr.speed, [92, 95, 98, 101, 103, 100]);
  const recentVla = lastValues(shots, (shot) => shot.pr.vla, [18.8, 19.4, 20.2, 20.8, 19.9, 20.4]);
  const recentHla = lastValues(shots, (shot) => shot.pr.hla, [-0.8, -0.2, 0.4, 0.7, 0.1, -0.1]);
  const recentCarry = lastValues(shots, (shot) => shot.pr.carry, [154, 161, 166, 170, 173, 168]);
  const recentSpin = lastValues(shots, (shot) => shot.pr.spin, [6580, 6700, 6900, 6760, 6885, 7020]);

  const vlaErrors = shots
    .filter((shot) => shot.tm?.vla != null)
    .map((shot) => pctError(shot.pr.vla, shot.tm!.vla!));

  const passRate = latestStats?.vla?.passRate ?? null;
  const carryAverage = Math.round(average(recentCarry, 172));
  const speedAverage = average(recentSpeed, 100).toFixed(1);
  const spinAverage = Math.round(average(recentSpin, 6820));
  const dispersion = average(
    shots.slice(-10).map((shot) => Math.abs(shot.pr.hla)),
    1.4
  ).toFixed(1);
  const vlaBias = average(vlaErrors, 11.6);
  const heroGrade = gradeFromPassRate(passRate);
  const schedule = buildScheduleWeek(sessions, weekPage);
  const overviewSpeed = latestShot?.pr.speed ?? average(recentSpeed, 100);
  const overviewVla = latestShot?.pr.vla ?? average(recentVla, 20.1);
  const overviewHla = latestShot?.pr.hla ?? average(recentHla, 0.2);
  const overviewSpin = latestShot?.pr.spin ?? average(recentSpin, 6820);
  const overviewCarry = latestShot?.pr.carry ?? average(recentCarry, 172);
  const [animatedSpeed, setAnimatedSpeed] = useState(overviewSpeed);
  const [isSpeedAnimating, setIsSpeedAnimating] = useState(false);
  const hasMountedSpeed = useRef(false);
  const latestShotKey = latestShot ? String(latestShot.id) : "";

  useEffect(() => {
    if (!latestShot) {
      setAnimatedSpeed(0);
      setIsSpeedAnimating(false);
      hasMountedSpeed.current = true;
      return;
    }

    if (!hasMountedSpeed.current) {
      setAnimatedSpeed(overviewSpeed);
      setIsSpeedAnimating(false);
      hasMountedSpeed.current = true;
      return;
    }

    let frameId = 0;
    const start = performance.now();
    const duration = 2800;

    setAnimatedSpeed(0);
    setIsSpeedAnimating(true);

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
      setAnimatedSpeed(overviewSpeed * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setIsSpeedAnimating(false);
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      setIsSpeedAnimating(false);
    };
  }, [latestShot, latestShotKey, overviewSpeed]);

  const filterCopy = {
    all: {
      eyebrow: "Live practice command center",
      heading: "SPIVOT Shot Lab",
      detail: "Track ball speed, launch, spin, and carry inside a premium golf cockpit built for practice sessions, live capture, and calibration.",
      sideTitle: "Shot Overview",
    },
    advice: {
      eyebrow: "Coaching mode",
      heading: "Guided Advice and Analysis",
      detail: "Surface the next highest-leverage fixes before diving into charts, replays, or frame-level review.",
      sideTitle: "Shot Overview",
    },
    tests: {
      eyebrow: "Validation mode",
      heading: "Personal Tests and Analysis",
      detail: "Pin the current verification tools, replay surfaces, and live capture checkpoints in one sweep.",
      sideTitle: "Shot Overview",
    },
    labs: {
      eyebrow: "Lab mode",
      heading: "Calibration Labs and Analysis",
      detail: "Jump from the hero surface into physics, filtering, and model diagnostics without the old dashboard clutter.",
      sideTitle: "Shot Overview",
    },
    docs: {
      eyebrow: "Reference mode",
      heading: "Reference Docs and Analysis",
      detail: "Keep exports, archives, and version history closer to the home experience for quick review loops.",
      sideTitle: "Shot Overview",
    },
  }[filter];

  const insightCards: InsightCardData[] = {
    all: [
      {
        owner: "AI Caddie",
        role: "overview",
        title: "Ball speed review",
        meta: `${speedAverage} mph average across the latest live cluster`,
        accent: BRAND_GREEN,
        series: recentSpeed,
        onClick: () => onOpenTab("shots"),
      },
      {
        owner: "TrackMan",
        role: "matched",
        title: "Carry window",
        meta: `${carryAverage} yd center line for ${club}`,
        accent: BRAND_INK,
        series: recentCarry,
        onClick: () => onOpenTab("accuracy"),
      },
      {
        owner: "Live Bay",
        role: "capture",
        title: "Spin stability",
        meta: `${spinAverage.toLocaleString()} rpm through the latest swings`,
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: onOpenTrajectory,
      },
    ],
    advice: [
      {
        owner: "AI Coach",
        role: "priority",
        title: "VLA bias watch",
        meta: `${formatSigned(vlaBias, "%")} against the matched TrackMan reference`,
        accent: BRAND_GREEN,
        series: recentCarry,
        onClick: () => onOpenTab("compare"),
      },
      {
        owner: "Start Line",
        role: "control",
        title: "Dispersion drift",
        meta: `Current lateral spread sits around ${dispersion}°`,
        accent: BRAND_INK,
        series: recentSpeed,
        onClick: () => onOpenTab("progress"),
      },
      {
        owner: "Practice Plan",
        role: "session",
        title: "Next best action",
        meta: latestSession ? `Replay ${latestSession.version} before adjusting the mount` : "Log one new session to build the next coaching note",
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: onOpenTrajectory,
      },
    ],
    tests: [
      {
        owner: "Accuracy",
        role: "check",
        title: "Tolerance pass rate",
        meta: passRate !== null ? `${passRate}% of the latest session falls inside target` : "No matched session yet, start with a quick synthetic shot",
        accent: BRAND_GREEN,
        series: recentSpeed,
        onClick: () => onOpenTab("accuracy"),
      },
      {
        owner: "Replay",
        role: "trajectory",
        title: "Flight path ready",
        meta: latestShot ? `${latestShot.trackPts ?? 0} tracked points available for the latest replay` : "Open trajectory replay once a shot lands",
        accent: BRAND_INK,
        series: recentCarry,
        onClick: onOpenTrajectory,
      },
      {
        owner: "Frames",
        role: "inspection",
        title: "Scrub candidate",
        meta: shots.length ? `${shots.length} captured shots are ready for frame-level review` : "Capture a shot to open frame scrubbing",
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: () => onOpenTab("frames"),
      },
    ],
    labs: [
      {
        owner: "Physics",
        role: "validator",
        title: "Impact fit",
        meta: latestSession ? `${latestSession.version} is the best candidate for physical-model validation` : "Seed one session and verify the launch fit",
        accent: BRAND_GREEN,
        series: recentCarry,
        onClick: () => onOpenTab("physics"),
      },
      {
        owner: "Kalman",
        role: "filtering",
        title: "Smoothing check",
        meta: shots.length ? `Recent captures can stress the smoothing path right now` : "Generate a few shots to populate filter diagnostics",
        accent: BRAND_INK,
        series: recentSpeed,
        onClick: () => onOpenTab("kalman"),
      },
      {
        owner: "Model",
        role: "confidence",
        title: "Regression status",
        meta: `${formatSigned(vlaBias, "%")} suggests the model path still needs inspection`,
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: () => onOpenTab("model"),
      },
    ],
    docs: [
      {
        owner: "Exports",
        role: "backup",
        title: "CSV snapshot",
        meta: `${shots.length || 0} live shots are ready to export`,
        accent: BRAND_GREEN,
        series: recentCarry,
        onClick: onExport,
      },
      {
        owner: "Archive",
        role: "history",
        title: "Session log",
        meta: `${sessions.length} saved sessions are available in the archive`,
        accent: BRAND_INK,
        series: recentSpeed,
        onClick: () => onOpenTab("sessions"),
      },
      {
        owner: "Versions",
        role: "trend",
        title: "Version history",
        meta: latestSession ? `Latest run is ${latestSession.version}` : "No saved versions yet, create a session first",
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: () => onOpenTab("trend"),
      },
    ],
  }[filter];

  const actionTiles: ActionTileData[] = [
    {
      index: "01",
      title: "Speed",
      value: `${animatedSpeed.toFixed(1)}`,
      subtitle: "mph ball speed",
      accent: BRAND_GREEN,
      icon: <IconSpeed />,
      onClick: () => onOpenTab("shots"),
    },
    {
      index: "02",
      title: "VLA",
      value: `${overviewVla.toFixed(1)}°`,
      subtitle: "vertical launch",
      accent: BRAND_INK,
      icon: <IconVla />,
      onClick: () => onOpenTab("accuracy"),
    },
    {
      index: "03",
      title: "HLA",
      value: `${formatSigned(overviewHla, "°")}`,
      subtitle: "horizontal launch",
      accent: BRAND_GREEN,
      icon: <IconHla />,
      onClick: () => onOpenTab("shots"),
    },
    {
      index: "04",
      title: "Spin",
      value: `${Math.round(overviewSpin).toLocaleString()}`,
      subtitle: "rpm back spin",
      accent: BRAND_INK,
      icon: <IconSpinMetric />,
      onClick: onOpenTrajectory,
    },
    {
      index: "05",
      title: "Carry",
      value: `${Math.round(overviewCarry)}`,
      subtitle: "yd carry distance",
      accent: BRAND_GREEN,
      icon: <IconCarryMetric />,
      onClick: onOpenTrajectory,
    },
    {
      index: "06",
      title: "Total",
      value: String(shots.length || 0).padStart(2, "0"),
      subtitle: "shots in the feed",
      accent: BRAND_INK,
      icon: <IconTotalMetric />,
      onClick: () => onOpenTab("shots"),
    },
  ];

  const heroActions: HeroActionData[] = [
    {
      label: "Accuracy",
      icon: <IconTarget />,
      onClick: () => onOpenTab("accuracy"),
      active: false,
    },
    {
      label: "Replay",
      icon: <IconOrbit />,
      onClick: onOpenTrajectory,
      active: false,
    },
    {
      label: liveStatus === "connected" ? "Disconnect" : "Go Live",
      icon: <IconPulse />,
      onClick: onToggleLive,
      active: liveStatus === "connected" || liveStatus === "connecting",
    },
  ];

  return (
    <section className="pr-home">
      <div className="pr-home-stage">
        <div className="pr-home-layout">
          <div className="pr-copy-column">
            {filter === "all" && (
              <div className="pr-home-brandline">
                <span className="pr-home-brand-pill">SPIVOT</span>
                <span className="pr-home-brandline-copy">Golf Performance Intelligence</span>
              </div>
            )}
            <span className="pr-home-eyebrow">{filterCopy.eyebrow}</span>
            {filter === "all" ? (
              <h1 className="pr-home-title-brand">
                <span>Shot Lab</span>
                <span className="is-accent">Range Intelligence</span>
              </h1>
            ) : (
              <h1>{filterCopy.heading}</h1>
            )}
            <p className={filter === "all" ? "pr-home-lede" : undefined}>{filterCopy.detail}</p>

            <div className="pr-filter-row">
              {HOME_FILTERS.map((item) => (
                <button
                  key={item.id}
                  className={`pr-filter-chip ${filter === item.id ? "is-active" : ""}`}
                  onClick={() => onFilterChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="pr-home-microcopy">
              <span>{shots.length} live shots</span>
              <span>{sessions.length} saved sessions</span>
              <span>{club} selected</span>
            </div>

            <div className="pr-insight-grid">
              {insightCards.map((card) => (
                <InsightCard key={`${filter}-${card.title}`} card={card} />
              ))}
            </div>
          </div>

          <div className="pr-hero-column">
            <div className="pr-hero-metric">
              <span className="pr-hero-grade">{heroGrade}</span>
              <span className="pr-hero-label">Consistency</span>
              <strong>{carryAverage}</strong>
              <span className="pr-hero-unit">yd carry avg</span>
            </div>

            <div className="pr-hero-core">
              <TrajectorySculpture spinActive={isSpeedAnimating} />

              <div className="pr-hero-rail">
                {heroActions.map((action) => (
                  <button
                    key={action.label}
                    className={`pr-hero-rail-btn ${action.active ? "is-active" : ""}`}
                    onClick={action.onClick}
                    title={action.label}
                  >
                    {action.icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="pr-hero-speed">
              <span className="pr-hero-speed-label">Ball Speed</span>
              <div className="pr-hero-speed-value">
                <strong>{animatedSpeed.toFixed(1)}</strong>
                <span>mph</span>
              </div>
              <span className="pr-hero-speed-meta">
                {liveStatus === "connected"
                  ? `${liveShotCount} live shots in the feed`
                  : `${club} profile active`}
              </span>
            </div>

            <div className="pr-hero-pills">
              <span className="pr-stat-pill">
                <strong>{shots.length || 12}</strong>
                <span>shots</span>
              </span>
              <span className="pr-stat-pill">
                <strong>{sessions.length || 4}</strong>
                <span>sessions</span>
              </span>
              <span className="pr-stat-pill">
                <strong>{liveStatus === "connected" ? liveShotCount : club}</strong>
                <span>{liveStatus === "connected" ? "live" : "club"}</span>
              </span>
            </div>
          </div>

          <div className="pr-side-column">
            <h2>Shot Overview</h2>
            <p>Latest capture metrics from the active shot feed, staged as a clean six-card summary.</p>

            <div className="pr-action-grid">
              {actionTiles.map((tile) => (
                <ActionTile key={tile.index} tile={tile} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <ScheduleStrip
        schedule={schedule}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
        onOpenSession={() => onOpenTab("compare")}
        onNewSession={onNewSession}
      />
    </section>
  );
}

function InsightCard({ card }: { card: InsightCardData }) {
  return (
    <button className="pr-insight-card" onClick={card.onClick}>
      <div className="pr-insight-head">
        <span className="pr-avatar-mini" style={{ backgroundColor: `${card.accent}20`, color: card.accent }}>
          {initials(card.owner)}
        </span>
        <span>
          <strong>{card.owner}</strong>
          <span>{card.role}</span>
        </span>
      </div>

      <div className="pr-insight-body">
        <h3>{card.title}</h3>
        <p>{card.meta}</p>
      </div>

      <MiniSparkline values={card.series} color={card.accent} />
    </button>
  );
}

function ActionTile({ tile }: { tile: ActionTileData }) {
  const ghostIcon = React.isValidElement(tile.icon)
    ? React.cloneElement(tile.icon as React.ReactElement)
    : tile.icon;

  return (
    <button className="pr-action-tile" onClick={tile.onClick}>
      <span className="pr-action-index">{tile.index}</span>
      <span className="pr-action-icon" style={{ color: tile.accent }}>
        {tile.icon}
      </span>
      <span className="pr-action-ghost" style={{ color: tile.accent }} aria-hidden="true">
        {ghostIcon}
      </span>
      <h3>{tile.title}</h3>
      <strong>{tile.value}</strong>
      <p>{tile.subtitle}</p>
    </button>
  );
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const series = values.length ? values : [1, 3, 2, 4, 2, 5];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const points = series
    .map((value, index) => {
      const x = series.length === 1 ? 50 : (index / (series.length - 1)) * 100;
      const y = max === min ? 18 : 30 - ((value - min) / (max - min)) * 24;
      return `${x},${y}`;
    })
    .join(" ");
  const last = points.split(" ").slice(-1)[0].split(",");

  return (
    <svg className="pr-sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />
    </svg>
  );
}

function TrajectorySculpture({ spinActive }: { spinActive: boolean }) {
  return (
    <div className="pr-sculpture">
      <span className="pr-sculpture-halo" />
      <span className="pr-sculpture-shadow" />

      <div className="pr-golf-ball-wrap">
        <img
          src="/golf-ball.svg"
          alt=""
          className={`pr-golf-ball-image ${spinActive ? "is-spinning" : ""}`}
          draggable={false}
        />
      </div>
    </div>
  );
}

interface WeekSlot {
  key: string;
  date: Date;
  label: string;
  session: Session | null;
  isToday: boolean;
  isActive: boolean;
}

interface ScheduleData {
  label: string;
  slots: WeekSlot[];
  canPrev: boolean;
  canNext: boolean;
}

function ScheduleStrip({
  schedule,
  onPrevWeek,
  onNextWeek,
  onOpenSession,
  onNewSession,
}: {
  schedule: ScheduleData;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onOpenSession: () => void;
  onNewSession: () => void;
}) {
  return (
    <section className="pr-schedule">
      <div className="pr-schedule-head">
        <div className="pr-schedule-title">
          <div className="pr-schedule-nav">
            <button className="pr-inline-icon" onClick={onPrevWeek} disabled={!schedule.canPrev}>
              <IconChevronLeft />
            </button>
            <strong>{schedule.label}</strong>
            <button className="pr-inline-icon" onClick={onNextWeek} disabled={!schedule.canNext}>
              <IconChevronRight />
            </button>
          </div>
        </div>

        <div className="pr-schedule-actions">
          <button className="pr-secondary-pill" onClick={onOpenSession}>
            Compare
          </button>
          <button className="pr-primary-pill" onClick={onNewSession}>
            New Session
          </button>
        </div>
      </div>

      <div className="pr-week-labels">
        {schedule.slots.map((slot) => (
          <span key={slot.key} className={slot.isToday ? "is-today" : ""}>
            {slot.label}
          </span>
        ))}
      </div>

      <div className="pr-week-grid">
        {schedule.slots.map((slot) => {
          const vlaMean = slot.session ? calcSessionStats(slot.session).vla?.mean ?? null : null;
          const isPassing = vlaMean !== null ? Math.abs(vlaMean) <= 1 : false;
          const detail = slot.session
            ? `${slot.session.club} · ${slot.session.shots.length} shots`
            : "Open slot";

          return (
            <button
              key={slot.key}
              className={`pr-week-card ${slot.isActive ? "is-active" : ""} ${slot.session ? "" : "is-empty"}`}
              onClick={slot.session ? onOpenSession : onNewSession}
            >
              <div className="pr-week-card-top">
                <strong>{slot.date.getDate()}</strong>
                <span>
                  {slot.session
                    ? new Date(slot.session.createdAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      }).toLowerCase()
                    : "open"}
                </span>
              </div>

              <div className="pr-week-card-body">
                <h3>{slot.session ? slot.session.version : "New session"}</h3>
                <p>{detail}</p>
                <span className={`pr-week-status ${isPassing ? "is-pass" : ""}`}>
                  {slot.session
                    ? vlaMean !== null
                      ? `${formatSigned(vlaMean, "%")} VLA`
                      : "No TM match"
                    : "Tap to create"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface SecProps {
  tab: TabId;
  shots: Shot[];
  sessions: Session[];
  active: Shot | null;
  playing: boolean;
  club: string;
  tmReady: boolean;
  onSelectShot: (shot: Shot) => void;
  onPlay: () => void;
  onPlayDone: () => void;
  onAddShot: (shot: Shot) => void;
  onNotify: (message: string, type?: "ok" | "err") => void;
  onDelete: (id: string) => void;
  onReset: () => void;
  onNew: () => void;
  onClear: () => void;
  onExport: () => void;
}

function SecPage({
  tab,
  shots,
  sessions,
  active,
  playing,
  club,
  tmReady,
  onSelectShot,
  onPlay,
  onPlayDone,
  onAddShot,
  onNotify,
  onDelete,
  onReset,
  onNew,
  onClear,
  onExport,
}: SecProps) {
  return (
    <div className="pr-secondary-content">
      <Suspense fallback={<Loader />}>
        {tab === "trajectory" && (
          <TrajectoryView
            shots={shots}
            activeShot={active}
            playing={playing}
            onSelectShot={onSelectShot}
            onPlay={onPlay}
            onPlayDone={onPlayDone}
          />
        )}
        {tab === "physics" && <PhysicsView />}
        {tab === "kalman" && <KalmanView />}
        {tab === "model" && <ModelView />}
        {tab === "accuracy" && <AccuracyView shots={shots} tmReady={tmReady} />}
        {tab === "shots" && (
          <ShotLogView
            shots={shots}
            activeShot={active}
            onSelectShot={onSelectShot}
            onClear={onClear}
            onExport={onExport}
          />
        )}
        {tab === "input" && <InputDataView selectedClub={club} onAddShot={onAddShot} onNotify={onNotify} />}
        {tab === "progress" && <ProgressView sessions={sessions} />}
        {tab === "trend" && <TrendView sessions={sessions} />}
        {tab === "compare" && (
          <CompareView sessions={sessions} selectedIds={sessions.map((session) => session.id)} onToggleSession={() => {}} />
        )}
        {tab === "frames" && <FrameScrubberView shots={shots} activeShot={active} onSelectShot={onSelectShot} />}
        {tab === "sessions" && (
          <AllSessionsView sessions={sessions} onDelete={onDelete} onReset={onReset} onNew={onNew} />
        )}
      </Suspense>
    </div>
  );
}

function Loader() {
  return (
    <div className="pr-loader">
      <span className="pr-loader-dot" />
      <span>Loading view…</span>
    </div>
  );
}

function BrandMark() {
  return (
    <img src="/spivot-logo.svg" alt="" className="pr-brand-logo" draggable={false} />
  );
}

function initials(value: string) {
  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function average(values: number[], fallback: number) {
  if (!values.length) {
    return fallback;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function gradeFromPassRate(passRate: number | null) {
  if (passRate === null) return "B";
  if (passRate >= 95) return "A";
  if (passRate >= 85) return "A-";
  if (passRate >= 72) return "B";
  if (passRate >= 58) return "C";
  return "D";
}

function lastValues<T>(items: T[], getValue: (item: T) => number, fallback: number[]) {
  const values = items.slice(-6).map(getValue);
  return values.length ? values : fallback;
}

function formatSigned(value: number, suffix = "") {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function buildScheduleWeek(sessions: Session[], weekPage: number): ScheduleData {
  const sessionsByDay = new Map<string, Session>();
  const ordered = [...sessions].sort(
    (left, right) => left.date.localeCompare(right.date) || left.createdAt - right.createdAt
  );

  for (const session of ordered) {
    sessionsByDay.set(session.date, session);
  }

  const weeks = Array.from(
    new Set(
      ordered.map((session) => toDateKey(startOfWeek(parseDate(session.date))))
    )
  );

  const today = startOfWeek(new Date());
  if (!weeks.length) {
    weeks.push(toDateKey(today));
  }

  const safePage = Math.min(Math.max(weekPage, 0), weeks.length - 1);
  const activeWeekKey = weeks[weeks.length - 1 - safePage];
  const weekStart = parseDate(activeWeekKey);
  const activeSessionDate = ordered.length ? ordered[ordered.length - 1].date : "";

  const slots = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const key = toDateKey(date);
    return {
      key,
      date,
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      session: sessionsByDay.get(key) ?? null,
      isToday: key === toDateKey(new Date()),
      isActive: key === activeSessionDate,
    };
  });

  return {
    label: weekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }).replace(" ", ", "),
    slots,
    canPrev: safePage < weeks.length - 1,
    canNext: safePage > 0,
  };
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const weekday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - weekday);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function IconCluster({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="2.2" fill="currentColor" />
      <circle cx="14" cy="6" r="2.2" fill="currentColor" />
      <circle cx="6" cy="14" r="2.2" fill="currentColor" />
      <circle cx="14" cy="14" r="2.2" fill="currentColor" />
    </svg>
  );
}

function IconTarget({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2v3M10 15v3M2 10h3M15 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSheets({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4.25" y="3.5" width="11.5" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCompare({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5.5h4.5v9H5zM10.5 5.5H15v9h-4.5z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 8.5h.01M13 11.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconTrend({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 14.5 8.2 10l2.6 2.6 5-6.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.4 6.5h2.8v2.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCalendar({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.75" y="5" width="12.5" height="11.25" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 3v3M13.5 3v3M3.75 8h12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendarPlus({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.75" y="5" width="12.5" height="11.25" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 3v3M13.5 3v3M3.75 8h12.5M10 10.25v4M8 12.25h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconOrbit({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="2.1" fill="currentColor" />
      <ellipse cx="10" cy="10" rx="7" ry="3.4" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="10" cy="10" rx="3.4" ry="7" stroke="currentColor" strokeWidth="1.5" transform="rotate(35 10 10)" />
    </svg>
  );
}

function IconPulse({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 10h3.3l1.6-3.5 2.3 7 2.1-4h5.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconWave({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 11c1.3 0 1.3-4 2.6-4s1.3 6 2.6 6 1.3-8 2.6-8 1.3 10 2.6 10 1.3-4 2.6-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconModel({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 6.25 10 3l6 3.25v7.5L10 17l-6-3.25v-7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 3v14M4 6.25 16 13.75" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconDots({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="10" r="1.6" fill="currentColor" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}

function IconFrames({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.5" y="4" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 4v12M13 4v12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconBall({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 7.4c.9-.7 2.2-1.2 3.5-1.2M7.2 10.7c1-.5 2.1-.7 3.3-.7M8 13.7c.8-.3 1.6-.5 2.4-.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconSpeed({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 13a5 5 0 1 1 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m10 10 3-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="10" r="1.25" fill="currentColor" />
    </svg>
  );
}

function IconVla({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 14.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 12.5 13 6.5M13 6.5v4M13 6.5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHla({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 10h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m12.5 7 3 3-3 3M7.5 7l-3 3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSpinMetric({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 4.25a5.75 5.75 0 1 1-4.58 2.27" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 3.75v3.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCarryMetric({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 14.5c2.2-3.7 5-5.7 8.5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m11.5 6.5 3-.5-.6 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 15h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

function IconTotalMetric({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11.5" y="4" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="4" y="11.5" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11.5" y="11.5" width="4.5" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconPlus({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconExport({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3.5v8.5M6.8 8.8 10 12l3.2-3.2M4.5 15.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5.5 7.75 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronLeft({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m12 5.5-4.5 4.5 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m8 5.5 4.5 4.5-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
