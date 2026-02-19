// app/student/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/useAuth';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';

// ── Code generator ────────────────────────────────────────────────────────────
const generateTeamCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'T-';
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};
const generateUniqueCode = async (): Promise<string> => {
  let code = generateTeamCode();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await getDocs(query(collection(db, 'teams'), where('teamCode', '==', code)));
    if (existing.empty) return code;
    code = generateTeamCode();
    attempts++;
  }
  return code;
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface TeamData {
  teamId: string;
  teamName: string;
  teamCode: string;
  members: string[];
  ownerUid: string;
  ownerEmail: string;
  createdAt: string;
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

interface WorkshopState {
  activeStation: number | null;
  roundActive: boolean;
  roundTimeLimit: number;
  roundStartedAt: number | null;
  workshopStarted: boolean;
}

const WORKSHOP_DOC  = 'workshops/feb2026';
const STATION_NAMES = ['', 'Shield', 'Oxygen', 'Override', 'Pressure'];

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// ── Shared styles (mirrors admin page) ───────────────────────────────────────
const sharedStyles = `
  * { scrollbar-width: none; }
  *::-webkit-scrollbar { display: none; }

  :root { font-family: 'Arial Narrow', 'Impact', 'Haettenschweiler', Arial, sans-serif; }

  @keyframes spin-cw  { to { transform: rotate(360deg);  } }
  @keyframes spin-ccw { to { transform: rotate(-360deg); } }
  @keyframes pulse-glow { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
  @keyframes ticker { 0% { transform:translateX(0); } 100% { transform:translateX(-50%); } }
  @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }

  @keyframes glitch-1 {
    0%,100% { clip-path: inset(0 0 98% 0); transform: translate(-4px); }
    50%      { clip-path: inset(30% 0 50% 0); transform: translate(4px); }
  }
  @keyframes glitch-2 {
    0%,100% { clip-path: inset(60% 0 20% 0); transform: translate(3px); }
    50%      { clip-path: inset(10% 0 80% 0); transform: translate(-3px); }
  }

  @keyframes scorePop {
    0% { transform: scale(1); }
    40% { transform: scale(1.08); }
    100% { transform: scale(1); }
  }
  .score-pop { animation: scorePop 0.4s cubic-bezier(0.34,1.56,0.64,1); }

  @keyframes unlockPulse {
    0%   { box-shadow: 0 0 0 0 rgba(124,58,237,0.6); }
    70%  { box-shadow: 0 0 0 14px rgba(124,58,237,0); }
    100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
  }
  .station-unlock { animation: unlockPulse 1.2s ease-out; }

  @keyframes pageShake {
    0%,100% { transform: translate(0,0); }
    20% { transform: translate(-2px,1px); }
    40% { transform: translate(2px,-1px); }
    60% { transform: translate(-1px,2px); }
    80% { transform: translate(1px,-2px); }
  }
  .shake { animation: pageShake 0.4s ease both; }

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

  .underline-input { background:transparent; outline:none; width:100%; }
  .underline-input::placeholder { color: rgba(255,255,255,0.15); }
`;

export default function StudentPage() {
  const { user, role, loading } = useAuth('student');
  const router = useRouter();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [pageState, setPageState] = useState<'loading' | 'form' | 'dashboard'>('loading');
  const [existingTeam, setExistingTeam] = useState<TeamData | null>(null);
  const [workshopState, setWorkshopState] = useState<WorkshopState>({
    activeStation: null, roundActive: false,
    roundTimeLimit: 300, roundStartedAt: null, workshopStarted: false,
  });
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Form state
  const [teamName, setTeamName]         = useState('');
  const [members, setMembers]           = useState<string[]>(['', '']);
  const [formLoading, setFormLoading]   = useState(false);
  const [formError, setFormError]       = useState('');
  const [teamNameError, setTeamNameError] = useState('');
  const [copied, setCopied]             = useState(false);
  const [glitch, setGlitch]             = useState(false);

  // ── Glitch effect ─────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // ── Check existing team ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user || loading) return;
    const check = async () => {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists() && userDoc.data().teamId) {
        const teamDoc = await getDoc(doc(db, 'teams', userDoc.data().teamId));
        if (teamDoc.exists()) {
          setExistingTeam(teamDoc.data() as TeamData);
          setPageState('dashboard');
          return;
        }
      }
      setPageState('form');
    };
    check();
  }, [user, loading]);

  // ── Live team updates ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || pageState !== 'dashboard' || !existingTeam?.teamId) return;
    const unsub = onSnapshot(doc(db, 'teams', existingTeam.teamId), (snap) => {
      if (snap.exists()) setExistingTeam(snap.data() as TeamData);
    });
    return unsub;
  }, [user, pageState, existingTeam?.teamId]);

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
        const elapsed   = Math.floor((Date.now() - workshopState.roundStartedAt!) / 1000);
        const remaining = Math.max(0, workshopState.roundTimeLimit - elapsed);
        setTimeRemaining(remaining);
        if (remaining === 0) clearInterval(timerRef.current!);
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      setTimeRemaining(workshopState.roundTimeLimit);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [workshopState.roundActive, workshopState.roundStartedAt, workshopState.roundTimeLimit]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  const triggerShake = () => {
    const el = document.getElementById('page-root');
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  };

  const addMember    = () => { if (members.length < 3) setMembers([...members, '']); };
  const removeMember = (i: number) => { if (members.length > 2) setMembers(members.filter((_, idx) => idx !== i)); };
  const updateMember = (i: number, v: string) => { const u = [...members]; u[i] = v; setMembers(u); };

  const checkTeamNameUnique = async (name: string) => {
    if (!name.trim()) return;
    const res = await getDocs(query(collection(db, 'teams'), where('teamNameLower', '==', name.trim().toLowerCase())));
    setTeamNameError(res.empty ? '' : 'Team name already taken.');
  };

  const validateForm = (): boolean => {
    if (!teamName.trim())              { setFormError('Team name is required.');        return false; }
    if (teamName.trim().length < 3)    { setFormError('Min 3 characters.');             return false; }
    if (teamNameError)                 { setFormError('Fix the team name error first.'); return false; }
    if (members.some(m => !m.trim())) { setFormError('Fill all member names.');         return false; }
    if (members.some(m => m.trim().length < 2)) { setFormError('Min 2 chars per name.'); return false; }
    if (new Set(members.map(m => m.trim().toLowerCase())).size !== members.length) {
      setFormError('Duplicate names found.'); return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!validateForm()) { triggerShake(); return; }
    setFormLoading(true);
    try {
      const nameCheck = await getDocs(query(collection(db, 'teams'), where('teamNameLower', '==', teamName.trim().toLowerCase())));
      if (!nameCheck.empty) { setTeamNameError('Just taken! Pick another.'); setFormLoading(false); triggerShake(); return; }
      const teamCode = await generateUniqueCode();
      const teamId   = `${teamCode}-${user!.uid.slice(0, 6)}`;
      const teamData: TeamData = {
        teamId, teamName: teamName.trim(), teamCode,
        members: members.map(m => m.trim()),
        ownerUid: user!.uid, ownerEmail: user!.email!,
        createdAt: new Date().toISOString(),
        station1Score: 0, station2Score: 0, station3Score: 0, station4Score: 0,
        station1Attempts: 0, station2Attempts: 0, station3Attempts: 0, station4Attempts: 0,
        totalScore: 0, completedStations: [],
      };
      await setDoc(doc(db, 'teams', teamId), { ...teamData, teamNameLower: teamName.trim().toLowerCase() });
      await setDoc(doc(db, 'users', user!.uid), { teamId, teamCode }, { merge: true });
      setExistingTeam(teamData);
      setPageState('dashboard');
    } catch (err) {
      console.error(err);
      setFormError('Something went wrong. Try again.');
      triggerShake();
    } finally {
      setFormLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(existingTeam?.teamCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const completedCount = existingTeam?.completedStations?.length ?? 0;
  const timerDanger    = timeRemaining < 60 && workshopState.roundActive;
  const timerWarning   = timeRemaining < 30 && workshopState.roundActive;
  const timerColor     = timerDanger ? '#ef4444' : '#a78bfa';

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading || pageState === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-[#030108]">
      <style>{sharedStyles}</style>
      <div className="scanline-bar" />
      <div className="noise-overlay" />
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.15]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)', filter: 'blur(100px)' }} />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-6">
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
        <div className="text-center">
          <p className="text-white font-black text-2xl uppercase tracking-[0.25em]"
            style={{ textShadow: '0 0 20px rgba(124,58,237,0.7)' }}>RISE 2026</p>
          <p className="text-[#7c3aed]/50 font-mono text-xs tracking-[0.4em] mt-2 uppercase">Initializing Session...</p>
        </div>
      </div>
    </div>
  );

  if (!user || role !== 'student') return null;

  // ── FORM page ─────────────────────────────────────────────────────────────
  if (pageState === 'form') return (
    <div id="page-root" className="min-h-screen bg-[#030108] text-white overflow-hidden"
      style={{ fontFamily: "'Arial Narrow','Impact',sans-serif" }}>
      <style>{sharedStyles}</style>
      <div className="scanline-bar" />
      <div className="noise-overlay" />

      {/* Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.13]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #6b21a8, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      {/* Ticker */}
      <div className="w-full overflow-hidden bg-[#7c3aed]/10 border-b border-[#7c3aed]/30 py-1">
        <div className="flex whitespace-nowrap" style={{ animation: 'ticker 30s linear infinite' }}>
          {Array(8).fill(null).map((_, i) => (
            <span key={i} className="text-[#a78bfa] text-xs tracking-widest mx-8 font-mono">
              ◈ RISE 2026 &nbsp;
              ◈ Real-World IoT Systems Exploration &nbsp;
              ◈ Division of AI/ML &nbsp;
              ◈ Karunya Institute &nbsp;
              ◈ 4 Stations &nbsp;
              ◈ Max 1000 pts/station &nbsp;
            </span>
          ))}
        </div>
      </div>

      <div className="relative min-h-[calc(100vh-26px)] flex flex-col lg:flex-row">

        {/* ── LEFT: Branding ── */}
        <div className="lg:w-1/2 flex flex-col items-center justify-center px-8 py-16 lg:py-0 relative border-b lg:border-b-0 lg:border-r border-[#7c3aed]/15">

          <div className="text-center relative z-10">
            {/* Tag */}
            <div className="inline-flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rotate-45 bg-[#7c3aed]" style={{ boxShadow: '0 0 10px #7c3aed' }} />
              <span className="text-[#7c3aed]/60 text-xs uppercase tracking-[0.35em] font-mono">Division of AI/ML Presents</span>
              <div className="w-2 h-2 rotate-45 bg-[#7c3aed]" style={{ boxShadow: '0 0 10px #7c3aed' }} />
            </div>

            {/* Glitch title */}
            <div className={`glitch-wrap ${glitch ? 'glitch-active' : ''}`} data-text="RISE">
              <h1
                className="font-black italic uppercase relative block"
                style={{
                  fontSize: 'clamp(5rem, 18vw, 13rem)',
                  background: 'linear-gradient(160deg, #fdf4ff 0%, #f0abfc 25%, #e879f9 55%, #a855f7 80%, #7c3aed 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  letterSpacing: '-0.03em',
                  lineHeight: 0.9,
                }}
              >RISE</h1>
            </div>

            {/* Slash divider */}
            <div className="flex items-center justify-center gap-1.5 my-5">
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ width: 2, height: 14, background: 'rgba(124,58,237,0.4)', transform: 'skewX(-20deg)', opacity: 1 - i * 0.1 }} />
              ))}
            </div>

            <p className="text-[#7c3aed]/50 text-xs uppercase tracking-[0.35em] font-mono mb-8">
              Real-World IoT Systems Exploration
            </p>

            {/* Stat pills */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {[
                { label: 'Stations', value: '04' },
                { label: 'Format',   value: 'Live' },
                { label: 'Year',     value: '2026' },
              ].map((s) => (
                <div key={s.label} className="relative stat-pill bg-[#0d0014] border border-[#7c3aed]/30 px-6 py-3 text-center">
                  <div className="corner-tl" /><div className="corner-tr" />
                  <div className="corner-bl" /><div className="corner-br" />
                  <p className="text-white font-black text-xl font-mono">{s.value}</p>
                  <p className="text-[#7c3aed]/40 text-xs uppercase tracking-[0.25em] font-mono mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Live badge */}
            <div className="inline-flex items-center gap-2 mt-8 stat-pill bg-[#0d0014] border border-[#7c3aed]/30 px-5 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" style={{ boxShadow: '0 0 8px #4ade80' }} />
              <span className="text-white/30 text-xs font-mono uppercase tracking-widest">Registration Open</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Form ── */}
        <div className="lg:w-1/2 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 lg:py-0">

          {/* Section label */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-5 h-5 rotate-45 flex items-center justify-center"
                style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)' }}>
                <div className="w-2 h-2 bg-[#7c3aed] rotate-45" />
              </div>
              <p className="text-[#7c3aed]/40 text-xs uppercase tracking-[0.4em] font-mono">// Register Squad</p>
            </div>
            <h2 className="text-white font-black text-4xl uppercase tracking-tight leading-none">
              Build Your{' '}
              <span className="text-[#a78bfa]" style={{ textShadow: '0 0 20px rgba(124,58,237,0.5)' }}>Crew</span>
            </h2>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center gap-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{ width: 2, height: 10, background: 'rgba(124,58,237,0.3)', transform: 'skewX(-20deg)' }} />
                ))}
              </div>
              <p className="text-white/25 text-xs font-mono">{user.email}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-7 max-w-md w-full">

            {/* Team Name */}
            <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5">
              <div className="corner-tl" /><div className="corner-tr" />
              <div className="corner-bl" /><div className="corner-br" />
              <label className="text-[#7c3aed]/50 text-xs uppercase tracking-[0.3em] font-mono block mb-3">
                ◈ Team Name <span className="text-[#a78bfa]">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => { setTeamName(e.target.value); setTeamNameError(''); setFormError(''); }}
                  onBlur={() => checkTeamNameUnique(teamName)}
                  placeholder="Name your crew"
                  maxLength={30}
                  className="underline-input text-white text-xl font-black uppercase tracking-wider py-2 pr-16 transition-all duration-200"
                  style={{
                    borderBottom: teamNameError
                      ? '2px solid rgba(248,113,113,0.8)'
                      : '2px solid rgba(124,58,237,0.4)',
                  }}
                  onFocus={(e) => { if (!teamNameError) e.currentTarget.style.borderBottomColor = '#7c3aed'; }}
                  onBlurCapture={(e) => { if (!teamNameError) e.currentTarget.style.borderBottomColor = 'rgba(124,58,237,0.4)'; }}
                />
                <span className="absolute right-0 bottom-2 text-[#7c3aed]/30 text-xs font-mono">{teamName.length}/30</span>
              </div>
              {teamNameError && (
                <p className="text-red-400 text-xs mt-2 font-mono flex items-center gap-2">
                  <span className="font-black">▲</span> {teamNameError}
                </p>
              )}
            </div>

            {/* Members */}
            <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5">
              <div className="corner-tl" /><div className="corner-tr" />
              <div className="corner-bl" /><div className="corner-br" />
              <div className="flex items-center justify-between mb-5">
                <label className="text-[#7c3aed]/50 text-xs uppercase tracking-[0.3em] font-mono">
                  ◈ Squad Members <span className="text-[#a78bfa]">*</span>
                </label>
                {members.length < 3 && (
                  <button type="button" onClick={addMember}
                    className="clip-btn text-xs px-3 py-1 border border-[#7c3aed]/30 bg-[#7c3aed]/10 text-[#a78bfa]">
                    + Add Player
                  </button>
                )}
              </div>

              <div className="space-y-5">
                {members.map((member, index) => (
                  <div key={index} className="flex items-end gap-3">
                    {/* Badge */}
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center font-black text-xs font-mono mb-1"
                      style={{
                        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                        background: index === 0 ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.05)',
                        color: index === 0 ? '#a78bfa' : 'rgba(255,255,255,0.25)',
                      }}
                    >{index + 1}</div>

                    <div className="flex-1 relative">
                      {index === 0 && (
                        <span className="absolute -top-5 left-0 text-xs font-mono uppercase tracking-widest text-[#7c3aed]/60">★ Captain</span>
                      )}
                      <input
                        type="text"
                        value={member}
                        onChange={(e) => { updateMember(index, e.target.value); setFormError(''); }}
                        placeholder={`Player ${index + 1} — Full Name`}
                        maxLength={40}
                        className="underline-input text-white text-sm font-semibold tracking-wide py-2 transition-all duration-200"
                        style={{ borderBottom: '1px solid rgba(124,58,237,0.25)' }}
                        onFocus={(e) => { e.currentTarget.style.borderBottomColor = '#7c3aed'; }}
                        onBlur={(e)  => { e.currentTarget.style.borderBottomColor = 'rgba(124,58,237,0.25)'; }}
                      />
                    </div>

                    {members.length > 2 && (
                      <button type="button" onClick={() => removeMember(index)}
                        className="flex-shrink-0 mb-2 text-red-400/30 hover:text-red-400 transition-colors font-black text-xl leading-none">
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Slot indicator */}
              <div className="flex items-center gap-2 mt-5">
                {[0, 1, 2].map(n => (
                  <div key={n} style={{
                    width: 28, height: 3,
                    background: n < members.length ? '#7c3aed' : 'rgba(255,255,255,0.07)',
                    boxShadow: n < members.length ? '0 0 8px rgba(124,58,237,0.8)' : 'none',
                    clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                    transition: 'all 0.3s',
                  }} />
                ))}
                <span className="text-[#7c3aed]/30 text-xs font-mono ml-1">{members.length}/3</span>
              </div>
            </div>

            {/* Error */}
            {formError && (
              <div className="relative border-l-2 border-red-500/70 bg-red-900/10 py-3 px-5"
                style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}>
                <p className="text-red-300 text-sm font-mono">
                  <span className="text-red-400 font-black mr-2">ERR /</span>{formError}
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={formLoading || !!teamNameError}
              className="clip-btn w-full py-4 text-sm font-black border-2 border-[#7c3aed]/60 bg-[#7c3aed]/20 text-white tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ boxShadow: '0 0 30px rgba(124,58,237,0.2)' }}
            >
              {formLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Registering...
                </span>
              ) : '⚡ LOCK IN & GET CODE'}
            </button>

            {/* Sign out */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={async () => { await signOut(auth); router.replace('/login'); }}
                className="text-[#7c3aed]/40 hover:text-[#7c3aed] text-xs font-mono uppercase tracking-widest transition-colors"
              >
                ← Sign Out
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  const totalAttempts =
    (existingTeam?.station1Attempts || 0) + (existingTeam?.station2Attempts || 0) +
    (existingTeam?.station3Attempts || 0) + (existingTeam?.station4Attempts || 0);

  return (
    <div id="page-root" className="min-h-screen bg-[#030108] text-white overflow-x-hidden"
      style={{ fontFamily: "'Arial Narrow','Impact',sans-serif" }}>
      <style>{sharedStyles}</style>
      <div className="scanline-bar" />
      <div className="noise-overlay" />

      {/* Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.13]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #6b21a8, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      {/* ── TICKER ── */}
      <div className="w-full overflow-hidden bg-[#7c3aed]/10 border-b border-[#7c3aed]/30 py-1">
        <div className="flex whitespace-nowrap" style={{ animation: 'ticker 30s linear infinite' }}>
          {Array(6).fill(null).map((_, i) => (
            <span key={i} className="text-[#a78bfa] text-xs tracking-widest mx-8 font-mono">
              ◈ RISE 2026 &nbsp;
              ◈ TEAM: {existingTeam?.teamName} &nbsp;
              ◈ CODE: {existingTeam?.teamCode} &nbsp;
              ◈ SCORE: {existingTeam?.totalScore ?? 0} PTS &nbsp;
              ◈ {completedCount}/4 STATIONS DONE &nbsp;
              ◈ {workshopState.roundActive ? `ROUND LIVE — ${formatTime(timeRemaining)}` : 'ROUND IDLE'} &nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* ── HEADER ── */}
      <div className="relative px-4 sm:px-6 pt-5 pb-4 border-b border-[#7c3aed]/20">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <div className={`glitch-wrap ${glitch ? 'glitch-active' : ''}`} data-text="">
              <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-[0.15em] text-white"
                style={{ textShadow: '0 0 30px rgba(124,58,237,0.5)' }}>
                RISE 2026
              </h1>
            </div>
            <p className="text-[#7c3aed]/70 text-xs tracking-[0.3em] mt-1 font-mono">
              EMERGENCY TASKS WORKSHOP — KARUNYA INSTITUTE
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Live indicator */}
            {workshopState.roundActive && (
              <div className="flex items-center gap-2 stat-pill bg-green-900/20 border border-green-500/40 px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-xs font-mono tracking-widest">ROUND LIVE</span>
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

        {/* Stat pills row */}
        <div className="flex gap-3 mt-4 flex-wrap max-w-5xl mx-auto">
          {[
            { label: 'TEAM',     value: existingTeam?.teamName ?? '—' },
            { label: 'SCORE',    value: `${existingTeam?.totalScore ?? 0} PTS` },
            { label: 'DONE',     value: `${completedCount}/4` },
            { label: 'ATTEMPTS', value: String(totalAttempts) },
            { label: 'STATION',  value: workshopState.activeStation ? `S${workshopState.activeStation} — ${STATION_NAMES[workshopState.activeStation]}` : 'IDLE' },
          ].map((s) => (
            <div key={s.label} className="stat-pill bg-[#0d0014] border border-[#7c3aed]/30 px-4 py-1.5">
              <span className="text-[#7c3aed]/50 text-xs font-mono tracking-widest">{s.label} </span>
              <span className="text-sm font-black text-white">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">

        {/* ── ACTIVE ROUND TIMER BANNER ── */}
        {workshopState.roundActive && workshopState.activeStation && (
          <div className="relative border border-[#7c3aed]/40 bg-[#0a0015] p-5 overflow-hidden">
            <div className="corner-tl" /><div className="corner-tr" />
            <div className="corner-bl" /><div className="corner-br" />
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.07) 0%, transparent 70%)' }} />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-[#7c3aed]/50 text-xs font-mono tracking-[0.3em] uppercase mb-1">
                  ◈ ROUND IN PROGRESS — STATION {workshopState.activeStation}: {STATION_NAMES[workshopState.activeStation]}
                </p>
                <p className="text-white/40 text-xs font-mono">
                  {timerDanger ? '⚠ HURRY UP! ' : ''} Submit your answer before time runs out
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div
                  className="font-black font-mono tracking-widest text-5xl sm:text-6xl"
                  style={{
                    color: timerColor,
                    textShadow: `0 0 30px ${timerDanger ? 'rgba(239,68,68,0.6)' : 'rgba(167,139,250,0.4)'}`,
                    animation: timerWarning ? 'blink 1s step-end infinite' : 'none',
                  }}
                >
                  {formatTime(timeRemaining)}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-[#7c3aed]/10 relative mt-4 h-1">
              <div className="h-full transition-all duration-1000"
                style={{
                  width: workshopState.roundTimeLimit > 0
                    ? `${(timeRemaining / workshopState.roundTimeLimit) * 100}%` : '100%',
                  background: timerDanger ? '#ef4444' : '#7c3aed',
                  boxShadow: `0 0 8px ${timerDanger ? '#ef4444' : '#7c3aed'}`,
                }}
              />
            </div>
          </div>
        )}

        {/* ── TEAM CODE CARD ── */}
        <div className="relative border border-[#7c3aed]/30 bg-[#0a0015] p-5 sm:p-8 overflow-hidden">
          <div className="corner-tl" /><div className="corner-tr" />
          <div className="corner-bl" /><div className="corner-br" />
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at left, rgba(124,58,237,0.06) 0%, transparent 60%)' }} />
          <div className="absolute top-0 right-0 w-40 h-full pointer-events-none opacity-30"
            style={{ background: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(124,58,237,0.05) 6px, rgba(124,58,237,0.05) 12px)' }} />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <p className="text-[#7c3aed]/40 text-xs font-mono uppercase tracking-[0.4em] mb-2">◈ Your Access Code</p>
              <div
                className="font-black font-mono tracking-[0.15em] leading-none"
                style={{
                  fontSize: 'clamp(2.5rem, 8vw, 5rem)',
                  color: '#a78bfa',
                  textShadow: '0 0 30px rgba(167,139,250,0.6), 0 0 60px rgba(124,58,237,0.3)',
                }}
              >{existingTeam?.teamCode}</div>
              <p className="text-white/15 text-xs font-mono mt-3 uppercase tracking-wider">
                Enter this code in every station sketch
              </p>
            </div>

            <button
              onClick={handleCopy}
              className="clip-btn self-start sm:self-center py-3 px-6 text-sm font-black border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa]"
              style={copied ? { borderColor: 'rgba(74,222,128,0.5)', color: '#4ade80' } : {}}
            >
              {copied ? '✓ COPIED!' : '⎘ COPY CODE'}
            </button>
          </div>
        </div>

        {/* ── STATION GRID ── */}
        <div>
          <p className="text-[#7c3aed]/40 text-xs font-mono uppercase tracking-[0.35em] mb-4">◈ Station Progress</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((station) => {
              const score     = existingTeam?.[`station${station}Score` as keyof TeamData] as number || 0;
              const attempts  = existingTeam?.[`station${station}Attempts` as keyof TeamData] as number || 0;
              const completed = existingTeam?.completedStations?.includes(station);
              const isActive  = workshopState.activeStation === station && workshopState.roundActive;

              return (
                <div
                  key={station}
                  className={`relative py-6 sm:py-8 px-4 text-center overflow-hidden ${completed ? 'station-unlock' : ''}`}
                  style={{
                    background: completed
                      ? 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(107,33,168,0.06))'
                      : isActive
                        ? 'rgba(124,58,237,0.07)'
                        : 'rgba(255,255,255,0.015)',
                    border: completed
                      ? '1px solid rgba(167,139,250,0.5)'
                      : isActive
                        ? '1px solid rgba(124,58,237,0.5)'
                        : '1px solid rgba(255,255,255,0.06)',
                    clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
                  }}
                >
                  {/* Corner brackets */}
                  <span className="absolute pointer-events-none" style={{ top: 0, left: 0, width: 10, height: 10, borderTop: `1px solid ${completed ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`, borderLeft: `1px solid ${completed ? '#a78bfa' : 'rgba(255,255,255,0.1)'}` }} />
                  <span className="absolute pointer-events-none" style={{ top: 0, right: 0, width: 10, height: 10, borderTop: `1px solid ${completed ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`, borderRight: `1px solid ${completed ? '#a78bfa' : 'rgba(255,255,255,0.1)'}` }} />
                  <span className="absolute pointer-events-none" style={{ bottom: 0, left: 0, width: 10, height: 10, borderBottom: `1px solid ${completed ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`, borderLeft: `1px solid ${completed ? '#a78bfa' : 'rgba(255,255,255,0.1)'}` }} />
                  <span className="absolute pointer-events-none" style={{ bottom: 0, right: 0, width: 10, height: 10, borderBottom: `1px solid ${completed ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`, borderRight: `1px solid ${completed ? '#a78bfa' : 'rgba(255,255,255,0.1)'}` }} />

                  {isActive && (
                    <div className="absolute top-2 right-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" style={{ boxShadow: '0 0 6px #4ade80' }} />
                    </div>
                  )}

                  {/* Completed glow */}
                  {completed && (
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ background: 'radial-gradient(ellipse at center, rgba(167,139,250,0.08) 0%, transparent 70%)' }} />
                  )}

                  <p className="text-xs font-mono uppercase tracking-[0.3em] mb-2"
                    style={{ color: completed ? 'rgba(167,139,250,0.7)' : isActive ? 'rgba(124,58,237,0.7)' : 'rgba(255,255,255,0.18)' }}>
                    STN-0{station}
                  </p>
                  <p className="text-xs font-mono uppercase tracking-widest mb-3"
                    style={{ color: completed ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)' }}>
                    {STATION_NAMES[station]}
                  </p>

                  <p className="font-black font-mono leading-none mb-3"
                    style={{
                      fontSize: 'clamp(1.8rem, 5vw, 2.5rem)',
                      color: completed ? '#a78bfa' : 'rgba(255,255,255,0.08)',
                      textShadow: completed ? '0 0 30px rgba(167,139,250,0.6)' : 'none',
                    }}>
                    {score > 0 ? score : '—'}
                  </p>

                  <div className="inline-block px-3 py-0.5 text-xs font-black uppercase tracking-widest"
                    style={{
                      background: completed ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                      border: completed ? '1px solid rgba(167,139,250,0.4)' : '1px solid rgba(255,255,255,0.06)',
                      clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                      color: completed ? '#a78bfa' : 'rgba(255,255,255,0.12)',
                    }}>
                    {completed ? 'DONE ✓' : isActive ? '● LIVE' : 'LOCKED'}
                  </div>

                  {attempts > 0 && !completed && (
                    <div className="mt-2 text-yellow-500/50 text-[10px] font-mono tracking-widest">{attempts}x attempts</div>
                  )}
                  {completed && attempts > 1 && (
                    <div className="mt-2 text-[#7c3aed]/40 text-[10px] font-mono tracking-widest">{attempts} attempts</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── TOTAL SCORE ── */}
        <div className="relative border border-[#7c3aed]/30 bg-[#0a0015] py-6 sm:py-8 px-5 sm:px-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 overflow-hidden">
          <div className="corner-tl" /><div className="corner-tr" />
          <div className="corner-bl" /><div className="corner-br" />
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at left, rgba(124,58,237,0.07) 0%, transparent 60%)' }} />
          <div className="absolute top-0 right-0 w-40 h-full pointer-events-none opacity-30"
            style={{ background: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(124,58,237,0.06) 6px, rgba(124,58,237,0.06) 12px)' }} />

          <div className="relative z-10">
            <p className="text-[#7c3aed]/40 text-xs font-mono uppercase tracking-[0.4em] mb-1">◈ Total Score</p>
            <div className="font-black font-mono leading-none"
              style={{
                fontSize: 'clamp(3rem, 10vw, 6rem)',
                color: '#a78bfa',
                textShadow: '0 0 40px rgba(167,139,250,0.5), 0 0 80px rgba(124,58,237,0.2)',
              }}>
              {existingTeam?.totalScore ?? 0}
              <span className="ml-2 text-[#7c3aed]/35" style={{ fontSize: '1.5rem' }}>PTS</span>
            </div>
          </div>

          <div className="relative z-10 flex gap-6">
            <div className="text-center">
              <p className="font-black text-3xl text-[#a78bfa] font-mono">{completedCount}</p>
              <p className="text-[#7c3aed]/30 text-xs uppercase tracking-widest font-mono mt-0.5">Done</p>
            </div>
            <div className="w-px self-stretch"
              style={{ background: 'linear-gradient(to bottom, transparent, rgba(124,58,237,0.3), transparent)' }} />
            <div className="text-center">
              <p className="font-black text-3xl font-mono text-white/20">{4 - completedCount}</p>
              <p className="text-[#7c3aed]/30 text-xs uppercase tracking-widest font-mono mt-0.5">Left</p>
            </div>
            <div className="w-px self-stretch"
              style={{ background: 'linear-gradient(to bottom, transparent, rgba(124,58,237,0.3), transparent)' }} />
            <div className="text-center">
              <p className="font-black text-3xl font-mono text-yellow-500/60">{totalAttempts}</p>
              <p className="text-[#7c3aed]/30 text-xs uppercase tracking-widest font-mono mt-0.5">Tries</p>
            </div>
          </div>
        </div>

        {/* ── TEAM MEMBERS ── */}
        <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5">
          <div className="corner-tl" /><div className="corner-tr" />
          <div className="corner-bl" /><div className="corner-br" />
          <p className="text-[#7c3aed]/50 text-xs tracking-[0.3em] font-mono mb-4">◈ SQUAD MEMBERS</p>
          <div className="flex flex-wrap gap-2">
            {existingTeam?.members?.map((m, i) => (
              <div key={i} className="stat-pill bg-[#0d0014] border border-[#7c3aed]/20 px-4 py-2 flex items-center gap-2">
                <span className="text-[#7c3aed]/50 text-xs font-mono">{i === 0 ? '★' : `${i + 1}.`}</span>
                <span className="text-white font-black text-sm uppercase tracking-wide">{m}</span>
                {i === 0 && <span className="text-[#7c3aed]/40 text-[10px] font-mono">CAPTAIN</span>}
              </div>
            ))}
          </div>
        </div>

      

      </div>
    </div>
  );
}
