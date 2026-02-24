import React, { useState } from "react";
import { Button } from "../ui/Button";
import { CLUB_NAMES } from "../../constants";
import { todayISO } from "../../utils/dates";
import type { Session, SessionShot, NewSessionForm } from "../../types";

interface NewSessionModalProps {
  onSave:  (session: Session) => void;
  onClose: () => void;
}

type ShotRow = {
  pr_speed: string; pr_vla: string; pr_hla: string; pr_carry: string; pr_spin: string;
  tm_speed: string; tm_vla: string; tm_hla: string; tm_carry: string; tm_spin: string;
};

const EMPTY_ROW: ShotRow = { pr_speed: "", pr_vla: "", pr_hla: "", pr_carry: "", pr_spin: "", tm_speed: "", tm_vla: "", tm_hla: "", tm_carry: "", tm_spin: "" };

export default function NewSessionModal({ onSave, onClose }: NewSessionModalProps) {
  const [form, setForm] = useState<NewSessionForm>({ date: todayISO(), version: "v22.86", label: "", club: "7-Iron" });
  const [rows, setRows] = useState<ShotRow[]>([{ ...EMPTY_ROW }]);

  const addRow    = () => setRows((r) => [...r, { ...EMPTY_ROW }]);
  const updateRow = (i: number, field: keyof ShotRow, val: string) =>
    setRows((r) => r.map((row, ri) => ri === i ? { ...row, [field]: val } : row));

  const handleSave = () => {
    const shots: SessionShot[] = rows
      .filter((r) => r.pr_speed || r.pr_vla)
      .map((r, i) => ({
        id:      `new-${Date.now()}-${i}`,
        shotNum: i + 1,
        pr: {
          speed: +r.pr_speed || 91,
          vla:   +r.pr_vla   || 29,
          hla:   +r.pr_hla   || 0,
          carry: +r.pr_carry || 143,
          spin:  +r.pr_spin  || 7200,
        },
        tm: (r.tm_speed || r.tm_vla)
          ? {
              speed: +r.tm_speed || undefined,
              vla:   +r.tm_vla   || undefined,
              hla:   +r.tm_hla   || undefined,
              carry: +r.tm_carry || undefined,
              spin:  +r.tm_spin  || undefined,
            }
          : null,
        trackPts: 13,
      }));

    if (!shots.length) return;

    onSave({
      id:        `session-${Date.now()}`,
      date:      form.date,
      version:   form.version,
      label:     form.label,
      club:      form.club,
      shots,
      createdAt: Date.now(),
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "min(920px,95vw)", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

        {/* Modal header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>New Test Session</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Log ProRange + TrackMan readings side-by-side</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>

          {/* Session meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {([
              ["date",    "Date",         "date",   ""],
              ["version", "Version",      "text",   "v22.86"],
              ["label",   "Notes / Label","text",   "e.g. Z-depth fix"],
            ] as const).map(([key, label, type, placeholder]) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input
                  type={type}
                  value={form[key]}
                  placeholder={placeholder}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Club</label>
              <select value={form.club} onChange={(e) => setForm((f) => ({ ...f, club: e.target.value }))} style={inputStyle}>
                {CLUB_NAMES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Shot rows */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
            Shot Data
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  {["Speed", "VLA", "HLA", "Carry", "Spin"].map((h) => (
                    <th key={`pr-${h}`} style={{ ...thStyle, background: "#eff6ff", color: "#1d4ed8" }}>PR {h}</th>
                  ))}
                  {["Speed", "VLA", "HLA", "Carry", "Spin"].map((h) => (
                    <th key={`tm-${h}`} style={{ ...thStyle, background: "#fffbeb", color: "#92400e" }}>TM {h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ padding: "4px 6px", color: "#9ca3af", fontSize: 12, textAlign: "center" }}>{i + 1}</td>
                    {(["pr_speed","pr_vla","pr_hla","pr_carry","pr_spin"] as (keyof ShotRow)[]).map((f) => (
                      <td key={f} style={{ padding: "3px 4px" }}>
                        <input type="number" value={row[f]} onChange={(e) => updateRow(i, f, e.target.value)}
                          style={{ ...inputStyle, padding: "5px 7px", fontSize: 12, width: 70, background: "#f0f6ff" }} placeholder="—" />
                      </td>
                    ))}
                    {(["tm_speed","tm_vla","tm_hla","tm_carry","tm_spin"] as (keyof ShotRow)[]).map((f) => (
                      <td key={f} style={{ padding: "3px 4px" }}>
                        <input type="number" value={row[f]} onChange={(e) => updateRow(i, f, e.target.value)}
                          style={{ ...inputStyle, padding: "5px 7px", fontSize: 12, width: 70, background: "#fffbeb" }} placeholder="—" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={addRow} size="sm" style={{ marginTop: 10 }}>+ Add Row</Button>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save Session</Button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "DM Sans,sans-serif", color: "#1a1d2e", background: "#fff" };
const thStyle:    React.CSSProperties = { padding: "7px 8px", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", textAlign: "center" };
