# Model Tester Integration Guide

## 📋 Overview
Add the Model Performance Tester to your ProRange test suite to test YOLO ball detection with different crop sizes and confidence thresholds.

## 🔧 Installation Steps

### 1. Add the Component File

Copy `ModelTester.tsx` to:
```
src/components/modules/ModelTester.tsx
```

### 2. Update App.tsx

**Import the component** (add to line ~24):
```typescript
const ModelView = lazy(() => import("./components/modules/ModelTester").then(m=>({default:m.ModelTester})));
```

**Add to MORE_NAV** (around line 58):
```typescript
const MORE_NAV: {id:TabId; label:string}[] = [
  {id:"trajectory", label:"Trajectory"},
  {id:"physics",    label:"Physics Validator"},
  {id:"kalman",     label:"Kalman Tester"},
  {id:"model",      label:"Model Tester"},  // ← ADD THIS
  {id:"trend",      label:"Trend Charts"},
  {id:"sessions",   label:"All Sessions"},
  {id:"input",      label:"Input Data"},
];
```

**Add to tab rendering** (around line 250):
```typescript
{tab === "model" && (
  <Suspense fallback={<div style={{...centered}}>Loading Model Tester...</div>}>
    <ModelView />
  </Suspense>
)}
```

### 3. Update TypeScript Types

Add to `src/types.ts` (or wherever `TabId` is defined):
```typescript
export type TabId =
  | "dashboard"
  | "trajectory"
  | "accuracy"
  | "shots"
  | "compare"
  | "progress"
  | "trend"
  | "sessions"
  | "input"
  | "physics"
  | "kalman"
  | "model"      // ← ADD THIS
  | "scrubber";
```

## ✅ That's It!

The Model Tester will now appear in your ≡ menu with the same styling as your other test modules.

---

## 🎨 Features

- **Interactive Controls**: Adjust confidence threshold and crop size with sliders
- **Visual Trajectory**: See ball detections plotted over time
- **Real Metrics**: Shows detection count, avg confidence, effective recall, status
- **Smart Recommendations**: Gives actionable advice based on results
- **Matches Your Design**: Uses same Card, Button, Badge components

---

## 🔌 Connecting Real Model Data

Currently, the component uses **simulated data**. To connect your actual YOLO model:

### Option A: Python Backend (Recommended)

Add an endpoint to `server.js`:

```javascript
app.post('/api/test-model', async (req, res) => {
  const { confidence, cropSize, frames } = req.body;
  
  // Call Python script
  const { spawn } = require('child_process');
  const python = spawn('python', [
    'test_model_performance.py',
    '--model', 'best.pt',
    '--frames', frames,
    '--confidence', confidence,
    '--crop-size', cropSize,
    '--json'  // Output JSON instead of console
  ]);
  
  let data = '';
  python.stdout.on('data', (chunk) => data += chunk);
  python.on('close', () => res.json(JSON.parse(data)));
});
```

Update `ModelTester.tsx`:

```typescript
const runTest = async () => {
  setLoading(true);
  const response = await fetch('/api/test-model', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ confidence, cropSize, frames: './test_frames' })
  });
  const data = await response.json();
  setResults(data.results);
  drawTrajectory(data.detections);
  setLoading(false);
};
```

### Option B: Direct YOLO Integration

If you want to run inference in the browser (not recommended for YOLO):

1. Convert model to TensorFlow.js
2. Load in React
3. Run inference on uploaded frames

**This is complex and slow** - better to use Python backend.

---

## 📊 Sample Test Workflow

1. Record 240fps video on iPhone
2. Extract first 150ms (36 frames) to folder
3. Point Python script at frames folder
4. Run test in ProRange suite UI
5. Adjust crop size / confidence based on recommendations
6. Export optimal settings for production app

---

## 🎯 Understanding the Metrics

- **Detections**: How many frames had ball detected (out of 36)
- **Avg Confidence**: Mean confidence score across detections
- **Effective Recall**: Model recall × Crop success rate
- **Status**:
  - ✅✅✅ Excellent (30+ points): TrackMan-level
  - ✅✅ Good (25-29 points): Highly accurate
  - ✅ Fair (20-24 points): Usable
  - ❌ Poor (<20 points): Needs improvement

Target: **30+ detections in 36 frames = 83%+ effective recall**

With your 89.2% model recall, achieving this requires:
- Crop size: 400-450px
- Confidence: 0.10-0.15
- Good Kalman filter tuning
