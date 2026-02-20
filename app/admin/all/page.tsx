// app/admin/all/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/useAuth';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  orderBy,
  query,
} from 'firebase/firestore';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Team {
  teamId: string;
  teamName: string;
  teamCode: string;
  members: string[];
  station1Score: number;
  station2Score: number;
  station3Score: number;
  station4Score: number;
  station1Attempts: number;
  station2Attempts: number;
  station3Attempts: number;
  station4Attempts: number;
  totalScore: number;
  completedStations: number[];
}

// One timer doc per station stored in Firestore
interface StationState {
  roundActive: boolean;
  roundTimeLimit: number;
  roundStartedAt: number | null;
  stationNum: number;
}

// The "all stations" workshop doc shape
interface AllStationsDoc {
  allActive: boolean;
  roundTimeLimit: number;
  roundStartedAt: number | null;
  station1: StationState;
  station2: StationState;
  station3: StationState;
  station4: StationState;
  workshopStarted: boolean;
}

// We reuse the same workshops/feb2026 doc but add allActive + per-station sub-fields
// The existing /api/score route reads ws.activeStation and ws.roundActive
// For "all stations" mode we write ALL 4 stations as active simultaneously
// by updating the main workshop doc to roundActive=true + activeStation=null (open)
// AND writing individual stationX.roundActive flags for per-station timers

const WORKSHOP_DOC  = 'workshops/feb2026';
const STATION_NAMES = ['', 'Shield', 'Oxygen', 'Pressure', 'Override'];
const STATION_COLORS = [
  '',
  'rgba(124,58,237,1)',   // S1 purple
  'rgba(8,145,178,1)',    // S2 cyan
  'rgba(180,83,9,1)',     // S3 amber
  'rgba(22,101,52,1)',    // S4 green
];
const STATION_GLOW = [
  '',
  'rgba(124,58,237,0.5)',
  'rgba(8,145,178,0.5)',
  'rgba(180,83,9,0.5)',
  'rgba(22,101,52,0.5)',
];

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const defaultStation = (n: number): StationState => ({
  stationNum: n,
  roundActive: false,
  roundTimeLimit: 300,
  roundStartedAt: null,
});

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminAllPage() {
  const { user, role, loading } = useAuth('admin');
  const router = useRouter();

  const [teams, setTeams]       = useState<Team[]>([]);
  const [glitch, setGlitch]     = useState(false);
  const [customTime, setCustomTime] = useState('5');

  // Per-station live state (read from Firestore)
  const [stations, setStations] = useState<StationState[]>([
    defaultStation(1),
    defaultStation(2),
    defaultStation(3),
    defaultStation(4),
  ]);

  // Per-station countdown (local, derived from stations state)
  const [timers, setTimers] = useState<number[]>([300, 300, 300, 300]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [allActive, setAllActive] = useState(false);

  // ── Glitch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 6000);
    return () => clearInterval(iv);
  }, []);

  // ── Live teams ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'teams'), orderBy('totalScore', 'desc'));
    return onSnapshot(q, (snap) =>
      setTeams(snap.docs.map((d) => d.data() as Team))
    );
  }, [user]);

  // ── Live workshop state ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, WORKSHOP_DOC), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;

      const updated: StationState[] = [1, 2, 3, 4].map((n) => {
        const key = `station${n}`;
        return data[key]
          ? { ...data[key], stationNum: n }
          : defaultStation(n);
      });
      setStations(updated);
      setAllActive(!!data.allActive);
    });
  }, [user]);

  // ── Per-station countdown tick ────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimers(
        stations.map((st) => {
          if (!st.roundActive || !st.roundStartedAt) return st.roundTimeLimit;
          const elapsed  = Math.floor((Date.now() - st.roundStartedAt) / 1000);
          return Math.max(0, st.roundTimeLimit - elapsed);
        })
      );
    }, 1000);

    // Run once immediately
    setTimers(
      stations.map((st) => {
        if (!st.roundActive || !st.roundStartedAt) return st.roundTimeLimit;
        const elapsed = Math.floor((Date.now() - st.roundStartedAt) / 1000);
        return Math.max(0, st.roundTimeLimit - elapsed);
      })
    );

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [stations]);

  // ── Auto-stop when a timer hits 0 ─────────────────────────────────────────
  useEffect(() => {
    timers.forEach((t, i) => {
      if (t === 0 && stations[i].roundActive) {
        stopStation(i + 1);
      }
    });
  }, [timers]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const timeLimitSec = () => Math.max(60, parseInt(customTime) * 60 || 300);

  const buildStationPatch = (
    n: number,
    patch: Partial<StationState>
  ): Record<string, any> => {
    const key = `station${n}`;
    const current = stations[n - 1];
    return { [key]: { ...current, ...patch, stationNum: n } };
  };

  // ── Start ALL 4 stations simultaneously ───────────────────────────────────
  const startAll = useCallback(async () => {
    const limit = timeLimitSec();
    const now   = Date.now();

    const patch: Record<string, any> = {
      allActive:      true,
      workshopStarted: true,
      // Also write top-level fields so existing /api/score route accepts all stations
      roundActive:    true,
      activeStation:  null,   // null = all stations accepted
      roundTimeLimit: limit,
      roundStartedAt: now,
    };

    // Write each station sub-doc
    for (let n = 1; n <= 4; n++) {
      patch[`station${n}`] = {
        stationNum:     n,
        roundActive:    true,
        roundTimeLimit: limit,
        roundStartedAt: now,
      };
    }

    await setDoc(doc(db, WORKSHOP_DOC), patch, { merge: true });
  }, [customTime, stations]);

  // ── Stop ALL stations ─────────────────────────────────────────────────────
  const stopAll = useCallback(async () => {
    const patch: Record<string, any> = {
      allActive:     false,
      roundActive:   false,
      activeStation: null,
    };
    for (let n = 1; n <= 4; n++) {
      patch[`station${n}`] = {
        ...stations[n - 1],
        roundActive:    false,
        roundStartedAt: null,
      };
    }
    await setDoc(doc(db, WORKSHOP_DOC), patch, { merge: true });
  }, [stations]);

  // ── Pause ALL ─────────────────────────────────────────────────────────────
  const pauseAll = useCallback(async () => {
    const patch: Record<string, any> = { allActive: false, roundActive: false };
    for (let n = 1; n <= 4; n++) {
      patch[`station${n}`] = { ...stations[n - 1], roundActive: false };
    }
    await setDoc(doc(db, WORKSHOP_DOC), patch, { merge: true });
  }, [stations]);

  // ── Resume ALL ────────────────────────────────────────────────────────────
  const resumeAll = useCallback(async () => {
    const patch: Record<string, any> = { allActive: true, roundActive: true };
    for (let n = 1; n <= 4; n++) {
      const st   = stations[n - 1];
      const spent = st.roundStartedAt
        ? Math.floor((Date.now() - st.roundStartedAt) / 1000)
        : 0;
      const remaining = Math.max(0, st.roundTimeLimit - spent);
      patch[`station${n}`] = {
        ...st,
        roundActive:    true,
        roundStartedAt: Date.now() - (st.roundTimeLimit - remaining) * 1000,
      };
    }
    await setDoc(doc(db, WORKSHOP_DOC), patch, { merge: true });
  }, [stations]);

  // ── Start single station ──────────────────────────────────────────────────
  const startStation = useCallback(async (n: number) => {
    const limit = timeLimitSec();
    const now   = Date.now();
    const patch = buildStationPatch(n, {
      roundActive:    true,
      roundTimeLimit: limit,
      roundStartedAt: now,
    });
    // Also set top-level activeStation for /api/score compatibility
    await setDoc(doc(db, WORKSHOP_DOC), {
      ...patch,
      activeStation: n,
      roundActive:   true,
    }, { merge: true });
  }, [stations, customTime]);

  // ── Stop single station ───────────────────────────────────────────────────
  const stopStation = useCallback(async (n: number) => {
    const patch = buildStationPatch(n, {
      roundActive:    false,
      roundStartedAt: null,
    });
    await setDoc(doc(db, WORKSHOP_DOC), patch, { merge: true });
  }, [stations]);

  // ── Pause single station ──────────────────────────────────────────────────
  const pauseStation = useCallback(async (n: number) => {
    const patch = buildStationPatch(n, { roundActive: false });
    await setDoc(doc(db, WORKSHOP_DOC), patch, { merge: true });
  }, [stations]);

  // ── Resume single station ─────────────────────────────────────────────────
  const resumeStation = useCallback(async (n: number) => {
    const st      = stations[n - 1];
    const spent   = st.roundStartedAt
      ? Math.floor((Date.now() - st.roundStartedAt) / 1000)
      : 0;
    const remaining = Math.max(0, st.roundTimeLimit - spent);
    const patch = buildStationPatch(n, {
      roundActive:    true,
      roundStartedAt: Date.now() - (st.roundTimeLimit - remaining) * 1000,
    });
    await setDoc(doc(db, WORKSHOP_DOC), patch, { merge: true });
  }, [stations]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const sharedStyles = `
    * { scrollbar-width: none; }
    *::-webkit-scrollbar { display: none; }
    @keyframes spin-cw  { to { transform: rotate(360deg);  } }
    @keyframes spin-ccw { to { transform: rotate(-360deg); } }
    @keyframes glitch-1 {
      0%,100% { clip-path: inset(0 0 98% 0); transform: translate(-4px); }
      50%      { clip-path: inset(30% 0 50% 0); transform: translate(4px); }
    }
    @keyframes glitch-2 {
      0%,100% { clip-path: inset(60% 0 20% 0); transform: translate(3px); }
      50%      { clip-path: inset(10% 0 80% 0); transform: translate(-3px); }
    }
    @keyframes pulse-glow { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
    @keyframes ticker { 0% { transform:translateX(0); } 100% { transform:translateX(-50%); } }
    @keyframes blink   { 0%,100% { opacity:1; } 50% { opacity:0; } }
    @keyframes fadeIn  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    .glitch-wrap { position:relative; }
    .glitch-wrap::before, .glitch-wrap::after {
      content: attr(data-text); position:absolute; inset:0; font:inherit; color:inherit;
    }
    .glitch-active::before { color:#f0abfc; animation:glitch-1 0.15s steps(2) forwards; }
    .glitch-active::after  { color:#818cf8; animation:glitch-2 0.15s steps(2) forwards; }
    .scanline-bar {
      position:fixed; inset:0; pointer-events:none; z-index:50;
      background:linear-gradient(transparent 50%, rgba(0,0,0,0.04) 50%);
      background-size:100% 4px;
    }
    .noise-overlay {
      position:fixed; inset:0; pointer-events:none; z-index:49; opacity:0.025;
      background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    }
    .stat-pill {
      font-family:'Share Tech Mono',monospace;
      clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);
    }
    .corner-tl { position:absolute;top:0;left:0;width:12px;height:12px;border-top:1px solid #7c3aed;border-left:1px solid #7c3aed; }
    .corner-tr { position:absolute;top:0;right:0;width:12px;height:12px;border-top:1px solid #7c3aed;border-right:1px solid #7c3aed; }
    .corner-bl { position:absolute;bottom:0;left:0;width:12px;height:12px;border-bottom:1px solid #7c3aed;border-left:1px solid #7c3aed; }
    .corner-br { position:absolute;bottom:0;right:0;width:12px;height:12px;border-bottom:1px solid #7c3aed;border-right:1px solid #7c3aed; }
    .clip-btn {
      clip-path:polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%);
      font-family:'Share Tech Mono',monospace;
      letter-spacing:0.15em; text-transform:uppercase; transition:all 0.2s;
    }
    .clip-btn:hover  { filter:brightness(1.2); transform:translateY(-1px); }
    .clip-btn:active { transform:translateY(0); }
    .panel-fade { animation: fadeIn 0.2s ease both; }
  `;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#030108]">
      <style>{sharedStyles}</style>
      <div className="relative w-24 h-24">
        <div style={{ animation: 'spin-cw 1.4s linear infinite' }}
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#7c3aed] border-r-[#7c3aed]" />
        <div style={{ animation: 'spin-ccw 1s linear infinite' }}
          className="absolute inset-3 rounded-full border-2 border-transparent border-t-[#6b21a8] border-l-[#6b21a8]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-[#7c3aed]"
            style={{ boxShadow: '0 0 12px #7c3aed, 0 0 24px #7c3aed' }} />
        </div>
      </div>
    </div>
  );

  if (!user || role !== 'admin') return null;

  // ── Derived ───────────────────────────────────────────────────────────────
  const anyActive      = stations.some((s) => s.roundActive);
  const allRunning     = stations.every((s) => s.roundActive);
  const activeCount    = stations.filter((s) => s.roundActive).length;
  const completedTeams = teams.filter((t) => t.completedStations?.length === 4).length;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#030108] text-white"
      style={{ fontFamily: "'Arial Narrow','Impact',sans-serif" }}>
      <style>{sharedStyles}</style>
      <div className="scanline-bar" />
      <div className="noise-overlay" />

      {/* Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[700px] h-[700px] rounded-full opacity-[0.12]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)', filter: 'blur(100px)' }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, #6b21a8, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      {/* ── TICKER ────────────────────────────────────────────────────────── */}
      <div className="w-full overflow-hidden bg-[#7c3aed]/10 border-b border-[#7c3aed]/30 py-1">
        <div className="flex whitespace-nowrap" style={{ animation: 'ticker 30s linear infinite' }}>
          {Array(8).fill(null).map((_, i) => (
            <span key={i} className="text-[#a78bfa] text-xs tracking-widest mx-8 font-mono">
              ◈ ALL STATIONS MODE &nbsp;
              ◈ {teams.length} TEAMS REGISTERED &nbsp;
              ◈ {activeCount}/4 STATIONS LIVE &nbsp;
              ◈ {completedTeams} TEAMS FULLY COMPLETE &nbsp;
              ◈ START ALL SIMULTANEOUSLY &nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="relative px-6 pt-6 pb-4 border-b border-[#7c3aed]/20">
        <div className="flex items-start justify-between max-w-6xl mx-auto">
          <div>
            <div className={`glitch-wrap ${glitch ? 'glitch-active' : ''}`} data-text="">
              <h1 className="text-4xl font-black uppercase tracking-[0.15em] text-white"
                style={{ textShadow: '0 0 30px rgba(124,58,237,0.5)' }}>
                ALL STATIONS
              </h1>
            </div>
            <p className="text-[#7c3aed]/70 text-xs tracking-[0.3em] mt-1 font-mono">
              RISE 2026 — SIMULTANEOUS STATION CONTROL
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')}
              className="clip-btn px-4 py-2 text-xs border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa]">
              ← BACK
            </button>
            {anyActive && (
              <div className="flex items-center gap-2 stat-pill bg-green-900/20 border border-green-500/40 px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-xs font-mono tracking-widest">
                  {activeCount}/4 LIVE
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 stat-pill bg-[#7c3aed]/20 border border-[#7c3aed]/40 px-4 py-2">
              <div className="w-2 h-2 rounded-full bg-[#a78bfa]"
                style={{ animation: 'pulse-glow 1.5s ease-in-out infinite' }} />
              <span className="text-[#a78bfa] text-xs font-mono tracking-widest">LIVE</span>
            </div>
            {user.photoURL && (
              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-sm border border-[#7c3aed]/40" />
            )}
            <button
              onClick={async () => { await signOut(auth); router.replace('/login'); }}
              className="clip-btn bg-red-900/40 border border-red-700/40 text-red-400 text-xs px-4 py-2"
            >LOGOUT</button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-4 flex-wrap max-w-6xl mx-auto">
          {[
            { label: 'TEAMS',     value: teams.length },
            { label: 'ACTIVE',    value: `${activeCount}/4 STN` },
            { label: 'COMPLETE',  value: `${completedTeams}/${teams.length}` },
            { label: 'TOP SCORE', value: teams[0]?.totalScore || 0 },
          ].map((s) => (
            <div key={s.label} className="stat-pill bg-[#0d0014] border border-[#7c3aed]/30 px-4 py-1.5">
              <span className="text-[#7c3aed]/50 text-xs font-mono tracking-widest">{s.label} </span>
              <span className="text-sm font-black text-white">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* ── TIME SELECTOR ─────────────────────────────────────────────────── */}
        <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5">
          <div className="corner-tl" /><div className="corner-tr" />
          <div className="corner-bl" /><div className="corner-br" />
          <p className="text-[#7c3aed]/50 text-xs tracking-[0.3em] font-mono mb-3">
            ◈ SET ROUND DURATION — APPLIES TO ALL STATIONS
          </p>
          <div className="flex gap-2 flex-wrap items-center">
            {['3', '5', '7', '10', '15'].map((t) => (
              <button key={t} onClick={() => setCustomTime(t)}
                className={`clip-btn px-5 py-2 text-sm border ${
                  customTime === t
                    ? 'bg-[#7c3aed]/30 border-[#7c3aed]/70 text-[#a78bfa]'
                    : 'bg-[#0d0014] border-[#7c3aed]/20 text-white/40 hover:text-white/70'
                }`}
              >{t} MIN</button>
            ))}
            <input
              type="number"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              min="1" max="60"
              className="bg-[#0d0014] border border-[#7c3aed]/30 text-[#a78bfa] font-mono text-sm px-4 py-2 w-24 focus:outline-none focus:border-[#7c3aed]"
              placeholder="Custom"
            />
            <span className="text-[#7c3aed]/30 text-xs font-mono ml-2">
              = {formatTime(timeLimitSec())} per station
            </span>
          </div>
        </div>

        {/* ── MASTER CONTROLS ───────────────────────────────────────────────── */}
        <div className="relative border border-[#7c3aed]/30 bg-[#0a0015] p-6 overflow-hidden">
          <div className="corner-tl" /><div className="corner-tr" />
          <div className="corner-bl" /><div className="corner-br" />
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.05) 0%, transparent 70%)' }} />

          <p className="text-[#7c3aed]/50 text-xs tracking-[0.3em] font-mono mb-5">
            ◈ MASTER CONTROL — ALL 4 STATIONS AT ONCE
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            {/* START ALL */}
            <button
              onClick={startAll}
              disabled={allRunning}
              className="clip-btn py-5 text-base font-black border-2 border-green-500/50 bg-green-900/20 text-green-300
                disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ boxShadow: allRunning ? 'none' : '0 0 25px rgba(34,197,94,0.15)' }}
            >
              <div className="text-2xl mb-1">⚡</div>
              START ALL
              <div className="text-xs font-normal mt-1 text-green-400/60 tracking-widest">
                STATIONS 1 · 2 · 3 · 4
              </div>
            </button>

            {/* PAUSE / RESUME ALL */}
            <button
              onClick={anyActive ? pauseAll : resumeAll}
              disabled={!anyActive && !stations.some((s) => s.roundStartedAt)}
              className="clip-btn py-5 text-base font-black border-2 border-yellow-600/50 bg-yellow-900/20 text-yellow-300
                disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <div className="text-2xl mb-1">{anyActive ? '⏸' : '▶'}</div>
              {anyActive ? 'PAUSE ALL' : 'RESUME ALL'}
              <div className="text-xs font-normal mt-1 text-yellow-400/60 tracking-widest">
                {anyActive ? 'FREEZE TIMERS' : 'CONTINUE TIMERS'}
              </div>
            </button>

            {/* STOP ALL */}
            <button
              onClick={stopAll}
              disabled={!anyActive && !stations.some((s) => s.roundStartedAt)}
              className="clip-btn py-5 text-base font-black border-2 border-red-600/50 bg-red-900/20 text-red-300
                disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <div className="text-2xl mb-1">⏹</div>
              STOP ALL
              <div className="text-xs font-normal mt-1 text-red-400/60 tracking-widest">
                END ALL ROUNDS
              </div>
            </button>
          </div>

          {/* All-active status bar */}
          {anyActive && (
            <div className="mt-5 panel-fade">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/30 text-xs font-mono">
                  SLOWEST TIMER — {formatTime(Math.max(...timers))}
                </span>
                <span className="text-white/30 text-xs font-mono">
                  FASTEST — {formatTime(Math.min(...timers.filter((_, i) => stations[i].roundActive)))}
                </span>
              </div>
              <div className="w-full h-1 bg-[#7c3aed]/10 relative">
                <div className="h-full transition-all duration-1000"
                  style={{
                    width: `${(Math.min(...timers) / (stations[0].roundTimeLimit || 300)) * 100}%`,
                    background: '#7c3aed',
                    boxShadow: '0 0 8px #7c3aed',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── 4 STATION CARDS ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => {
            const st          = stations[n - 1];
            const t           = timers[n - 1];
            const color       = STATION_COLORS[n];
            const glow        = STATION_GLOW[n];
            const danger      = t < 60  && st.roundActive;
            const warning     = t < 30  && st.roundActive;
            const timerColor  = danger ? '#ef4444' : color;
            const stationDone = teams.filter((tm) =>
              tm.completedStations?.includes(n)
            ).length;
            const pct = st.roundTimeLimit > 0
              ? Math.round((t / st.roundTimeLimit) * 100)
              : 0;

            return (
              <div key={n}
                className="relative border bg-[#0a0015] p-5 flex flex-col gap-4 overflow-hidden panel-fade"
                style={{
                  borderColor: st.roundActive
                    ? color.replace('1)', '0.5)')
                    : 'rgba(255,255,255,0.07)',
                  boxShadow: st.roundActive ? `0 0 20px ${glow}` : 'none',
                  transition: 'border-color 0.4s, box-shadow 0.4s',
                }}
              >
                {/* Glow bg */}
                {st.roundActive && (
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top, ${color.replace('1)', '0.06)')} 0%, transparent 70%)` }} />
                )}

                {/* Corner brackets */}
                {[
                  { t: 0, l: 0, bt: '1px solid', bb: 'none', bl: '1px solid', br: 'none' },
                  { t: 0, r: 0, bt: '1px solid', bb: 'none', bl: 'none',      br: '1px solid' },
                  { b: 0, l: 0, bt: 'none',      bb: '1px solid', bl: '1px solid', br: 'none' },
                  { b: 0, r: 0, bt: 'none',      bb: '1px solid', bl: 'none', br: '1px solid' },
                ].map((c, i) => (
                  <span key={i} className="absolute pointer-events-none" style={{
                    top: c.t !== undefined ? 0 : undefined,
                    bottom: c.b !== undefined ? 0 : undefined,
                    left: c.l !== undefined ? 0 : undefined,
                    right: c.r !== undefined ? 0 : undefined,
                    width: 12, height: 12,
                    borderTop: c.bt !== 'none' ? `${c.bt} ${color}` : 'none',
                    borderBottom: c.bb !== 'none' ? `${c.bb} ${color}` : 'none',
                    borderLeft: c.bl !== 'none' ? `${c.bl} ${color}` : 'none',
                    borderRight: c.br !== 'none' ? `${c.br} ${color}` : 'none',
                    opacity: st.roundActive ? 1 : 0.3,
                  }} />
                ))}

                {/* Station label */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono tracking-[0.3em] uppercase"
                      style={{ color: st.roundActive ? color : 'rgba(255,255,255,0.25)' }}>
                      STN — 0{n}
                    </p>
                    {st.roundActive && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse"
                          style={{ background: color, boxShadow: `0 0 6px ${glow}` }} />
                        <span className="text-[10px] font-mono" style={{ color }}>LIVE</span>
                      </div>
                    )}
                  </div>
                  <p className="text-white font-black text-lg uppercase tracking-wider mt-0.5">
                    {STATION_NAMES[n]}
                  </p>
                </div>

                {/* Timer */}
                <div className="relative z-10 text-center">
                  <div
                    className="font-black font-mono tracking-widest leading-none"
                    style={{
                      fontSize: 'clamp(2.8rem, 6vw, 3.5rem)',
                      color: timerColor,
                      textShadow: `0 0 30px ${danger ? 'rgba(239,68,68,0.5)' : glow}`,
                      animation: warning ? 'blink 1s step-end infinite' : 'none',
                    }}
                  >
                    {formatTime(t)}
                  </div>
                  <p className="text-white/20 text-[10px] font-mono mt-1 tracking-widest">
                    {st.roundActive
                      ? `${pct}% REMAINING`
                      : st.roundStartedAt ? 'PAUSED' : 'IDLE'}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="relative z-10 w-full h-1 bg-white/5">
                  <div className="h-full transition-all duration-1000"
                    style={{
                      width: `${pct}%`,
                      background: danger ? '#ef4444' : color,
                      boxShadow: `0 0 8px ${danger ? 'rgba(239,68,68,0.6)' : glow}`,
                    }}
                  />
                </div>

                {/* Completion count */}
                <div className="relative z-10 flex items-center justify-between">
                  <p className="text-white/20 text-[10px] font-mono tracking-widest">
                    {stationDone}/{teams.length} DONE
                  </p>
                  <p className="text-white/20 text-[10px] font-mono tracking-widest">
                    {teams.reduce((a, tm) => a + ((tm[`station${n}Attempts` as keyof Team] as number) || 0), 0)} ATTEMPTS
                  </p>
                </div>

                {/* Individual controls */}
                <div className="relative z-10 grid grid-cols-2 gap-2">
                  {st.roundActive ? (
                    <>
                      <button onClick={() => pauseStation(n)}
                        className="clip-btn py-2 text-xs border border-yellow-600/40 bg-yellow-900/15 text-yellow-400">
                        ⏸ PAUSE
                      </button>
                      <button onClick={() => stopStation(n)}
                        className="clip-btn py-2 text-xs border border-red-700/40 bg-red-900/15 text-red-400">
                        ⏹ STOP
                      </button>
                    </>
                  ) : st.roundStartedAt ? (
                    <>
                      <button onClick={() => resumeStation(n)}
                        className="clip-btn py-2 text-xs border border-green-600/40 bg-green-900/15 text-green-400">
                        ▶ RESUME
                      </button>
                      <button onClick={() => stopStation(n)}
                        className="clip-btn py-2 text-xs border border-red-700/40 bg-red-900/15 text-red-400">
                        ⏹ RESET
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startStation(n)}
                        className="clip-btn col-span-2 py-2 text-xs border border-white/15 bg-white/5 text-white/50 hover:text-white/80 hover:border-white/30">
                        ▶ START ONLY S{n}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── LIVE LEADERBOARD STRIP ────────────────────────────────────────── */}
        <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] overflow-hidden">
          <div className="corner-tl" /><div className="corner-tr" />
          <div className="corner-bl" /><div className="corner-br" />

          <div className="px-5 py-3 border-b border-[#7c3aed]/15">
            <p className="text-[#7c3aed]/50 text-xs tracking-[0.3em] font-mono">◈ LIVE LEADERBOARD</p>
          </div>

          {/* Header */}
          <div className="grid grid-cols-9 gap-2 px-5 py-2 border-b border-[#7c3aed]/10
            text-[#7c3aed]/40 font-mono tracking-[0.2em] uppercase text-xs">
            <div className="col-span-1">#</div>
            <div className="col-span-2">TEAM</div>
            <div className="col-span-1 text-center">S1</div>
            <div className="col-span-1 text-center">S2</div>
            <div className="col-span-1 text-center">S3</div>
            <div className="col-span-1 text-center">S4</div>
            <div className="col-span-1 text-center">ATT</div>
            <div className="col-span-1 text-right">TOTAL</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-[#7c3aed]/8 max-h-[50vh] overflow-y-auto">
            {teams.length === 0 ? (
              <div className="text-center py-12 text-white/15 font-mono tracking-widest text-xs">
                NO TEAMS YET
              </div>
            ) : (
              teams.map((team, idx) => {
                const totalAtt =
                  (team.station1Attempts || 0) + (team.station2Attempts || 0) +
                  (team.station3Attempts || 0) + (team.station4Attempts || 0);
                return (
                  <div key={team.teamId}
                    className={`grid grid-cols-9 gap-2 px-5 py-3 items-center
                      hover:bg-[#7c3aed]/5 transition-all
                      ${idx === 0 ? 'bg-[#7c3aed]/8' : ''}`}
                  >
                    <div className="col-span-1">
                      {idx === 0 ? (
                        <span className="text-yellow-400 font-black text-lg">01</span>
                      ) : idx === 1 ? (
                        <span className="text-gray-300 font-black">02</span>
                      ) : idx === 2 ? (
                        <span className="text-amber-600 font-black">03</span>
                      ) : (
                        <span className="text-white/25 font-mono text-sm">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                      )}
                    </div>

                    <div className="col-span-2">
                      <p className="text-white font-black text-sm uppercase tracking-wide truncate">
                        {team.teamName}
                      </p>
                      <p className="text-[#7c3aed]/40 text-xs font-mono">{team.teamCode}</p>
                    </div>

                    {[1, 2, 3, 4].map((s) => {
                      const score = team[`station${s}Score` as keyof Team] as number || 0;
                      const done  = team.completedStations?.includes(s);
                      return (
                        <div key={s} className="col-span-1 text-center">
                          <span className={`font-mono font-bold text-sm
                            ${done ? 'text-[#a78bfa]' : 'text-white/20'}`}>
                            {score > 0 ? score : '—'}
                          </span>
                          {done && <div className="text-[8px] text-[#7c3aed]/50 font-mono">✓</div>}
                        </div>
                      );
                    })}

                    <div className="col-span-1 text-center">
                      <span className="text-white/30 font-mono text-xs">
                        {totalAtt > 0 ? totalAtt : '—'}
                      </span>
                    </div>

                    <div className="col-span-1 text-right">
                      <span className={`font-black text-base ${idx === 0 ? 'text-[#a78bfa]' : 'text-white'}`}
                        style={{ textShadow: idx === 0 ? '0 0 15px rgba(167,139,250,0.5)' : 'none' }}>
                        {team.totalScore}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
