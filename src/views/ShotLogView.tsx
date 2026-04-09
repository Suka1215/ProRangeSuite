import React, { useEffect, useMemo, useState } from "react";
import type { SessionLibraryBucket } from "../hooks/useSessionLibrary";
import type { Shot } from "../types";

interface ShotLogViewProps {
  buckets: SessionLibraryBucket[];
  loading: boolean;
  error: string | null;
  activeSessionId: string | null;
  onSelectShot: (shot: Shot) => void;
  onStartSession: () => Promise<void> | void;
  onEndSession: () => Promise<void> | void;
  onDeleteBucket: (bucketId: string) => Promise<void> | void;
}

type DateFilter = "all" | "week" | "day";
type ShotSortKey = "capturedAt" | "speed" | "vla" | "hla" | "spin" | "carry" | "total";
type SortDirection = "asc" | "desc";

interface SessionShotRow {
  shot: Shot;
  shotNumber: number;
}

const DATE_FILTERS: Array<{ id: DateFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "week", label: "This Week" },
  { id: "day", label: "Today" },
];

const SHOT_COLUMNS: Array<{ key: ShotSortKey; label: string }> = [
  { key: "capturedAt", label: "Date Created" },
  { key: "speed", label: "Speed" },
  { key: "vla", label: "VLA" },
  { key: "hla", label: "HLA" },
  { key: "spin", label: "Spin" },
  { key: "carry", label: "Carry" },
  { key: "total", label: "Total" },
];

function bucketShotCount(bucket: SessionLibraryBucket) {
  return Math.max(bucket.shotCount, bucket.shots.length);
}

function averageMetric(shots: Shot[], pick: (shot: Shot) => number) {
  if (!shots.length) return null;
  const values = shots.map(pick).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatStamp(value: number) {
  if (!value) return "Awaiting sync";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShotTime(shot: Shot) {
  if (shot.capturedAt) {
    return new Date(shot.capturedAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return shot.timestamp;
}

function formatMetric(value: number | null | undefined, options: { unit: string; digits?: number; signed?: boolean }) {
  if (value == null || !Number.isFinite(value)) return "—";

  const digits = options.digits ?? 0;
  const prefix = options.signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}${options.unit}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  return date.getTime();
}

function matchesDateFilter(value: number, filter: DateFilter) {
  if (filter === "all") return true;
  if (!value) return false;

  if (filter === "day") {
    return value >= startOfToday();
  }

  return value >= startOfWeek();
}

function parseHexColor(value: string) {
  const normalized = value.replace("#", "");
  const source = normalized.length === 3
    ? normalized
        .split("")
        .map((segment) => `${segment}${segment}`)
        .join("")
    : normalized;
  const int = Number.parseInt(source, 16);

  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function mixColor(base: string, target: string, amount: number) {
  const left = parseHexColor(base);
  const right = parseHexColor(target);
  const clamp = Math.max(0, Math.min(1, amount));
  const mix = (start: number, end: number) => Math.round(start + (end - start) * clamp);

  const r = mix(left.r, right.r);
  const g = mix(left.g, right.g);
  const b = mix(left.b, right.b);

  return `#${[r, g, b]
    .map((segment) => segment.toString(16).padStart(2, "0"))
    .join("")}`;
}

function sourceLabel(bucket: SessionLibraryBucket) {
  if (bucket.kind === "misc") return "Misc";
  if (bucket.source === "suite") return "Suite";
  if (bucket.source === "app") return "App";
  if (bucket.source === "gspro") return "GSPro";
  return "Session";
}

function cardTheme(bucket: SessionLibraryBucket, isSelected: boolean) {
  const accent = bucket.kind === "misc" ? "#eff2ef" : bucket.color;
  const text = bucket.kind === "misc" ? "#20242c" : mixColor(accent, "#101317", 0.86);
  const muted = bucket.kind === "misc" ? "rgba(32,36,44,0.62)" : mixColor(accent, "#5f6878", 0.76);

  return {
    "--shot-card-bg": isSelected
      ? `linear-gradient(180deg, ${mixColor(accent, "#ffffff", 0.72)}, ${mixColor(accent, "#eff8ef", 0.82)})`
      : `linear-gradient(180deg, ${mixColor(accent, "#ffffff", 0.9)}, ${mixColor(accent, "#f5f7f5", 0.94)})`,
    "--shot-card-border": bucket.kind === "misc" ? "rgba(38,41,48,0.08)" : mixColor(accent, "#d6edd8", 0.52),
    "--shot-card-ink": text,
    "--shot-card-muted": muted,
    "--shot-card-pill": bucket.kind === "misc" ? "rgba(255,255,255,0.92)" : mixColor(accent, "#ffffff", 0.76),
    "--shot-card-dot": bucket.kind === "misc" ? "#98a2b3" : accent,
  } as React.CSSProperties;
}

function shotSortValue(row: SessionShotRow, key: ShotSortKey) {
  switch (key) {
    case "capturedAt":
      return row.shot.capturedAt ?? 0;
    case "speed":
      return row.shot.pr.speed ?? 0;
    case "vla":
      return row.shot.pr.vla ?? 0;
    case "hla":
      return row.shot.pr.hla ?? 0;
    case "spin":
      return row.shot.pr.spin ?? 0;
    case "carry":
      return row.shot.pr.carry ?? 0;
    case "total":
      return row.shot.pr.total ?? row.shot.pr.carry ?? 0;
    default:
      return 0;
  }
}

function matchesShotSearch(row: SessionShotRow, query: string) {
  if (!query) return true;

  const haystack = [
    row.shot.id,
    row.shot.club,
    formatShotTime(row.shot),
    row.shot.timestamp,
    row.shot.pr.speed.toFixed(1),
    row.shot.pr.vla.toFixed(1),
    row.shot.pr.hla.toFixed(1),
    Math.round(row.shot.pr.spin).toString(),
    Math.round(row.shot.pr.carry).toString(),
    Math.round(row.shot.pr.total ?? row.shot.pr.carry).toString(),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export default function ShotLogView({
  buckets,
  loading,
  error,
  activeSessionId,
  onSelectShot,
  onStartSession,
  onEndSession,
  onDeleteBucket,
}: ShotLogViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [shotSearch, setShotSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shotSortKey, setShotSortKey] = useState<ShotSortKey>("capturedAt");
  const [shotSortDirection, setShotSortDirection] = useState<SortDirection>("desc");

  const visibleBuckets = useMemo(() => {
    const filtered = buckets.filter((bucket) => bucket.kind === "misc" || matchesDateFilter(bucket.updatedAt, dateFilter));

    return filtered.slice().sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      if (left.kind !== right.kind) return left.kind === "misc" ? 1 : -1;
      return right.updatedAt - left.updatedAt;
    });
  }, [buckets, dateFilter]);

  useEffect(() => {
    if (!visibleBuckets.length) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) => {
      if (current && visibleBuckets.some((bucket) => bucket.id === current)) {
        return current;
      }

      if (activeSessionId && visibleBuckets.some((bucket) => bucket.id === activeSessionId)) {
        return activeSessionId;
      }

      return visibleBuckets[0]?.id ?? null;
    });
  }, [activeSessionId, visibleBuckets]);

  const selectedBucket =
    visibleBuckets.find((bucket) => bucket.id === selectedId) ??
    buckets.find((bucket) => bucket.id === selectedId) ??
    visibleBuckets[0] ??
    null;

  const cardCount = visibleBuckets.filter((bucket) => bucket.kind === "session").length;

  const shotRows = useMemo(() => {
    if (!selectedBucket) return [];

    const query = shotSearch.trim().toLowerCase();
    const direction = shotSortDirection === "asc" ? 1 : -1;
    const rows = selectedBucket.shots.map((shot, index) => ({
      shot,
      shotNumber: selectedBucket.shots.length - index,
    }));

    return rows
      .filter((row) => matchesShotSearch(row, query))
      .sort((left, right) => {
        const delta = shotSortValue(left, shotSortKey) - shotSortValue(right, shotSortKey);
        if (delta !== 0) return delta * direction;
        return (right.shot.capturedAt ?? 0) - (left.shot.capturedAt ?? 0);
      });
  }, [selectedBucket, shotSearch, shotSortDirection, shotSortKey]);

  function toggleSort(nextKey: ShotSortKey) {
    if (shotSortKey === nextKey) {
      setShotSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }

    setShotSortKey(nextKey);
    setShotSortDirection("desc");
  }

  async function handleDeleteSelected() {
    if (!selectedBucket) return;
    setDeletingId(selectedBucket.id);
    try {
      await onDeleteBucket(selectedBucket.id);
      if (selectedId === selectedBucket.id) {
        setSelectedId(null);
      }
    } finally {
      setDeletingId(null);
    }
  }

  function renderCard(bucket: SessionLibraryBucket, index: number) {
    const isSelected = selectedBucket?.id === bucket.id;
    const averageCarry = averageMetric(bucket.shots, (shot) => shot.pr.carry);
    const shots = bucketShotCount(bucket);
    const label = bucket.kind === "misc"
      ? "Misc"
      : bucket.isActive
        ? "Active Session"
        : index === 0
          ? "Latest"
          : `#${String(index + 1).padStart(2, "0")}`;

    return (
      <button
        key={bucket.id}
        className={`pr-shotsession-card ${isSelected ? "is-selected" : ""}`}
        style={cardTheme(bucket, isSelected)}
        onClick={() => setSelectedId(bucket.id)}
      >
        <div className="pr-shotsession-card-top">
          <span className="pr-shotsession-label">{label}</span>
          <span className="pr-shotsession-datetime">
            <span className="pr-shotsession-dot" />
            {formatStamp(bucket.updatedAt)}
          </span>
        </div>

        <strong>{bucket.title}</strong>
        <p>
          {bucket.kind === "misc"
            ? "Unassigned shots captured outside a named session."
            : `${bucket.club} · ${sourceLabel(bucket)} · ${shots} shots`}
        </p>

        <div className="pr-shotsession-pills">
          <span>{shots} Shots</span>
          <span>{averageCarry != null ? `${Math.round(averageCarry)} YD` : "— YD"}</span>
          <span>{bucket.isActive ? "Active" : sourceLabel(bucket)}</span>
        </div>
      </button>
    );
  }

  return (
    <div className="pr-shotdesk">
      <aside className="pr-shotdesk-nav">
        <div className="pr-shotdesk-head">
          <div>
            <span className="pr-shotdesk-eyebrow">Recent Sessions</span>
            <h1>Shot Log</h1>
            <p>Newest first. Pick a saved session to drive the shot table on the right.</p>
          </div>
          <span className="pr-shotdesk-count">{cardCount}</span>
        </div>

        <div className="pr-shotdesk-filters">
          {DATE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              className={`pr-shotdesk-filter ${dateFilter === filter.id ? "is-active" : ""}`}
              onClick={() => setDateFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {error && <div className="pr-shotdesk-error">{error}</div>}

        <div className="pr-shotdesk-scroll">
          {loading && !visibleBuckets.length ? (
            <div className="pr-shotdesk-empty">
              <h3>Loading sessions</h3>
              <p>Loading your saved app sessions and misc shots from this device.</p>
            </div>
          ) : visibleBuckets.length ? (
            visibleBuckets.map((bucket, index) => renderCard(bucket, index))
          ) : (
            <div className="pr-shotdesk-empty">
              <h3>No sessions yet</h3>
              <p>Start a session and it will show up here immediately.</p>
              <button className="pr-shotdesk-emptybtn" onClick={() => void onStartSession()}>
                New Session
              </button>
            </div>
          )}
        </div>
      </aside>

      <section className="pr-shotledger">
        {!selectedBucket ? (
          <div className="pr-shotdesk-empty is-panel">
            <h3>Select a session</h3>
            <p>Choose a session card on the left to load its shot table.</p>
          </div>
        ) : (
          <>
            <div className="pr-shotledger-toolbar">
              <label className="pr-shotledger-search">
                <span>Search shots</span>
                <input
                  value={shotSearch}
                  onChange={(event) => setShotSearch(event.target.value)}
                  placeholder="Search time, speed, carry, spin"
                />
              </label>

              <div className="pr-shotledger-summary">
                <span>{selectedBucket.title}</span>
                <span>{bucketShotCount(selectedBucket)} shots</span>
              </div>

              <div className="pr-shotledger-actions">
                <button
                  className="pr-shotledger-btn"
                  onClick={() => void onEndSession()}
                  disabled={!selectedBucket.isActive}
                >
                  End Session
                </button>
                <button
                  className="pr-shotledger-btn is-danger"
                  onClick={() => void handleDeleteSelected()}
                  disabled={deletingId === selectedBucket.id || selectedBucket.isActive}
                >
                  {deletingId === selectedBucket.id
                    ? "Deleting..."
                    : selectedBucket.kind === "misc"
                      ? "Clear Misc"
                      : "Delete Session"}
                </button>
              </div>
            </div>

            <div className="pr-shotledger-wrap">
              {shotRows.length === 0 ? (
                <div className="pr-shotdesk-empty is-panel">
                  <h3>No shots in this session</h3>
                  <p>Keep the session open while you hit and the shot list will update in real time.</p>
                </div>
              ) : (
                <table className="pr-shotledger-table">
                  <thead>
                    <tr>
                      <th>Shot</th>
                      {SHOT_COLUMNS.map((column) => (
                        <th key={column.key}>
                          <button
                            type="button"
                            className={`pr-shotledger-sort ${shotSortKey === column.key ? "is-active" : ""}`}
                            onClick={() => toggleSort(column.key)}
                          >
                            <span>{column.label}</span>
                            <span>{shotSortKey === column.key ? (shotSortDirection === "desc" ? "↓" : "↑") : "↕"}</span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shotRows.map((row) => (
                      <tr key={String(row.shot.id)} onClick={() => onSelectShot(row.shot)}>
                        <td className="is-shot">
                          <strong>#{row.shotNumber}</strong>
                          <span>{row.shot.club}</span>
                        </td>
                        <td>{formatShotTime(row.shot)}</td>
                        <td>{formatMetric(row.shot.pr.speed, { unit: " mph", digits: 1 })}</td>
                        <td>{formatMetric(row.shot.pr.vla, { unit: "°", digits: 1 })}</td>
                        <td>{formatMetric(row.shot.pr.hla, { unit: "°", digits: 1, signed: true })}</td>
                        <td>{formatMetric(row.shot.pr.spin, { unit: " rpm", digits: 0 })}</td>
                        <td>{formatMetric(row.shot.pr.carry, { unit: " yd", digits: 0 })}</td>
                        <td>{formatMetric(row.shot.pr.total ?? row.shot.pr.carry, { unit: " yd", digits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
