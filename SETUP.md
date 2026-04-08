# ProRange Live Setup Guide

Connect your iPhone ProRange app to the browser test suite over WiFi.
Every shot you hit updates the dashboard in real time.

---

## How It Works

```
iPhone (ProRange app)
        │
        │  HTTP POST /shot  (GSPro protocol, port 9211)
        │  same WiFi network
        ▼
Mac (server.js — Node bridge)
        │
        │  WebSocket broadcast
        ▼
Browser (React dashboard — localhost:3000)
```

---

## One-Time Setup

### 1. Install Node.js (if not already)
```bash
# Check if you have it:
node --version   # needs v18+

# If not, install from https://nodejs.org  (LTS version)
```

### 2. Install dependencies
```bash
cd prorange-test-suite   # the folder you unzipped
npm install
```

### 3. Build the React app
```bash
npm run build
```

---

## Every Session

### Step 1 — Start the bridge server
```bash
npm run server
```

You'll see something like:
```
╔═══════════════════════════════════════════════════════╗
║         ProRange Live Bridge Server — RUNNING         ║
╠═══════════════════════════════════════════════════════╣
║  Browser:  http://localhost:3000                      ║
║  LAN:      http://192.168.1.42:3000                   ║
╠═══════════════════════════════════════════════════════╣
║  iPhone → set GSPro IP to: 192.168.1.42               ║
║  iPhone → set GSPro Port:  9211                       ║
╚═══════════════════════════════════════════════════════╝
```

### Step 2 — Open the dashboard
Go to **http://localhost:3000** in your browser.

### Step 3 — Configure ProRange on your iPhone
In the ProRange iOS app settings:
- **GSPro IP Address** → your Mac's IP shown in the terminal (e.g. `192.168.1.42`)
- **GSPro Port** → `9211`
- Make sure your iPhone and Mac are on the **same WiFi network**

> **Tip:** Your Mac's IP can change if you reconnect to WiFi.
> Run `ipconfig getifaddr en0` in Terminal to check it any time.

### Step 4 — Click "Go Live" in the dashboard
Hit the **Go Live** button in the top nav bar.
The dot turns green when connected.

### Step 5 — Hit shots!
Each shot from ProRange appears instantly on the dashboard —
Speed, VLA, HLA, Carry, Spin all update live.

---

## Accumulating Test Sessions

After a testing session with TrackMan:

1. In the browser, go to **Input Data** tab
2. Manually enter the TrackMan readings for each shot
   (or export from TrackMan and paste the CSV)
3. Go to **+ Session** → enter the version, date, notes
4. All sessions persist in your browser's local storage

---

## Development Mode (hot reload)

If you're editing code and want hot reload:
```bash
# Terminal 1: bridge server
node server.js

# Terminal 2: vite dev server (auto-proxies WebSocket to port 3000)
npm run dev
```
Then open http://localhost:5173

---

## Desktop Builds

You can package the Electron desktop app into downloadable installers from this repo.

### Build a desktop app for your current machine
```bash
npm run desktop:dist
```

Artifacts are written to `release/`.

### Build macOS downloadables
```bash
npm run desktop:dist:mac
```

This produces a `.dmg` and `.zip` in `release/`.

### Build Windows downloadables
```bash
npm run desktop:dist:win
```

This produces an NSIS installer `.exe` and a `.zip` in `release/`.
For the smoothest Windows result, run this command on a Windows machine.

### Smoke-test the packaged app layout without making an installer
```bash
npm run desktop:pack
```

### GSPro helper note

The desktop app looks for `gspro_bridge.py` in one of these ways:
- a path you set with `GSPRO_BRIDGE_SCRIPT`
- a bundled `gspro_bridge.py` shipped with the desktop app
- the legacy local Mac fallback at `/Users/jmmiller/Downloads/gspro_bridge.py`

If you want one-click GSPro setup in the downloadable app, bundle `gspro_bridge.py` with the desktop build or set `GSPRO_BRIDGE_SCRIPT` on the target machine.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Go Live" stays orange | Server not running — check Terminal |
| iPhone sends shots but browser doesn't update | Wrong IP in ProRange settings |
| `EADDRINUSE` error | Port 9211 in use — kill the old process: `lsof -ti:9211 \| xargs kill` |
| Shots come in but VLA looks wrong | That's the whole point — use the dashboard to track it! |

---

## Shot Data Format

ProRange sends standard GSPro JSON — the bridge translates it:

```json
{
  "DeviceID": "ProRange",
  "Units": "Yards",
  "ShotNumber": 42,
  "Club": "7Iron",
  "BallData": {
    "Speed": 91.2,
    "VLA": 19.7,
    "HLA": 1.3,
    "TotalSpin": 7240,
    "SpinAxis": 4.2,
    "CarryDistance": 162
  }
}
```

TrackMan readings are entered manually via the **Input Data** tab and matched to shots by shot number within a session.
