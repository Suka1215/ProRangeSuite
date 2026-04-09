import socket
import threading
import json
import time
from datetime import datetime

# --- CONFIGURATION ---
LISTEN_HOST = '0.0.0.0'
LISTEN_PORT = 9210         # iPhone connects here (Local IP:9210)
GSPRO_HOST = '127.0.0.1'
GSPRO_PORT = 921           # Official GSPro Open Connect Port

gspro_lock = threading.Lock()
gspro_sock = None
shot_count = 1

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
            s.connect((GSPRO_HOST, GSPRO_PORT))
            with gspro_lock:
                gspro_sock = s
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Connected to GSPro on {GSPRO_PORT}")
            return
        except Exception as e:
            # WinError 10061 usually means GSPro Connect window isn't open/active
            print(f"[{datetime.now().strftime('%H:%M:%S')}] GSPro unavailable: {e} - retrying in 2s...")
            time.sleep(2)

def send_to_gspro(data_dict) -> bool:
    global gspro_sock, shot_count

    # Ensure V1 Protocol requirements
    if "ShotNumber" not in data_dict:
        data_dict["ShotNumber"] = shot_count
        shot_count += 1

    # Strictly ensure APIversion is a string "1"
    data_dict["APIversion"] = "1"

    payload = json.dumps(data_dict) + '\n'

    with gspro_lock:
        sock = gspro_sock
    if sock is None:
        return False

    try:
        sock.sendall(payload.encode('utf-8'))
        return True
    except Exception as e:
        # WinError 10054 happens here if GSPro rejects the JSON format
        print(f"Send error (GSPro rejected data): {e}")
        with gspro_lock:
            gspro_sock = None
        threading.Thread(target=connect_gspro, daemon=True).start()
        return False

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
            while '\n' in buf:
                line, buf = buf.split('\n', 1)
                if not line.strip():
                    continue

                try:
                    shot_data = json.loads(line)
                    log("iPhone -> GSPro", line)
                    send_to_gspro(shot_data)
                except json.JSONDecodeError:
                    # Filter out HTTP noise if your phone sends it
                    if "GET " in line or "POST " in line:
                        print("Warning: Phone is sending HTTP. Must send raw TCP.")
                    else:
                        print(f"Non-JSON data received: {line[:50]}")
    except Exception as e:
        print(f"Phone connection lost: {e}")
    finally:
        phone_sock.close()

def main():
    print(f"{'='*40}")
    print("GSPro Bridge Active")
    print(f"   Listening for Phone on: {LISTEN_PORT}")
    print(f"   Forwarding to GSPro on: {GSPRO_PORT}")
    print(f"{'='*40}")

    # Start GSPro connection thread
    threading.Thread(target=connect_gspro, daemon=True).start()
    # Start Heartbeat thread
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
