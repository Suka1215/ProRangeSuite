import React, { useState, lazy, Suspense, useCallback } from "react";
import { useSessions }       from "./hooks/useSessions";
import { useNotification }   from "./hooks/useNotification";
import { useLiveShots }      from "./hooks/useLiveShots";
import type { LiveStatus }   from "./hooks/useLiveShots";
import { NotificationToast } from "./components/ui/NotificationToast";
import { generateSyntheticShot, exportShotsToCSV } from "./utils/shotData";
import { calcSessionStats, pctError } from "./utils/stats";
import { VERSION_COLORS } from "./constants";
import type { Shot, Session, TabId } from "./types";

/* ── lazy views ─────────────────────────────────────────────────────── */
const FrameScrubberView = lazy(() => import('./views/FrameScrubberView'));
const TrajectoryView  = lazy(() => import("./views/TrajectoryView"));
const AccuracyView    = lazy(() => import("./views/AccuracyView"));
const ShotLogView     = lazy(() => import("./views/ShotLogView"));
const InputDataView   = lazy(() => import("./views/InputDataView"));
const ProgressView    = lazy(() => import("./views/ProgressView"));
const TrendView       = lazy(() => import("./views/TrendView"));
const CompareView     = lazy(() => import("./views/CompareView"));
const AllSessionsView = lazy(() => import("./views/AllSessionsView"));
const PhysicsView     = lazy(() => import("./components/modules/PhysicsValidator").then(m=>({default:m.PhysicsValidator})));
const KalmanView      = lazy(() => import("./components/modules/KalmanTester").then(m=>({default:m.KalmanTester})));
const ModelView       = lazy(() => import("./components/modules/ModelTester").then(m=>({default:m.ModelTester})));
const NewSessionModal = lazy(() => import("./components/modules/NewSessionModal"));

/* ── global CSS ─────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body,#root{height:100%;overflow:hidden}
  body{font-family:'DM Sans',sans-serif;background:#f6f6f6;color:#1a1d2e}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-thumb{background:#d0d4de;border-radius:4px}
  button{font-family:'DM Sans',sans-serif;cursor:pointer;border:none;outline:none}
  button:active{opacity:.85;transform:scale(.97)}
  @keyframes fadeDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes ping{0%{transform:scale(1);opacity:.7}70%{transform:scale(2.2);opacity:0}100%{opacity:0}}
`;

const CLUBS = ["Driver","3-Wood","5-Iron","7-Iron","9-Iron","PW","SW"];

/* nav items — primary tabs shown in nav bar */
const PRIMARY_NAV: {id:TabId; label:string; chevron?:boolean}[] = [
  {id:"dashboard",  label:"Dashboard"},
  {id:"accuracy",   label:"Accuracy",   chevron:true},
  {id:"shots",      label:"Shot Log",   chevron:true},
  {id:"compare",    label:"Compare"},
  {id:"progress",   label:"Progress",   chevron:true},
];

/* overflow items in ≡ menu */
const MORE_NAV: {id:TabId; label:string}[] = [
  {id:"trajectory", label:"Trajectory"},
  {id:"physics",    label:"Physics Validator"},
  {id:"kalman",     label:"Kalman Tester"},
<<<<<<< HEAD
=======
  {id:"model",      label:"Model Tester"},
>>>>>>> master
  {id:"trend",      label:"Trend Charts"},
  {id:"sessions",   label:"All Sessions"},
  {id:"input",      label:"Input Data"},
];

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  APP                                                             ║
   ╚══════════════════════════════════════════════════════════════════╝ */
export default function App() {
  const [tab,     setTab]    = useState<TabId>("dashboard");
  const [club,    setClub]   = useState("7-Iron");
  const [moreOpen,setMoreOpen] = useState(false);
  const [clubOpen,setClubOpen] = useState(false);
  const [modal,   setModal]  = useState(false);
  const [playing, setPlaying]= useState(false);
  const [tlOff,   setTlOff]  = useState(0);

  const [active, setActive] = useState<Shot|null>(null);

  const {
    sessions, liveShots, liveSession, tmReady,
    addSession, deleteSession, resetToSeed,
    addLiveShot, clearLiveShots,
  } = useSessions();
  const {notification, notify} = useNotification();

  // shots = live shots from iPhone (persisted in useSessions)
  // We use liveShots directly for trajectory/shot-log views
  const shots = liveShots;

  const handleLiveShot = (s: Shot) => {
    addLiveShot(s);   // persists to localStorage + adds to live session
    setActive(s);
  };

  const { status: liveStatus, shotCount: liveShotCount, connect: liveConnect, disconnect: liveDisconnect } =
    useLiveShots({ onShot: handleLiveShot, onNotify: notify });

  const addShot = () => {
    const s = generateSyntheticShot(club);
    addLiveShot(s); setActive(s); notify("Shot generated ✓");
  };

  const moreActive = MORE_NAV.some(n=>n.id===tab);

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",background:"#f6f6f6"}}>
      <style>{CSS}</style>
      <NotificationToast notification={notification}/>

      {/* ════════════════════════════════════════════════════════════
          NAV BAR  — exact match to reference image
          • #f6f6f6 background (same as page — no visible bar)
          • each item = its own rounded pill with light gray bg
          • active item = solid #1a6bff pill
          • logo = rounded square icon, NO text
          • right side = club pill + blue "+ Shot" + outlined "+ Session"
      ════════════════════════════════════════════════════════════ */}
      <header style={{
        flexShrink:0,
        background:"#f6f6f6",
        padding:"14px 24px",
        display:"flex",
        alignItems:"center",
        gap:8,
      }}>

        {/* Logo icon */}
        <div style={{
          width:42, height:42,
          borderRadius:13,
          background:"linear-gradient(140deg,#1a6bff,#0038b8)",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:20,
          boxShadow:"0 4px 14px rgba(26,107,255,.35)",
          flexShrink:0,
          marginRight:4,
        }}>⛳</div>

        {/* ── Primary nav pills ── */}
        {PRIMARY_NAV.map(({id,label,chevron}) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              onClick={()=>setTab(id)}
              style={{
                /* each button is an independent floating pill */
                background: isActive ? "#1a6bff" : "rgba(0,0,0,.07)",
                color:      isActive ? "#fff"    : "#444",
                borderRadius: 100,
                padding:    "10px 18px",
                fontSize:   14,
                fontWeight: isActive ? 700 : 500,
                display:    "flex",
                alignItems: "center",
                gap:        6,
                transition: "all .15s",
                whiteSpace: "nowrap",
              }}
            >
              {label}
              {chevron && (
                <svg width="11" height="7" viewBox="0 0 11 7" fill="none">
                  <path d="M1 1.5l4.5 4 4.5-4" stroke={isActive?"rgba(255,255,255,.7)":"#888"}
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          );
        })}

        {/* ≡ More menu pill */}
        <div style={{position:"relative"}}>
          <button
            onClick={()=>setMoreOpen(v=>!v)}
            style={{
              background: moreActive ? "#1a6bff" : "rgba(0,0,0,.07)",
              color:      moreActive ? "#fff"    : "#444",
              borderRadius: 100,
              padding:    "10px 16px",
              fontSize:   14,
              fontWeight: 500,
              display:    "flex", alignItems:"center", gap:7,
              transition: "all .15s",
            }}
          >
            {/* Hamburger lines */}
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <rect y="0"   width="18" height="2.2" rx="1.1" fill={moreActive?"#fff":"#555"}/>
              <rect y="5.9" width="12" height="2.2" rx="1.1" fill={moreActive?"#fff":"#555"}/>
              <rect y="11.8" width="15" height="2.2" rx="1.1" fill={moreActive?"#fff":"#555"}/>
            </svg>
            <svg width="11" height="7" viewBox="0 0 11 7" fill="none">
              <path d="M1 1.5l4.5 4 4.5-4" stroke={moreActive?"rgba(255,255,255,.7)":"#888"}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {moreOpen && (
            <div style={{
              position:"absolute", top:"calc(100% + 10px)", left:0, zIndex:999,
              background:"#fff", borderRadius:18, padding:"8px",
              minWidth:220,
              boxShadow:"0 12px 48px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.06)",
              border:"1px solid rgba(0,0,0,.06)",
              animation:"fadeDown .18s ease",
            }}>
              {MORE_NAV.map(({id,label}) => (
                <button key={id} onClick={()=>{setTab(id);setMoreOpen(false);}} style={{
                  display:"block", width:"100%", padding:"10px 16px",
                  borderRadius:12, textAlign:"left",
                  background: tab===id ? "#eff6ff" : "transparent",
                  color:      tab===id ? "#1a6bff" : "#333",
                  fontSize:   14, fontWeight: tab===id ? 700 : 500,
                  transition: "background .12s",
                }}>{label}</button>
              ))}
              <div style={{height:1,background:"#f0f0f0",margin:"6px 0"}}/>
              <button onClick={()=>{exportShotsToCSV(shots);notify("Exported ✓");setMoreOpen(false);}} style={{
                display:"block",width:"100%",padding:"10px 16px",borderRadius:12,
                textAlign:"left",background:"transparent",color:"#9ca3af",fontSize:13.5,
              }}>↓ Export CSV</button>
            </div>
          )}
        </div>

        {/* ── Spacer ── */}
        <div style={{flex:1}}/>

        {/* Club selector */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setClubOpen(v=>!v)} style={{
            background:"rgba(0,0,0,.07)", borderRadius:100,
            padding:"10px 18px", fontSize:14, fontWeight:600, color:"#333",
            display:"flex",alignItems:"center",gap:7,
          }}>
            {club}
            <svg width="11" height="7" viewBox="0 0 11 7" fill="none">
              <path d="M1 1.5l4.5 4 4.5-4" stroke="#888" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {clubOpen && (
            <div style={{
              position:"absolute",top:"calc(100% + 10px)",right:0,zIndex:999,
              background:"#fff",borderRadius:18,padding:"8px",minWidth:155,
              boxShadow:"0 12px 48px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.06)",
              border:"1px solid rgba(0,0,0,.06)",
              animation:"fadeDown .18s ease",
            }}>
              {CLUBS.map(c=>(
                <button key={c} onClick={()=>{setClub(c);setClubOpen(false);}} style={{
                  display:"block",width:"100%",padding:"10px 16px",borderRadius:12,
                  textAlign:"left",
                  background:c===club?"#eff6ff":"transparent",
                  color:c===club?"#1a6bff":"#333",
                  fontSize:14,fontWeight:c===club?700:500,
                }}>{c}</button>
              ))}
            </div>
          )}
        </div>

        {/* 📡 Live Connect button + TM DB status */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <LiveConnectButton
            status={liveStatus}
            shotCount={liveShotCount}
            onConnect={liveConnect}
            onDisconnect={liveDisconnect}
          />
          <div title={tmReady ? "TrackMan 10k reference DB loaded" : "Loading TM reference..."} style={{
            display:"flex",alignItems:"center",gap:5,
            background: tmReady ? "rgba(34,197,94,.12)" : "rgba(251,146,60,.12)",
            borderRadius:100, padding:"6px 12px",
            fontSize:11, fontWeight:700,
            color: tmReady ? "#16a34a" : "#f97316",
            border: tmReady ? "1px solid rgba(34,197,94,.25)" : "1px solid rgba(251,146,60,.25)",
            transition:"all .4s",
          }}>
            <div style={{width:6,height:6,borderRadius:"50%",background:tmReady?"#22c55e":"#f97316",animation:tmReady?"none":"pulse 1.2s infinite"}}/>
            {tmReady ? "TM DB ✓" : "TM loading…"}
          </div>
        </div>

        {/* + Shot — solid blue pill */}
        <button onClick={addShot} style={{
          background:"linear-gradient(135deg,#1a6bff,#0038b8)",
          color:"#fff", borderRadius:100, padding:"10px 24px",
          fontSize:14, fontWeight:700,
          boxShadow:"0 4px 16px rgba(26,107,255,.42)",
        }}>+ Shot</button>

        {/* + Session — outlined */}
        <button onClick={()=>setModal(true)} style={{
          background:"#fff", color:"#1a6bff",
          borderRadius:100, padding:"10px 24px",
          fontSize:14, fontWeight:700,
          border:"2px solid #1a6bff",
        }}>+ Session</button>
      </header>

      {/* ════════════════════════════════════════════════════════════
          PAGE BODY
      ════════════════════════════════════════════════════════════ */}
      {tab === "dashboard"
        ? <Dashboard
            shots={shots} sessions={sessions} active={active}
            tlOff={tlOff} onTlOff={setTlOff}
            onPlay={()=>{setTab("trajectory");setPlaying(true);}}
            onGoAccuracy={()=>setTab("accuracy")}
            onGoShots={()=>setTab("shots")}
            onNew={()=>setModal(true)}
            onTab={setTab}
            onExport={()=>{exportShotsToCSV(shots);notify("Exported ✓");}}
          />
        : <SecPage
            tab={tab} shots={shots} sessions={sessions} active={active}
            playing={playing} club={club} tmReady={tmReady}
            onSelectShot={s=>{setActive(s);setTab("trajectory");}}
            onPlay={()=>setPlaying(true)} onPlayDone={()=>setPlaying(false)}
            onAddShot={s=>{addLiveShot(s);setActive(s);notify("Shot logged ✓");}}
            onNotify={notify}
            onDelete={id=>{deleteSession(id);notify("Deleted");}}
            onReset={()=>{resetToSeed();notify("Reset");}}
            onNew={()=>setModal(true)}
            onClear={()=>{clearLiveShots();setActive(null);notify('Shot log cleared')}}
            onExport={()=>{exportShotsToCSV(shots);notify("Exported ✓");}}
          />
      }

      {modal && (
        <Suspense fallback={null}>
          <NewSessionModal
            onSave={s=>{addSession(s);setModal(false);notify("Session saved ✓");}}
            onClose={()=>setModal(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  LIVE CONNECT BUTTON  — nav bar pill with status indicator        ║
   ╚══════════════════════════════════════════════════════════════════╝ */
function LiveConnectButton({status,shotCount,onConnect,onDisconnect}:{
  status:LiveStatus; shotCount:number; onConnect:()=>void; onDisconnect:()=>void;
}) {
  const isConnected   = status === "connected";
  const isConnecting  = status === "connecting";

  const dotColor = isConnected ? "#22c55e" : isConnecting ? "#f59e0b" : "#9ca3af";
  const label    = isConnected
    ? `Live · ${shotCount} shot${shotCount !== 1 ? "s" : ""}`
    : isConnecting ? "Connecting…" : "Go Live";

  return (
    <button
      onClick={isConnected ? onDisconnect : onConnect}
      title={isConnected
        ? "Click to disconnect from iPhone"
        : "Connect to ProRange iPhone app over WiFi"}
      style={{
        background: isConnected ? "rgba(34,197,94,.12)" : "rgba(0,0,0,.07)",
        border:     isConnected ? "1.5px solid rgba(34,197,94,.35)" : "1.5px solid transparent",
        borderRadius: 100,
        padding:    "9px 18px",
        fontSize:   13.5,
        fontWeight: 600,
        color:      isConnected ? "#16a34a" : "#444",
        display:    "flex", alignItems:"center", gap:7,
        transition: "all .2s",
      }}
    >
      {/* Animated dot */}
      <span style={{
        width:8, height:8, borderRadius:"50%",
        background: dotColor,
        flexShrink:0,
        boxShadow: isConnected ? "0 0 0 3px rgba(34,197,94,.2)" : "none",
        animation: isConnecting ? "spin .9s linear infinite" : "none",
        display:"inline-block",
      }}/>
      {label}
      {/* Pulsing ring when connected */}
      {isConnected && (
        <span style={{
          width:8, height:8, borderRadius:"50%",
          background:"rgba(34,197,94,.25)",
          position:"absolute",
          animation:"ping 1.4s ease-out infinite",
        }}/>
      )}
    </button>
  );
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  DASHBOARD  — 2×2 grid of 4 cards + session schedule below      ║
   ║                                                                  ║
   ║  TOP ROW:  [Shot Diagnosis]  [Suggested Fixes]                   ║
   ║  BOTTOM ROW: [Metric Accuracy vs TM]  [Recent Shots]             ║  ← on separate tab now
   ║  Actually: TOP 2 cards, BOTTOM = session timeline                ║
   ╚══════════════════════════════════════════════════════════════════╝ */
interface DashProps {
  shots:Shot[]; sessions:Session[]; active:Shot|null;
  tlOff:number; onTlOff:(n:number)=>void;
  onPlay:()=>void; onGoAccuracy:()=>void; onGoShots:()=>void;
  onNew:()=>void; onTab:(t:TabId)=>void; onExport:()=>void;
}

function Dashboard({shots,sessions,active,tlOff,onTlOff,onPlay,onGoAccuracy,onGoShots,onNew,onTab,onExport}:DashProps) {
  const withTM  = shots.filter(s=>s.tm?.vla);
  const meanVla = withTM.length
    ? withTM.map(s=>pctError(s.pr.vla,s.tm!.vla!)).reduce((a,b)=>a+b,0)/withTM.length
    : null;
  const latest = sessions[sessions.length-1];

  return (
    <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",background:"#f6f6f6"}}>

      {/* Page title + action pills */}
      <div style={{padding:"4px 28px 18px",display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexShrink:0}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:800,letterSpacing:"-.6px",color:"#1a1d2e",lineHeight:1.2}}>Shot Analysis</h1>
          <p style={{color:"#9ca3af",fontSize:13.5,marginTop:4,fontWeight:500}}>
            Your latest update · {shots.length} shots logged
          </p>
        </div>
        <div style={{display:"flex",gap:10}}>
          {/* floating button style — same pill style as nav */}
          <button onClick={()=>onTab("compare")} style={{
            background:"rgba(0,0,0,.07)",color:"#444",borderRadius:100,
            padding:"10px 20px",fontSize:13.5,fontWeight:600,
            display:"flex",alignItems:"center",gap:7,
          }}>
            Last session
            <svg width="11" height="7" viewBox="0 0 11 7" fill="none"><path d="M1 1.5l4.5 4 4.5-4" stroke="#888" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={onExport} style={{
            background:"linear-gradient(135deg,#1a6bff,#0038b8)",
            color:"#fff",borderRadius:100,padding:"10px 22px",
            fontSize:13.5,fontWeight:700,
            boxShadow:"0 4px 16px rgba(26,107,255,.4)",
            display:"flex",alignItems:"center",gap:7,
          }}>
            ↑ Export
            <svg width="11" height="7" viewBox="0 0 11 7" fill="none"><path d="M1 1.5l4.5 4 4.5-4" stroke="rgba(255,255,255,.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {/* ── 2-column card grid — equal height ── */}
      <div style={{
        padding:"0 28px",
        display:"grid",
        gridTemplateColumns:"1fr 1fr",
        gap:16,
        flexShrink:0,
        alignItems:"stretch",   /* force equal height */
      }}>
        <CardShotDiagnosis shot={active} meanVla={meanVla} onPlay={onPlay} onView={onGoAccuracy}/>
        <CardSuggestedFixes latest={latest} sessions={sessions} meanVla={meanVla} onExplore={()=>onTab("compare")}/>
      </div>

      {/* ── Session schedule — fixed height, no stretching ── */}
      <div style={{
        marginTop:16, padding:"0 28px 24px",
        flexShrink:0,
      }}>
        <SessionSchedule
          sessions={sessions} offset={tlOff}
          onOffset={onTlOff} onNew={onNew} onTab={onTab}
        />
      </div>
    </div>
  );
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  CARD 1 — SHOT DIAGNOSIS  (full height, animated, 5 metrics)     ║
   ╚══════════════════════════════════════════════════════════════════╝ */
function CardShotDiagnosis({shot,meanVla,onPlay,onView}:{shot:Shot|null;meanVla:number|null;onPlay:()=>void;onView:()=>void}) {
  const pass = meanVla!==null && Math.abs(meanVla)<=1;
  const [animKey, setAnimKey] = React.useState(0);

  // Re-trigger animation when shot changes
  React.useEffect(() => { setAnimKey(k => k+1); }, [shot?.id]);

  const metrics = [
    {
      icon: <IconBars/>,
      label: "Ball Speed", sub: "Velocity",
      value: shot ? `${shot.pr.speed} mph` : "— mph",
      date: shot?.timestamp, color: "#1a6bff",
    },
    {
      icon: <IconAngle/>,
      label: "VLA", sub: "Vertical Launch Angle",
      value: shot ? `${shot.pr.vla}°` : "—°",
      date: shot?.timestamp, color: "#f97316",
    },
    {
      icon: <IconHla/>,
      label: "HLA", sub: "Horizontal Launch Angle",
      value: shot ? `${shot.pr.hla > 0 ? "+" : ""}${shot.pr.hla}°` : "—°",
      date: shot?.timestamp, color: "#8b5cf6",
    },
    {
      icon: <IconCarry/>,
      label: "Carry", sub: "Carry Distance",
      value: shot ? `${shot.pr.carry} yds` : "— yds",
      date: shot?.timestamp, color: "#06b6d4",
    },
    {
      icon: <IconSpin/>,
      label: "Spin Rate", sub: "Back Spin",
      value: shot ? `${shot.pr.spin.toLocaleString()} rpm` : "— rpm",
      date: shot?.timestamp, color: "#ec4899",
    },
  ];

  return (
    <div style={{
      background:"#fff", borderRadius:22,
      border:"1px solid rgba(0,0,0,.06)",
      boxShadow:"0 2px 20px rgba(0,0,0,.06)",
      padding:"22px 24px",
      display:"flex", flexDirection:"column",
      /* match height of blue card */
      alignSelf:"stretch",
    }}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexShrink:0}}>
        <span style={{fontSize:15,fontWeight:800,color:"#1a1d2e"}}>Shot Diagnosis</span>
        <span style={{fontSize:12,color:"#9ca3af",fontStyle:"italic"}}>
          finished analyzing:{" "}
          <button onClick={onPlay} style={{color:"#1a6bff",background:"none",fontWeight:700,fontSize:12,padding:0,fontStyle:"normal"}}>Retry</button>
        </span>
      </div>

      {/* 2-col body — 50/50 split */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,flex:1}}>

        {/* ── Ball viz + play button — fills full left half ── */}
        <div style={{
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          gap:16,
          background:"#fff",
          borderRadius:16,
          padding:"20px 10px",
          position:"relative",
          overflow:"hidden",
        }}>
          {/* subtle decorative rings behind ball */}
          <div style={{position:"absolute",width:220,height:220,borderRadius:"50%",border:"1px solid rgba(147,197,253,.25)",top:"50%",left:"50%",transform:"translate(-50%,-60%)",pointerEvents:"none"}}/>
          <div style={{position:"absolute",width:280,height:280,borderRadius:"50%",border:"1px solid rgba(147,197,253,.12)",top:"50%",left:"50%",transform:"translate(-50%,-60%)",pointerEvents:"none"}}/>

          <BallSVG shot={shot} animKey={animKey}/>

          <button
            onClick={()=>{onPlay(); setAnimKey(k=>k+1);}}
            style={{
              width:46,height:46,borderRadius:"50%",
              background:"linear-gradient(135deg,#1a6bff,#0038b8)",
              color:"#fff",fontSize:19,
              boxShadow:"0 6px 22px rgba(26,107,255,.50)",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"transform .15s, box-shadow .15s",
              zIndex:1,
            }}
            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(1.08)";(e.currentTarget as HTMLButtonElement).style.boxShadow="0 8px 28px rgba(26,107,255,.65)";}}
            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(1)";(e.currentTarget as HTMLButtonElement).style.boxShadow="0 6px 22px rgba(26,107,255,.50)";}}
          >▶</button>
        </div>

        {/* ── Metric rows with ↓ connectors ── */}
        <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          {metrics.map((m, i) => {
            const isLast = i === metrics.length - 1;
            const isStatus = isLast;
            return (
              <React.Fragment key={m.label}>
                <DiagRow
                  icon={m.icon} label={m.label} sub={m.sub}
                  value={m.value} date={m.date} color={m.color}
                  animKey={animKey} delay={i*80}
                  isStatus={isStatus} pass={pass} onView={onView} meanVla={meanVla}
                />
                {!isLast && (
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",paddingLeft:19,gap:0}}>
                    {/* separator line */}
                    <div style={{width:"100%",height:1,background:"#f4f5f8"}}/>
                    {/* ↓ connector arrow */}
                    <div style={{
                      fontSize:13,color:"#d1d5db",lineHeight:1,
                      marginTop:1,marginBottom:1,paddingLeft:2,
                    }}>↓</div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* Individual diagnosis row — matches Heart Diagnosis card style */
function DiagRow({icon,label,sub,value,date,color,animKey,delay,isStatus,pass,onView,meanVla}:{
  icon:React.ReactNode; label:string; sub:string; value:string;
  date?:string; color:string; animKey:number; delay:number;
  isStatus:boolean; pass:boolean; onView:()=>void; meanVla:number|null;
}) {
  const [displayed, setDisplayed] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDisplayed(value), delay);
    return () => clearTimeout(t);
  }, [value, animKey, delay]);

  if (isStatus) {
    return (
      <div style={{
        border:`1.5px solid ${pass?"#bbf7d0":"#fecaca"}`,
        borderRadius:14, padding:"11px 14px",
        background:pass?"#f0fdf4":"#fff8f8",
        display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,
        animation:`fadeDown .4s ease ${delay}ms both`,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{
            width:36,height:36,borderRadius:10,flexShrink:0,
            background:pass?"#dcfce7":"#fee2e2",
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="2" width="14" height="14" rx="3" stroke={pass?"#16a34a":"#ef4444"} strokeWidth="1.8"/>
              <line x1="6" y1="9" x2="9" y2="12" stroke={pass?"#16a34a":"#ef4444"} strokeWidth="2" strokeLinecap="round"/>
              <line x1="9" y1="12" x2="13" y2="6" stroke={pass?"#16a34a":"#ef4444"} strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:pass?"#16a34a":"#dc2626"}}>
              {meanVla!==null?`VLA ${meanVla>=0?"+":""}${meanVla.toFixed(1)}%`:"VLA Uncalibrated"}
            </div>
            <div style={{fontSize:11,color:"#9ca3af",marginTop:1}}>
              {pass?"Within ±1% tolerance":"Calibration Issue"}
            </div>
          </div>
        </div>
        <button onClick={onView} style={{
          fontSize:11,color:pass?"#16a34a":"#dc2626",
          background:"none",fontWeight:700,padding:0,whiteSpace:"nowrap",
        }}>
          {pass?"✓ Passing":"• Consult accuracy ›"}
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display:"flex",alignItems:"center",gap:12,padding:"9px 0",
      animation:`fadeDown .35s ease ${delay}ms both`,
    }}>
      {/* Icon box */}
      <div style={{
        width:40,height:40,borderRadius:11,flexShrink:0,
        background:`${color}15`,
        display:"flex",alignItems:"center",justifyContent:"center",
      }}>{icon}</div>

      {/* Label + sub */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14.5,fontWeight:700,color:"#1a1d2e"}}>{label}</div>
        <div style={{fontSize:10.5,color:"#9ca3af",marginTop:1}}>
          {sub}
          {date && <span style={{marginLeft:8,color:"#e5e7eb"}}>· {date}</span>}
        </div>
      </div>

      {/* Value — animated */}
      <span style={{
        fontSize:13.5,fontWeight:700,color:"#374151",
        fontFamily:"'DM Mono',monospace",
        flexShrink:0,
      }}>
        {displayed}
      </span>
      <span style={{color:"#e5e7eb",fontSize:18,flexShrink:0}}>›</span>
    </div>
  );
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  CARD 2 — SUGGESTED FIXES  (blue gradient card)                  ║
   ╚══════════════════════════════════════════════════════════════════╝ */
function CardSuggestedFixes({latest,sessions,meanVla,onExplore}:{latest?:Session;sessions:Session[];meanVla:number|null;onExplore:()=>void}) {
  const FIXES = [
    {pri:"HIGH",   priCol:"rgba(239,68,68,.35)",  priTxt:"#fca5a5", label:"Z-depth recalibration",     desc:"Camera distance estimation off by ~12°"},
    {pri:"HIGH",   priCol:"rgba(239,68,68,.35)",  priTxt:"#fca5a5", label:"Camera angle verification",  desc:"Physical mount angle adds systematic offset"},
    {pri:"MEDIUM", priCol:"rgba(251,146,60,.35)", priTxt:"#fed7aa", label:"Retro-velocity tuning",      desc:"Impact window regression needs tighter window"},
    {pri:"LOW",    priCol:"rgba(34,197,94,.3)",   priTxt:"#86efac", label:"Apex detection threshold",   desc:"May cut trajectory short on high-loft shots"},
  ];

  // Calculate trend: improving or worsening
  const vlaHistory = sessions.map(s => {
    const st = calcSessionStats(s);
    return st.vla?.mean ?? null;
  }).filter((v): v is number => v !== null);
  const improving = vlaHistory.length >= 2
    && Math.abs(vlaHistory[vlaHistory.length-1]) < Math.abs(vlaHistory[0]);
  const totalDelta = vlaHistory.length >= 2
    ? Math.abs(vlaHistory[0]) - Math.abs(vlaHistory[vlaHistory.length-1])
    : null;

  // Confidence score based on how many sessions + shot count
  const totalShots = sessions.reduce((a,s) => a + s.shots.length, 0);
  const confidence = Math.min(Math.round((totalShots / 80) * 100), 99);

  // Next recommended action
  const nextAction = meanVla !== null && Math.abs(meanVla) > 20
    ? "Measure camera tilt with inclinometer"
    : meanVla !== null && Math.abs(meanVla) > 10
    ? "Check Z-depth calibration at 10ft"
    : "Verify retro-velocity window size";

  return (
    <div style={{
      background:"linear-gradient(150deg,#1660ee 0%,#003ab5 100%)",
      borderRadius:22,
      padding:"20px 22px",
      color:"#fff",
      display:"flex",flexDirection:"column",
      position:"relative",overflow:"hidden",
      boxShadow:"0 8px 32px rgba(26,107,255,.28)",
    }}>
      {/* decorative circles */}
      <div style={{position:"absolute",top:-55,right:-55,width:220,height:220,borderRadius:"50%",background:"rgba(255,255,255,.06)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:-35,left:-20,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,.04)",pointerEvents:"none"}}/>

      {/* ── header row ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,position:"relative"}}>
        <div>
          <div style={{
            display:"inline-flex",alignItems:"center",gap:6,
            background:"rgba(0,0,0,.25)",borderRadius:100,
            padding:"4px 13px",fontSize:11,fontWeight:700,marginBottom:10,
          }}>⛳ Suggested Calibration Fixes</div>

          <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:3}}>
            <span style={{fontSize:12,opacity:.6}}>Version:</span>
            <span style={{fontSize:20,fontWeight:800,letterSpacing:"-.3px"}}>{latest?.version??"v22.86"}</span>
          </div>
          <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:3}}>
            <span style={{fontSize:12,opacity:.6}}>VLA error:</span>
            <span style={{fontSize:16,fontWeight:800,color:meanVla!==null&&Math.abs(meanVla)<=1?"#86efac":"#fca5a5"}}>
              {meanVla!==null ? `${meanVla>=0?"+":""}${meanVla.toFixed(1)}%` : "Uncalibrated"}
            </span>
          </div>
          <div style={{fontSize:11,opacity:.5,marginTop:2}}>{sessions.length} sessions · click any to compare</div>
        </div>
        <div style={{fontSize:50,lineHeight:1,flexShrink:0}}>🏌️</div>
      </div>

      {/* ── stats row: trend + confidence + next action ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12,position:"relative"}}>
        {/* Trend */}
        <div style={{background:"rgba(255,255,255,.1)",borderRadius:10,padding:"8px 10px"}}>
          <div style={{fontSize:9.5,opacity:.6,fontWeight:600,textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>Trend</div>
          <div style={{fontSize:13,fontWeight:800,color:improving?"#86efac":"#fca5a5"}}>
            {improving ? "↓ Improving" : "↑ Worsening"}
          </div>
          <div style={{fontSize:10,opacity:.55,marginTop:2}}>
            {totalDelta !== null ? `${improving?"-":"+"}${Math.abs(totalDelta).toFixed(1)}% overall` : "Not enough data"}
          </div>
        </div>

        {/* Confidence */}
        <div style={{background:"rgba(255,255,255,.1)",borderRadius:10,padding:"8px 10px"}}>
          <div style={{fontSize:9.5,opacity:.6,fontWeight:600,textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>Confidence</div>
          <div style={{fontSize:13,fontWeight:800}}>{confidence}%</div>
          <div style={{marginTop:5,height:3,background:"rgba(255,255,255,.15)",borderRadius:2,overflow:"hidden"}}>
            <div style={{width:`${confidence}%`,height:"100%",background:confidence>70?"#86efac":"#fed7aa",borderRadius:2}}/>
          </div>
        </div>

        {/* Shot count */}
        <div style={{background:"rgba(255,255,255,.1)",borderRadius:10,padding:"8px 10px"}}>
          <div style={{fontSize:9.5,opacity:.6,fontWeight:600,textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>Shots Logged</div>
          <div style={{fontSize:13,fontWeight:800}}>{totalShots}</div>
          <div style={{fontSize:10,opacity:.55,marginTop:2}}>Need 100 for full cal.</div>
        </div>
      </div>

      {/* ── fix items ── */}
      <div style={{display:"flex",flexDirection:"column",gap:7,position:"relative"}}>
        {FIXES.map((f,i)=>(
          <div key={i} style={{
            background:"rgba(255,255,255,.1)",
            border:"1px solid rgba(255,255,255,.12)",
            borderRadius:11,padding:"9px 13px",
            display:"flex",alignItems:"center",gap:10,
          }}>
            <span style={{
              flexShrink:0,padding:"2px 8px",borderRadius:20,
              fontSize:9,fontWeight:800,letterSpacing:".5px",
              background:f.priCol,color:f.priTxt,
            }}>{f.pri}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12.5,fontWeight:700}}>{f.label}</div>
              <div style={{fontSize:10.5,opacity:.6,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── next recommended action ── */}
      <div style={{
        marginTop:10,padding:"9px 13px",
        background:"rgba(255,255,255,.08)",
        border:"1px solid rgba(255,255,255,.15)",
        borderRadius:11,position:"relative",
      }}>
        <div style={{fontSize:9.5,opacity:.55,fontWeight:700,textTransform:"uppercase",letterSpacing:".4px",marginBottom:3}}>👉 Next Recommended Action</div>
        <div style={{fontSize:12,fontWeight:700,opacity:.9}}>{nextAction}</div>
      </div>

      <button onClick={onExplore} style={{
        marginTop:10,width:"100%",padding:"10px",
        background:"rgba(255,255,255,.13)",
        border:"1.5px solid rgba(255,255,255,.25)",
        borderRadius:12,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",
        position:"relative",
      }}>Explore session history</button>
    </div>
  );
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  SESSION SCHEDULE  — exact match to reference Plan Schedule       ║
   ║  White background, 7-column with day-name headers,               ║
   ║  date+time on same row, item icon+name below, blue active cell   ║
   ╚══════════════════════════════════════════════════════════════════╝ */
function SessionSchedule({sessions,offset,onOffset,onNew,onTab}:{
  sessions:Session[]; offset:number; onOffset:(n:number)=>void;
  onNew:()=>void; onTab:(t:TabId)=>void;
}) {
  const COLS   = 7;
  const actI   = sessions.length - 1;
  const shown  = sessions.slice(offset, offset+COLS);
  const canPrev = offset > 0;
  const canNext = offset+COLS < sessions.length;

  // Day names for column headers
  const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // Map sessions to column positions (reuse day of week as column hint or just spread them)
  const colItems = Array.from({length: COLS}, (_, ci) => {
    const s = shown[ci] ?? null;
    const gi = offset + ci;
    return { s, gi, isActive: gi === actI };
  });

  // Color ring for version icons
  const versionColors: Record<string,string> = {
    "v22.74":"#ef4444","v22.77":"#f97316","v22.79":"#22c55e",
    "v22.86":"#1a6bff","default":"#8b5cf6"
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:0,flex:1}}>

      {/* ─── Header: "Session History" + nav + buttons ─── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontSize:19,fontWeight:800,color:"#1a1d2e"}}>Session History</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>canPrev&&onOffset(offset-1)} style={{
              width:30,height:30,borderRadius:"50%",
              border:"1.5px solid rgba(0,0,0,.15)",
              background:canPrev?"#fff":"transparent",
              color:canPrev?"#374151":"#ccc",
              fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",
              cursor:canPrev?"pointer":"default",
            }}>‹</button>
            <span style={{fontSize:14,fontWeight:700,color:"#1a1d2e"}}>
              {shown[0]
                ? new Date(shown[0].date+"T12:00").toLocaleDateString("en-US",{month:"long",year:"numeric"}).replace(" ",", ").split(",").map((p,i)=>
                    i===1 ? <span key={i} style={{color:"#1a6bff"}}>,{p}</span> : p
                  )
                : "No sessions"}
            </span>
            <button onClick={()=>canNext&&onOffset(offset+1)} style={{
              width:30,height:30,borderRadius:"50%",
              border:"1.5px solid rgba(0,0,0,.15)",
              background:canNext?"#fff":"transparent",
              color:canNext?"#374151":"#ccc",
              fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",
              cursor:canNext?"pointer":"default",
            }}>›</button>
          </div>
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>onTab("compare")} style={{
            background:"#fff",
            border:"1.5px solid #1a6bff",
            borderRadius:100,padding:"8px 22px",
            fontSize:13,fontWeight:700,color:"#1a6bff",
          }}>Add notes</button>
          <button onClick={onNew} style={{
            background:"linear-gradient(135deg,#1a6bff,#0038b8)",
            borderRadius:100,padding:"8px 24px",
            fontSize:13,fontWeight:700,color:"#fff",
            boxShadow:"0 4px 14px rgba(26,107,255,.38)",
          }}>+ Set Session</button>
        </div>
      </div>

      {/* ─── Calendar container — white card, FIXED height ─── */}
      <div style={{
        background:"#fff",borderRadius:20,
        border:"1px solid rgba(0,0,0,.06)",
        boxShadow:"0 1px 8px rgba(0,0,0,.05)",
        overflow:"hidden",
        flexShrink:0,   /* ← never stretch */
      }}>
        {/* Day-name column headers */}
        <div style={{display:"grid",gridTemplateColumns:`repeat(${COLS},1fr)`,padding:"16px 20px 12px"}}>
          {colItems.map(({isActive},ci) => {
            const dayName = shown[ci]
              ? new Date(shown[ci]!.date+"T12:00").toLocaleDateString("en-US",{weekday:"short"})
              : DAY_NAMES[ci];
            return (
              <div key={ci} style={{display:"flex",justifyContent:"center"}}>
                {isActive ? (
                  <div style={{
                    width:40,height:40,borderRadius:"50%",
                    background:"#1a6bff",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    color:"#fff",fontSize:13,fontWeight:800,
                  }}>{dayName}</div>
                ) : (
                  <span style={{fontSize:13,fontWeight:600,color:"#6b7280",lineHeight:"40px"}}>{dayName}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Horizontal divider — full width, like reference */}
        <div style={{height:1,background:"#e8eaf0"}}/>

        {/* Calendar cells — individual gray rounded cards like reference, with gap */}
        <div style={{display:"grid",gridTemplateColumns:`repeat(${COLS},1fr)`,height:160,gap:10,padding:"0 16px 16px"}}>
          {colItems.map(({s,gi,isActive},ci) => {
            if (!s) {
              return (
                <div key={`empty-${ci}`} onClick={onNew}
                  style={{
                    background:"#f8f9fc",
                    borderRadius:14,
                    border:"1.5px dashed #dde0eb",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    cursor:"pointer",height:"100%",
                  }}>
                  <div style={{fontSize:11,color:"#c4c8d4",fontWeight:600}}>+ Add session</div>
                </div>
              );
            }

            const st = calcSessionStats(s);
            const ve = st.vla?.mean ?? null;
            const pass = ve!==null&&Math.abs(ve)<=1;
            const d = new Date(s.date+"T12:00");
            const dateNum = d.getDate();
            const timeStr = "3.00 pm";
            const vColor = versionColors[s.version] ?? versionColors["default"];

            return (
              <div
                key={s.id}
                onClick={()=>onTab("compare")}
                style={{
                  background:isActive?"#1a6bff":"#f4f5f9",
                  borderRadius:14,
                  padding:"12px 13px",
                  cursor:"pointer",
                  display:"flex",flexDirection:"column",
                  gap:6,
                  position:"relative",
                  height:"100%",
                  boxSizing:"border-box",
                  boxShadow:isActive?"0 6px 20px rgba(26,107,255,.35)":"none",
                  border:isActive?"none":"1px solid rgba(0,0,0,.04)",
                  transition:"transform .15s",
                }}
                onMouseEnter={e=>{if(!isActive)(e.currentTarget as HTMLDivElement).style.background="#eceef5";}}
                onMouseLeave={e=>{if(!isActive)(e.currentTarget as HTMLDivElement).style.background="#f4f5f9";}}
              >
                {/* Date number + time on same row */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span style={{
                    fontSize:16,fontWeight:800,
                    color:isActive?"#fff":"#1a1d2e",
                    lineHeight:1,
                  }}>{dateNum}</span>
                  <span style={{
                    fontSize:10.5,fontWeight:500,
                    color:isActive?"rgba(255,255,255,.65)":"#9ca3af",
                  }}>{timeStr}</span>
                </div>

                {/* Version icon row + label */}
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  {/* Colored avatar circle */}
                  <div style={{
                    width:26,height:26,borderRadius:"50%",
                    background:isActive?"rgba(255,255,255,.25)":vColor+"18",
                    border:`2px solid ${isActive?"rgba(255,255,255,.5)":vColor}`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:10,fontWeight:800,
                    color:isActive?"#fff":vColor,
                    flexShrink:0,
                  }}>
                    {s.version.replace("v","").replace(".","").slice(0,3)}
                  </div>
                  <div>
                    <div style={{
                      fontSize:12.5,fontWeight:700,
                      color:isActive?"#fff":"#1a1d2e",
                      fontFamily:"'DM Mono',monospace",
                      lineHeight:1.2,
                    }}>{s.version}</div>
                    <div style={{
                      fontSize:10.5,fontWeight:700,
                      fontFamily:"'DM Mono',monospace",
                      color:isActive?"rgba(255,255,255,.8)":(pass?"#16a34a":"#ef4444"),
                      marginTop:1,
                    }}>
                      {ve!==null?`${ve>=0?"+":""}${ve}%`:"—"}
                    </div>
                  </div>
                </div>

                {/* Label/note */}
                {s.label && (
                  <div style={{
                    fontSize:10.5,
                    color:isActive?"rgba(255,255,255,.55)":"#9ca3af",
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                    fontStyle:"italic",
                  }}>{s.label}</div>
                )}

                {/* PASS/FAIL badge — top right */}
                <div style={{
                  position:"absolute",top:12,right:12,
                  fontSize:9,fontWeight:800,letterSpacing:".3px",
                  padding:"2px 7px",borderRadius:20,
                  background:pass
                    ?(isActive?"rgba(34,197,94,.3)":"#f0fdf4")
                    :(isActive?"rgba(239,68,68,.3)":"#fef2f2"),
                  color:pass
                    ?(isActive?"#a7f3d0":"#16a34a")
                    :(isActive?"#fca5a5":"#ef4444"),
                }}>{pass?"PASS":"FAIL"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  SECONDARY VIEWS                                                  ║
   ╚══════════════════════════════════════════════════════════════════╝ */
interface SecProps {
  tab:TabId; shots:Shot[]; sessions:Session[]; active:Shot|null; playing:boolean; club:string; tmReady:boolean;
  onSelectShot:(s:Shot)=>void; onPlay:()=>void; onPlayDone:()=>void;
  onAddShot:(s:Shot)=>void; onNotify:(m:string,t?:"ok"|"err")=>void;
  onDelete:(id:string)=>void; onReset:()=>void; onNew:()=>void;
  onClear:()=>void; onExport:()=>void;
}
function SecPage(p:SecProps) {
  return (
    <div style={{flex:1,overflow:"auto",padding:24,background:"#f6f6f6"}}>
      <Suspense fallback={<Loader/>}>
        {p.tab==="trajectory" && <TrajectoryView shots={p.shots} activeShot={p.active} playing={p.playing} onSelectShot={p.onSelectShot} onPlay={p.onPlay} onPlayDone={p.onPlayDone}/>}
        {p.tab==="physics"    && <PhysicsView/>}
        {p.tab==="kalman"     && <KalmanView/>}
<<<<<<< HEAD
=======
        {p.tab==="model"      && <ModelView/>}
>>>>>>> master
        {p.tab==="accuracy"   && <AccuracyView shots={p.shots} tmReady={p.tmReady}/>}
        {p.tab==="shots"      && <ShotLogView shots={p.shots} activeShot={p.active} onSelectShot={s=>{p.onSelectShot(s);}} onClear={p.onClear} onExport={p.onExport}/>}
        {p.tab==="input"      && <InputDataView selectedClub={p.club} onAddShot={p.onAddShot} onNotify={p.onNotify}/>}
        {p.tab==="progress"   && <ProgressView sessions={p.sessions}/>}
        {p.tab==="trend"      && <TrendView sessions={p.sessions}/>}
        {p.tab==="compare"    && <CompareView sessions={p.sessions} selectedIds={p.sessions.map(s=>s.id)} onToggleSession={()=>{}}/>}
        {p.tab==="frames"     && <FrameScrubberView shots={p.shots} activeShot={p.active} onSelectShot={p.onSelectShot}/>}
        {p.tab==="sessions"   && <AllSessionsView sessions={p.sessions} onDelete={p.onDelete} onReset={p.onReset} onNew={p.onNew}/>}
      </Suspense>
    </div>
  );
}

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  SMALL REUSABLE COMPONENTS                                        ║
   ╚══════════════════════════════════════════════════════════════════╝ */

function BallSVG({shot, animKey=0}:{shot:Shot|null; animKey?:number}) {
  const spd=shot?.pr.speed??91, vla=shot?.pr.vla??20, spn=shot?.pr.spin??7200;
  const cx=140, cy=130, r=90;

  // Generate dimple positions arranged in realistic golf ball rows
  const dimples: {x:number,y:number,r:number}[] = [];
  const rows = [
    {lat:0,   count:10, rr:3.8},
    {lat:22,  count:10, rr:3.6},
    {lat:-22, count:10, rr:3.6},
    {lat:42,  count:8,  rr:3.3},
    {lat:-42, count:8,  rr:3.3},
    {lat:60,  count:6,  rr:3.0},
    {lat:-60, count:6,  rr:3.0},
    {lat:75,  count:4,  rr:2.5},
    {lat:-75, count:4,  rr:2.5},
  ];
  rows.forEach(({lat,count,rr}) => {
    const latRad = (lat * Math.PI) / 180;
    const rowRadius = r * Math.cos(latRad);
    const rowY = cy - r * Math.sin(latRad);
    for (let i=0; i<count; i++) {
      const angle = (i / count) * 2 * Math.PI + (lat % 44 === 0 ? 0 : Math.PI/count);
      const dx = rowRadius * Math.cos(angle);
      // Only show dimples on the visible hemisphere (rough front-face cull)
      if (dx > -rowRadius*0.85) {
        dimples.push({x: cx + dx, y: rowY, r: rr});
      }
    }
  });

  return (
    <svg
      key={animKey}
      viewBox="0 0 280 280"
      style={{width:"100%", maxWidth:240, height:"auto", overflow:"visible"}}
    >
      <defs>
        {/* Main ball gradient — white golf ball */}
        <radialGradient id="ballFill" cx="38%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="#ffffff"/>
          <stop offset="45%"  stopColor="#f0f4f8"/>
          <stop offset="80%"  stopColor="#d8e4f0"/>
          <stop offset="100%" stopColor="#c0cfe0"/>
        </radialGradient>
        {/* Dimple gradient — slightly darker concave look */}
        <radialGradient id="dimpleFill" cx="60%" cy="40%" r="60%">
          <stop offset="0%"   stopColor="#c8d8e8"/>
          <stop offset="100%" stopColor="#a8b8cc"/>
        </radialGradient>
        {/* Drop shadow filter */}
        <filter id="golfShadow" x="-25%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="2" dy="8" stdDeviation="14" floodColor="rgba(80,110,160,.28)"/>
        </filter>
        {/* Clip to circle */}
        <clipPath id="ballClip">
          <circle cx={cx} cy={cy} r={r}/>
        </clipPath>
      </defs>

      {/* Ground shadow */}
      <ellipse cx={cx} cy={cy+r+14} rx={62} ry={10} fill="rgba(0,0,0,.09)"/>

      {/* Ball body */}
      <circle cx={cx} cy={cy} r={r} fill="url(#ballFill)" filter="url(#golfShadow)"/>

      {/* Dimples — clipped to ball */}
      <g clipPath="url(#ballClip)">
        {dimples.map((d,i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r}
            fill="url(#dimpleFill)"
            opacity="0.7"
          />
        ))}
      </g>

      {/* Ball outline */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(160,180,210,.35)" strokeWidth="1"/>

      {/* Primary specular highlight */}
      <ellipse cx={cx-28} cy={cy-34} rx={22} ry={15}
        fill="rgba(255,255,255,.72)"
        transform={`rotate(-30,${cx-28},${cy-34})`}
      />
      {/* Secondary small highlight */}
      <ellipse cx={cx-14} cy={cy-50} rx={8} ry={5}
        fill="rgba(255,255,255,.45)"
        transform={`rotate(-20,${cx-14},${cy-50})`}
      />

      {/* ── Speed badge (top-left) ── */}
      <g>
        <rect x={8} y={54} width={46} height={22} rx={11} fill="#1a6bff"/>
        <text x={31} y={69} textAnchor="middle" fontSize="12" fill="#fff" fontWeight="800" fontFamily="DM Sans,sans-serif">{spd.toFixed(0)}</text>
        <circle cx={62} cy={65} r={13} fill="#fff" stroke="#1a6bff" strokeWidth="2.5"/>
        <text x={62} y={70} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1a6bff" fontFamily="DM Sans,sans-serif">S</text>
      </g>

      {/* ── VLA badge (top-right) ── */}
      <g>
        <circle cx={178} cy={65} r={13} fill="#fff" stroke="#f97316" strokeWidth="2.5"/>
        <text x={178} y={70} textAnchor="middle" fontSize="10" fontWeight="800" fill="#f97316" fontFamily="DM Sans,sans-serif">V</text>
        <rect x={194} y={54} width={54} height={22} rx={11} fill="#f97316"/>
        <text x={221} y={69} textAnchor="middle" fontSize="12" fill="#fff" fontWeight="800" fontFamily="DM Sans,sans-serif">{vla.toFixed(1)}°</text>
      </g>

      {/* ── Spin badge (bottom-center) ── */}
      <g>
        <circle cx={cx} cy={cy+r+6} r={13} fill="#fff" stroke="#8b5cf6" strokeWidth="2.5"/>
        <text x={cx} y={cy+r+11} textAnchor="middle" fontSize="10" fontWeight="800" fill="#8b5cf6" fontFamily="DM Sans,sans-serif">R</text>
        <rect x={cx-44} y={cy+r+22} width={88} height={22} rx={11} fill="#8b5cf6"/>
        <text x={cx} y={cy+r+37} textAnchor="middle" fontSize="11.5" fill="#fff" fontWeight="800" fontFamily="DM Sans,sans-serif">{(spn/1000).toFixed(1)}k rpm</text>
      </g>
    </svg>
  );
}

function IconBars(){
  return <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><rect x="1" y="10" width="4" height="7" rx="1" fill="#1a6bff"/><rect x="7" y="6" width="4" height="11" rx="1" fill="#1a6bff" opacity=".6"/><rect x="13" y="2" width="4" height="15" rx="1" fill="#1a6bff" opacity=".4"/></svg>;
}
function IconAngle(){
  return <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M2 15L10 3l8 12" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconHla(){
  return <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M2 9h14M9 2l7 7-7 7" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function IconCarry(){
  return <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M2 14 Q9 4 16 14" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"/><circle cx={16} cy={14} r={2} fill="#06b6d4"/></svg>;
}
function IconSpin(){
  return <svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M9 2a7 7 0 0 1 7 7" stroke="#ec4899" strokeWidth="2" strokeLinecap="round"/><path d="M2 9a7 7 0 0 0 7 7" stroke="#ec4899" strokeWidth="2" strokeLinecap="round"/><path d="M16 9 13 7M16 9 13 11" stroke="#ec4899" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function Loader(){
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:80,color:"#9ca3af",fontSize:14}}>
    <span style={{animation:"spin .8s linear infinite",display:"inline-block",marginRight:10,fontSize:22}}>◌</span>Loading…
  </div>;
}
