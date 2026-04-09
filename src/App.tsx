import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth/AuthProvider";
import { CLUB_NAMES } from "./constants";
import bgGolfImage from "./assets/bg-golf.png";
import { NotificationToast } from "./components/ui/NotificationToast";
import TrackManPulseCard from "./features/shot-iq/components/TrackManPulseCard";
import { useLiveShots } from "./hooks/useLiveShots";
import type { LiveStatus } from "./hooks/useLiveShots";
import { useDesktopBridge } from "./hooks/useDesktopBridge";
import { useNotification } from "./hooks/useNotification";
import { useSessionLibrary } from "./hooks/useSessionLibrary";
import { useSessions } from "./hooks/useSessions";
import { useUserShots } from "./hooks/useUserShots";
import { isDesktopApp } from "./lib/desktop";
import type { SessionLibraryBucket } from "./hooks/useSessionLibrary";
import type { Session, Shot, TabId } from "./types";
import { exportShotsToCSV, generateSyntheticShot } from "./utils/shotData";
import { calcSessionStats, pctError } from "./utils/stats";
import NewSessionModal from "./components/modules/NewSessionModal";
import BridgeConnectionsView from "./views/BridgeConnectionsView";

const AccuracyView = lazy(() => import("./views/AccuracyView"));
const ShotLogView = lazy(() => import("./views/ShotLogView"));
const ProgressView = lazy(() => import("./views/ProgressView"));
const CompareView = lazy(() => import("./views/CompareView"));
const AllSessionsView = lazy(() => import("./views/AllSessionsView"));
const PRIMARY_NAV = [
  { id: "dashboard", label: "Home", icon: IconCluster },
  { id: "accuracy", label: "Accuracy", icon: IconTarget },
  { id: "shots", label: "Shot Log", icon: IconSheets },
  { id: "compare", label: "Compare", icon: IconCompare },
  { id: "progress", label: "Progress", icon: IconTrend },
  { id: "sessions", label: "Sessions", icon: IconCalendar },
] as const satisfies { id: TabId; label: string; icon: IconComponent }[];


const DESKTOP_BRIDGE_NAV = { id: "bridge", label: "Bridge Connections", icon: IconPulse } as const satisfies {
  id: TabId;
  label: string;
  icon: IconComponent;
};

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
    eyebrow: "Shot IQ",
    title: "TrackMan Intelligence",
    description: "A matched-shot analysis studio with drift readouts, tendencies, and calibration scoring.",
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
  bridge: {
    eyebrow: "Desktop",
    title: "Bridge Connections",
    description: "Manage the GSPro bridge and premium offline companion pairing for the Electron desktop shell.",
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
  variant?: "default" | "trackman";
  matchedCount?: number;
  totalCount?: number;
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

function normalizeShot(shot: Shot): Shot {
  return {
    ...shot,
    capturedAt: shot.capturedAt ?? Date.now(),
    pr: {
      ...shot.pr,
      total: shot.pr.total ?? shot.pr.carry,
    },
    tm: shot.tm
      ? {
          ...shot.tm,
          total: shot.tm.total ?? shot.tm.carry,
        }
      : null,
  };
}

export default function App() {
  const { user, logOut } = useAuth();
  const isDesktopShell = isDesktopApp();
  const [tab, setTab] = useState<TabId>("dashboard");
  const [club, setClub] = useState<string>("7-Iron");
  const [clubOpen, setClubOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeShot, setActiveShot] = useState<Shot | null>(null);
  const [homeFilter, setHomeFilter] = useState<HomeFilter>("all");
  const [weekPage, setWeekPage] = useState(0);
  const [newSessionModalOpen, setNewSessionModalOpen] = useState(false);
  const [newSessionError, setNewSessionError] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

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
  const { shots: cloudShots, loading: cloudShotsLoading, error: cloudShotsError } = useUserShots(user?.uid);
  const {
    buckets: sessionBuckets,
    activeSessionId,
    loading: sessionLibraryLoading,
    error: sessionLibraryError,
    startSession,
    endSession,
    deleteBucket,
  } = useSessionLibrary(user?.uid, club);
  const desktopBridge = useDesktopBridge();
  const primaryNav = isDesktopShell ? [...PRIMARY_NAV, DESKTOP_BRIDGE_NAV] : PRIMARY_NAV;

  const handleLiveShot = (shot: Shot) => {
    const normalizedShot = normalizeShot(shot);
    addLiveShot(normalizedShot);
    setActiveShot(normalizedShot);
  };

  const {
    status: liveStatus,
    shotCount: liveShotCount,
    connect: liveConnect,
    disconnect: liveDisconnect,
  } = useLiveShots({ onShot: handleLiveShot, onNotify: notify, autoConnect: false });

  const shots = useMemo(() => {
    const merged: Array<{ shot: Shot; order: number }> = [];
    const seen = new Set<string>();
    let order = 0;

    for (const shot of cloudShots) {
      const key = String(shot.id);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ shot: normalizeShot(shot), order: order++ });
    }

    for (const shot of liveShots) {
      const key = String(shot.id);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ shot: normalizeShot(shot), order: order++ });
    }

    return merged
      .sort((left, right) => {
        const timeDelta = (left.shot.capturedAt ?? 0) - (right.shot.capturedAt ?? 0);
        if (timeDelta !== 0) return timeDelta;
        return left.order - right.order;
      })
      .map(({ shot }) => shot);
  }, [cloudShots, liveShots]);

  useEffect(() => {
    if (!cloudShotsError) return;
    notify(cloudShotsError, "err");
  }, [cloudShotsError, notify]);

  useEffect(() => {
    if (!sessionLibraryError) return;
    notify(sessionLibraryError, "err");
  }, [sessionLibraryError, notify]);

  useEffect(() => {
    if (!shots.length) {
      setActiveShot(null);
      return;
    }

    if (tab === "dashboard") {
      setActiveShot(shots[shots.length - 1]);
      return;
    }

    if (!activeShot) {
      setActiveShot(shots[shots.length - 1]);
      return;
    }

    const stillExists = shots.some((shot) => String(shot.id) === String(activeShot.id));
    if (!stillExists) {
      setActiveShot(shots[shots.length - 1]);
    }
  }, [activeShot, shots]);

  const profileName = user?.displayName || user?.email || desktopBridge.pairing?.deviceName || "SPIVOT User";
  const profileSubtitle = user
    ? cloudShotsLoading
      ? "Syncing cloud shots"
      : `${cloudShots.length} cloud ${cloudShots.length === 1 ? "shot" : "shots"} loaded`
    : desktopBridge.premiumAccess
      ? "Offline companion unlocked"
      : desktopBridge.bridgeAccess
        ? "Bridge-only access"
        : "Desktop bridge available";

  const addShot = () => {
    const shot = normalizeShot(generateSyntheticShot(club));
    addLiveShot(shot);
    setActiveShot(shot);
    notify("Synthetic shot logged");
  };

  const handleStartSession = async (draft: { title: string; club: string; color: string }) => {
    if (!user?.uid) {
      setNewSessionError("Offline mode is view-only right now. Sign in to create cloud sessions from the suite.");
      notify("Sign in to create cloud sessions", "err");
      return;
    }

    setCreatingSession(true);
    setNewSessionError(null);

    if (activeSessionId) {
      try {
        await endSession();
      } catch (error) {
        console.error("[Session] Failed to end active session before creating a new one:", error);
      }
    }

    try {
      setClub(draft.club);
      await startSession(draft);
      setNewSessionModalOpen(false);
      openTab("shots");
      notify(`${draft.title} started`);
    } catch (error) {
      console.error("[Session] Failed to create session:", error);
      setNewSessionError(
        "Firestore blocked session creation. Update your rules for users/{uid}/sessions/** and users/{uid}/sessionState/current."
      );
      notify("Session creation is blocked by Firestore rules", "err");
    } finally {
      setCreatingSession(false);
    }
  };

  const handleEndSession = async () => {
    await endSession();
    notify("Session ended");
  };

  const openTab = (nextTab: TabId) => {
    setTab(nextTab);
    setClubOpen(false);
  };

  const openNewSessionModal = () => {
    setClubOpen(false);
    setNewSessionError(null);
    setNewSessionModalOpen(true);
  };

  const toggleLive = () => {
    if (liveStatus === "connected") {
      liveDisconnect();
      return;
    }
    liveConnect();
  };

  const sectionCopy = TAB_COPY[tab];
  const isImmersiveStage = tab === "accuracy" || tab === "shots";

  return (
    <div className="pr-page">
      <NotificationToast notification={notification} />
      {newSessionModalOpen && (
        <NewSessionModal
          sourceShots={liveShots}
          defaultClub={club}
          isSaving={creatingSession}
          error={newSessionError}
          onClose={() => {
            if (creatingSession) return;
            setNewSessionModalOpen(false);
          }}
          onSave={(draft) => {
            void handleStartSession(draft);
          }}
        />
      )}

      <div className="pr-shell">
        <div className="pr-frame">
          <HeaderBar
            tab={tab}
            club={club}
            tmReady={tmReady}
            liveStatus={liveStatus}
            liveShotCount={liveShotCount}
            clubOpen={clubOpen}
            primaryNav={primaryNav}
            onOpenTab={openTab}
            onToggleClub={() => {
              setClubOpen((current) => !current);
            }}
            onSelectClub={(nextClub) => {
              setClub(nextClub);
              setClubOpen(false);
            }}
            onAddShot={addShot}
            onNewSession={openNewSessionModal}
            onToggleLive={toggleLive}
            profileName={profileName}
            profileSubtitle={profileSubtitle}
            onSignOut={() => {
              if (user) {
                void logOut();
                return;
              }

              void desktopBridge.clearOfflineAccess();
            }}
          />

          {tab === "dashboard" ? (
            <HomeView
              filter={homeFilter}
              club={club}
              shots={shots}
              sessions={sessions}
              sessionBuckets={sessionBuckets}
              activeSessionId={activeSessionId}
              weekPage={weekPage}
              activeShot={activeShot}
              liveStatus={liveStatus}
              liveShotCount={liveShotCount}
              onFilterChange={setHomeFilter}
              onOpenTab={openTab}
              onPrevWeek={() => setWeekPage((current) => current + 1)}
              onNextWeek={() => setWeekPage((current) => Math.max(current - 1, 0))}
              onAddShot={addShot}
              onNewSession={openNewSessionModal}
              onExport={() => {
                exportShotsToCSV(shots);
                notify("CSV exported");
              }}
              onToggleLive={toggleLive}
            />
          ) : (
            <section className={`pr-secondary-stage ${isImmersiveStage ? "is-immersive" : ""}`}>
              {!isImmersiveStage && (
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
              )}

              <div className={`pr-secondary-stage-inner ${isImmersiveStage ? "is-immersive" : ""}`}>
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
                  onNew={openNewSessionModal}
                  onClear={() => {
                    clearLiveShots();
                    setActiveShot(null);
                    notify("Live shots cleared");
                  }}
                  onExport={() => {
                    exportShotsToCSV(shots);
                    notify("CSV exported");
                  }}
                  sessionBuckets={sessionBuckets}
                  sessionLibraryLoading={sessionLibraryLoading}
                  sessionLibraryError={sessionLibraryError}
                  activeSessionId={activeSessionId}
                  onStartSession={openNewSessionModal}
                  onEndSession={() => {
                    void handleEndSession();
                  }}
                  onDeleteBucket={(bucketId) => {
                    void deleteBucket(bucketId).then(() => notify(bucketId === "misc" ? "Misc shots deleted" : "Session deleted"));
                  }}
                  bridgeDesktop={desktopBridge}
                />
              </div>
            </section>
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
  clubOpen: boolean;
  primaryNav: readonly { id: TabId; label: string; icon: IconComponent }[];
  onOpenTab: (tab: TabId) => void;
  onToggleClub: () => void;
  onSelectClub: (club: string) => void;
  onAddShot: () => void;
  onNewSession: () => void;
  onToggleLive: () => void;
  profileName: string;
  profileSubtitle: string;
  onSignOut: () => void;
}

function HeaderBar({
  tab,
  club,
  tmReady,
  liveStatus,
  liveShotCount,
  clubOpen,
  primaryNav,
  onOpenTab,
  onToggleClub,
  onSelectClub,
  onAddShot,
  onNewSession,
  onToggleLive,
  profileName,
  profileSubtitle,
  onSignOut,
}: HeaderBarProps) {
  return (
    <header className="pr-header">
      <button className="pr-brand" onClick={() => onOpenTab("dashboard")} aria-label="SpinVOT home">
        <BrandMark />
      </button>

      <div className="pr-header-nav">
        {primaryNav.map((item) => {
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

        <div className="pr-profile">
          <span className="pr-profile-copy">
            <strong>{profileName}</strong>
            <span>{profileSubtitle}</span>
          </span>
          <span className="pr-avatar">{initials(profileName)}</span>
        </div>

        <button className="pr-header-signout" onClick={onSignOut}>
          Log out
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
  sessionBuckets: SessionLibraryBucket[];
  activeSessionId: string | null;
  weekPage: number;
  activeShot: Shot | null;
  liveStatus: LiveStatus;
  liveShotCount: number;
  onFilterChange: (filter: HomeFilter) => void;
  onOpenTab: (tab: TabId) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onAddShot: () => void;
  onNewSession: () => void;
  onExport: () => void;
  onToggleLive: () => void;
}

function HomeView({
  filter,
  club,
  shots,
  sessions,
  sessionBuckets,
  activeSessionId,
  weekPage,
  activeShot,
  liveStatus,
  liveShotCount,
  onFilterChange,
  onOpenTab,
  onPrevWeek,
  onNextWeek,
  onAddShot,
  onNewSession,
  onExport,
  onToggleLive,
}: HomeViewProps) {
  const savedSessionBuckets = sessionBuckets.filter((bucket) => bucket.kind === "session");
  const savedSessionCount = savedSessionBuckets.length;
  const latestSavedBucket = savedSessionBuckets[0] ?? null;
  const latestShot = activeShot ?? (shots.length ? shots[shots.length - 1] : null);
  const latestSession = sessions.length ? sessions[sessions.length - 1] : null;
  const latestStats = latestSession ? calcSessionStats(latestSession) : null;
  const latestSessionLabel = latestSavedBucket?.title ?? latestSession?.version ?? null;
  const schedule = buildScheduleWeek(savedSessionBuckets, activeSessionId, weekPage);
  const recentSpeed = lastValues(shots, (shot) => shot.pr.speed, [92, 95, 98, 101, 103, 100]);
  const recentVla = lastValues(shots, (shot) => shot.pr.vla, [18.8, 19.4, 20.2, 20.8, 19.9, 20.4]);
  const recentHla = lastValues(shots, (shot) => shot.pr.hla, [-0.8, -0.2, 0.4, 0.7, 0.1, -0.1]);
  const recentCarry = lastValues(shots, (shot) => shot.pr.carry, [154, 161, 166, 170, 173, 168]);
  const recentSpin = lastValues(shots, (shot) => shot.pr.spin, [6580, 6700, 6900, 6760, 6885, 7020]);
  const recentTotal = lastValues(shots, (shot) => shot.pr.total ?? shot.pr.carry, [165, 171, 177, 182, 185, 180]);

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
  const overviewSpeed = latestShot?.pr.speed ?? average(recentSpeed, 100);
  const overviewVla = latestShot?.pr.vla ?? average(recentVla, 20.1);
  const overviewHla = latestShot?.pr.hla ?? average(recentHla, 0.2);
  const overviewSpin = latestShot?.pr.spin ?? average(recentSpin, 6820);
  const overviewCarry = latestShot?.pr.carry ?? average(recentCarry, 172);
  const overviewTotal = latestShot?.pr.total ?? average(recentTotal, overviewCarry);
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
      detail: "Surface the next highest-leverage fixes before diving into saved shots, comparisons, and progress review.",
      sideTitle: "Shot Overview",
    },
    tests: {
      eyebrow: "Validation mode",
      heading: "Personal Tests and Analysis",
      detail: "Pin the current verification views, session checks, and live capture checkpoints in one sweep.",
      sideTitle: "Shot Overview",
    },
    labs: {
      eyebrow: "Lab mode",
      heading: "Calibration Labs and Analysis",
      detail: "Jump from the hero surface into session review, accuracy, and progress without the old dashboard clutter.",
      sideTitle: "Shot Overview",
    },
    docs: {
      eyebrow: "Reference mode",
      heading: "Reference Docs and Analysis",
      detail: "Keep exports, archives, and session history closer to the home experience for quick review loops.",
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
        variant: "trackman" as const,
        matchedCount: shots.filter((shot) => shot.tm?.carry != null).length,
        totalCount: shots.length,
        onClick: () => onOpenTab("accuracy"),
      },
      {
        owner: "Live Bay",
        role: "capture",
        title: "Spin stability",
        meta: `${spinAverage.toLocaleString()} rpm through the latest swings`,
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: () => onOpenTab("shots"),
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
        meta: latestSessionLabel
          ? `Review ${latestSessionLabel} before adjusting the mount`
          : "Log one new session to build the next coaching note",
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: () => onOpenTab("shots"),
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
        owner: "Latest Shot",
        role: "review",
        title: "Capture ready",
        meta: latestShot ? `${latestShot.trackPts ?? 0} tracked points available for the latest shot review` : "Open shot log once a shot lands",
        accent: BRAND_INK,
        series: recentCarry,
        onClick: () => onOpenTab("shots"),
      },
      {
        owner: "Session Review",
        role: "inspection",
        title: "Shot log ready",
        meta: shots.length ? `${shots.length} captured shots are ready to inspect in the log` : "Capture a shot to start reviewing",
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: () => onOpenTab("shots"),
      },
    ],
    labs: [
      {
        owner: "Session Review",
        role: "validator",
        title: "Impact fit",
        meta: latestSessionLabel
          ? `${latestSessionLabel} is the best candidate for session review`
          : "Seed one session and verify the launch fit",
        accent: BRAND_GREEN,
        series: recentCarry,
        onClick: () => onOpenTab("compare"),
      },
      {
        owner: "Progress",
        role: "filtering",
        title: "Smoothing check",
        meta: shots.length ? `Recent captures can stress the consistency trend right now` : "Generate a few shots to populate session trends",
        accent: BRAND_INK,
        series: recentSpeed,
        onClick: () => onOpenTab("progress"),
      },
      {
        owner: "Accuracy",
        role: "confidence",
        title: "Regression status",
        meta: `${formatSigned(vlaBias, "%")} suggests the current setup still needs inspection`,
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: () => onOpenTab("accuracy"),
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
        meta: `${savedSessionCount} saved sessions are available in the archive`,
        accent: BRAND_INK,
        series: recentSpeed,
        onClick: () => onOpenTab("sessions"),
      },
      {
        owner: "Versions",
        role: "history",
        title: "Version history",
        meta: latestSessionLabel ? `Latest run is ${latestSessionLabel}` : "No saved versions yet, create a session first",
        accent: BRAND_GREEN,
        series: recentSpin,
        onClick: () => onOpenTab("sessions"),
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
      onClick: () => onOpenTab("shots"),
    },
    {
      index: "05",
      title: "Carry",
      value: `${Math.round(overviewCarry)}`,
      subtitle: "yd carry distance",
      accent: BRAND_GREEN,
      icon: <IconCarryMetric />,
      onClick: () => onOpenTab("shots"),
    },
    {
      index: "06",
      title: "Total",
      value: `${Math.round(overviewTotal)}`,
      subtitle: "yd total distance",
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
      label: liveStatus === "connected" ? "Disconnect" : "Go Live",
      icon: <IconPulse />,
      onClick: onToggleLive,
      active: liveStatus === "connected" || liveStatus === "connecting",
    },
  ];

  return (
    <section className="pr-home">
      <div className="pr-home-stage">
        <FairwayBackdrop />

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
              <span>{savedSessionCount} saved sessions</span>
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

            <div className="pr-hero-core" aria-hidden="true" />

            <div className="pr-hero-speed-stack">
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
                  <strong>{savedSessionCount || 0}</strong>
                  <span>sessions</span>
                </span>
                <span className="pr-stat-pill">
                  <strong>{liveStatus === "connected" ? liveShotCount : club}</strong>
                  <span>{liveStatus === "connected" ? "live" : "club"}</span>
                </span>
              </div>
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

function FairwayBackdrop() {
  return (
    <div className="pr-home-backdrop" aria-hidden="true">
      <img src={bgGolfImage} alt="" className="pr-home-backdrop-image" draggable={false} />
    </div>
  );
}

function InsightCard({ card }: { card: InsightCardData }) {
  if (card.variant === "trackman") {
    return (
      <TrackManPulseCard
        title={card.title}
        meta={card.meta}
        series={card.series}
        matchedCount={card.matchedCount}
        totalCount={card.totalCount}
        onClick={card.onClick}
      />
    );
  }

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
  session: {
    id: string;
    title: string;
    club: string;
    shotCount: number;
    createdAt: number;
    vlaMean: number | null;
    isActive: boolean;
  } | null;
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
          const vlaMean = slot.session?.vlaMean ?? null;
          const isPassing = vlaMean !== null ? Math.abs(vlaMean) <= 1 : false;
          const detail = slot.session
            ? `${slot.session.club} · ${slot.session.shotCount} shots`
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
                <h3>{slot.session ? slot.session.title : "New session"}</h3>
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
  sessionBuckets: import("./hooks/useSessionLibrary").SessionLibraryBucket[];
  sessionLibraryLoading: boolean;
  sessionLibraryError: string | null;
  activeSessionId: string | null;
  onStartSession: () => void;
  onEndSession: () => void;
  onDeleteBucket: (bucketId: string) => void;
  bridgeDesktop: ReturnType<typeof useDesktopBridge>;
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
  sessionBuckets,
  sessionLibraryLoading,
  sessionLibraryError,
  activeSessionId,
  onStartSession,
  onEndSession,
  onDeleteBucket,
  bridgeDesktop,
}: SecProps) {
  return (
    <div className="pr-secondary-content">
      <Suspense fallback={<Loader />}>
        {tab === "accuracy" && <AccuracyView shots={shots} sessions={sessions} tmReady={tmReady} />}
        {tab === "shots" && (
          <ShotLogView
            buckets={sessionBuckets}
            loading={sessionLibraryLoading}
            error={sessionLibraryError}
            activeSessionId={activeSessionId}
            onSelectShot={onSelectShot}
            onStartSession={onStartSession}
            onEndSession={onEndSession}
            onDeleteBucket={onDeleteBucket}
          />
        )}
        {tab === "progress" && <ProgressView sessions={sessions} />}
        {tab === "compare" && (
          <CompareView sessions={sessions} selectedIds={sessions.map((session) => session.id)} onToggleSession={() => {}} />
        )}
        {tab === "bridge" && (
          <BridgeConnectionsView
            bridge={bridgeDesktop.bridge}
            pairing={bridgeDesktop.pairing}
            entitlement={bridgeDesktop.entitlement}
            connectors={bridgeDesktop.connectors}
            connectorLogs={bridgeDesktop.connectorLogs}
            loading={bridgeDesktop.loading}
            error={bridgeDesktop.error}
            offlineAllowed={bridgeDesktop.premiumAccess}
            bridgeOnly={bridgeDesktop.bridgeAccess && !bridgeDesktop.premiumAccess}
            pairingUrl={bridgeDesktop.pairingUrl}
            manualCode={bridgeDesktop.manualCode}
            onConnectConnector={bridgeDesktop.connectConnector}
            onSendGsproTestShot={bridgeDesktop.sendGsproTestShot}
            onRefresh={bridgeDesktop.refresh}
            onClearOfflineAccess={bridgeDesktop.clearOfflineAccess}
          />
        )}
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

function buildScheduleWeek(
  sessionBuckets: SessionLibraryBucket[],
  activeSessionId: string | null,
  weekPage: number
): ScheduleData {
  const sessionsByDay = new Map<string, WeekSlot["session"]>();
  const ordered = [...sessionBuckets]
    .map((bucket) => {
      const createdAt = bucket.createdAt || bucket.updatedAt || (bucket.id === activeSessionId ? Date.now() : 0);
      if (!createdAt) {
        return null;
      }

      const vlaSamples = bucket.shots
        .filter((shot) => shot.tm?.vla != null)
        .map((shot) => pctError(shot.pr.vla, shot.tm!.vla as number));
      const vlaMean = vlaSamples.length
        ? vlaSamples.reduce((sum, value) => sum + value, 0) / vlaSamples.length
        : null;

      return {
        id: bucket.id,
        title: bucket.title,
        club: bucket.club,
        shotCount: Math.max(bucket.shotCount, bucket.shots.length),
        createdAt,
        vlaMean,
        isActive: bucket.id === activeSessionId,
      };
    })
    .filter((session): session is NonNullable<typeof session> => Boolean(session))
    .sort((left, right) => left.createdAt - right.createdAt);

  for (const session of ordered) {
    sessionsByDay.set(toDateKey(new Date(session.createdAt)), session);
  }

  const safePage = Math.max(weekPage, 0);
  const weekStart = startOfWeek(addDays(new Date(), safePage * -7));
  const activeSession = ordered.find((session) => session.isActive) ?? null;
  const activeSessionDate = activeSession ? toDateKey(new Date(activeSession.createdAt)) : "";
  const labelAnchor = addDays(weekStart, 3);

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
    label: labelAnchor.toLocaleDateString("en-US", { month: "long", year: "numeric" }).replace(" ", ", "),
    slots,
    canPrev: safePage < 51,
    canNext: safePage > 0,
  };
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
