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
  onClearBucket: (bucketId: string) => Promise<void> | void;
  onDeleteShots: (bucketId: string, shotIds: string[]) => Promise<void> | void;
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
  if (bucket.source === "dashboard-session") return "Dashboard";
  if (bucket.source === "suite") return "Suite";
  if (bucket.source === "app") return "App";
  if (bucket.source === "gspro") return "GSPro";
  return "Session";
}

function statusLabel(bucket: SessionLibraryBucket) {
  if (bucket.kind === "misc") return "Misc";
  if (bucket.isActive) return "Active";
  return "Saved";
}

function cardTheme(bucket: SessionLibraryBucket, isSelected: boolean) {
  const accent = bucket.kind === "misc" ? "#eff2ef" : "#6ad87c";
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

function csvCell(value: unknown) {
  if (value == null) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function csvNumber(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? "" : value.toFixed(digits);
}

function safeFilename(value: string) {
  const cleaned = value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return cleaned || "session";
}

function exportShotTableToCSV(rows: SessionShotRow[], bucket: SessionLibraryBucket, scope: "selected" | "session") {
  const header = [
    "session_id",
    "session_title",
    "session_club",
    "session_source",
    "shot",
    "shot_id",
    "club",
    "timestamp",
    "captured_at",
    "pr_speed",
    "pr_vla",
    "pr_hla",
    "pr_carry",
    "pr_total",
    "pr_spin",
    "tm_speed",
    "tm_vla",
    "tm_hla",
    "tm_carry",
    "tm_total",
    "tm_spin",
    "track_points",
  ];
  const body = rows.map((row) => {
    const shot = row.shot;

    return [
      csvCell(bucket.id),
      csvCell(bucket.title),
      csvCell(bucket.club),
      csvCell(bucket.source),
      row.shotNumber,
      csvCell(shot.id),
      csvCell(shot.club),
      csvCell(shot.timestamp),
      shot.capturedAt ? new Date(shot.capturedAt).toISOString() : "",
      csvNumber(shot.pr.speed),
      csvNumber(shot.pr.vla),
      csvNumber(shot.pr.hla),
      csvNumber(shot.pr.carry, 0),
      csvNumber(shot.pr.total ?? shot.pr.carry, 0),
      csvNumber(shot.pr.spin, 0),
      csvNumber(shot.tm?.speed),
      csvNumber(shot.tm?.vla),
      csvNumber(shot.tm?.hla),
      csvNumber(shot.tm?.carry, 0),
      csvNumber(shot.tm?.total ?? shot.tm?.carry, 0),
      csvNumber(shot.tm?.spin, 0),
      shot.trackPts ?? "",
    ].join(",");
  });
  const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: `prorange-${safeFilename(bucket.title)}-${scope}-${Date.now()}.csv`,
  });

  link.click();
  URL.revokeObjectURL(url);
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
  onClearBucket,
  onDeleteShots,
}: ShotLogViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [shotSortKey, setShotSortKey] = useState<ShotSortKey>("capturedAt");
  const [shotSortDirection, setShotSortDirection] = useState<SortDirection>("desc");
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);

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
  const featuredBucket =
    visibleBuckets.find((bucket) => bucket.isActive && bucket.kind === "session") ??
    visibleBuckets.find((bucket) => bucket.kind === "session") ??
    null;

  const shotRows = useMemo(() => {
    if (!selectedBucket) return [];

    const direction = shotSortDirection === "asc" ? 1 : -1;
    const rows = selectedBucket.shots.map((shot, index) => ({
      shot,
      shotNumber: selectedBucket.shots.length - index,
    }));

    return rows
      .sort((left, right) => {
        const delta = shotSortValue(left, shotSortKey) - shotSortValue(right, shotSortKey);
        if (delta !== 0) return delta * direction;
        return (right.shot.capturedAt ?? 0) - (left.shot.capturedAt ?? 0);
      });
  }, [selectedBucket, shotSortDirection, shotSortKey]);

  useEffect(() => {
    setSelectedShotIds([]);
  }, [selectedBucket?.id, shotSortDirection, shotSortKey]);

  const selectedShots = useMemo(() => {
    const selectedIdSet = new Set(selectedShotIds);
    return shotRows
      .filter((row) => selectedIdSet.has(String(row.shot.id)))
      .map((row) => row.shot);
  }, [selectedShotIds, shotRows]);

  const allVisibleSelected = shotRows.length > 0 && shotRows.every((row) => selectedShotIds.includes(String(row.shot.id)));

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

  async function handleClearSelectedBucket() {
    if (!selectedBucket) return;
    setClearingId(selectedBucket.id);
    try {
      await onClearBucket(selectedBucket.id);
      setSelectedShotIds([]);
    } finally {
      setClearingId(null);
    }
  }

  async function handleDeleteSelectedShots() {
    if (!selectedBucket || !selectedShotIds.length) return;
    await onDeleteShots(selectedBucket.id, selectedShotIds);
    setSelectedShotIds([]);
  }

  function toggleShotSelection(shotId: string) {
    setSelectedShotIds((current) =>
      current.includes(shotId) ? current.filter((value) => value !== shotId) : [...current, shotId]
    );
  }

  function toggleSelectAllRows() {
    if (allVisibleSelected) {
      setSelectedShotIds([]);
      return;
    }

    setSelectedShotIds(shotRows.map((row) => String(row.shot.id)));
  }

  function handleExportRows(scope: "selected" | "session") {
    if (!selectedBucket) return;

    const rowsToExport = scope === "selected"
      ? shotRows.filter((row) => selectedShotIds.includes(String(row.shot.id)))
      : shotRows;

    if (!rowsToExport.length) return;
    exportShotTableToCSV(rowsToExport, selectedBucket, scope);
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
          <span className={`pr-shotsession-status is-${bucket.isActive ? "active" : bucket.kind === "misc" ? "misc" : "saved"}`}>
            {statusLabel(bucket)}
          </span>
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
              <div className="pr-shotledger-heading">
                <strong>{selectedBucket.title}</strong>
                <span>{bucketShotCount(selectedBucket)} shots in this session</span>
              </div>

              <div className="pr-shotledger-toolbar-right">
                <div className="pr-shotledger-actions">
                  <button
                    className="pr-shotledger-btn is-secondary"
                    onClick={() => handleExportRows("selected")}
                    disabled={!selectedShots.length}
                  >
                    Export Selected
                  </button>
                  <button
                    className="pr-shotledger-btn is-secondary"
                    onClick={() => void handleDeleteSelectedShots()}
                    disabled={!selectedShotIds.length}
                  >
                    Delete Selected
                  </button>
                  <button
                    className="pr-shotledger-btn is-secondary"
                    onClick={() => handleExportRows("session")}
                    disabled={!shotRows.length}
                  >
                    Export Session
                  </button>
                  <button
                    className="pr-shotledger-btn"
                    onClick={() => void onEndSession()}
                    disabled={!selectedBucket.isActive}
                  >
                    End Session
                  </button>
                  <button
                    className="pr-shotledger-btn is-secondary"
                    onClick={() => void handleClearSelectedBucket()}
                    disabled={clearingId === selectedBucket.id || !bucketShotCount(selectedBucket)}
                  >
                    {clearingId === selectedBucket.id
                      ? "Clearing..."
                      : selectedBucket.kind === "misc"
                        ? "Clear Misc"
                        : "Clear Shots"}
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
            </div>

            <div className="pr-shotledger-wrap is-admin">
              {shotRows.length === 0 ? (
                <div className="pr-shotdesk-empty is-panel">
                  <h3>No shots in this session</h3>
                  <p>Keep the session open while you hit and the shot list will update in real time.</p>
                </div>
              ) : (
                <table className="pr-shotledger-table is-admin">
                  <thead>
                    <tr>
                      <th className="is-check">
                        <label className="pr-shotledger-check">
                          <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllRows} />
                          <span />
                        </label>
                      </th>
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
                        <td className="is-check" onClick={(event) => event.stopPropagation()}>
                          <label className="pr-shotledger-check">
                            <input
                              type="checkbox"
                              checked={selectedShotIds.includes(String(row.shot.id))}
                              onChange={() => toggleShotSelection(String(row.shot.id))}
                            />
                            <span />
                          </label>
                        </td>
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
