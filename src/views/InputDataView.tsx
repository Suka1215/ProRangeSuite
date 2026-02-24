import React, { useState, useRef } from "react";
import { Card, CardHeader, CardBody } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { METRICS, METRIC_LABELS, CLUB_NAMES } from "../constants";
import { generateSyntheticShot, importTrackManCSV } from "../utils/shotData";
import type { Shot, MetricKey, ClubName } from "../types";

interface InputDataViewProps {
  selectedClub: string;
  onAddShot: (shot: Shot) => void;
  onNotify: (msg: string, type?: "ok" | "err") => void;
}

type FormState = Record<MetricKey, string>;

const EMPTY_FORM: FormState = { speed: "", vla: "", hla: "", carry: "", spin: "" };

export default function InputDataView({ selectedClub, onAddShot, onNotify }: InputDataViewProps) {
  const [prForm,    setPrForm]    = useState<FormState>(EMPTY_FORM);
  const [tmForm,    setTmForm]    = useState<FormState>(EMPTY_FORM);
  const [club,      setClub]      = useState(selectedClub);
  const [csvDrag,   setCsvDrag]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [filterClub, setFilterClub] = useState<string>("7-Iron");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleManualSubmit = () => {
    const pr = {
      speed: +prForm.speed || 91,
      vla:   +prForm.vla   || 29,
      hla:   +prForm.hla   || 0,
      carry: +prForm.carry || 143,
      spin:  +prForm.spin  || 7200,
    };
    const tmHasData = Object.values(tmForm).some((v) => v !== "");
    const tm = tmHasData ? {
      speed: +tmForm.speed || undefined,
      vla:   +tmForm.vla   || undefined,
      hla:   +tmForm.hla   || undefined,
      carry: +tmForm.carry || undefined,
      spin:  +tmForm.spin  || undefined,
    } : null;

    onAddShot({
      id:        Date.now(),
      club,
      timestamp: new Date().toLocaleTimeString(),
      pr, tm,
      trackPts:  13,
    });

    setPrForm(EMPTY_FORM);
    setTmForm(EMPTY_FORM);
    onNotify("Shot logged ✓");
  };

  const processCSVText = (text: string, filename: string) => {
    try {
      // Detect format: TrackMan native vs ProRange export
      const firstLine = text.split("\n")[0];
      const isTMFormat = firstLine.includes("Ball Speed") && firstLine.includes("Launch Angle");

      if (isTMFormat) {
        const result = importTrackManCSV(text);
        result.shots.forEach((s) => onAddShot(s));
        const clubSummary = Object.entries(result.clubs)
          .map(([c, n]) => `${c}: ${n}`)
          .join(", ");
        onNotify(`✓ ${result.shots.length} TrackMan shots imported (${clubSummary})${result.skipped ? ` · ${result.skipped} skipped` : ""}`);
      } else {
        onNotify("Unknown CSV format — use TrackMan export or ProRange CSV", "err");
      }
    } catch (e: unknown) {
      onNotify(`Import failed: ${e instanceof Error ? e.message : "unknown error"}`, "err");
    }
  };

  const handleCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => processCSVText(e.target?.result as string, file.name);
    reader.readAsText(file);
  };

  // Load the bundled reference dataset filtered by club
  const handleLoadReference = async () => {
    setImporting(true);
    try {
      const res  = await fetch("/pga_precision_10k_v8.csv");
      const text = await res.text();
      const result = importTrackManCSV(text, filterClub as ClubName);
      result.shots.forEach((s) => onAddShot(s));
      onNotify(`✓ Loaded ${result.shots.length} real TrackMan ${filterClub} shots as reference`);
    } catch {
      onNotify("Could not load reference dataset", "err");
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateBatch = (n: number) => {
    Array.from({ length: n }).forEach(() => onAddShot(generateSyntheticShot(club)));
    onNotify(`${n} synthetic shots generated ✓`);
  };

  return (
    <div style={{ animation: "slideUp 0.25s ease" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Input Data</h1>
        <p style={{ color: "#6b7280", fontSize: 13, marginTop: 3 }}>Manual entry · TrackMan CSV import · Reference dataset · Synthetic generator</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* ── Manual entry ── */}
        <Card>
          <CardHeader title="✏ Manual Shot Entry" />
          <CardBody>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Club</label>
              <select value={club} onChange={(e) => setClub(e.target.value)} style={inputStyle}>
                {CLUB_NAMES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>

            <SectionLabel>ProRange Readings</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {METRICS.map((m) => (
                <div key={m}>
                  <label style={labelStyle}>{METRIC_LABELS[m]}</label>
                  <input
                    type="number" style={inputStyle}
                    value={prForm[m]} placeholder={placeholders[m]}
                    onChange={(e) => setPrForm((f) => ({ ...f, [m]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <SectionLabel>TrackMan Ground Truth (optional)</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {METRICS.map((m) => (
                <div key={m}>
                  <label style={labelStyle}>{METRIC_LABELS[m]}</label>
                  <input
                    type="number"
                    style={{ ...inputStyle, background: "#fffbeb" }}
                    value={tmForm[m]} placeholder="TM value"
                    onChange={(e) => setTmForm((f) => ({ ...f, [m]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <Button variant="primary" onClick={handleManualSubmit} style={{ width: "100%", justifyContent: "center" }}>
              + Log Shot
            </Button>
          </CardBody>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── TrackMan CSV import ── */}
          <Card>
            <CardHeader title="📂 Import TrackMan CSV" />
            <CardBody>
              <div
                onDragOver={(e) => { e.preventDefault(); setCsvDrag(true); }}
                onDragLeave={() => setCsvDrag(false)}
                onDrop={(e) => { e.preventDefault(); setCsvDrag(false); const f = e.dataTransfer.files[0]; if (f) handleCSV(f); }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${csvDrag ? "#1a6bff" : "#e5e7eb"}`,
                  borderRadius: 10, padding: "20px",
                  textAlign: "center", cursor: "pointer",
                  background: csvDrag ? "#eff6ff" : "#fafbff",
                  marginBottom: 12, transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 26, marginBottom: 4 }}>📄</div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>Drop TrackMan CSV or click to browse</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>Accepts native TrackMan export format</div>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files?.[0]) handleCSV(e.target.files[0]); }} />
              </div>

              {/* Load from bundled reference dataset */}
              <div style={{
                background: "linear-gradient(135deg,#eff6ff,#f5f3ff)",
                border: "1px solid #c7d7fe", borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1d2e", marginBottom: 6 }}>
                  📊 Load from Reference Dataset
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
                  10,000 real PGA TrackMan shots across 10 clubs. Use as ground truth baseline.
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={filterClub}
                    onChange={(e) => setFilterClub(e.target.value)}
                    style={{ ...inputStyle, flex: 1, fontSize: 12, padding: "7px 10px" }}
                  >
                    {CLUB_NAMES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <button
                    onClick={handleLoadReference}
                    disabled={importing}
                    style={{
                      background: importing ? "#9ca3af" : "linear-gradient(135deg,#1a6bff,#0038b8)",
                      color: "#fff", borderRadius: 8, padding: "7px 16px",
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                      opacity: importing ? 0.7 : 1,
                    }}
                  >
                    {importing ? "Loading…" : "Load 1,000 shots"}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6 }}>
                  Source: pga_precision_10k_v8.csv · 1,000 shots per club
                </div>
              </div>
            </CardBody>
          </Card>

          {/* ── Synthetic generator ── */}
          <Card>
            <CardHeader title="🎲 Synthetic Generator" />
            <CardBody>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
                Draws from real TrackMan normal distributions (mean ± std per club). Adds simulated ProRange measurement noise including the current +12° VLA offset.
              </p>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Club</label>
                <select value={club} onChange={(e) => setClub(e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }}>
                  {CLUB_NAMES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[5, 10, 25, 50].map((n) => (
                  <Button key={n} onClick={() => handleGenerateBatch(n)} style={{ justifyContent: "center", fontSize: 13 }}>
                    Generate {n}
                  </Button>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "DM Sans, sans-serif", color: "#1a1d2e", background: "#fff" };
const placeholders: Record<MetricKey, string> = { speed: "91.4", vla: "29.3", hla: "0.5", carry: "143", spin: "7240" };

