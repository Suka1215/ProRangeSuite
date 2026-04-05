import React from "react";

interface TrackManPulseCardProps {
  title: string;
  meta: string;
  series: number[];
  matchedCount?: number;
  totalCount?: number;
  onClick: () => void;
}

export default function TrackManPulseCard({
  title,
  meta,
  series,
  matchedCount = 0,
  totalCount = 0,
  onClick,
}: TrackManPulseCardProps) {
  const values = series.length ? series : [154, 160, 164, 168, 171, 166];
  const path = buildSmoothPath(values);

  return (
    <button
      className="shotiq-trackman-card"
      onClick={onClick}
      aria-label={`TrackMan matched card, ${matchedCount} of ${totalCount || matchedCount} shots matched`}
    >
      <div className="shotiq-trackman-head">
        <span className="shotiq-trackman-avatar">T</span>
        <span className="shotiq-trackman-copy">
          <strong>TrackMan</strong>
          <span>Matched</span>
        </span>
      </div>

      <div className="shotiq-trackman-body">
        <h3>{title}</h3>
        <p>{meta}</p>
      </div>

      <svg className="shotiq-trackman-spark" viewBox="0 0 260 86" preserveAspectRatio="none" aria-hidden="true">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="250" cy={lastPointY(values)} r="6" fill="currentColor" />
      </svg>
    </button>
  );
}

function buildSmoothPath(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 130 : 14 + (index / (values.length - 1)) * 236;
    const y = max === min ? 48 : 72 - ((value - min) / (max - min)) * 34;
    return { x, y };
  });

  if (!points.length) {
    return "M14 62 L246 28";
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    path += ` Q ${midX} ${previous.y} ${current.x} ${current.y}`;
  }

  return path;
}

function lastPointY(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const last = values[values.length - 1] ?? 0;
  return max === min ? 48 : 72 - ((last - min) / (max - min)) * 34;
}
