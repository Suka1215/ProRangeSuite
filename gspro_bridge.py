import socket
import threading
import json
import time
import argparse
from datetime import datetime
from typing import Optional

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen-host", default="0.0.0.0")
    parser.add_argument("--listen-port", type=int, default=9210)
    parser.add_argument("--sim-host", default="127.0.0.1")
    parser.add_argument("--sim-port", type=int, default=921)
    parser.add_argument("--sim-name", default="GSPro")
    return parser.parse_args()

ARGS = parse_args()

LISTEN_HOST = ARGS.listen_host
LISTEN_PORT = ARGS.listen_port
SIM_HOST = ARGS.sim_host
SIM_PORT = ARGS.sim_port
SIM_NAME = ARGS.sim_name
SIM_NAME_KEY = SIM_NAME.strip().lower()

gspro_lock = threading.Lock()
gspro_sock = None
shot_count = 1


def build_gspro_payload(input_data, fallback_shot_number=None):
    global shot_count

    if not isinstance(input_data, dict):
        input_data = {}

    ball = input_data.get("BallData", {}) if isinstance(input_data, dict) else {}
    options = input_data.get("ShotDataOptions", {}) if isinstance(input_data, dict) else {}

    shot_number = input_data.get("ShotNumber") if isinstance(input_data, dict) else None
    if not isinstance(shot_number, int):
        shot_number = fallback_shot_number if isinstance(fallback_shot_number, int) else shot_count

    payload = {
        "DeviceID": input_data.get("DeviceID") if isinstance(input_data.get("DeviceID"), str) and input_data.get("DeviceID").strip() else "SPIVOT Bridge",
        "Units": input_data.get("Units") if isinstance(input_data.get("Units"), str) and input_data.get("Units").strip() else "Yards",
        "ShotNumber": shot_number,
        "APIversion": "1",
        "BallData": {
            "Speed": float(ball.get("Speed", 0.0) or 0.0),
            "VLA": float(ball.get("VLA", 0.0) or 0.0),
            "HLA": float(ball.get("HLA", 0.0) or 0.0),
            "BackSpin": float(ball.get("BackSpin", ball.get("TotalSpin", 0.0)) or 0.0),
            "SideSpin": float(ball.get("SideSpin", 0.0) or 0.0),
            "TotalSpin": float(ball.get("TotalSpin", ball.get("BackSpin", 0.0)) or 0.0),
            "SpinAxis": float(ball.get("SpinAxis", 0.0) or 0.0),
        },
        "ShotDataOptions": {
            "ContainsBallData": bool(options.get("ContainsBallData", True)),
            "ContainsClubData": bool(options.get("ContainsClubData", False)),
            "LaunchMonitorIsReady": bool(options.get("LaunchMonitorIsReady", True)),
            "LaunchMonitorBallDetected": bool(options.get("LaunchMonitorBallDetected", True)),
            "IsHeartBeat": bool(options.get("IsHeartBeat", False)),
        }
    }

    if "CarryDistance" in ball:
        payload["BallData"]["CarryDistance"] = float(ball.get("CarryDistance") or 0.0)

    if "ClubData" in input_data and isinstance(input_data["ClubData"], dict):
        payload["ClubData"] = input_data["ClubData"]

    return payload

def log(direction, data):
    ts = datetime.now().strftime('%H:%M:%S.%f')[:-3]
    try:
        obj = json.loads(data.strip())
        if obj.get('ShotDataOptions', {}).get('IsHeartBeat'):
            return
        print(f"\n[{ts}] {direction}")
        print(json.dumps(obj, indent=2))
    except Exception:
        print(f"[{ts}] {direction}: {data.strip()}")

def connect_gspro():
    global gspro_sock
    while True:
        try:
            # Create a fresh socket
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(5.0)
            s.connect((SIM_HOST, SIM_PORT))
            with gspro_lock:
                gspro_sock = s
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Connected to {SIM_NAME} on {SIM_PORT}")
            return
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] {SIM_NAME} unavailable: {e} - retrying in 2s...")
            time.sleep(2)

def send_to_gspro(data_dict) -> bool:
    global gspro_sock, shot_count

    normalized_payload = build_gspro_payload(data_dict, shot_count)
    if normalized_payload.get("ShotDataOptions", {}).get("IsHeartBeat") and SIM_NAME_KEY != "gspro":
        return True

    if normalized_payload.get("ShotNumber") == shot_count and not normalized_payload.get("ShotDataOptions", {}).get("IsHeartBeat"):
        shot_count += 1

    payload = json.dumps(normalized_payload) + '\n'

    with gspro_lock:
        sock = gspro_sock
    if sock is None:
        return False

    try:
        sock.sendall(payload.encode('utf-8'))
        return True
    except Exception as e:
        print(f"Send error ({SIM_NAME} rejected data): {e}")
        with gspro_lock:
            gspro_sock = None
        threading.Thread(target=connect_gspro, daemon=True).start()
        return False


def try_parse_json_payload(raw_text: str) -> Optional[dict]:
    text = raw_text.strip()
    if not text:
        return None

    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def extract_http_json_request(buffer: str):
    header_end = buffer.find('\r\n\r\n')
    delimiter_len = 4
    if header_end == -1:
        header_end = buffer.find('\n\n')
        delimiter_len = 2
    if header_end == -1:
        return None, buffer

    header_block = buffer[:header_end]
    remainder = buffer[header_end + delimiter_len:]
    header_lines = [line for line in header_block.replace('\r', '').split('\n') if line.strip()]
    if not header_lines:
        return None, buffer

    request_line = header_lines[0]
    if not request_line.startswith(("POST ", "GET ")):
        return None, buffer

    headers = {}
    for line in header_lines[1:]:
        if ':' not in line:
            continue
        key, value = line.split(':', 1)
        headers[key.strip().lower()] = value.strip()

    content_length = int(headers.get('content-length', '0') or '0')
    if len(remainder.encode('utf-8')) < content_length:
        return None, buffer

    body = remainder[:content_length]
    leftover = remainder[content_length:]
    return {
        "request_line": request_line,
        "headers": headers,
        "body": body,
        "leftover": leftover,
    }, leftover


def send_http_response(phone_sock, status_code=200, payload=None):
    response_body = json.dumps(payload or {"ok": True})
    status_text = "OK" if status_code == 200 else "Bad Request"
    response = (
        f"HTTP/1.1 {status_code} {status_text}\r\n"
        "Content-Type: application/json\r\n"
        f"Content-Length: {len(response_body.encode('utf-8'))}\r\n"
        "Connection: close\r\n"
        "\r\n"
        f"{response_body}"
    )
    phone_sock.sendall(response.encode('utf-8'))

def heartbeat_loop():
    """Sends a complete V1 heartbeat every 2 seconds"""
    while True:
        hb = {
            "DeviceID": "iPhone-Bridge",
            "Units": "Yards",
            "ShotNumber": 0,
            "APIversion": "1",
            "BallData": {
                "Speed": 0.0, "SpinAxis": 0.0, "TotalSpin": 0.0, "HLA": 0.0, "VLA": 0.0
            },
            "ClubData": { "Speed": 0.0 },
            "ShotDataOptions": {
                "ContainsBallData": False,
                "ContainsClubData": False,
                "LaunchMonitorIsReady": True,
                "LaunchMonitorBallDetected": False,
                "IsHeartBeat": True
            }
        }
        if send_to_gspro(hb):
            pass
        time.sleep(2)

def handle_iphone(phone_sock, addr):
    print(f"Phone connected: {addr}")
    buf = ""
    try:
        while True:
            data = phone_sock.recv(4096).decode('utf-8', errors='replace')
            if not data:
                break
            buf += data
            while True:
                if buf.startswith(("POST ", "GET ")):
                    request, remaining = extract_http_json_request(buf)
                    if request is None:
                        break

                    buf = remaining
                    shot_data = try_parse_json_payload(request["body"])
                    if shot_data is None:
                        print("Warning: Phone sent HTTP, but body was not valid JSON.")
                        send_http_response(phone_sock, 400, {"ok": False, "error": "invalid_json"})
                        continue

                    log(f"iPhone -> {SIM_NAME}", request["body"])
                    forwarded = send_to_gspro(shot_data)
                    send_http_response(phone_sock, 200 if forwarded else 502, {"ok": forwarded})
                    continue

                if '\n' not in buf:
                    break

                line, buf = buf.split('\n', 1)
                if not line.strip():
                    continue

                shot_data = try_parse_json_payload(line)
                if shot_data is not None:
                    log(f"iPhone -> {SIM_NAME}", line)
                    send_to_gspro(shot_data)
                    continue

                print(f"Non-JSON data received: {line[:80]}")
    except Exception as e:
        print(f"Phone connection lost: {e}")
    finally:
        phone_sock.close()

def main():
    print(f"{'='*40}")
    print(f"{SIM_NAME} Bridge Active")
    print(f"   Listening for Phone on: {LISTEN_PORT}")
    print(f"   Forwarding to {SIM_NAME} on: {SIM_PORT}")
    print(f"{'='*40}")

    # Start GSPro connection thread
    threading.Thread(target=connect_gspro, daemon=True).start()
    # GSPro expects a persistent ready heartbeat. Infinite Tee should only receive real shots.
    if SIM_NAME_KEY == "gspro":
        threading.Thread(target=heartbeat_loop, daemon=True).start()

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((LISTEN_HOST, LISTEN_PORT))
    server.listen(5)

    try:
        while True:
            client, addr = server.accept()
            threading.Thread(target=handle_iphone, args=(client, addr), daemon=True).start()
    except KeyboardInterrupt:
        print("\nStopping Bridge...")

if __name__ == '__main__':
    main()
