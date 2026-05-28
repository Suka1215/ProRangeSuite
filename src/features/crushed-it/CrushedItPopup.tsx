import { useCallback, useEffect, useRef, useState } from "react";
import "./CrushedItPopup.css";

export interface CrushedItData {
  ballSpeedMph: number;
  carryYards: number;
  totalYards: number;
  smashFactor: number;
  club: string;
  avgSpeedMph?: number;
}

interface CrushedItPopupProps {
  data: CrushedItData;
  onDismiss?: () => void;
  autoDismissSeconds?: number;
  soundSrc?: string;
}

const DEFAULT_COUNTDOWN_SECONDS = 5;
const DEFAULT_SOUND_SRC = "/audio/crushed-it.mp3";

export default function CrushedItPopup({
  data,
  onDismiss,
  autoDismissSeconds = DEFAULT_COUNTDOWN_SECONDS,
  soundSrc = DEFAULT_SOUND_SRC,
}: CrushedItPopupProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const runningRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [seconds, setSeconds] = useState(autoDismissSeconds);
  const [dismissing, setDismissing] = useState(false);

  const dismiss = useCallback(() => {
    if (dismissing) return;
    runningRef.current = false;
    audioRef.current?.pause();
    setDismissing(true);
    window.setTimeout(() => onDismiss?.(), 450);
  }, [dismissing, onDismiss]);

  useEffect(() => {
    setSeconds(autoDismissSeconds);
    setDismissing(false);
    runningRef.current = true;
  }, [autoDismissSeconds, data]);

  useEffect(() => {
    const audio = new Audio(soundSrc);
    audio.preload = "auto";
    audio.volume = 0.85;
    audio.currentTime = 0;
    audioRef.current = audio;

    audio.load();
    void audio.play().catch(() => {
      // Browsers may block sound when the popup is opened by a non-user shot event.
    });

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [data, soundSrc]);

  useEffect(() => {
    if (seconds <= 0) {
      dismiss();
      return;
    }

    const timeoutId = window.setTimeout(() => setSeconds((current) => current - 1), 1000);
    return () => window.clearTimeout(timeoutId);
  }, [dismiss, seconds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const colors = ["#1d9e75", "#5dcaa5", "#9fe1cb", "#0f6e56", "#e8faf0", "#ffffff", "#085041"];
    const pieces = Array.from({ length: 130 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 220,
      w: 6 + Math.random() * 8,
      h: 3 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: 1.8 + Math.random() * 3.2,
      spin: (Math.random() - 0.5) * 0.18,
      angle: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.04 + Math.random() * 0.04,
      opacity: 0.75 + Math.random() * 0.25,
      delay: Math.floor(Math.random() * 80),
    }));

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;

    const draw = () => {
      if (!runningRef.current) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      frame += 1;
      let alive = false;

      for (const piece of pieces) {
        if (frame < piece.delay) continue;

        piece.y += piece.speed;
        piece.angle += piece.spin;
        piece.phase += piece.wobbleSpeed;
        piece.x += Math.sin(piece.phase) * 1.2;

        if (piece.y < canvas.height + 30) {
          alive = true;
        }

        context.save();
        context.globalAlpha = piece.opacity * Math.max(0, 1 - piece.y / (canvas.height + 20));
        context.translate(piece.x, piece.y);
        context.rotate(piece.angle);
        context.fillStyle = piece.color;
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        context.restore();
      }

      if (alive) {
        animationFrameRef.current = window.requestAnimationFrame(draw);
      }
    };

    const startDelayId = window.setTimeout(() => {
      animationFrameRef.current = window.requestAnimationFrame(draw);
    }, 400);

    return () => {
      window.clearTimeout(startDelayId);
      window.cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [data]);

  const speedDelta = data.avgSpeedMph != null
    ? `${data.ballSpeedMph - data.avgSpeedMph >= 0 ? "+" : ""}${(data.ballSpeedMph - data.avgSpeedMph).toFixed(1)} mph above your ${data.club} average`
    : null;
  const circumference = 2 * Math.PI * 22;
  const dashOffset = (1 - seconds / autoDismissSeconds) * circumference;
  const sparkles = [
    { style: { top: "13%", left: "11%" }, size: 18, delay: 0.7 },
    { style: { top: "9%", right: "13%" }, size: 13, delay: 0.9 },
    { style: { top: "17%", right: "7%" }, size: 20, delay: 0.8 },
    { style: { bottom: "22%", left: "7%" }, size: 15, delay: 1 },
    { style: { bottom: "17%", right: "9%" }, size: 22, delay: 0.75 },
    { style: { top: "40%", left: "3%" }, size: 11, delay: 0.95 },
  ];

  return (
    <div className={`ci-backdrop${dismissing ? " ci-backdrop--out" : ""}`} role="dialog" aria-modal="true">
      <div className="ci-impact-flash" aria-hidden="true" />
      <canvas ref={canvasRef} className="ci-canvas" />

      <div className={`ci-card${dismissing ? " ci-card--out" : ""}`}>
        <div className="ci-impact-slab" aria-hidden="true" />
        <div className="ci-ring ci-ring-1" />
        <div className="ci-ring ci-ring-2" />
        <div className="ci-ring ci-ring-3" />
        <div className="ci-shockwave ci-shockwave-1" />
        <div className="ci-shockwave ci-shockwave-2" />
        <div className="ci-bottom-bar" />

        {sparkles.map((sparkle, index) => (
          <svg
            key={index}
            className="ci-sparkle"
            style={{
              width: sparkle.size,
              height: sparkle.size,
              animationDelay: `${sparkle.delay}s`,
              ...sparkle.style,
            }}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 2l1.8 6.2H20l-5 3.6 1.9 6.2L12 14.4l-4.9 3.6L9 11.8 4 8.2h6.2z" fill="#1d9e75" />
          </svg>
        ))}

        <div className="ci-countdown" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="#e8faf0" strokeWidth="4" />
            <circle
              cx="28"
              cy="28"
              r="22"
              fill="none"
              stroke="#1d9e75"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 28 28)"
              style={{ transition: "stroke-dashoffset 0.9s linear" }}
            />
          </svg>
          <span className="ci-countdown-num">{seconds}</span>
        </div>

        <div className="ci-content">
          <div className="ci-pill">
            <span className="ci-pill-dot" />
            Speed milestone
          </div>

          <h1 className="ci-title">Crushed it</h1>
          <p className="ci-subtitle">Ball speed cleared 130 mph - {data.club} profile</p>

          <div className="ci-speed-wrap">
            <span className="ci-speed-num">{data.ballSpeedMph.toFixed(1)}</span>
            <span className="ci-speed-label">MPH BALL SPEED</span>
          </div>

          <div className="ci-stats">
            <div className="ci-stat-card">
              <span className="ci-stat-label">Carry</span>
              <span className="ci-stat-val">{Math.round(data.carryYards)}</span>
              <span className="ci-stat-unit">yards</span>
            </div>
            <div className="ci-stat-card">
              <span className="ci-stat-label">Total</span>
              <span className="ci-stat-val">{Math.round(data.totalYards)}</span>
              <span className="ci-stat-unit">yards</span>
            </div>
            <div className="ci-stat-card">
              <span className="ci-stat-label">Smash</span>
              <span className="ci-stat-val">{data.smashFactor.toFixed(2)}</span>
              <span className="ci-stat-unit">factor</span>
            </div>
          </div>

          {speedDelta ? (
            <div className="ci-trend">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1d9e75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
              <div>
                <p className="ci-trend-main">{speedDelta}</p>
                <p className="ci-trend-sub">Fastest shots deserve a little spotlight.</p>
              </div>
            </div>
          ) : null}

          <div className="ci-actions">
            <button className="ci-btn-secondary" onClick={dismiss}>Dismiss</button>
            <button className="ci-btn-primary" onClick={dismiss}>Keep swinging</button>
          </div>
        </div>
      </div>
    </div>
  );
}
