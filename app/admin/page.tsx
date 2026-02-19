// app/admin/page.tsx
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
  orderBy,
  query,
  updateDoc,
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
  createdAt: string;
}

interface WorkshopState {
  activeStation: number | null;
  roundActive: boolean;
  roundTimeLimit: number;
  roundStartedAt: number | null;
  workshopStarted: boolean;
}

const WORKSHOP_DOC   = 'workshops/feb2026';
const STATION_NAMES  = ['', 'Shield', 'Oxygen', 'Override', 'Pressure'];
const STATION_COLORS = ['', '#7c3aed', '#0891b2', '#b45309', '#166534'];

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, role, loading } = useAuth('admin');
  const router = useRouter();

  const [teams, setTeams]               = useState<Team[]>([]);
  const [workshopState, setWorkshopState] = useState<WorkshopState>({
    activeStation: null, roundActive: false,
    roundTimeLimit: 300, roundStartedAt: null, workshopStarted: false,
  });
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [activeTab, setActiveTab]         = useState<'control' | 'leaderboard' | 'teams'>('control');
  const [customTime, setCustomTime]       = useState('5');
  const [searchQuery, setSearchQuery]     = useState('');
  const [glitch, setGlitch]               = useState(false);
  const [timerFullscreen, setTimerFullscreen]       = useState(false);
  const [leaderboardFullscreen, setLeaderboardFullscreen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Glitch effect ─────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // ── ESC closes fullscreen ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTimerFullscreen(false);
        setLeaderboardFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ── Live teams ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'teams'), orderBy('totalScore', 'desc'));
    return onSnapshot(q, (snap) => setTeams(snap.docs.map((d) => d.data() as Team)));
  }, [user]);

  // ── Live workshop state ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, WORKSHOP_DOC), (snap) => {
      if (snap.exists()) setWorkshopState(snap.data() as WorkshopState);
    });
  }, [user]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (workshopState.roundActive && workshopState.roundStartedAt) {
      const tick = () => {
        const elapsed    = Math.floor((Date.now() - workshopState.roundStartedAt!) / 1000);
        const remaining  = Math.max(0, workshopState.roundTimeLimit - elapsed);
        setTimeRemaining(remaining);
        if (remaining === 0) {
          clearInterval(timerRef.current!);
          // Auto-close round when timer hits 0
          updateWorkshop({ roundActive: false });
        }
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      setTimeRemaining(workshopState.roundTimeLimit);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [workshopState.roundActive, workshopState.roundStartedAt, workshopState.roundTimeLimit]);

  // ── Admin actions ─────────────────────────────────────────────────────────
  const updateWorkshop = useCallback(async (updates: Partial<WorkshopState>) => {
    await setDoc(doc(db, WORKSHOP_DOC), { ...workshopState, ...updates }, { merge: true });
  }, [workshopState]);

  const startRound = async (station: number) => {
    const timeLimitSec = parseInt(customTime) * 60;
    await updateWorkshop({
      activeStation: station, roundActive: true,
      roundTimeLimit: timeLimitSec, roundStartedAt: Date.now(),
    });
  };

  const pauseRound  = () => updateWorkshop({ roundActive: false });
  const resumeRound = () => updateWorkshop({
    roundActive: true,
    roundStartedAt: Date.now() - (workshopState.roundTimeLimit - timeRemaining) * 1000,
  });
  const stopRound = () => updateWorkshop({
    roundActive: false, activeStation: null, roundStartedAt: null,
  });

  const resetAllScores = async () => {
    if (!confirm('Reset ALL team scores and attempts? This cannot be undone.')) return;
    await Promise.all(teams.map((t) =>
      updateDoc(doc(db, 'teams', t.teamId), {
        station1Score: 0, station2Score: 0, station3Score: 0, station4Score: 0,
        station1Attempts: 0, station2Attempts: 0, station3Attempts: 0, station4Attempts: 0,
        totalScore: 0, completedStations: [],
      })
    ));
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const rankedTeams    = teams
    .map((t, i) => ({ ...t, rank: i + 1 }))
    .filter((t) =>
      t.teamName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.teamCode.toLowerCase().includes(searchQuery.toLowerCase())
    );
  const activeTeams    = teams.filter((t) => t.totalScore > 0).length;
  const completedTeams = teams.filter((t) => t.completedStations.length === 4).length;
  const timerDanger    = timeRemaining < 60  && workshopState.roundActive;
  const timerWarning   = timeRemaining < 30  && workshopState.roundActive;
  const timerColor     = timerDanger ? '#ef4444' : '#a78bfa';

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#030108]">
      <style>{`
        @keyframes spin-cw  { to { transform: rotate(360deg);  } }
        @keyframes spin-ccw { to { transform: rotate(-360deg); } }
      `}</style>
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

  // ── Shared styles ─────────────────────────────────────────────────────────
  const sharedStyles = `
    * { scrollbar-width: none; }
    *::-webkit-scrollbar { display: none; }
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
    @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
    @keyframes shake {
      0%,100% { transform:translate(0,0); }
      20% { transform:translate(-2px,1px); } 40% { transform:translate(2px,-1px); }
      60% { transform:translate(-1px,2px); } 80% { transform:translate(1px,-2px); }
    }
    @keyframes unlockPulse {
      0%   { box-shadow: 0 0 0 0 rgba(124,58,237,0.6); }
      70%  { box-shadow: 0 0 0 12px rgba(124,58,237,0); }
      100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
    }
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
    .unlock-anim { animation: unlockPulse 1s ease-out; }
  `;

  // ── Timer Panel (reused in normal + fullscreen) ───────────────────────────
  const TimerPanel = ({ fullscreen = false }: { fullscreen?: boolean }) => (
    <div className={`relative border border-[#7c3aed]/30 bg-[#0a0015] overflow-hidden flex flex-col items-center justify-center
      ${fullscreen ? 'fixed inset-0 z-[100] border-0' : 'p-8'}`}
    >
      {fullscreen && <div className="scanline-bar" />}
      <div className="corner-tl" /><div className="corner-tr" />
      <div className="corner-bl" /><div className="corner-br" />

      {/* Fullscreen toggle button */}
      <button
        onClick={() => setTimerFullscreen(!fullscreen)}
        className="absolute top-4 right-4 clip-btn px-3 py-1.5 text-xs border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa]"
      >
        {fullscreen ? '✕ EXIT' : '⛶ FULLSCREEN'}
      </button>

      {/* Station label */}
      <p className={`text-[#7c3aed]/50 tracking-[0.4em] font-mono mb-4
        ${fullscreen ? 'text-lg mt-8' : 'text-xs'}`}
      >
        {workshopState.roundActive ? '◈ ROUND IN PROGRESS' : '◈ ROUND IDLE'}
        {workshopState.activeStation &&
          ` — STATION ${workshopState.activeStation}: ${STATION_NAMES[workshopState.activeStation]}`}
      </p>

      {/* Big timer */}
      <div
        style={{
          color: timerColor,
          textShadow: `0 0 40px ${timerDanger ? 'rgba(239,68,68,0.6)' : 'rgba(167,139,250,0.4)'}`,
          animation: timerWarning ? 'blink 1s step-end infinite' : 'none',
          fontSize: fullscreen ? 'clamp(8rem, 20vw, 18rem)' : undefined,
          lineHeight: 1,
        }}
        className={`font-black font-mono tracking-widest ${fullscreen ? '' : 'text-8xl'}`}
      >
        {formatTime(timeRemaining)}
      </div>

      {/* Attempt penalty note */}
      {workshopState.activeStation && (
        <p className={`font-mono text-[#7c3aed]/40 mt-3
          ${fullscreen ? 'text-base' : 'text-xs'}`}
        >
          {timeRemaining === 0
            ? '⚠ ROUND ENDED — submissions rejected'
            : `Attempt penalties: 2nd→800 cap  3rd→600  4th+→400`}
        </p>
      )}

      {/* Progress bar */}
      <div className={`w-full bg-[#7c3aed]/10 relative ${fullscreen ? 'mt-8 h-2' : 'mt-4 h-1'}`}>
        <div
          className="h-full transition-all duration-1000"
          style={{
            width: workshopState.roundTimeLimit > 0
              ? `${(timeRemaining / workshopState.roundTimeLimit) * 100}%` : '100%',
            background: timerDanger ? '#ef4444' : '#7c3aed',
            boxShadow: `0 0 8px ${timerDanger ? '#ef4444' : '#7c3aed'}`,
          }}
        />
      </div>

      {/* Quick controls in fullscreen */}
      {fullscreen && (
        <div className="flex gap-4 mt-10">
          <button
            onClick={workshopState.roundActive ? pauseRound : resumeRound}
            disabled={!workshopState.activeStation}
            className="clip-btn py-3 px-8 text-sm font-black border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa] disabled:opacity-30"
          >
            {workshopState.roundActive ? '⏸ PAUSE' : '▶ RESUME'}
          </button>
          <button
            onClick={stopRound}
            disabled={!workshopState.activeStation}
            className="clip-btn py-3 px-8 text-sm font-black border border-red-700/40 bg-red-900/20 text-red-400 disabled:opacity-30"
          >
            ⏹ STOP
          </button>
        </div>
      )}
    </div>
  );

  // ── Leaderboard Panel (reused in normal + fullscreen) ─────────────────────
  const LeaderboardPanel = ({ fullscreen = false }: { fullscreen?: boolean }) => (
    <div className={fullscreen ? 'fixed inset-0 z-[100] bg-[#030108] flex flex-col p-6 overflow-hidden' : ''}>
      {fullscreen && <style>{sharedStyles}</style>}
      {fullscreen && <div className="scanline-bar" />}
      {fullscreen && <div className="noise-overlay" />}

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        {fullscreen && (
          <div>
            <h2 className="text-3xl font-black uppercase tracking-widest text-white"
              style={{ textShadow: '0 0 20px rgba(124,58,237,0.5)' }}>
              ◈ LIVE LEADERBOARD
            </h2>
            <p className="text-[#7c3aed]/40 text-xs font-mono tracking-widest mt-1">
              RISE 2026 — EMERGENCY TASKS — KARUNYA INSTITUTE
            </p>
          </div>
        )}
        <button
          onClick={() => setLeaderboardFullscreen(!fullscreen)}
          className="clip-btn px-3 py-1.5 text-xs border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa] ml-auto"
        >
          {fullscreen ? '✕ EXIT FULLSCREEN' : '⛶ FULLSCREEN'}
        </button>
      </div>

      {/* Search */}
      {!fullscreen && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="SEARCH TEAM NAME OR CODE..."
          className="w-full mb-4 bg-[#0a0015] border border-[#7c3aed]/30 text-white font-mono text-sm px-5 py-3 focus:outline-none focus:border-[#7c3aed] placeholder-white/20 tracking-widest uppercase"
        />
      )}

      {/* Table */}
      <div className={`relative border border-[#7c3aed]/20 bg-[#0a0015] overflow-hidden flex-1`}>
        <div className="corner-tl" /><div className="corner-tr" />
        <div className="corner-bl" /><div className="corner-br" />

        {/* Header */}
        <div className={`grid gap-2 px-4 py-3 border-b border-[#7c3aed]/20 text-[#7c3aed]/50 font-mono tracking-[0.2em] uppercase
          ${fullscreen ? 'grid-cols-9 text-sm' : 'grid-cols-9 text-xs'}`}
        >
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
        <div className={`divide-y divide-[#7c3aed]/10 overflow-y-auto ${fullscreen ? 'max-h-[calc(100vh-260px)]' : 'max-h-[55vh]'}`}>
          {rankedTeams.length === 0 ? (
            <div className="text-center py-16 text-white/20 font-mono tracking-widest">NO TEAMS FOUND</div>
          ) : (
            rankedTeams.map((team, idx) => {
              const totalAttempts =
                (team.station1Attempts || 0) + (team.station2Attempts || 0) +
                (team.station3Attempts || 0) + (team.station4Attempts || 0);
              return (
                <div
                  key={team.teamId}
                  className={`grid gap-2 px-4 items-center transition-all hover:bg-[#7c3aed]/5
                    ${fullscreen ? 'grid-cols-9 py-5' : 'grid-cols-9 py-3'}
                    ${idx === 0 ? 'bg-[#7c3aed]/10' : ''}`}
                >
                  {/* Rank */}
                  <div className="col-span-1">
                    {idx === 0 ? (
                      <span className={`text-yellow-400 font-black ${fullscreen ? 'text-2xl' : 'text-lg'}`}>01</span>
                    ) : idx === 1 ? (
                      <span className={`text-gray-300 font-black ${fullscreen ? 'text-xl' : ''}`}>02</span>
                    ) : idx === 2 ? (
                      <span className={`text-amber-600 font-black ${fullscreen ? 'text-xl' : ''}`}>03</span>
                    ) : (
                      <span className="text-white/30 font-mono text-sm">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    )}
                  </div>

                  {/* Team */}
                  <div className="col-span-2">
                    <p className={`text-white font-black uppercase tracking-wide truncate
                      ${fullscreen ? 'text-base' : 'text-sm'}`}>{team.teamName}</p>
                    <p className="text-[#7c3aed]/50 text-xs font-mono">{team.teamCode}</p>
                  </div>

                  {/* Station scores */}
                  {[1, 2, 3, 4].map((s) => {
                    const score = team[`station${s}Score` as keyof Team] as number;
                    const done  = team.completedStations?.includes(s);
                    const atts  = team[`station${s}Attempts` as keyof Team] as number || 0;
                    return (
                      <div key={s} className="col-span-1 text-center">
                        <span className={`font-mono font-bold
                          ${done ? 'text-[#a78bfa]' : 'text-white/20'}
                          ${fullscreen ? 'text-base' : 'text-sm'}`}>
                          {score > 0 ? score : '—'}
                        </span>
                        {done && (
                          <div className="text-[8px] text-[#7c3aed]/60 font-mono">✓</div>
                        )}
                        {atts > 0 && !done && (
                          <div className="text-[8px] text-yellow-500/60 font-mono">{atts}x</div>
                        )}
                      </div>
                    );
                  })}

                  {/* Total attempts */}
                  <div className="col-span-1 text-center">
                    <span className={`font-mono text-white/40 ${fullscreen ? 'text-sm' : 'text-xs'}`}>
                      {totalAttempts > 0 ? totalAttempts : '—'}
                    </span>
                  </div>

                  {/* Total score */}
                  <div className="col-span-1 text-right">
                    <span
                      className={`font-black ${fullscreen ? 'text-xl' : 'text-base'}`}
                      style={{
                        color: idx === 0 ? '#a78bfa' : '#ffffff',
                        textShadow: idx === 0 ? '0 0 15px rgba(167,139,250,0.6)' : 'none',
                      }}
                    >
                      {team.totalScore}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className={`grid grid-cols-4 gap-3 ${fullscreen ? 'mt-4' : 'mt-4'}`}>
        {[
          { label: 'TOP SCORE', value: teams[0]?.totalScore || 0 },
          { label: 'AVG SCORE', value: teams.length ? Math.round(teams.reduce((a, t) => a + t.totalScore, 0) / teams.length) : 0 },
          { label: 'COMPLETED', value: `${completedTeams}/${teams.length}` },
          { label: 'ACTIVE STN', value: workshopState.activeStation ? `S${workshopState.activeStation} ${STATION_NAMES[workshopState.activeStation]}` : 'NONE' },
        ].map((s) => (
          <div key={s.label} className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-3 text-center">
            <div className="corner-tl" /><div className="corner-tr" />
            <div className="corner-bl" /><div className="corner-br" />
            <p className="text-[#7c3aed]/40 text-xs font-mono tracking-widest mb-1">{s.label}</p>
            <p className={`text-white font-black ${fullscreen ? 'text-2xl' : 'text-xl'}`}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{sharedStyles}</style>

      {/* Fullscreen overlays */}
      {timerFullscreen       && <TimerPanel       fullscreen />}
      {leaderboardFullscreen && <LeaderboardPanel fullscreen />}

      <div className="scanline-bar" />
      <div className="noise-overlay" />

      {/* Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.13]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #6b21a8, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      <div className="relative min-h-screen bg-[#030108] text-white overflow-hidden"
        style={{ fontFamily: "'Arial Narrow','Impact',sans-serif" }}>

        {/* ── TICKER ────────────────────────────────────────────────── */}
        <div className="w-full overflow-hidden bg-[#7c3aed]/10 border-b border-[#7c3aed]/30 py-1">
          <div className="flex whitespace-nowrap" style={{ animation: 'ticker 30s linear infinite' }}>
            {Array(6).fill(null).map((_, i) => (
              <span key={i} className="text-[#a78bfa] text-xs tracking-widest mx-8 font-mono">
                ◈ ADMIN CONTROL &nbsp;
                ◈ {teams.length} TEAMS &nbsp;
                ◈ {activeTeams} ACTIVE &nbsp;
                ◈ {completedTeams} COMPLETED &nbsp;
                ◈ STN: {workshopState.activeStation ? STATION_NAMES[workshopState.activeStation] : 'IDLE'} &nbsp;
                ◈ {workshopState.roundActive ? `ROUND LIVE — ${formatTime(timeRemaining)}` : 'ROUND IDLE'} &nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* ── HEADER ────────────────────────────────────────────────── */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[#7c3aed]/20">
          <div className="flex items-start justify-between">
            <div>
              <div className={`glitch-wrap ${glitch ? 'glitch-active' : ''}`} data-text="">
                <h1 className="text-4xl font-black uppercase tracking-[0.15em] text-white"
                  style={{ textShadow: '0 0 30px rgba(124,58,237,0.5)' }}>
                  ADMIN // CONTROL
                </h1>
              </div>
              <p className="text-[#7c3aed]/70 text-xs tracking-[0.3em] mt-1 font-mono">
                EMERGENCY TASKS WORKSHOP 2026 — KARUNYA INSTITUTE
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 stat-pill bg-[#7c3aed]/20 border border-[#7c3aed]/40 px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-[#a78bfa]"
                  style={{ animation: 'pulse-glow 1.5s ease-in-out infinite' }} />
                <span className="text-[#a78bfa] text-xs font-mono tracking-widest">LIVE</span>
              </div>
              <div className="flex items-center gap-3">
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-sm border border-[#7c3aed]/40" />
                <button
                  onClick={async () => { await signOut(auth); router.replace('/login'); }}
                  className="clip-btn bg-red-900/40 border border-red-700/40 text-red-400 text-xs px-4 py-2"
                >LOGOUT</button>
              </div>
            </div>
          </div>

          {/* Stat pills */}
          <div className="flex gap-3 mt-4 flex-wrap">
            {[
              { label: 'TEAMS',    value: teams.length },
              { label: 'ACTIVE',   value: activeTeams },
              { label: 'COMPLETE', value: completedTeams },
              { label: 'STATION',  value: workshopState.activeStation ? `S${workshopState.activeStation} — ${STATION_NAMES[workshopState.activeStation]}` : 'OFF' },
              { label: 'ROUND',    value: workshopState.roundActive ? `LIVE ${formatTime(timeRemaining)}` : 'IDLE' },
            ].map((s) => (
              <div key={s.label} className="stat-pill bg-[#0d0014] border border-[#7c3aed]/30 px-4 py-1.5">
                <span className="text-[#7c3aed]/50 text-xs font-mono tracking-widest">{s.label} </span>
                <span className={`text-sm font-black ${s.label === 'ROUND' && workshopState.roundActive ? 'text-green-400' : 'text-white'}`}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── TABS ──────────────────────────────────────────────────── */}
        <div className="flex border-b border-[#7c3aed]/20 px-6">
          {(['control', 'leaderboard', 'teams'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-xs tracking-[0.25em] uppercase font-mono border-b-2 transition-all ${
                activeTab === tab
                  ? 'border-[#7c3aed] text-[#a78bfa]'
                  : 'border-transparent text-white/30 hover:text-white/60'
              }`}
            >
              {tab === 'control' ? '◈ CONTROL' : tab === 'leaderboard' ? '◈ LEADERBOARD' : '◈ TEAMS'}
            </button>
          ))}
        </div>

        {/* ── TAB: CONTROL ──────────────────────────────────────────── */}
        {activeTab === 'control' && (
          <div className="p-6 space-y-6 max-w-5xl mx-auto">

            {/* Timer */}
            <TimerPanel />

            {/* Time selector */}
            <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5">
              <div className="corner-tl" /><div className="corner-tr" />
              <div className="corner-bl" /><div className="corner-br" />
              <p className="text-[#7c3aed]/50 text-xs tracking-[0.3em] font-mono mb-3">◈ SET ROUND DURATION (MINUTES)</p>
              <div className="flex gap-2 flex-wrap">
                {['3','5','7','10','15'].map((t) => (
                  <button key={t} onClick={() => setCustomTime(t)}
                    className={`clip-btn px-5 py-2 text-sm border ${
                      customTime === t
                        ? 'bg-[#7c3aed]/30 border-[#7c3aed]/70 text-[#a78bfa]'
                        : 'bg-[#0d0014] border-[#7c3aed]/20 text-white/40 hover:text-white/70'
                    }`}
                  >{t} MIN</button>
                ))}
                <input type="number" value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  min="1" max="60"
                  className="bg-[#0d0014] border border-[#7c3aed]/30 text-[#a78bfa] font-mono text-sm px-4 py-2 w-24 focus:outline-none focus:border-[#7c3aed]"
                  placeholder="Custom"
                />
              </div>
            </div>

            {/* Station launch */}
            <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5">
              <div className="corner-tl" /><div className="corner-tr" />
              <div className="corner-bl" /><div className="corner-br" />
              <p className="text-[#7c3aed]/50 text-xs tracking-[0.3em] font-mono mb-4">◈ LAUNCH STATION ROUND</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1,2,3,4].map((s) => {
                  const isActive = workshopState.roundActive && workshopState.activeStation === s;
                  return (
                    <button key={s} onClick={() => startRound(s)} disabled={isActive}
                      className={`clip-btn py-4 text-sm border text-white disabled:opacity-40 disabled:cursor-not-allowed
                        ${isActive
                          ? 'border-green-500/60 bg-green-900/20'
                          : 'border-[#7c3aed]/30 bg-[#0d0014] hover:bg-[#7c3aed]/10'}`}
                    >
                      <div className="text-[#7c3aed]/60 text-xs mb-1 flex items-center justify-center gap-1">
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />}
                        STATION {s}
                      </div>
                      <div className="font-black tracking-wider">{STATION_NAMES[s].toUpperCase()}</div>
                      {isActive && <div className="text-green-400 text-xs mt-1">● LIVE</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Round controls */}
            <div className="grid grid-cols-3 gap-3">
              <button onClick={workshopState.roundActive ? pauseRound : resumeRound}
                disabled={!workshopState.activeStation}
                className="clip-btn py-4 text-sm font-black border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {workshopState.roundActive ? '⏸ PAUSE' : '▶ RESUME'}
              </button>
              <button onClick={stopRound} disabled={!workshopState.activeStation}
                className="clip-btn py-4 text-sm font-black border border-red-700/40 bg-red-900/20 text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
              >⏹ STOP ROUND</button>
              <button onClick={resetAllScores}
                className="clip-btn py-4 text-sm font-black border border-yellow-700/40 bg-yellow-900/20 text-yellow-400"
              >⚠ RESET ALL</button>
            </div>

            {/* Scoring legend */}
            <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5">
              <div className="corner-tl" /><div className="corner-tr" />
              <div className="corner-bl" /><div className="corner-br" />
              <p className="text-[#7c3aed]/50 text-xs tracking-[0.3em] font-mono mb-4">◈ SCORING BREAKDOWN (MAX 1000)</p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'ACCURACY', max: 400, desc: 'Exact=400 · ≤5°=300 · ≤10°=150 · ≤15°=50' },
                  { label: 'SPEED',    max: 400, desc: '<3s=400 · <6s=300 · <10s=150 · <14s=50' },
                  { label: 'EFFICIENCY', max: 200, desc: '≤3 moves=200 · ≤6=150 · ≤10=80 · ≤15=30' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-[#a78bfa] font-black text-lg">{s.max}</p>
                    <p className="text-white/60 text-xs font-mono tracking-widest mb-1">{s.label}</p>
                    <p className="text-white/25 text-[10px] font-mono">{s.desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-[#7c3aed]/10">
                <p className="text-[#7c3aed]/50 text-xs font-mono tracking-widest mb-2">◈ ATTEMPT PENALTIES</p>
                <div className="flex gap-4 flex-wrap">
                  {[
                    { label: '1st attempt', value: 'Full 1000' },
                    { label: '2nd attempt', value: 'Cap 800' },
                    { label: '3rd attempt', value: 'Cap 600' },
                    { label: '4th+ attempt', value: 'Cap 400' },
                  ].map((p) => (
                    <div key={p.label} className="stat-pill bg-[#0d0014] border border-[#7c3aed]/20 px-3 py-1">
                      <span className="text-white/30 text-xs font-mono">{p.label}: </span>
                      <span className="text-[#a78bfa] text-xs font-mono font-bold">{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Workshop launch */}
            {!workshopState.workshopStarted && (
              <button onClick={() => updateWorkshop({ workshopStarted: true })}
                className="clip-btn w-full py-5 text-lg font-black border-2 border-[#7c3aed]/60 bg-[#7c3aed]/20 text-white tracking-widest"
                style={{ boxShadow: '0 0 30px rgba(124,58,237,0.2)' }}
              >⚡ LAUNCH WORKSHOP</button>
            )}
          </div>
        )}

        {/* ── TAB: LEADERBOARD ──────────────────────────────────────── */}
        {activeTab === 'leaderboard' && (
          <div className="p-6 max-w-5xl mx-auto">
            <LeaderboardPanel />
          </div>
        )}

        {/* ── TAB: TEAMS ────────────────────────────────────────────── */}
        {activeTab === 'teams' && (
          <div className="p-6 max-w-5xl mx-auto">
            <input type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH TEAMS..."
              className="w-full mb-4 bg-[#0a0015] border border-[#7c3aed]/30 text-white font-mono text-sm px-5 py-3 focus:outline-none focus:border-[#7c3aed] placeholder-white/20 tracking-widest uppercase"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {rankedTeams.map((team, idx) => {
                const totalAttempts =
                  (team.station1Attempts || 0) + (team.station2Attempts || 0) +
                  (team.station3Attempts || 0) + (team.station4Attempts || 0);
                return (
                  <div key={team.teamId}
                    className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5 hover:border-[#7c3aed]/40 transition-all">
                    <div className="corner-tl" /><div className="corner-tr" />
                    <div className="corner-bl" /><div className="corner-br" />

                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-white font-black uppercase tracking-wide">{team.teamName}</p>
                        <p className="text-[#7c3aed]/50 text-xs font-mono mt-0.5">{team.teamCode}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="stat-pill bg-[#7c3aed]/10 border border-[#7c3aed]/30 px-3 py-1 text-xs font-mono text-[#a78bfa]">
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                        {totalAttempts > 0 && (
                          <span className="text-yellow-500/60 text-[10px] font-mono">{totalAttempts} attempts</span>
                        )}
                      </div>
                    </div>

                    {/* Members */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {team.members?.map((m, i) => (
                        <span key={i} className="text-xs font-mono text-white/50 border border-white/10 px-2 py-0.5">
                          {i === 0 ? '★ ' : ''}{m}
                        </span>
                      ))}
                    </div>

                    {/* Station badges with attempt count */}
                    <div className="flex gap-2">
                      {[1,2,3,4].map((s) => {
                        const done = team.completedStations?.includes(s);
                        const atts = team[`station${s}Attempts` as keyof Team] as number || 0;
                        const score = team[`station${s}Score` as keyof Team] as number || 0;
                        return (
                          <div key={s}
                            className={`flex-1 text-center py-1.5 text-xs font-mono font-bold border ${
                              done
                                ? 'border-[#7c3aed]/50 bg-[#7c3aed]/10 text-[#a78bfa]'
                                : atts > 0
                                  ? 'border-yellow-700/40 bg-yellow-900/10 text-yellow-500/60'
                                  : 'border-white/10 text-white/20'
                            }`}
                          >
                            S{s}
                            {done  && <div className="text-[8px] text-[#7c3aed]/60">✓ {score}</div>}
                            {!done && atts > 0 && <div className="text-[8px] text-yellow-500/50">{atts}x</div>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Score bar */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-0.5 bg-[#7c3aed]/10">
                        <div className="h-full transition-all duration-700"
                          style={{
                            width: `${teams[0]?.totalScore > 0 ? (team.totalScore / teams[0].totalScore) * 100 : 0}%`,
                            background: '#7c3aed', boxShadow: '0 0 6px #7c3aed',
                          }}
                        />
                      </div>
                      <span className="text-white font-black font-mono text-sm">
                        {team.totalScore} <span className="text-white/30 text-xs">pts</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
