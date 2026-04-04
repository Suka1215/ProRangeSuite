import React, { useMemo, useRef, useState, useEffect } from "react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { MetricDelta } from "../ui/MetricDelta";
import { pctError } from "../../utils/stats";
import {
  analyzeSequence,
  estimateApexFromMetrics,
  parseSequenceInput,
  type SequencePoint,
  type SequenceMetrics,
} from "../../utils/shotSequence";

interface TrackManRef {
  speed: string;
  vla: string;
  hla: string;
  spin: string;
  carry: string;
  apex: string;
}

interface YoloDetection {
  frame: number;
  x: number;
  y: number;
  conf?: number;
  width?: number;
  height?: number;
  classId?: number;
}

interface YoloResponse {
  ok?: boolean;
  model?: string;
  totalFrames?: number;
  frameWidth?: number;
  frameHeight?: number;
  orderedFrames?: string[];
  detections?: YoloDetection[];
  error?: string;
}

type FrameOrderMode = "natural-name" | "lex-name" | "capture-time" | "selected";
type FramePointSource = "start-anchor" | "real" | "interpolated" | "extrapolated" | "held" | "missing";

interface FrameLocationRow {
  frame: number;
  name: string;
  x: number | null;
  y: number | null;
  conf?: number;
  source: FramePointSource;
  isReal: boolean;
  boxWidthPx?: number;
  boxHeightPx?: number;
  radiusPx?: number;
}

interface SequenceBuildResult {
  sequence: SequencePoint[];
  frameLocations: FrameLocationRow[];
}

const EMPTY_TM: TrackManRef = { speed: "", vla: "", hla: "", spin: "", carry: "", apex: "" };
const NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function parseTmValue(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatValue(value: number, digits: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function orderFrames(files: File[], mode: FrameOrderMode): File[] {
  const copy = [...files];
  if (mode === "selected") return copy;
  if (mode === "natural-name") return copy.sort((a, b) => NAME_COLLATOR.compare(a.name, b.name));
  if (mode === "lex-name") return copy.sort((a, b) => a.name.localeCompare(b.name));
  return copy.sort((a, b) => (a.lastModified - b.lastModified) || NAME_COLLATOR.compare(a.name, b.name));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Failed to read ${file.name}`));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function apiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.port === "5173") {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  return "";
}

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const full = `${apiBase()}${url}`;
  let res: Response;
  try {
    res = await fetch(full, init);
  } catch {
    throw new Error(`Cannot reach backend at ${full}. Start the Node server with 'npm run server'.`);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Backend returned non-JSON response (status ${res.status}).`);
    }
  }

  if (!res.ok) {
    const msg = data?.error || `Request failed with status ${res.status}.`;
    throw new Error(msg);
  }
  if (data == null) {
    throw new Error(`Backend returned empty response (status ${res.status}).`);
  }
  return data;
}

function detectionsToSequence(
  detections: YoloDetection[],
  totalFrames: number,
  fps: number,
  frameWidth?: number,
  frameHeight?: number,
  frameNames: string[] = []
): SequenceBuildResult {
  const grouped = new Map<number, YoloDetection[]>();
  detections
    .filter((d) => Number.isFinite(d.frame) && Number.isFinite(d.x) && Number.isFinite(d.y))
    .forEach((d) => {
      const frame = Math.round(d.frame);
      const arr = grouped.get(frame) ?? [];
      arr.push({ ...d, frame });
      grouped.set(frame, arr);
    });
  grouped.forEach((arr) => {
    arr.sort((a, b) => {
      const confDelta = (b.conf ?? 0) - (a.conf ?? 0);
      if (Math.abs(confDelta) > 1e-9) return confDelta;
      const areaA = (a.width ?? 0) * (a.height ?? 0);
      const areaB = (b.width ?? 0) * (b.height ?? 0);
      return areaB - areaA;
    });
  });

  const frameIds = [...grouped.keys()].sort((a, b) => a - b);
  const chosenByFrame = new Map<number, YoloDetection>();
  if (frameIds.length > 0) {
    interface DpNode {
      score: number;
      prevIdx: number;
    }

    const dp: DpNode[][] = [];
    for (let fi = 0; fi < frameIds.length; fi++) {
      const frame = frameIds[fi];
      const candidates = grouped.get(frame) ?? [];
      if (!candidates.length) {
        dp.push([]);
        continue;
      }

      const row: DpNode[] = [];
      for (let ci = 0; ci < candidates.length; ci++) {
        const c = candidates[ci];
        const conf = Math.max(0, Math.min(1, c.conf ?? 0.5));
        const confCost = (1 - conf) * 10;

        if (fi === 0 || dp[fi - 1].length === 0) {
          row.push({ score: confCost, prevIdx: -1 });
          continue;
        }

        const prevFrame = frameIds[fi - 1];
        const prevCandidates = grouped.get(prevFrame) ?? [];
        const frameDt = Math.max(1, frame - prevFrame);
        let bestScore = Number.POSITIVE_INFINITY;
        let bestPrevIdx = -1;

        for (let pi = 0; pi < prevCandidates.length; pi++) {
          const prev = prevCandidates[pi];
          const prevNode = dp[fi - 1][pi];
          if (!prevNode || !Number.isFinite(prevNode.score)) continue;

          const dx = c.x - prev.x;
          const dy = c.y - prev.y;
          const dist = Math.hypot(dx, dy);
          const step = dist / frameDt;
          const jumpPenalty = step > 180 ? (step - 180) * 6 : 0;
          const moveCost = step * 0.22;

          const score = prevNode.score + confCost + moveCost + jumpPenalty;
          if (score < bestScore) {
            bestScore = score;
            bestPrevIdx = pi;
          }
        }

        row.push({ score: bestScore, prevIdx: bestPrevIdx });
      }

      dp.push(row);
    }

    let bestFinalFrameIdx = frameIds.length - 1;
    while (bestFinalFrameIdx >= 0 && dp[bestFinalFrameIdx].length === 0) {
      bestFinalFrameIdx--;
    }

    if (bestFinalFrameIdx >= 0) {
      const finalRow = dp[bestFinalFrameIdx];
      let bestIdx = 0;
      let bestScore = finalRow[0]?.score ?? Number.POSITIVE_INFINITY;
      for (let i = 1; i < finalRow.length; i++) {
        if (finalRow[i].score < bestScore) {
          bestScore = finalRow[i].score;
          bestIdx = i;
        }
      }

      let ci = bestIdx;
      for (let fi = bestFinalFrameIdx; fi >= 0; fi--) {
        const frame = frameIds[fi];
        const candidates = grouped.get(frame) ?? [];
        if (!candidates.length) continue;
        const node = dp[fi][ci];
        if (!node || ci < 0 || ci >= candidates.length) continue;
        chosenByFrame.set(frame, candidates[ci]);
        ci = node.prevIdx;
        if (ci < 0 && fi > 0) {
          break;
        }
      }
    }
  }

  const frameLocations: FrameLocationRow[] = [];

  for (let frame = 0; frame < Math.max(0, totalFrames); frame++) {
    const name = frameNames[frame] ?? `frame_${String(frame).padStart(4, "0")}`;
    const direct = chosenByFrame.get(frame);
    if (direct) {
      const src: FramePointSource = frame === 0 ? "start-anchor" : "real";
      frameLocations.push({
        frame,
        name,
        x: direct.x,
        y: direct.y,
        conf: direct.conf,
        source: src,
        isReal: true,
        boxWidthPx: direct.width,
        boxHeightPx: direct.height,
        radiusPx:
          direct.width != null && direct.height != null
            ? Math.max(0, (direct.width + direct.height) * 0.25)
            : undefined,
      });
      continue;
    }
    frameLocations.push({
      frame,
      name,
      x: null,
      y: null,
      source: "missing",
      isReal: false,
    });
  }

  const sequence: SequencePoint[] = frameLocations
    .filter((row) => row.x != null && row.y != null && row.isReal)
    .map((row) => ({
      frame: row.frame,
      tMs: (row.frame * 1000) / fps,
      x: row.x as number,
      y: row.y as number,
      conf: row.conf,
      isReal: row.isReal,
      boxWidthPx: row.boxWidthPx,
      boxHeightPx: row.boxHeightPx,
      radiusPx: row.radiusPx,
      frameWidthPx: frameWidth,
      frameHeightPx: frameHeight,
    }));

  return { sequence, frameLocations };
}

function ApexDelta({ pr, tm }: { pr: number; tm: number | null }) {
  if (tm == null || tm === 0) return <span style={{ color: "#9ca3af" }}>—</span>;
  const err = pctError(pr, tm);
  const pass = Math.abs(err) <= 1;
  return (
    <span style={{ color: pass ? "#16a34a" : "#ef4444", fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>
      {err >= 0 ? "+" : ""}
      {err.toFixed(1)}%
    </span>
  );
}

function rowsFromSequencePoints(points: SequencePoint[]): FrameLocationRow[] {
  return [...points]
    .sort((a, b) => a.frame - b.frame)
    .map((p) => ({
      frame: p.frame,
      name: `frame_${String(p.frame).padStart(4, "0")}`,
      x: p.x,
      y: p.y,
      conf: p.conf,
      source: p.isReal === false ? "interpolated" : "real",
      isReal: p.isReal !== false,
      boxWidthPx: p.boxWidthPx,
      boxHeightPx: p.boxHeightPx,
      radiusPx: p.radiusPx,
    }));
}

export function ShotSequenceTester() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [rawInput, setRawInput] = useState("");
  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [points, setPoints] = useState<SequencePoint[]>([]);
  const [frameLocations, setFrameLocations] = useState<FrameLocationRow[]>([]);
  const [metrics, setMetrics] = useState<SequenceMetrics | null>(null);
  const [tm, setTm] = useState<TrackManRef>(EMPTY_TM);

  const [fps, setFps] = useState(240);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(240);
  const [useOnlyReal, setUseOnlyReal] = useState(true);
  const [useDistanceForX, setUseDistanceForX] = useState(true);

  const [rawImageFrames, setRawImageFrames] = useState<File[]>([]);
  const [frameOrderMode, setFrameOrderMode] = useState<FrameOrderMode>("natural-name");
  const [yoloConfidence, setYoloConfidence] = useState(0.12);
  const [yoloCropSize, setYoloCropSize] = useState(400);
  const [yoloClassId, setYoloClassId] = useState<number | "">("");
  const [modelPath, setModelPath] = useState("");
  const [runningYolo, setRunningYolo] = useState(false);
  const [yoloStatus, setYoloStatus] = useState("");

  const [error, setError] = useState<string>("");
  const [loadingLookup, setLoadingLookup] = useState(false);

  const parsedSummary = useMemo(() => {
    if (!points.length) return null;
    const withTime = points.filter((p) => p.tMs != null).length;
    const withDist = points.filter((p) => p.dFitM != null || p.dRawM != null).length;
    const real = points.filter((p) => p.isReal === true).length;
    const pred = points.filter((p) => p.isReal === false).length;
    return { total: points.length, withTime, withDist, real, pred };
  }, [points]);

  const tmValues = useMemo(() => {
    return {
      speed: parseTmValue(tm.speed),
      vla: parseTmValue(tm.vla),
      hla: parseTmValue(tm.hla),
      spin: parseTmValue(tm.spin),
      carry: parseTmValue(tm.carry),
      apex: parseTmValue(tm.apex),
    };
  }, [tm]);

  const imageFrames = useMemo(
    () => orderFrames(rawImageFrames, frameOrderMode),
    [rawImageFrames, frameOrderMode]
  );

  const runOrderPreview = useMemo(
    () => imageFrames.slice(0, 20).map((f, i) => `${String(i + 1).padStart(2, "0")}. ${f.name}`),
    [imageFrames]
  );

  function clearAnalysis() {
    setMetrics(null);
    setTm(EMPTY_TM);
  }

  function resetResults() {
    clearAnalysis();
    setError("");
    setYoloStatus("");
    setFrameLocations([]);
    setPoints([]);
    setRawInput("");
    setSourceLabel("");
  }

  function applyAnalysis(candidatePoints: SequencePoint[]) {
    const result = analyzeSequence(candidatePoints, {
      fps,
      pixelsPerMeter,
      useOnlyReal,
      useDistanceForX,
    });
    setMetrics(result);
  }

  function ingestRaw(raw: string, label: string) {
    try {
      const parsed = parseSequenceInput(raw);
      setRawInput(raw);
      setSourceLabel(label);
      setPoints(parsed);
      setFrameLocations(rowsFromSequencePoints(parsed));
      clearAnalysis();
      setError("");
      setYoloStatus("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not parse sequence input.";
      setError(msg);
      setPoints([]);
      setFrameLocations([]);
      clearAnalysis();
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    ingestRaw(text, file.name);
  }

  function handleImageFramesUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
      .filter((f) => f.type.startsWith("image/"));

    setRawImageFrames(files);
    setFrameLocations([]);
    setYoloStatus(files.length ? `${files.length} image frames selected` : "");
    if (!files.length) return;
    setError("");
  }

  async function runYoloFromFrames() {
    if (!imageFrames.length) {
      setError("Select image frames first.");
      return;
    }

    setRunningYolo(true);
    setError("");

    try {
      const framesPayload = await Promise.all(
        imageFrames.map(async (file) => ({
          name: file.name,
          data: await fileToDataUrl(file),
        }))
      );

      const data = (await fetchJson("/api/test-model-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames: framesPayload,
          confidence: yoloConfidence,
          cropSize: yoloCropSize,
          classId: yoloClassId === "" ? undefined : yoloClassId,
          modelPath: modelPath.trim() || undefined,
        }),
      })) as YoloResponse;

      const detections = Array.isArray(data.detections) ? data.detections : [];
      const totalFrames = Number.isFinite(data.totalFrames) ? Number(data.totalFrames) : imageFrames.length;
      const sequenceResult = detectionsToSequence(
        detections,
        totalFrames,
        fps,
        data.frameWidth,
        data.frameHeight,
        imageFrames.map((f) => f.name)
      );
      const sequence = sequenceResult.sequence;
      setFrameLocations(sequenceResult.frameLocations);
      const framesWithDetections = new Set(detections.map((d) => Math.round(d.frame))).size;

      if (sequence.length < 5) {
        setPoints(sequence);
        setRawInput("");
        setSourceLabel(`${totalFrames} image frames (YOLO)`);
        clearAnalysis();
        setError(`YOLO returned too few usable points (${sequence.length}). Need at least 5.`);
        return;
      }

      setPoints(sequence);
      setRawInput("");
      setSourceLabel(`${totalFrames} image frames (YOLO)`);
      clearAnalysis();
      applyAnalysis(sequence);

      const modelLabel = data.model ? ` · model ${data.model}` : "";
      const backendOrder = Array.isArray(data.orderedFrames) ? data.orderedFrames : [];
      const first = (backendOrder[0] ?? imageFrames[0]?.name ?? "");
      const last = (backendOrder[backendOrder.length - 1] ?? imageFrames[imageFrames.length - 1]?.name ?? "");
      const localFirst = imageFrames[0]?.name ?? "";
      const localLast = imageFrames[imageFrames.length - 1]?.name ?? "";
      const orderCheck = backendOrder.length
        ? ((localFirst === first && localLast === last) ? "order-verified" : "order-mismatch")
        : "order-local";
      const start = sequenceResult.frameLocations[0];
      const startTxt = start?.x != null && start?.y != null
        ? `start f0=(${start.x.toFixed(1)}, ${start.y.toFixed(1)})`
        : "start f0=missing";
      setYoloStatus(`YOLO-only frames ${framesWithDetections}/${totalFrames}${modelLabel} · no filler · ${orderCheck} · ${startTxt} · ${first} → ${last}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "YOLO inference failed.";
      setError(msg);
      clearAnalysis();
    } finally {
      setRunningYolo(false);
    }
  }

  function downloadFrameLocationsCsv() {
    if (!frameLocations.length) return;
    const header = "frame,name,x,y,source,isReal,confidence";
    const lines = frameLocations.map((r) =>
      [
        r.frame,
        `"${r.name.replace(/"/g, '""')}"`,
        r.x == null ? "" : r.x.toFixed(3),
        r.y == null ? "" : r.y.toFixed(3),
        r.source,
        r.isReal ? "1" : "0",
        r.conf == null ? "" : r.conf.toFixed(5),
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shot-sequence-frame-locations.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function runAnalysis() {
    if (!points.length) {
      setError("Load a sequence first.");
      return;
    }
    try {
      applyAnalysis(points);
      setError("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed.";
      setError(msg);
      setMetrics(null);
    }
  }

  async function lookupTrackMan() {
    if (!metrics) return;
    setLoadingLookup(true);
    try {
      const data = await fetchJson("/api/tm-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speed: metrics.speed, vla: metrics.vla }),
      });
      const matched = data?.tm;
      if (!matched) throw new Error("No TrackMan match found.");

      const apex = estimateApexFromMetrics(+matched.speed, +matched.vla, +matched.spin);
      setTm({
        speed: String(matched.speed ?? ""),
        vla: String(matched.vla ?? ""),
        hla: String(matched.hla ?? ""),
        spin: String(matched.spin ?? ""),
        carry: String(matched.carry ?? ""),
        apex: String(apex),
      });
      setError("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "TrackMan lookup failed.";
      setError(msg);
    } finally {
      setLoadingLookup(false);
    }
  }

  useEffect(() => {
    if (!metrics) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD = { top: 24, right: 24, bottom: 36, left: 44 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;

    const obs = metrics.observedFlight;
    const fit = metrics.fittedFlight;
    const proj = metrics.projectedFlight;

    const maxX = Math.max(120, ...obs.map((p) => p.x), ...fit.map((p) => p.x), ...proj.map((p) => p.x));
    const maxY = Math.max(25, ...obs.map((p) => p.y), ...fit.map((p) => p.y), ...proj.map((p) => p.y));
    const sx = (x: number) => PAD.left + (x / maxX) * cW;
    const sy = (y: number) => PAD.top + cH - (y / maxY) * cH;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = PAD.top + (cH * i) / 5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const x = PAD.left + (cW * i) / 6;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, H - PAD.bottom);
      ctx.stroke();
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px DM Mono, monospace";
    ctx.textAlign = "center";
    for (let i = 0; i <= 6; i++) {
      const value = (maxX * i) / 6;
      ctx.fillText(`${value.toFixed(0)} yd`, PAD.left + (cW * i) / 6, H - 12);
    }
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const value = maxY - (maxY * i) / 5;
      ctx.fillText(`${value.toFixed(0)} ft`, PAD.left - 8, PAD.top + (cH * i) / 5 + 4);
    }

    const drawLine = (pts: { x: number; y: number }[], stroke: string, width: number, dashed = false) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = sx(p.x);
        const y = sy(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };

    drawLine(proj, "#22c55e", 2.2);
    drawLine(fit, "#f59e0b", 2, true);
    drawLine(obs, "#1a6bff", 2.6);

    obs.forEach((p) => {
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), 2.8, 0, Math.PI * 2);
      ctx.fillStyle = "#1a6bff";
      ctx.fill();
    });

    const legend = [
      { c: "#1a6bff", t: "Measured Sequence" },
      { c: "#f59e0b", t: "Fit Over Captured Frames" },
      { c: "#22c55e", t: "Projected Full Flight" },
    ];
    ctx.textAlign = "left";
    ctx.font = "11px DM Sans, sans-serif";
    legend.forEach((item, i) => {
      const y = PAD.top + 12 + i * 16;
      ctx.beginPath();
      ctx.arc(PAD.left + 4, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = item.c;
      ctx.fill();
      ctx.fillStyle = "#64748b";
      ctx.fillText(item.t, PAD.left + 14, y + 4);
    });
  }, [metrics]);

  const metricRows = metrics ? [
    { key: "speed", label: "Ball Speed", pr: metrics.speed, tm: tmValues.speed, unit: "mph", digits: 1 },
    { key: "vla", label: "Launch Angle", pr: metrics.vla, tm: tmValues.vla, unit: "°", digits: 2 },
    { key: "hla", label: "Launch Direction", pr: metrics.hla, tm: tmValues.hla, unit: "°", digits: 2 },
    { key: "spin", label: "Spin", pr: metrics.spin, tm: tmValues.spin, unit: "rpm", digits: 0 },
    { key: "carry", label: "Carry", pr: metrics.carry, tm: tmValues.carry, unit: "yd", digits: 1 },
    { key: "apex", label: "Apex", pr: metrics.apex, tm: tmValues.apex, unit: "ft", digits: 1 },
  ] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a1d2e" }}>Shot Sequence Tester</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
          Upload frame images and run YOLO, or paste tracked JSON/CSV. The tester computes speed, launch, spin, carry, and apex for TrackMan comparison.
        </p>
      </div>

      <Card>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: 12, border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8fafc" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Run YOLO on Frame Sequence</div>
              {imageFrames.length > 0 && <span style={{ fontSize: 12, color: "#64748b" }}>{imageFrames.length} frames loaded</span>}
            </div>

            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageFramesUpload}
              style={{ display: "none" }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: 10, marginBottom: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>YOLO Conf</span>
                <input
                  type="number"
                  min={0.01}
                  max={0.99}
                  step={0.01}
                  value={yoloConfidence}
                  onChange={(e) => setYoloConfidence(Math.max(0.01, Math.min(0.99, Number(e.target.value) || 0.12)))}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Crop Size</span>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={10}
                  value={yoloCropSize}
                  onChange={(e) => setYoloCropSize(Math.max(0, Number(e.target.value) || 0))}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Class Id (optional)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="e.g. 0"
                  value={yoloClassId}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      setYoloClassId("");
                      return;
                    }
                    const n = Number(raw);
                    if (Number.isFinite(n) && n >= 0) setYoloClassId(Math.round(n));
                  }}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "span 2" }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Model Path (optional if YOLO_MODEL_PATH is set)</span>
                <input
                  type="text"
                  placeholder="/abs/path/to/best.pt"
                  value={modelPath}
                  onChange={(e) => setModelPath(e.target.value)}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", fontFamily: "DM Mono, monospace", fontSize: 12 }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginBottom: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Frame Order</span>
                <select
                  value={frameOrderMode}
                  onChange={(e) => setFrameOrderMode(e.target.value as FrameOrderMode)}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", fontSize: 13 }}
                >
                  <option value="natural-name">Natural filename (recommended)</option>
                  <option value="lex-name">Lexicographic filename</option>
                  <option value="capture-time">Capture time</option>
                  <option value="selected">File picker order</option>
                </select>
              </label>
              {imageFrames.length > 0 && (
                <div style={{ fontSize: 12, color: "#475569" }}>
                  Running in this exact order. First: <b>{imageFrames[0]?.name}</b> · Last: <b>{imageFrames[imageFrames.length - 1]?.name}</b>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="primary" onClick={() => imageInputRef.current?.click()}>Select Image Frames</Button>
              <Button variant="default" onClick={runYoloFromFrames} disabled={runningYolo || imageFrames.length === 0}>
                {runningYolo ? "Running YOLO..." : "Run YOLO + Analyze"}
              </Button>
              {yoloStatus && <span style={{ fontSize: 12, color: "#475569" }}>{yoloStatus}</span>}
            </div>

            {imageFrames.length > 0 && (
              <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
                <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0", textTransform: "uppercase" }}>
                  Run Order Preview ({imageFrames.length} frames)
                </div>
                <div style={{ maxHeight: 130, overflowY: "auto", padding: "8px 10px", fontFamily: "DM Mono, monospace", fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
                  {runOrderPreview.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                  {imageFrames.length > runOrderPreview.length && (
                    <div style={{ color: "#94a3b8" }}>... {imageFrames.length - runOrderPreview.length} more</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.txt,application/json,text/csv,text/plain"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <Button variant="default" onClick={() => fileInputRef.current?.click()}>Load Sequence File</Button>
            <Button
              variant="default"
              onClick={() => ingestRaw(rawInput, "Pasted input")}
              disabled={!rawInput.trim()}
            >
              Parse Pasted Input
            </Button>
            <Button variant="default" onClick={runAnalysis} disabled={!points.length}>Run Analysis</Button>
            <Button variant="ghost" onClick={resetResults}>Clear</Button>
            {sourceLabel && <span style={{ fontSize: 12, color: "#64748b" }}>Source: {sourceLabel}</span>}
          </div>

          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder='Paste JSON or CSV sequence. Supported arrays: TrackPoints/points/frames/trajectory. Required fields: frame + x + y (tMs recommended).'
            style={{
              width: "100%",
              minHeight: 120,
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              padding: 12,
              fontFamily: "DM Mono, monospace",
              fontSize: 12,
              resize: "vertical",
            }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>FPS</span>
              <input
                type="number"
                min={60}
                max={1000}
                value={fps}
                onChange={(e) => setFps(Math.max(60, Number(e.target.value) || 240))}
                style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Pixels / Meter</span>
              <input
                type="number"
                min={20}
                max={2000}
                value={pixelsPerMeter}
                onChange={(e) => setPixelsPerMeter(Math.max(20, Number(e.target.value) || 240))}
                style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
              <input type="checkbox" checked={useOnlyReal} onChange={(e) => setUseOnlyReal(e.target.checked)} />
              <span style={{ fontSize: 13, color: "#475569" }}>Use only real points</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
              <input type="checkbox" checked={useDistanceForX} onChange={(e) => setUseDistanceForX(e.target.checked)} />
              <span style={{ fontSize: 13, color: "#475569" }}>Use DFitM/DRawM for X when available</span>
            </label>
          </div>

          {parsedSummary && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#64748b" }}>
              <span>{parsedSummary.total} points parsed</span>
              <span>{parsedSummary.withTime} with time</span>
              <span>{parsedSummary.withDist} with distance</span>
              <span>{parsedSummary.real} real</span>
              <span>{parsedSummary.pred} predicted</span>
            </div>
          )}

          {frameLocations.length > 0 && (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
              <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0", textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span>Ball Location Per Frame (X, Y)</span>
                <Button variant="ghost" onClick={downloadFrameLocationsCsv}>Download CSV</Button>
              </div>
              <div style={{ maxHeight: 220, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", background: "#f8fafc" }}>
                      <th style={{ padding: "8px 10px" }}>Frame</th>
                      <th style={{ padding: "8px 10px" }}>File</th>
                      <th style={{ padding: "8px 10px" }}>X</th>
                      <th style={{ padding: "8px 10px" }}>Y</th>
                      <th style={{ padding: "8px 10px" }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frameLocations.map((row) => (
                      <tr key={`${row.frame}-${row.name}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 10px", fontFamily: "DM Mono, monospace" }}>{row.frame}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "DM Mono, monospace", color: "#475569" }}>{row.name}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "DM Mono, monospace" }}>{row.x == null ? "—" : row.x.toFixed(1)}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "DM Mono, monospace" }}>{row.y == null ? "—" : row.y.toFixed(1)}</td>
                        <td style={{ padding: "8px 10px", color: row.source === "real" || row.source === "start-anchor" ? "#166534" : "#64748b" }}>{row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fef2f2", color: "#b91c1c", fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>
      </Card>

      {metrics && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(120px, 1fr))", gap: 10 }}>
            <MetricCard label="Speed" value={`${formatValue(metrics.speed, 1)} mph`} />
            <MetricCard label="VLA" value={`${formatValue(metrics.vla, 2)}°`} />
            <MetricCard label="HLA" value={`${formatValue(metrics.hla, 2)}°`} />
            <MetricCard label="Spin" value={`${formatValue(metrics.spin, 0)} rpm`} />
            <MetricCard label="Carry" value={`${formatValue(metrics.carry, 1)} yd`} />
            <MetricCard label="Apex" value={`${formatValue(metrics.apex, 1)} ft`} />
          </div>

          <Card>
            <div style={{ padding: 20 }}>
              <canvas ref={canvasRef} style={{ width: "100%", height: 320, display: "block", borderRadius: 10 }} />
              <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#64748b" }}>
                <span>Points used: {metrics.pointsUsed}</span>
                <span>Observed apex in capture: {formatValue(metrics.observedApex, 1)} ft</span>
                <span>Projected flight time: {formatValue(metrics.flightTime, 2)} s</span>
                <span>Fit error: {formatValue(metrics.fitError, 3)} m</span>
                <span>Spin mode: {metrics.spinMode}</span>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>TrackMan Comparison</h3>
                <Button variant="default" onClick={lookupTrackMan} disabled={loadingLookup}>
                  {loadingLookup ? "Looking up..." : "Auto Fill from TM Dataset"}
                </Button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(110px, 1fr))", gap: 10 }}>
                <TmInput label="TM Speed" unit="mph" value={tm.speed} onChange={(v) => setTm((s) => ({ ...s, speed: v }))} />
                <TmInput label="TM VLA" unit="°" value={tm.vla} onChange={(v) => setTm((s) => ({ ...s, vla: v }))} />
                <TmInput label="TM HLA" unit="°" value={tm.hla} onChange={(v) => setTm((s) => ({ ...s, hla: v }))} />
                <TmInput label="TM Spin" unit="rpm" value={tm.spin} onChange={(v) => setTm((s) => ({ ...s, spin: v }))} />
                <TmInput label="TM Carry" unit="yd" value={tm.carry} onChange={(v) => setTm((s) => ({ ...s, carry: v }))} />
                <TmInput label="TM Apex" unit="ft" value={tm.apex} onChange={(v) => setTm((s) => ({ ...s, apex: v }))} />
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                      <th style={{ padding: "10px 8px", color: "#64748b" }}>Metric</th>
                      <th style={{ padding: "10px 8px", color: "#64748b" }}>Shot Seq</th>
                      <th style={{ padding: "10px 8px", color: "#64748b" }}>TrackMan</th>
                      <th style={{ padding: "10px 8px", color: "#64748b" }}>% Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map((row) => (
                      <tr key={row.key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 8px", fontWeight: 600 }}>{row.label}</td>
                        <td style={{ padding: "10px 8px", fontFamily: "DM Mono, monospace" }}>
                          {formatValue(row.pr, row.digits)} {row.unit}
                        </td>
                        <td style={{ padding: "10px 8px", fontFamily: "DM Mono, monospace", color: "#334155" }}>
                          {row.tm == null ? "—" : `${formatValue(row.tm, row.digits)} ${row.unit}`}
                        </td>
                        <td style={{ padding: "10px 8px" }}>
                          {row.key === "apex"
                            ? <ApexDelta pr={row.pr} tm={row.tm} />
                            : <MetricDelta pr={row.pr} tm={row.tm} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 21, fontWeight: 800, color: "#0f172a", fontFamily: "DM Mono, monospace" }}>{value}</div>
      </div>
    </Card>
  );
}

function TmInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{label}</span>
      <div style={{ position: "relative" }}>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "8px 28px 8px 10px",
            fontFamily: "DM Mono, monospace",
            fontSize: 13,
          }}
        />
        <span style={{ position: "absolute", right: 8, top: 9, color: "#94a3b8", fontSize: 11 }}>{unit}</span>
      </div>
    </label>
  );
}
