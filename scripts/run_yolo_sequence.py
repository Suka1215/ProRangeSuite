#!/usr/bin/env python3
"""
Run YOLO inference on a folder of ordered image frames and emit JSON detections.

Output schema:
{
  "ok": true,
  "model": "...",
  "totalFrames": 36,
  "detections": [
    {"frame": 0, "x": 945.1, "y": 612.4, "conf": 0.82, "width": 16.2, "height": 15.9}
  ]
}
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run YOLO on frame sequence")
    parser.add_argument("--model", required=True, help="Path to YOLO .pt model")
    parser.add_argument("--input-dir", required=True, help="Directory containing image frames")
    parser.add_argument("--conf", type=float, default=0.12, help="Confidence threshold")
    parser.add_argument("--crop-size", type=int, default=0, help="Center crop size in pixels (0 disables crop)")
    parser.add_argument("--class-id", type=int, default=None, help="Optional class id filter")
    parser.add_argument("--json", action="store_true", help="Emit JSON payload")
    return parser.parse_args()


def list_frames(input_dir: Path) -> list[Path]:
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    files = [p for p in input_dir.iterdir() if p.is_file() and p.suffix.lower() in exts]
    return sorted(files, key=lambda p: p.name)


def to_float(value, default=0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def run() -> int:
    args = parse_args()
    input_dir = Path(args.input_dir)
    model_path = Path(args.model)

    if not input_dir.exists() or not input_dir.is_dir():
        print(json.dumps({"error": f"Input dir does not exist: {input_dir}"}))
        return 2
    if not model_path.exists():
        print(json.dumps({"error": f"Model file does not exist: {model_path}"}))
        return 2

    try:
        from ultralytics import YOLO  # type: ignore
        import cv2  # type: ignore
    except Exception as exc:
        print(json.dumps({"error": f"Missing YOLO dependencies: {exc}"}))
        return 2

    frames = list_frames(input_dir)
    if not frames:
        print(json.dumps({"error": f"No image frames found in {input_dir}"}))
        return 2

    try:
        model = YOLO(str(model_path))
    except Exception as exc:
        print(json.dumps({"error": f"Failed to load YOLO model: {exc}"}))
        return 2

    detections: list[dict] = []
    frame_width = 0
    frame_height = 0

    for frame_idx, frame_path in enumerate(frames):
        image = cv2.imread(str(frame_path))
        if image is None:
            continue

        h, w = image.shape[:2]
        if frame_width == 0:
            frame_width = int(w)
            frame_height = int(h)
        ox, oy = 0, 0
        cropped = image
        if args.crop_size and args.crop_size > 0:
            size = max(8, min(args.crop_size, w, h))
            ox = max(0, (w - size) // 2)
            oy = max(0, (h - size) // 2)
            cropped = image[oy:oy + size, ox:ox + size]

        try:
            result = model.predict(source=cropped, conf=args.conf, verbose=False)[0]
        except Exception:
            continue

        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            continue

        frame_candidates = []
        for i in range(len(boxes)):
            cls_tensor = boxes.cls[i] if hasattr(boxes, "cls") else None
            cls = int(cls_tensor.item()) if cls_tensor is not None else None
            if args.class_id is not None and cls is not None and cls != args.class_id:
                continue

            conf = to_float(boxes.conf[i].item() if hasattr(boxes, "conf") else 0.0, 0.0)
            x1, y1, x2, y2 = boxes.xyxy[i].tolist()
            cx = ((x1 + x2) / 2.0) + ox
            cy = ((y1 + y2) / 2.0) + oy
            bw = max(0.0, (x2 - x1))
            bh = max(0.0, (y2 - y1))
            frame_candidates.append(
                {
                    "frame": frame_idx,
                    "x": round(cx, 2),
                    "y": round(cy, 2),
                    "conf": round(conf, 5),
                    "width": round(bw, 2),
                    "height": round(bh, 2),
                    "classId": cls,
                }
            )

        frame_candidates.sort(key=lambda d: d.get("conf", 0), reverse=True)
        detections.extend(frame_candidates)

    payload = {
        "ok": True,
        "model": str(model_path),
        "totalFrames": len(frames),
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "orderedFrames": [p.name for p in frames],
        "detections": detections,
    }
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    sys.exit(run())
