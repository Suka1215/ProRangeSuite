import React, { useMemo, useState } from "react";
import { CLUB_NAMES } from "../../constants";
import { todayISO } from "../../utils/dates";
import type { Session, SessionShot, Shot } from "../../types";

interface NewSessionModalProps {
  sourceShots: Shot[];
  defaultClub: string;
  onSave: (session: Session) => void;
  onClose: () => void;
}

const SESSION_COLORS = [
  "#6ad87c",
  "#ffd768",
  "#7fc8ff",
  "#ff8f7d",
  "#b497ff",
  "#262930",
];

export default function NewSessionModal({
  sourceShots,
  defaultClub,
  onSave,
  onClose,
}: NewSessionModalProps) {
  const [label, setLabel] = useState("");
  const [club, setClub] = useState(defaultClub || "7-Iron");
  const [color, setColor] = useState(SESSION_COLORS[0]);

  const liveShotCount = sourceShots.length;
  const canSave = liveShotCount > 0;
  const sessionName = label.trim() || `${club} Session`;

  const helperCopy = useMemo(() => {
    if (!liveShotCount) {
      return "Capture a few live shots first, then save them as a named session.";
    }

    return `This will save the current live capture with ${liveShotCount} shot${liveShotCount === 1 ? "" : "s"}.`;
  }, [liveShotCount]);

  const handleSave = () => {
    if (!canSave) return;

    const shots: SessionShot[] = sourceShots.map((shot, index) => ({
      id: `session-${Date.now()}-${index}`,
      shotNum: index + 1,
      pr: shot.pr,
      tm: shot.tm ?? null,
      trackPts: shot.trackPts,
    }));

    onSave({
      id: `session-${Date.now()}`,
      date: todayISO(),
      version: `${club} · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      label: sessionName,
      club,
      color,
      shots,
      createdAt: Date.now(),
    });
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <div style={titleStyle}>Create Session</div>
            <div style={subtitleStyle}>Pick the club, choose a color, and save the current capture cleanly.</div>
          </div>
          <button onClick={onClose} style={closeButtonStyle} aria-label="Close create session modal">
            ×
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={sectionStyle}>
            <div style={sectionTextStyle}>
              <strong>Session name</strong>
              <span>Give this saved capture a clean label.</span>
            </div>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={`${club} Session`}
              style={fieldStyle}
            />
          </div>

          <div style={dividerStyle} />

          <div style={sectionStyle}>
            <div style={sectionTextStyle}>
              <strong>Club</strong>
              <span>Choose the club this session should live under.</span>
            </div>
            <select value={club} onChange={(event) => setClub(event.target.value)} style={fieldStyle}>
              {CLUB_NAMES.map((clubName) => (
                <option key={clubName} value={clubName}>
                  {clubName}
                </option>
              ))}
            </select>
          </div>

          <div style={dividerStyle} />

          <div style={sectionStyle}>
            <div style={sectionTextStyle}>
              <strong>Session color</strong>
              <span>Pick the accent used for this saved session.</span>
            </div>
            <div style={swatchRowStyle}>
              {SESSION_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Select session color ${swatch}`}
                  style={{
                    ...swatchStyle,
                    background: swatch,
                    boxShadow:
                      color === swatch
                        ? `0 0 0 4px rgba(255,255,255,0.95), 0 0 0 6px ${swatch}`
                        : "0 0 0 1px rgba(38, 41, 48, 0.08)",
                    transform: color === swatch ? "scale(1.04)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          <div style={dividerStyle} />

          <div style={summaryCardStyle}>
            <div style={summaryTopStyle}>
              <span style={summaryEyebrowStyle}>Current capture</span>
              <span style={{ ...summaryDotStyle, background: color }} />
            </div>
            <strong style={summaryTitleStyle}>{sessionName}</strong>
            <p style={summaryBodyStyle}>{helperCopy}</p>
            <div style={summaryMetaStyle}>
              <span>{club}</span>
              <span>{liveShotCount} shots ready</span>
            </div>
          </div>
        </div>

        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              ...primaryButtonStyle,
              opacity: canSave ? 1 : 0.5,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            Save Session
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "rgba(242, 246, 241, 0.74)",
  backdropFilter: "blur(10px)",
};

const cardStyle: React.CSSProperties = {
  width: "min(680px, 96vw)",
  borderRadius: 30,
  background: "#ffffff",
  boxShadow: "0 28px 70px rgba(38, 41, 48, 0.16)",
  border: "1px solid rgba(38, 41, 48, 0.06)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 20,
  padding: "28px 30px 22px",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "\"Outfit\", sans-serif",
  fontSize: 32,
  fontWeight: 700,
  letterSpacing: "-0.05em",
  color: "#262930",
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 15,
  lineHeight: 1.5,
  color: "rgba(38, 41, 48, 0.58)",
};

const closeButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 16,
  border: "1px solid rgba(38, 41, 48, 0.08)",
  background: "#ffffff",
  color: "rgba(38, 41, 48, 0.72)",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
};

const bodyStyle: React.CSSProperties = {
  padding: "0 30px 24px",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 20,
  padding: "18px 0",
};

const sectionTextStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 0,
  flex: 1,
  color: "#262930",
};

const fieldStyle: React.CSSProperties = {
  width: 220,
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(38, 41, 48, 0.1)",
  background: "#ffffff",
  fontSize: 15,
  color: "#262930",
  outline: "none",
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "rgba(38, 41, 48, 0.08)",
};

const swatchRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  width: 220,
  justifyContent: "flex-end",
};

const swatchStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  border: "none",
  cursor: "pointer",
  transition: "transform 160ms ease, box-shadow 160ms ease",
};

const summaryCardStyle: React.CSSProperties = {
  marginTop: 18,
  padding: 18,
  borderRadius: 24,
  background: "rgba(106, 216, 124, 0.08)",
  border: "1px solid rgba(106, 216, 124, 0.18)",
};

const summaryTopStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const summaryEyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(38, 41, 48, 0.54)",
};

const summaryDotStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  boxShadow: "0 0 0 4px rgba(255,255,255,0.84)",
};

const summaryTitleStyle: React.CSSProperties = {
  display: "block",
  marginTop: 10,
  fontFamily: "\"Outfit\", sans-serif",
  fontSize: 24,
  letterSpacing: "-0.05em",
  color: "#262930",
};

const summaryBodyStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 14,
  lineHeight: 1.55,
  color: "rgba(38, 41, 48, 0.64)",
};

const summaryMetaStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 14,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  padding: "20px 30px 28px",
};

const secondaryButtonStyle: React.CSSProperties = {
  minWidth: 132,
  padding: "14px 18px",
  borderRadius: 16,
  border: "1px solid rgba(38, 41, 48, 0.1)",
  background: "#ffffff",
  color: "#262930",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  minWidth: 164,
  padding: "14px 18px",
  borderRadius: 16,
  border: "none",
  background: "#6ad87c",
  color: "#1f2a22",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 18px 34px rgba(106, 216, 124, 0.24)",
};
