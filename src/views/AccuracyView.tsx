import React from "react";
import ShotIQDashboard from "../features/shot-iq/components/ShotIQDashboard";
import type { Session, Shot } from "../types";

interface AccuracyViewProps {
  shots: Shot[];
  sessions: Session[];
  activeSessionId: string | null;
  tmReady?: boolean;
}

export default function AccuracyView({ shots, sessions, activeSessionId, tmReady }: AccuracyViewProps) {
  return <ShotIQDashboard shots={shots} sessions={sessions} activeSessionId={activeSessionId} tmReady={tmReady} />;
}
