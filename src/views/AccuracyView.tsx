import React from "react";
import ShotIQDashboard from "../features/shot-iq/components/ShotIQDashboard";
import type { Session, Shot } from "../types";

interface AccuracyViewProps {
  shots: Shot[];
  sessions: Session[];
  tmReady?: boolean;
}

export default function AccuracyView({ shots, sessions, tmReady }: AccuracyViewProps) {
  return <ShotIQDashboard shots={shots} sessions={sessions} tmReady={tmReady} />;
}
