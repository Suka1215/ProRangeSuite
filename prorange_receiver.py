#!/usr/bin/env python3
"""
ProRange Frame Receiver
Receives frames from iPhone over UDP and saves them to disk.
Each shot is saved in its own shot-numbered directory.
"""

import socket
import json
import struct
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

# Configuration
UDP_IP = "0.0.0.0"  # Listen on all interfaces
UDP_PORT = 8889
OUTPUT_DIR = Path.home() / "ProRange_Frames"  # ~/ProRange_Frames/

# Frame reassembly
current_frames = {}  # frameIdx -> {chunks, total_size, etc}
current_shot = None
next_shot_number = 1
frame_sequence = 0

def parse_int(value):
    """Best-effort parse integer from mixed input types."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None


def slug(value, default="unknown"):
    """Filesystem-safe token."""
    if value is None:
        return default
    text = str(value).strip().lower()
    if not text:
        return default
    text = text.replace(" ", "_")
    text = re.sub(r"[^a-z0-9._-]+", "", text)
    return text or default


def detect_next_shot_number():
    """Find next shot number from existing shot_00001-style folders."""
    max_shot = 0
    if not OUTPUT_DIR.exists():
        return 1

    for entry in OUTPUT_DIR.iterdir():
        if not entry.is_dir():
            continue
        match = re.match(r"shot_(\d{5})(?:_r\d{2})?$", entry.name)
        if match:
            max_shot = max(max_shot, int(match.group(1)))
    return max_shot + 1


def extract_shot_number(header):
    """Read shot number from header if present."""
    if not isinstance(header, dict):
        return None

    candidates = [header]
    shot_obj = header.get("shot")
    if isinstance(shot_obj, dict):
        candidates.append(shot_obj)

    keys = [
        "shotNumber",
        "shot_number",
        "ShotNumber",
        "shotNum",
        "index",
        "shotIndex",
    ]
    for obj in candidates:
        for key in keys:
            value = parse_int(obj.get(key))
            if value is not None and value > 0:
                return value
    return None


def make_shot_dir(shot_number):
    """Create unique shot directory using shot number."""
    base_name = f"shot_{shot_number:05d}"
    shot_dir = OUTPUT_DIR / base_name
    revision = 1
    while shot_dir.exists():
        revision += 1
        shot_dir = OUTPUT_DIR / f"{base_name}_r{revision:02d}"
    shot_dir.mkdir(parents=True, exist_ok=False)
    return shot_dir


def next_frame_sequence():
    """Monotonic sequence for unique frame filenames."""
    global frame_sequence
    frame_sequence += 1
    return frame_sequence


def write_manifest(completed):
    """Write/update per-shot manifest."""
    global current_shot

    if current_shot is None:
        return

    header = current_shot.get("header", {})
    expected_frames = (
        parse_int(header.get("totalFrames"))
        or parse_int(header.get("frameCount"))
        or parse_int(header.get("frames"))
    )

    manifest = {
        "shotNumber": current_shot["number"],
        "createdAt": current_shot["created_at"],
        "completedAt": datetime.now().isoformat(timespec="seconds"),
        "completed": completed,
        "shotDir": str(current_shot["dir"]),
        "expectedFrames": expected_frames,
        "framesSaved": current_shot["frames_saved"],
        "phaseCounts": dict(current_shot["phase_counts"]),
        "variantCounts": dict(current_shot["variant_counts"]),
        "pendingFrameIndices": sorted(current_frames.keys()),
    }

    if expected_frames is not None:
        manifest["missingFrameEstimate"] = max(expected_frames - current_shot["frames_saved"], 0)

    if "flight_data" in current_shot:
        manifest["hasFlightData"] = True

    with open(current_shot["dir"] / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)


def start_new_shot(header=None, reason="shot_header"):
    """Initialize a new shot context and folder."""
    global current_shot, next_shot_number

    if current_shot is not None:
        print("⚠️  New shot started before previous shot_end; finalizing previous shot.")
        write_manifest(completed=False)

    current_frames.clear()

    shot_number = extract_shot_number(header)
    if shot_number is None:
        shot_number = next_shot_number
    next_shot_number = max(next_shot_number, shot_number + 1)

    shot_dir = make_shot_dir(shot_number)
    current_shot = {
        "number": shot_number,
        "dir": shot_dir,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "frames_saved": 0,
        "phase_counts": Counter(),
        "variant_counts": Counter(),
        "header": header if isinstance(header, dict) else {},
    }

    print(f"\n🏌️ NEW SHOT #{shot_number:05d} ({reason})")
    print(f"📁 Saving frames to: {shot_dir}")

    if isinstance(header, dict):
        pre_launch = header.get("preLaunchFrames", "unknown")
        total_expected = header.get("totalFrames", header.get("frameCount", "unknown"))
        print(f"   Pre-launch frames: {pre_launch}")
        print(f"   Total expected: {total_expected}")
        with open(shot_dir / "shot_header.json", "w") as f:
            json.dump(header, f, indent=2)

    write_manifest(completed=False)


def ensure_active_shot(reason):
    """Create synthetic shot context if packets arrive before shot_header."""
    if current_shot is not None:
        return

    synthetic_header = {
        "type": "shot_header",
        "generatedByReceiver": True,
        "reason": reason,
        "timestamp": datetime.now().timestamp(),
    }
    start_new_shot(header=synthetic_header, reason=f"synthetic:{reason}")


def resolve_phase(info):
    """Read phase from top-level frame_start or nested annotations."""
    phase = info.get("phase")
    annotations = info.get("annotations")
    if not phase and isinstance(annotations, dict):
        phase = annotations.get("phase")
    return slug(phase, default="unknown")


def resolve_variant(info):
    """Best-effort frame variant label (annotated/raw/etc)."""
    keys = ["variant", "frameType", "imageType", "kind", "typeLabel"]
    for key in keys:
        value = info.get(key)
        if value:
            return slug(value, default="frame")

    annotations = info.get("annotations")
    if isinstance(annotations, dict) and annotations:
        return "annotated"

    return "frame"


def handle_shot_header(data):
    """Handle shot_header JSON packet."""
    try:
        header = json.loads(data.decode("utf-8"))
        start_new_shot(header=header, reason="shot_header")
    except Exception as e:
        print(f"❌ Error parsing shot_header: {e}")


def handle_frame_start(data):
    """Handle frame_start JSON packet."""
    try:
        ensure_active_shot("frame_start_without_header")
        info = json.loads(data.decode("utf-8"))

        frame_idx = parse_int(info.get("index"))
        total_size = parse_int(info.get("totalSize"))
        if frame_idx is None or total_size is None:
            print("❌ frame_start missing required index/totalSize")
            return

        phase = resolve_phase(info)
        variant = resolve_variant(info)
        source = slug(info.get("source") or info.get("stream"), default="")
        frame_ts = info.get("timestamp")
        seq = next_frame_sequence()

        if frame_idx in current_frames:
            print(f"⚠️  Overwriting unfinished frame buffer for frame index {frame_idx}")

        current_frames[frame_idx] = {
            "chunks": {},
            "total_size": total_size,
            "phase": phase,
            "variant": variant,
            "source": source,
            "timestamp": frame_ts,
            "received_size": 0,
            "sequence": seq,
            "start_info": info,
        }

        src_label = f", {source}" if source else ""
        print(f"   📷 Frame idx={frame_idx} seq={seq}: expecting {total_size} bytes [{phase}, {variant}{src_label}]")
    except Exception as e:
        print(f"❌ Error parsing frame_start: {e}")


def unique_frame_base_name(frame_idx, frame):
    """Build non-colliding file base for frame image/metadata."""
    base = f"frame_{frame['sequence']:05d}_idx{frame_idx:05d}_{frame['phase']}_{frame['variant']}"
    if frame["source"]:
        base += f"_{frame['source']}"

    candidate = base
    suffix = 2
    while (current_shot["dir"] / f"{candidate}.jpg").exists() or (current_shot["dir"] / f"{candidate}.json").exists():
        candidate = f"{base}_dup{suffix:02d}"
        suffix += 1
    return candidate


def handle_chunk(data):
    """Handle binary chunk packet."""
    try:
        ensure_active_shot("chunk_without_header")

        # Parse chunk header: [0xAA][0xBB][frameIdx:2][chunkIdx:2][totalChunks:2][data]
        if len(data) < 8 or data[0] != 0xAA or data[1] != 0xBB:
            return

        frame_idx = struct.unpack(">H", data[2:4])[0]
        chunk_idx = struct.unpack(">H", data[4:6])[0]
        total_chunks = struct.unpack(">H", data[6:8])[0]
        chunk_data = data[8:]

        if frame_idx not in current_frames:
            print(f"⚠️  Received chunk for unknown frame {frame_idx}")
            return

        frame = current_frames[frame_idx]

        if chunk_idx in frame["chunks"]:
            # Ignore duplicate UDP chunk.
            return

        frame["chunks"][chunk_idx] = chunk_data
        frame["received_size"] += len(chunk_data)

        # Check if frame is complete.
        if len(frame["chunks"]) == total_chunks:
            chunks = []
            for i in range(total_chunks):
                if i not in frame["chunks"]:
                    print(f"❌ Frame {frame_idx}: missing chunk {i}")
                    return
                chunks.append(frame["chunks"][i])
            jpeg_data = b"".join(chunks)

            base = unique_frame_base_name(frame_idx, frame)
            image_path = current_shot["dir"] / f"{base}.jpg"
            meta_path = current_shot["dir"] / f"{base}.json"

            with open(image_path, "wb") as f:
                f.write(jpeg_data)

            meta = {
                "index": frame_idx,
                "sequence": frame["sequence"],
                "phase": frame["phase"],
                "variant": frame["variant"],
                "source": frame["source"] or None,
                "timestamp": frame["timestamp"],
                "totalSizeHeader": frame["total_size"],
                "totalSizeSaved": len(jpeg_data),
                "totalChunks": total_chunks,
                "frameStart": frame["start_info"],
            }
            with open(meta_path, "w") as f:
                json.dump(meta, f, indent=2)

            current_shot["frames_saved"] += 1
            current_shot["phase_counts"][frame["phase"]] += 1
            current_shot["variant_counts"][frame["variant"]] += 1

            print(f"   ✅ Frame idx={frame_idx} seq={frame['sequence']}: {len(jpeg_data)} bytes saved to {image_path.name}")

            # Cleanup frame buffer.
            del current_frames[frame_idx]

            # Keep manifest current during long shots.
            write_manifest(completed=False)

    except Exception as e:
        print(f"❌ Error handling chunk: {e}")


def handle_shot_end():
    """Handle shot_end JSON packet."""
    global current_shot

    if current_shot is None:
        print("\n🏁 Shot complete (no active shot context)\n")
        current_frames.clear()
        return

    pending = len(current_frames)
    if pending:
        print(f"⚠️  Shot ended with {pending} incomplete frame(s): {sorted(current_frames.keys())}")

    write_manifest(completed=True)
    print(f"\n🏁 Shot #{current_shot['number']:05d} complete: {current_shot['frames_saved']} frames saved\n")
    current_frames.clear()
    current_shot = None


def handle_flight_data(data):
    """Handle flight_data JSON packet."""
    try:
        ensure_active_shot("flight_data_without_header")
        flight = json.loads(data.decode("utf-8"))
        ball_data = flight.get("BallData", {})

        print("\n📊 FLIGHT DATA:")
        print(f"   Speed: {ball_data.get('Speed', 0):.1f} mph")
        print(f"   VLA: {ball_data.get('VLA', 0):.1f}°")
        print(f"   HLA: {ball_data.get('HLA', 0):.1f}°")
        print(f"   Spin: {ball_data.get('TotalSpin', 0):.0f} rpm")

        current_shot["flight_data"] = flight
        with open(current_shot["dir"] / "flight_data.json", "w") as f:
            json.dump(flight, f, indent=2)
        write_manifest(completed=False)
    except Exception as e:
        print(f"❌ Error parsing flight_data: {e}")

def main():
    """Main receiver loop"""
    global next_shot_number

    # Setup
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    next_shot_number = detect_next_shot_number()
    
    # Create UDP socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    
    print(f"🎯 ProRange Frame Receiver")
    print(f"📡 Listening on {UDP_IP}:{UDP_PORT}")
    print(f"📁 Saving to: {OUTPUT_DIR}")
    print(f"🔢 Next shot folder: shot_{next_shot_number:05d}")
    print(f"\n⏳ Waiting for frames from iPhone...\n")
    
    try:
        while True:
            data, _addr = sock.recvfrom(65535)  # Max UDP packet size
            
            # Try to parse as JSON first
            try:
                msg = json.loads(data.decode('utf-8'))
                msg_type = msg.get('type')
                
                if msg_type == 'shot_header':
                    handle_shot_header(data)
                
                elif msg_type == 'frame_start':
                    handle_frame_start(data)
                
                elif msg_type == 'shot_end':
                    handle_shot_end()
                
                elif msg_type == 'flight_data':
                    handle_flight_data(data)
            
            except (json.JSONDecodeError, UnicodeDecodeError):
                # Not JSON - must be binary chunk
                handle_chunk(data)
    
    except KeyboardInterrupt:
        if current_shot is not None:
            print("⚠️  Receiver interrupted; writing current shot manifest.")
            write_manifest(completed=False)
        print(f"\n\n👋 Stopped. Frames saved to: {OUTPUT_DIR}")
        sock.close()

if __name__ == "__main__":
    main()
