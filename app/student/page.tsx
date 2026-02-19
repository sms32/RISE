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
  totalScore: number;
  completedStations: number[];
}

// ── Global styles injected once ───────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    /* Hide scrollbar everywhere */
    *, *::-webkit-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
    *::-webkit-scrollbar { display: none; }

    /* Custom font stack — angular, condensed */
    :root { font-family: 'Arial Narrow', 'Impact', 'Haettenschweiler', Arial, sans-serif; }

    /* ── Animations ── */
    @keyframes scanMove {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }
    @keyframes ticker {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    @keyframes pulseGlow {
      0%, 100% { filter: drop-shadow(0 0 18px rgba(232,121,249,0.5)) drop-shadow(0 0 50px rgba(168,85,247,0.3)); }
      50% { filter: drop-shadow(0 0 40px rgba(232,121,249,1)) drop-shadow(0 0 100px rgba(168,85,247,0.6)); }
    }
    @keyframes floatY {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
    }

    /* Glitch on the RISE title */
    @keyframes glitchMain {
      0%,89%,100% { transform: skewX(0deg); opacity: 1; }
      90% { transform: skewX(-3deg) translateX(-4px); opacity: 0.9; }
      91% { transform: skewX(4deg) translateX(6px); opacity: 0.85; }
      92% { transform: skewX(0deg); opacity: 1; }
      95% { transform: skewX(-2deg) translateX(-2px); }
      96% { transform: skewX(0deg); }
    }
    @keyframes glitchSlice1 {
      0%,89%,100% { opacity: 0; transform: translate(0,0); }
      90% { opacity: 0.7; clip-path: polygon(0 15%, 100% 15%, 100% 35%, 0 35%); transform: translate(-8px, 0); }
      91% { opacity: 0.5; clip-path: polygon(0 55%, 100% 55%, 100% 70%, 0 70%); transform: translate(8px, 0); }
      92% { opacity: 0; }
    }
    @keyframes glitchSlice2 {
      0%,93%,100% { opacity: 0; transform: translate(0,0); }
      94% { opacity: 0.6; clip-path: polygon(0 40%, 100% 40%, 100% 55%, 0 55%); transform: translate(6px, -2px); color: #00ffff; }
      95% { opacity: 0; }
    }

    /* Page shake — subtle, triggered by class */
    @keyframes pageShake {
      0%,100% { transform: translate(0,0) rotate(0deg); }
      10% { transform: translate(-2px, 1px) rotate(-0.2deg); }
      20% { transform: translate(2px, -1px) rotate(0.2deg); }
      30% { transform: translate(-1px, 2px) rotate(-0.1deg); }
      40% { transform: translate(1px, -2px) rotate(0.1deg); }
      50% { transform: translate(-2px, 0px) rotate(-0.2deg); }
      60% { transform: translate(2px, 1px) rotate(0.2deg); }
      70% { transform: translate(-1px, -1px); }
      80% { transform: translate(1px, 1px); }
      90% { transform: translate(0, -1px); }
    }
    .shake { animation: pageShake 0.5s ease both; }

    /* Station tile unlock pulse */
    @keyframes unlockPulse {
      0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.6); }
      70% { box-shadow: 0 0 0 16px rgba(74,222,128,0); }
      100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
    }
    .station-done { animation: unlockPulse 1.5s ease-out; }

    /* Diagonal stripe bg pattern */
    .stripe-bg {
      background-image: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 8px,
        rgba(232,121,249,0.015) 8px,
        rgba(232,121,249,0.015) 16px
      );
    }

    /* Scanlines overlay */
    .scanlines::after {
      content: '';
      position: fixed;
      inset: 0;
      background-image: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 3px,
        rgba(0,0,0,0.07) 3px,
        rgba(0,0,0,0.07) 4px
      );
      pointer-events: none;
      z-index: 999;
    }

    /* Clipped input underline focus */
    .underline-input:focus { outline: none; }

    /* Score counter pulse */
    @keyframes scorePop {
      0% { transform: scale(1); }
      40% { transform: scale(1.08); }
      100% { transform: scale(1); }
    }
    .score-pop { animation: scorePop 0.4s cubic-bezier(0.34,1.56,0.64,1); }

    /* Shimmer sweep */
    @keyframes shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    .shimmer-text {
      background: linear-gradient(105deg, #f0abfc 30%, #ffffff 50%, #f0abfc 70%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: shimmer 4s linear infinite;
    }

    /* Noise overlay for texture */
    .noise::before {
      content: '';
      position: fixed;
      inset: 0;
      opacity: 0.03;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      background-size: 128px 128px;
      pointer-events: none;
      z-index: 998;
    }

    /* Corner bracket animated border */
    @keyframes cornerPulse {
      0%,100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
    .corner-pulse { animation: cornerPulse 2s ease-in-out infinite; }

    /* Loader ring spin */
    @keyframes spinCW { to { transform: rotate(360deg); } }
    @keyframes spinCCW { to { transform: rotate(-360deg); } }
  `}</style>
);

// ── Corner brackets component ─────────────────────────────────────────────────
const Corners = ({
  size = 14,
  thickness = 2,
  color = 'rgba(232,121,249,0.6)',
  pulse = false,
}: {
  size?: number;
  thickness?: number;
  color?: string;
  pulse?: boolean;
}) => {
  const s = `${size}px`;
  const b = `${thickness}px solid ${color}`;
  const cls = `absolute pointer-events-none ${pulse ? 'corner-pulse' : ''}`;
  return (
    <>
      <span className={cls} style={{ top: 0, left: 0, width: s, height: s, borderTop: b, borderLeft: b }} />
      <span className={cls} style={{ top: 0, right: 0, width: s, height: s, borderTop: b, borderRight: b }} />
      <span className={cls} style={{ bottom: 0, left: 0, width: s, height: s, borderBottom: b, borderLeft: b }} />
      <span className={cls} style={{ bottom: 0, right: 0, width: s, height: s, borderBottom: b, borderRight: b }} />
    </>
  );
};

// ── Diagonal slash divider ────────────────────────────────────────────────────
const SlashDivider = () => (
  <div className="flex items-center gap-2 my-1">
    {[...Array(6)].map((_, i) => (
      <div
        key={i}
        style={{
          width: 2,
          height: 16,
          background: 'rgba(232,121,249,0.3)',
          transform: 'skewX(-20deg)',
          opacity: 1 - i * 0.12,
        }}
      />
    ))}
  </div>
);

// ── RISE glitch title ─────────────────────────────────────────────────────────
const GlitchTitle = () => (
  <div className="relative inline-block select-none" style={{ lineHeight: 0.85 }}>
    {/* Cyan ghost slice */}
    <span
      aria-hidden
      className="absolute inset-0 font-black italic uppercase"
      style={{
        fontSize: 'clamp(5.5rem, 20vw, 14rem)',
        WebkitTextFillColor: 'cyan',
        color: 'cyan',
        animation: 'glitchSlice2 7s infinite',
        letterSpacing: '-0.03em',
      }}
    >RISE</span>

    {/* Pink ghost slice */}
    <span
      aria-hidden
      className="absolute inset-0 font-black italic uppercase"
      style={{
        fontSize: 'clamp(5.5rem, 20vw, 14rem)',
        WebkitTextFillColor: '#ff00ff',
        color: '#ff00ff',
        animation: 'glitchSlice1 6s infinite',
        letterSpacing: '-0.03em',
      }}
    >RISE</span>

    {/* Main */}
    <span
      className="relative block font-black italic uppercase"
      style={{
        fontSize: 'clamp(5.5rem, 20vw, 14rem)',
        background: 'linear-gradient(160deg, #fdf4ff 0%, #f0abfc 25%, #e879f9 55%, #a855f7 80%, #7c3aed 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        letterSpacing: '-0.03em',
        animation: 'glitchMain 6s infinite, pulseGlow 3s ease-in-out infinite, floatY 5s ease-in-out infinite',
      }}
    >RISE</span>
  </div>
);

// ── Ticker bar ────────────────────────────────────────────────────────────────
const Ticker = ({ text }: { text: string }) => (
  <div
    className="fixed top-0 left-0 right-0 z-50 overflow-hidden"
    style={{ height: 26, background: 'rgba(0,0,0,0.92)', borderBottom: '1px solid rgba(232,121,249,0.2)' }}
  >
    <div
      className="flex gap-16 whitespace-nowrap items-center h-full text-xs font-mono uppercase tracking-[0.25em]"
      style={{ animation: 'ticker 18s linear infinite', width: 'max-content', color: 'rgba(232,121,249,0.4)' }}
    >
      {Array(10).fill(text).map((t, i) => <span key={i}>{t}</span>)}
    </div>
  </div>
);

// ── Moving scan beam ──────────────────────────────────────────────────────────
const ScanBeam = () => (
  <div
    className="fixed left-0 right-0 pointer-events-none z-40"
    style={{
      height: 2,
      background: 'linear-gradient(90deg, transparent 0%, rgba(232,121,249,0.6) 30%, rgba(255,255,255,0.8) 50%, rgba(232,121,249,0.6) 70%, transparent 100%)',
      animation: 'scanMove 9s linear infinite',
      boxShadow: '0 0 20px rgba(232,121,249,0.5)',
    }}
  />
);

// ── Clipped button ────────────────────────────────────────────────────────────
const ClipButton = ({
  onClick,
  disabled,
  children,
  variant = 'primary',
  className = '',
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'ghost';
  className?: string;
}) => {
  const ref = useRef<HTMLButtonElement>(null);

  const triggerShake = () => {
    const el = document.getElementById('page-root');
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth; // reflow
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
  };

  return (
    <button
      ref={ref}
      onClick={() => { onClick?.(); }}
      disabled={disabled}
      className={`relative overflow-hidden font-black uppercase tracking-[0.2em] text-sm transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
      style={{
        clipPath: 'polygon(14px 0%, 100% 0%, calc(100% - 14px) 100%, 0% 100%)',
        background: variant === 'primary'
          ? 'linear-gradient(135deg, #c026d3 0%, #9333ea 100%)'
          : 'rgba(232,121,249,0.08)',
        border: variant === 'primary'
          ? 'none'
          : '1px solid rgba(232,121,249,0.25)',
        color: '#fff',
        boxShadow: variant === 'primary' && !disabled
          ? '0 0 40px rgba(192,38,211,0.5), 0 0 80px rgba(168,85,247,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
          : 'none',
        padding: '14px 32px',
      }}
      onMouseEnter={(e) => {
        if (!disabled && variant === 'primary') {
          e.currentTarget.style.boxShadow = '0 0 60px rgba(192,38,211,0.8), 0 0 120px rgba(168,85,247,0.4)';
          e.currentTarget.style.transform = 'translateY(-2px) scaleX(1.01)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = variant === 'primary'
          ? '0 0 40px rgba(192,38,211,0.5), 0 0 80px rgba(168,85,247,0.2)'
          : 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* shimmer sweep */}
      <span
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)',
          backgroundSize: '200% 100%',
          animation: variant === 'primary' ? 'shimmer 3s linear infinite' : 'none',
        }}
      />
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};

// ── Stat diamond ──────────────────────────────────────────────────────────────
const StatPill = ({ label, value }: { label: string; value: string }) => (
  <div className="relative px-6 py-3 flex flex-col items-center" style={{ background: 'rgba(232,121,249,0.04)', border: '1px solid rgba(232,121,249,0.14)' }}>
    <Corners size={10} color="rgba(232,121,249,0.5)" pulse />
    <p className="text-white font-black text-xl leading-none" style={{ fontFamily: 'monospace' }}>{value}</p>
    <p className="text-fuchsia-400/40 text-xs uppercase tracking-[0.25em] mt-0.5 font-mono">{label}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

export default function StudentPage() {
  const { user, role, loading } = useAuth('student');
  const router = useRouter();

  const [pageState, setPageState] = useState<'loading' | 'form' | 'dashboard'>('loading');
  const [existingTeam, setExistingTeam] = useState<TeamData | null>(null);
  const [teamName, setTeamName] = useState('');
  const [members, setMembers] = useState<string[]>(['', '']);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [teamNameError, setTeamNameError] = useState('');
  const [copied, setCopied] = useState(false);

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

  const addMember = () => { if (members.length < 3) setMembers([...members, '']); };
  const removeMember = (i: number) => { if (members.length > 2) setMembers(members.filter((_, idx) => idx !== i)); };
  const updateMember = (i: number, v: string) => { const u = [...members]; u[i] = v; setMembers(u); };

  const checkTeamNameUnique = async (name: string) => {
    if (!name.trim()) return;
    const res = await getDocs(query(collection(db, 'teams'), where('teamNameLower', '==', name.trim().toLowerCase())));
    setTeamNameError(res.empty ? '' : 'Team name already taken.');
  };

  const validateForm = (): boolean => {
    if (!teamName.trim()) { setFormError('Team name is required.'); return false; }
    if (teamName.trim().length < 3) { setFormError('Min 3 characters.'); return false; }
    if (teamNameError) { setFormError('Fix the team name error first.'); return false; }
    if (members.some(m => !m.trim())) { setFormError('Fill all member names.'); return false; }
    if (members.some(m => m.trim().length < 2)) { setFormError('Min 2 chars per name.'); return false; }
    if (new Set(members.map(m => m.trim().toLowerCase())).size !== members.length) {
      setFormError('Duplicate names found.'); return false;
    }
    return true;
  };

  const triggerShake = () => {
    const el = document.getElementById('page-root');
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
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
      const teamId = `${teamCode}-${user!.uid.slice(0, 6)}`;
      const teamData: TeamData = {
        teamName: teamName.trim(), teamCode,
        members: members.map(m => m.trim()),
        ownerUid: user!.uid, ownerEmail: user!.email!,
        createdAt: new Date().toISOString(),
        station1Score: 0, station2Score: 0, station3Score: 0, station4Score: 0,
        totalScore: 0, completedStations: [],
      };
      await setDoc(doc(db, 'teams', teamId), { ...teamData, teamNameLower: teamName.trim().toLowerCase(), teamId });
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
    triggerShake();
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── LOADING ─────────────────────────────────────────────────────────────
  if (loading || pageState === 'loading') {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden scanlines noise">
        <GlobalStyles />
        <div className="absolute w-[900px] h-[900px] rounded-full bg-fuchsia-700/20 blur-[220px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-purple-800/25 blur-[130px] -top-20 -right-20" />
        <div className="absolute w-[300px] h-[300px] rounded-full bg-pink-700/20 blur-[100px] -bottom-20 -left-20" />
        <ScanBeam />

        <div className="relative z-10 flex flex-col items-center gap-8">
          {/* Multi-ring loader */}
          <div className="relative w-28 h-28 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-fuchsia-500/10 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-0 rounded-full border-2 border-transparent"
              style={{ borderTopColor: '#e879f9', borderRightColor: 'rgba(232,121,249,0.2)', animation: 'spinCW 1.4s linear infinite' }} />
            <div className="absolute inset-3 rounded-full border-2 border-transparent"
              style={{ borderBottomColor: '#a855f7', borderLeftColor: 'rgba(168,85,247,0.2)', animation: 'spinCCW 1.0s linear infinite' }} />
            <div className="absolute inset-6 rounded-full border border-transparent"
              style={{ borderTopColor: '#c026d3', animation: 'spinCW 0.7s linear infinite' }} />
            {/* Center dot */}
            <div className="w-4 h-4 rounded-full bg-white"
              style={{ boxShadow: '0 0 20px #e879f9, 0 0 60px #a855f7, 0 0 100px rgba(168,85,247,0.5)' }} />
          </div>

          <div className="text-center space-y-2">
            <p
              className="font-black italic uppercase text-4xl tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #fdf4ff, #e879f9, #a855f7)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 20px rgba(232,121,249,0.7))',
              }}
            >RISE</p>
            <SlashDivider />
            <p className="text-fuchsia-400/50 font-mono text-xs uppercase tracking-[0.4em]">Initializing Session</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user || role !== 'student') return null;

  // ─── FORM ─────────────────────────────────────────────────────────────────
  if (pageState === 'form') {
    return (
      <div id="page-root" className="fixed inset-0 bg-black overflow-y-auto stripe-bg scanlines noise">
        <GlobalStyles />

        {/* Smoke */}
        <div className="fixed w-[700px] h-[700px] rounded-full bg-fuchsia-700/18 blur-[180px] -top-64 -left-64 pointer-events-none" />
        <div className="fixed w-[500px] h-[500px] rounded-full bg-purple-900/22 blur-[140px] -bottom-48 -right-48 pointer-events-none" />
        <div className="fixed w-[250px] h-[250px] rounded-full bg-pink-600/12 blur-[90px] top-1/3 right-1/4 pointer-events-none" />

        <Ticker text="★ RISE 2026  ·  Real-World IoT Systems Exploration  ·  Division of AI/ML  ·  Karunya Institute  ·" />
        <ScanBeam />

        <div className="relative z-10 min-h-screen flex flex-col lg:flex-row pt-[26px]">

          {/* ── LEFT: Branding ── */}
          <div className="lg:w-1/2 flex flex-col items-center justify-center px-8 py-16 lg:py-0 relative">

            {/* Diagonal accent lines */}
            <div className="absolute top-1/4 left-0 w-full h-px pointer-events-none hidden lg:block"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(232,121,249,0.12), transparent)', transform: 'rotate(-8deg)' }} />
            <div className="absolute bottom-1/3 left-0 w-full h-px pointer-events-none hidden lg:block"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.1), transparent)', transform: 'rotate(-8deg)' }} />

            <div className="text-center relative">
              {/* Event tag */}
              <div className="inline-flex items-center gap-2 mb-5">
                <div className="w-2 h-2 rotate-45 bg-fuchsia-500" style={{ boxShadow: '0 0 10px #e879f9' }} />
                <span className="text-fuchsia-400/60 text-xs uppercase tracking-[0.35em] font-mono">Division of AI/ML Presents</span>
                <div className="w-2 h-2 rotate-45 bg-fuchsia-500" style={{ boxShadow: '0 0 10px #e879f9' }} />
              </div>

              <GlitchTitle />

              {/* Slash rows below title */}
              <div className="flex justify-center mt-2 mb-5">
                <SlashDivider />
              </div>

              <p className="text-xs uppercase tracking-[0.35em] font-mono mb-8" style={{ color: 'rgba(232,121,249,0.45)' }}>
                Real-World IoT Systems Exploration
              </p>

              {/* Stat pills */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <StatPill label="Stations" value="04" />
                <StatPill label="Format" value="Live" />
                <StatPill label="Year" value="2026" />
              </div>

              {/* Bottom angular badge */}
              <div
                className="inline-flex items-center gap-2 mt-8 px-5 py-2"
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  border: '1px solid rgba(232,121,249,0.15)',
                  clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)',
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" style={{ boxShadow: '0 0 8px #4ade80' }} />
                <span className="text-white/30 text-xs font-mono uppercase tracking-widest">Registration Open</span>
              </div>
            </div>

            {/* Vertical separator */}
            <div
              className="hidden lg:block absolute right-0 top-1/4 bottom-1/4 w-px"
              style={{ background: 'linear-gradient(to bottom, transparent, rgba(232,121,249,0.25) 30%, rgba(232,121,249,0.25) 70%, transparent)' }}
            />
            {/* Diagonal chevron at separator midpoint */}
            <div
              className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2"
              style={{
                width: 10, height: 10,
                background: '#e879f9',
                transform: 'translateY(-50%) translateX(50%) rotate(45deg)',
                boxShadow: '0 0 12px #e879f9',
              }}
            />
          </div>

          {/* ── RIGHT: Form ── */}
          <div className="lg:w-1/2 flex flex-col justify-center px-6 sm:px-14 lg:px-16 py-16 lg:py-0">

            {/* Section label */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-6 h-6 rotate-45 flex items-center justify-center"
                  style={{ background: 'rgba(232,121,249,0.15)', border: '1px solid rgba(232,121,249,0.4)' }}
                >
                  <div className="w-2 h-2 bg-fuchsia-400 rotate-45" />
                </div>
                <p className="text-white/20 text-xs uppercase tracking-[0.4em] font-mono">// Register Squad</p>
              </div>
              <h2 className="text-white font-black text-4xl uppercase tracking-tight leading-none">
                Build Your{' '}
                <span
                  className="shimmer-text"
                  style={{ fontStyle: 'italic' }}
                >
                  Crew
                </span>
              </h2>
              <div className="flex items-center gap-2 mt-3">
                <SlashDivider />
                <p className="text-white/25 text-xs font-mono">{user.email}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8 max-w-md">

              {/* Team Name */}
              <div>
                <label className="text-fuchsia-300/50 text-xs uppercase tracking-[0.3em] font-mono block mb-3">
                  ◈ Team Name <span className="text-pink-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => { setTeamName(e.target.value); setTeamNameError(''); setFormError(''); }}
                    onBlur={() => checkTeamNameUnique(teamName)}
                    placeholder="Name your crew"
                    maxLength={30}
                    className="underline-input w-full bg-transparent text-white placeholder-white/15 text-xl font-black uppercase tracking-wider py-3 pr-16 transition-all duration-200"
                    style={{
                      borderBottom: teamNameError
                        ? '2px solid rgba(248,113,113,0.8)'
                        : '2px solid rgba(232,121,249,0.3)',
                    }}
                    onFocus={(e) => {
                      if (!teamNameError) e.currentTarget.style.borderBottomColor = '#e879f9';
                    }}
                    onBlurCapture={(e) => {
                      if (!teamNameError) e.currentTarget.style.borderBottomColor = 'rgba(232,121,249,0.3)';
                    }}
                  />
                  <span className="absolute right-0 bottom-3 text-white/20 text-xs font-mono">{teamName.length}/30</span>
                </div>
                {teamNameError && (
                  <p className="text-red-400 text-xs mt-2 font-mono flex items-center gap-2">
                    <span className="text-red-400 font-black">▲</span> {teamNameError}
                  </p>
                )}
              </div>

              {/* Members */}
              <div>
                <div className="flex items-center justify-between mb-5">
                  <label className="text-fuchsia-300/50 text-xs uppercase tracking-[0.3em] font-mono">
                    ◈ Squad Members <span className="text-pink-400">*</span>
                  </label>
                  {members.length < 3 && (
                    <button
                      type="button"
                      onClick={addMember}
                      className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest transition-colors font-mono"
                      style={{ color: 'rgba(232,121,249,0.7)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#e879f9'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(232,121,249,0.7)'; }}
                    >
                      <span className="text-base leading-none">＋</span> Add Player
                    </button>
                  )}
                </div>

                <div className="space-y-6">
                  {members.map((member, index) => (
                    <div key={index} className="flex items-end gap-4">
                      {/* Hexagon badge */}
                      <div
                        className="flex-shrink-0 w-10 h-10 flex items-center justify-center font-black text-sm mb-1"
                        style={{
                          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                          background: index === 0
                            ? 'linear-gradient(135deg, rgba(232,121,249,0.4), rgba(168,85,247,0.4))'
                            : 'rgba(255,255,255,0.05)',
                          border: 'none',
                          color: index === 0 ? '#fff' : 'rgba(255,255,255,0.25)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {index + 1}
                      </div>

                      <div className="flex-1 relative">
                        {index === 0 && (
                          <span
                            className="absolute -top-5 left-0 text-xs font-mono uppercase tracking-widest"
                            style={{ color: 'rgba(232,121,249,0.5)' }}
                          >
                            ★ Captain
                          </span>
                        )}
                        <input
                          type="text"
                          value={member}
                          onChange={(e) => { updateMember(index, e.target.value); setFormError(''); }}
                          placeholder={`Player ${index + 1} — Full Name`}
                          maxLength={40}
                          className="underline-input w-full bg-transparent text-white placeholder-white/15 text-sm font-semibold tracking-wide py-2.5 transition-all duration-200"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', letterSpacing: '0.05em' }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderBottomColor = 'rgba(232,121,249,0.6)';
                            e.currentTarget.style.boxShadow = '0 4px 0 -3px rgba(232,121,249,0.4)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.1)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        />
                      </div>

                      {members.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeMember(index)}
                          className="flex-shrink-0 mb-2 text-red-400/30 hover:text-red-400 transition-colors font-black text-xl leading-none"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Slot indicator */}
                <div className="flex items-center gap-3 mt-5">
                  {[0, 1, 2].map(n => (
                    <div
                      key={n}
                      style={{
                        width: 28,
                        height: 3,
                        background: n < members.length ? '#e879f9' : 'rgba(255,255,255,0.07)',
                        boxShadow: n < members.length ? '0 0 10px rgba(232,121,249,0.9)' : 'none',
                        clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                        transition: 'all 0.3s',
                      }}
                    />
                  ))}
                  <span className="text-white/20 text-xs font-mono ml-1">{members.length}/3</span>
                </div>
              </div>

              {/* Error */}
              {formError && (
                <div
                  className="py-3 px-5 relative"
                  style={{
                    background: 'rgba(248,113,113,0.05)',
                    borderLeft: '3px solid rgba(248,113,113,0.7)',
                    clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
                  }}
                >
                  <p className="text-red-300 text-sm font-mono">
                    <span className="text-red-400 font-black mr-2">ERR /</span>{formError}
                  </p>
                </div>
              )}

              {/* Submit */}
              <div className="pt-2 space-y-4">
                <ClipButton
                  disabled={formLoading || !!teamNameError}
                  className="w-full py-4"
                >
                  {formLoading ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>⚡ Lock In &amp; Get Code</>
                  )}
                </ClipButton>

                <button
                  type="button"
                  onClick={async () => { await signOut(auth); router.replace('/login'); }}
                  className="w-full text-center text-white/15 hover:text-white/40 text-xs uppercase tracking-[0.3em] font-mono transition-colors py-2"
                >
                  ↩ Exit Session
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── DASHBOARD ───────────────────────────────────────────────────────────
  const completedCount = existingTeam?.completedStations.length ?? 0;
  const totalStations = 4;
  const progressPct = (completedCount / totalStations) * 100;

  return (
    <div id="page-root" className="fixed inset-0 bg-black overflow-y-auto stripe-bg scanlines noise">
      <GlobalStyles />

      {/* Atmosphere */}
      <div className="fixed w-[800px] h-[800px] rounded-full bg-fuchsia-800/14 blur-[220px] -top-80 -left-80 pointer-events-none" />
      <div className="fixed w-[600px] h-[600px] rounded-full bg-purple-900/18 blur-[170px] bottom-0 -right-60 pointer-events-none" />
      <div className="fixed w-[350px] h-[350px] rounded-full bg-pink-800/10 blur-[120px] top-1/2 left-1/3 pointer-events-none" />

      <Ticker text={`★ ${existingTeam?.teamName ?? 'TEAM'}  ·  Score: ${existingTeam?.totalScore ?? 0} PTS  ·  Stations: ${completedCount}/${totalStations}  ·  Code: ${existingTeam?.teamCode ?? '---'}  ·`} />
      <ScanBeam />

      {/* ── Top nav ── */}
      <div
        className="fixed top-[26px] left-0 right-0 z-30 flex items-center justify-between px-6 sm:px-10"
        style={{
          height: 52,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(232,121,249,0.1)',
        }}
      >
        {/* RISE wordmark */}
        <div className="flex items-center gap-3">
          <span
            className="font-black italic uppercase text-2xl tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #f0abfc, #e879f9, #a855f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 10px rgba(232,121,249,0.6))',
            }}
          >RISE</span>
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-px h-4" style={{ background: 'rgba(232,121,249,0.2)' }} />
            <span className="text-white/20 text-xs font-mono uppercase tracking-widest">2026</span>
          </div>
        </div>

        {/* Center: team + status */}
        <div className="hidden sm:flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" style={{ boxShadow: '0 0 8px #4ade80' }} />
          <span className="text-white font-black text-sm uppercase tracking-wider">{existingTeam?.teamName}</span>
          <div
            className="px-3 py-0.5 font-mono text-xs font-bold"
            style={{
              background: 'rgba(232,121,249,0.08)',
              border: '1px solid rgba(232,121,249,0.2)',
              clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)',
              color: '#e879f9',
            }}
          >
            {existingTeam?.teamCode}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {user.photoURL && (
            <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full" style={{ border: '1px solid rgba(232,121,249,0.5)' }} />
          )}
          <button
            onClick={async () => { await signOut(auth); router.replace('/login'); }}
            className="text-white/25 hover:text-red-400 text-xs uppercase tracking-[0.25em] font-mono transition-colors"
          >
            ↩ Exit
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 pt-[88px] pb-20 px-5 sm:px-10 max-w-5xl mx-auto">

        {/* ── Hero bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="text-white/15 text-xs font-mono uppercase tracking-[0.35em] mb-1">// Active Squad</p>
            <h1
              className="font-black uppercase leading-none tracking-tight"
              style={{
                fontSize: 'clamp(2.5rem, 7vw, 5rem)',
                background: 'linear-gradient(135deg, #ffffff 0%, #f0abfc 50%, #e879f9 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >{existingTeam?.teamName}</h1>
          </div>

          {/* Mission progress */}
          <div className="flex flex-col items-start sm:items-end gap-2">
            <p className="text-white/20 text-xs font-mono uppercase tracking-widest">Mission Progress</p>
            <div className="flex items-center gap-3">
              {/* Segmented bar */}
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(n => (
                  <div
                    key={n}
                    style={{
                      width: 32,
                      height: 6,
                      clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                      background: n <= completedCount
                        ? 'linear-gradient(90deg, #c026d3, #e879f9)'
                        : 'rgba(255,255,255,0.06)',
                      boxShadow: n <= completedCount ? '0 0 10px rgba(232,121,249,0.7)' : 'none',
                      transition: 'all 0.4s',
                    }}
                  />
                ))}
              </div>
              <span className="text-fuchsia-400 font-black text-sm font-mono">{completedCount}/{totalStations}</span>
            </div>
          </div>
        </div>

        {/* ── Team Code block — full width ── */}
        <div
          className="relative mb-6 py-10 px-8 sm:px-14 overflow-hidden"
          style={{ border: '1px solid rgba(232,121,249,0.2)' }}
        >
          <Corners size={18} thickness={2} color="rgba(232,121,249,0.6)" pulse />

          {/* Diagonal stripe accent */}
          <div
            className="absolute top-0 right-0 w-40 h-full pointer-events-none opacity-30"
            style={{
              background: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(232,121,249,0.08) 6px, rgba(232,121,249,0.08) 12px)',
            }}
          />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(192,38,211,0.1) 0%, transparent 65%)' }}
          />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <p className="text-white/20 text-xs font-mono uppercase tracking-[0.4em] mb-2">◈ Your Access Code</p>
              <div
                className="font-black font-mono tracking-[0.15em] leading-none"
                style={{
                  fontSize: 'clamp(2.8rem, 9vw, 5.5rem)',
                  background: 'linear-gradient(135deg, #fdf4ff, #e879f9, #c026d3)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 0 35px rgba(232,121,249,0.8))',
                }}
              >{existingTeam?.teamCode}</div>
              <p className="text-white/15 text-xs font-mono mt-3 uppercase tracking-wider">
                Enter this code in every station sketch
              </p>
            </div>

            <ClipButton
              onClick={handleCopy}
              variant={copied ? 'ghost' : 'ghost'}
              className="self-start sm:self-center"
            >
              <span
                style={{ color: copied ? '#4ade80' : '#e879f9' }}
                className="flex items-center gap-2 text-xs"
              >
                {copied ? <>✓ Copied!</> : <>⎘ Copy Code</>}
              </span>
            </ClipButton>
          </div>
        </div>

        {/* ── Station grid ── */}
        <div className="mb-6">
          <p className="text-white/15 text-xs font-mono uppercase tracking-[0.35em] mb-4">// Stations</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((station) => {
              const score = existingTeam?.[`station${station}Score` as keyof TeamData] as number;
              const completed = existingTeam?.completedStations.includes(station);
              return (
                <div
                  key={station}
                  className={`relative py-8 px-4 text-center overflow-hidden ${completed ? 'station-done' : ''}`}
                  style={{
                    background: completed
                      ? 'linear-gradient(135deg, rgba(34,197,94,0.07), rgba(16,185,129,0.04))'
                      : 'rgba(255,255,255,0.015)',
                    border: completed
                      ? '1px solid rgba(34,197,94,0.35)'
                      : '1px solid rgba(255,255,255,0.06)',
                    clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
                  }}
                >
                  <Corners
                    size={10}
                    color={completed ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.1)'}
                    pulse={completed}
                  />

                  {completed && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ background: 'radial-gradient(ellipse at center, rgba(74,222,128,0.07) 0%, transparent 70%)' }}
                    />
                  )}

                  {/* Diagonal stripe for incomplete */}
                  {!completed && (
                    <div
                      className="absolute inset-0 opacity-50"
                      style={{
                        background: 'repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(255,255,255,0.01) 10px, rgba(255,255,255,0.01) 20px)',
                      }}
                    />
                  )}

                  <p
                    className="text-xs font-mono uppercase tracking-[0.3em] mb-3"
                    style={{ color: completed ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.18)' }}
                  >
                    STN-0{station}
                  </p>

                  <p
                    className="font-black font-mono leading-none mb-3"
                    style={{
                      fontSize: 'clamp(2rem, 5vw, 2.8rem)',
                      color: completed ? '#4ade80' : 'rgba(255,255,255,0.08)',
                      textShadow: completed ? '0 0 40px rgba(74,222,128,0.7), 0 0 80px rgba(74,222,128,0.3)' : 'none',
                    }}
                  >
                    {score > 0 ? score : '—'}
                  </p>

                  <div
                    className="inline-block px-3 py-0.5 text-xs font-black uppercase tracking-widest"
                    style={{
                      background: completed ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)',
                      border: completed ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,255,255,0.06)',
                      clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                      color: completed ? '#4ade80' : 'rgba(255,255,255,0.12)',
                    }}
                  >
                    {completed ? 'DONE ✓' : 'LOCKED'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Total Score ── */}
        <div
          className="relative mb-6 py-8 px-8 sm:px-14 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 overflow-hidden"
          style={{ border: '1px solid rgba(232,121,249,0.15)' }}
        >
          <Corners size={18} thickness={2} color="rgba(232,121,249,0.4)" />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at left, rgba(168,85,247,0.06) 0%, transparent 60%)' }}
          />
          {/* Diagonal stripe right */}
          <div
            className="absolute top-0 right-0 w-32 h-full pointer-events-none opacity-40"
            style={{ background: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(168,85,247,0.06) 6px, rgba(168,85,247,0.06) 12px)' }}
          />

          <div className="relative z-10">
            <p className="text-white/15 text-xs font-mono uppercase tracking-[0.4em] mb-1">◈ Total Score</p>
            <div
              className="font-black font-mono leading-none"
              style={{
                fontSize: 'clamp(3.5rem, 11vw, 7rem)',
                background: 'linear-gradient(135deg, #fdf4ff, #e879f9, #c026d3)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 35px rgba(232,121,249,0.6))',
              }}
            >
              {existingTeam?.totalScore ?? 0}
              <span
                className="ml-2"
                style={{
                  fontSize: '1.8rem',
                  WebkitTextFillColor: 'rgba(232,121,249,0.35)',
                }}
              >PTS</span>
            </div>
          </div>

          <div className="relative z-10 flex gap-6">
            <div className="text-center">
              <p className="font-black text-3xl text-white font-mono">{completedCount}</p>
              <p className="text-white/20 text-xs uppercase tracking-widest font-mono mt-0.5">Done</p>
            </div>
            <div className="w-px self-stretch" style={{ background: 'linear-gradient(to bottom, transparent, rgba(232,121,249,0.2), transparent)' }} />
            <div className="text-center">
              <p className="font-black text-3xl font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>{totalStations - completedCount}</p>
              <p className="text-white/20 text-xs uppercase tracking-widest font-mono mt-0.5">Left</p>
            </div>
          </div>
        </div>

        {/* ── Squad + Arduino ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Squad */}
          <div
            className="relative py-7 px-7 overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Corners size={12} color="rgba(255,255,255,0.15)" />
            <p className="text-white/15 text-xs font-mono uppercase tracking-[0.35em] mb-5">// Squad</p>
            <div className="space-y-5">
              {existingTeam?.members.map((member, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 flex items-center justify-center font-black text-sm flex-shrink-0"
                    style={{
                      clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                      background: index === 0
                        ? 'linear-gradient(135deg, rgba(232,121,249,0.3), rgba(168,85,247,0.3))'
                        : 'rgba(255,255,255,0.04)',
                      color: index === 0 ? '#fff' : 'rgba(255,255,255,0.2)',
                      fontFamily: 'monospace',
                    }}
                  >{index + 1}</div>
                  <div>
                    <p className="text-white font-semibold text-sm uppercase tracking-wide">{member}</p>
                    {index === 0 && (
                      <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'rgba(232,121,249,0.5)' }}>★ Captain</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Arduino */}
          <div
            className="relative py-7 px-7 overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Corners size={12} color="rgba(255,255,255,0.15)" />
            <p className="text-white/15 text-xs font-mono uppercase tracking-[0.35em] mb-5">// Arduino Setup</p>

            <div className="space-y-3 mb-5">
              {[
                'Scan QR at station → Download sketch',
                `Set teamCode → "${existingTeam?.teamCode}"`,
                'Set WiFi credentials to your hotspot',
                'Upload → Green LED = Connected',
                'Finish challenge → Score auto-updates',
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span
                    className="font-mono text-xs mt-0.5 flex-shrink-0 font-black"
                    style={{ color: 'rgba(232,121,249,0.35)' }}
                  >
                    {String(i + 1).padStart(2, '0')}.
                  </span>
                  <p className="text-white/35 text-sm leading-snug">{step}</p>
                </div>
              ))}
            </div>

            {/* Code snippet */}
            <div
              className="relative p-4 font-mono text-xs overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <Corners size={8} color="rgba(255,255,255,0.08)" />
              <p className="text-fuchsia-400/25 mb-2">// sketch.ino</p>
              <p className="text-white/35">const char* ssid = <span className="text-yellow-400/70">"YourWiFi"</span>;</p>
              <p className="text-white/35">const char* password = <span className="text-yellow-400/70">"YourPass"</span>;</p>
              <p className="text-white/35">
                String teamCode = <span style={{ color: '#86efac', textShadow: '0 0 10px rgba(134,239,172,0.6)' }}>"{existingTeam?.teamCode}"</span>;
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 flex items-center gap-4">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(232,121,249,0.2), transparent)' }} />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rotate-45 bg-fuchsia-500/40" />
            <p className="text-white/10 text-xs font-mono uppercase tracking-[0.35em]">Karunya · AI/ML · RISE 2026</p>
            <div className="w-1.5 h-1.5 rotate-45 bg-fuchsia-500/40" />
          </div>
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(232,121,249,0.2))' }} />
        </div>

      </div>
    </div>
  );
}
