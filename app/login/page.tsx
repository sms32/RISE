'use client';

import { useState, useEffect } from 'react';
import { signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { auth, googleProvider, db } from '@/lib/firebase';

// ─── ADMIN CONFIG ──────────────────────────────────────────────────────────────
const ADMIN_EMAILS: string[] = [
  'matrixkarunya@gmail.com',
  'sammichael@karunya.edu.in',
];
const ALLOWED_STUDENT_DOMAIN = 'karunya.edu.in';
// ──────────────────────────────────────────────────────────────────────────────

const isAdmin = (email: string): boolean =>
  ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());

const isAllowedStudent = (email: string): boolean =>
  email.toLowerCase().endsWith(`@${ALLOWED_STUDENT_DOMAIN}`);

// ─── GLOBAL STYLES ─────────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    *::-webkit-scrollbar { display: none; }
    * { scrollbar-width: none; -ms-overflow-style: none; }
    :root { font-family: 'Arial Narrow', Impact, Haettenschweiler, Arial, sans-serif; }

    @keyframes scanMove {
      0%   { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }
    @keyframes ticker {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    @keyframes pulseGlow {
      0%, 100% { filter: drop-shadow(0 0 18px rgba(232,121,249,0.5)) drop-shadow(0 0 50px rgba(168,85,247,0.3)); }
      50%       { filter: drop-shadow(0 0 40px rgba(232,121,249,1))   drop-shadow(0 0 100px rgba(168,85,247,0.6)); }
    }
    @keyframes floatY {
      0%, 100% { transform: translateY(0px); }
      50%       { transform: translateY(-10px); }
    }
    @keyframes glitchMain {
      0%,89%,100% { transform: skewX(0deg); opacity: 1; }
      90% { transform: skewX(-3deg) translateX(-4px); opacity: 0.9; }
      91% { transform: skewX(4deg) translateX(6px);  opacity: 0.85; }
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
    @keyframes spinCW  { to { transform: rotate(360deg);  } }
    @keyframes spinCCW { to { transform: rotate(-360deg); } }
    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes cornerPulse {
      0%, 100% { opacity: 0.4; }
      50%       { opacity: 1; }
    }
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

    .stripe-bg {
      background-image: repeating-linear-gradient(
        -45deg, transparent, transparent 8px,
        rgba(232,121,249,0.015) 8px, rgba(232,121,249,0.015) 16px
      );
    }
    .scanlines::after {
      content: '';
      position: fixed; inset: 0;
      background-image: repeating-linear-gradient(
        0deg, transparent, transparent 3px,
        rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px
      );
      pointer-events: none; z-index: 999;
    }
    .noise::before {
      content: '';
      position: fixed; inset: 0; opacity: 0.03;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      background-size: 128px 128px;
      pointer-events: none; z-index: 998;
    }
    .corner-pulse { animation: cornerPulse 2s ease-in-out infinite; }
    .shimmer-text {
      background: linear-gradient(105deg, #f0abfc 30%, #ffffff 50%, #f0abfc 70%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: shimmer 4s linear infinite;
    }
    .underline-input:focus { outline: none; }
  `}</style>
);

// ─── CORNERS ───────────────────────────────────────────────────────────────────
const Corners = ({
  size = 14, thickness = 2,
  color = 'rgba(232,121,249,0.6)', pulse = false,
}: { size?: number; thickness?: number; color?: string; pulse?: boolean }) => {
  const s = `${size}px`;
  const b = `${thickness}px solid ${color}`;
  const cls = `absolute pointer-events-none${pulse ? ' corner-pulse' : ''}`;
  return (
    <>
      <span className={cls} style={{ top: 0, left: 0, width: s, height: s, borderTop: b, borderLeft: b }} />
      <span className={cls} style={{ top: 0, right: 0, width: s, height: s, borderTop: b, borderRight: b }} />
      <span className={cls} style={{ bottom: 0, left: 0, width: s, height: s, borderBottom: b, borderLeft: b }} />
      <span className={cls} style={{ bottom: 0, right: 0, width: s, height: s, borderBottom: b, borderRight: b }} />
    </>
  );
};

// ─── SLASH DIVIDER ─────────────────────────────────────────────────────────────
const SlashDivider = () => (
  <div className="flex items-center gap-2 my-1">
    {[...Array(6)].map((_, i) => (
      <div key={i} style={{
        width: 2, height: 16,
        background: 'rgba(232,121,249,0.3)',
        transform: 'skewX(-20deg)',
        opacity: 1 - i * 0.12,
      }} />
    ))}
  </div>
);

// ─── GLITCH TITLE ──────────────────────────────────────────────────────────────
const GlitchTitle = () => (
  <div className="relative inline-block select-none" style={{ lineHeight: 0.85 }}>
    <span aria-hidden className="absolute inset-0 font-black italic uppercase" style={{
      fontSize: 'clamp(5.5rem, 20vw, 14rem)',
      WebkitTextFillColor: 'cyan', color: 'cyan',
      animation: 'glitchSlice2 7s infinite', letterSpacing: '-0.03em',
    }}>RISE</span>
    <span aria-hidden className="absolute inset-0 font-black italic uppercase" style={{
      fontSize: 'clamp(5.5rem, 20vw, 14rem)',
      WebkitTextFillColor: '#ff00ff', color: '#ff00ff',
      animation: 'glitchSlice1 6s infinite', letterSpacing: '-0.03em',
    }}>RISE</span>
    <span className="relative block font-black italic uppercase" style={{
      fontSize: 'clamp(5.5rem, 20vw, 14rem)',
      background: 'linear-gradient(160deg, #fdf4ff 0%, #f0abfc 25%, #e879f9 55%, #a855f7 80%, #7c3aed 100%)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
      letterSpacing: '-0.03em',
      animation: 'glitchMain 6s infinite, pulseGlow 3s ease-in-out infinite, floatY 5s ease-in-out infinite',
    }}>RISE</span>
  </div>
);

// ─── TICKER ────────────────────────────────────────────────────────────────────
const Ticker = ({ text }: { text: string }) => (
  <div className="fixed top-0 left-0 right-0 z-50 overflow-hidden" style={{ height: 26, background: 'rgba(0,0,0,0.92)', borderBottom: '1px solid rgba(232,121,249,0.2)' }}>
    <div className="flex gap-16 whitespace-nowrap items-center h-full text-xs font-mono uppercase" style={{
      animation: 'ticker 18s linear infinite', width: 'max-content',
      color: 'rgba(232,121,249,0.4)', letterSpacing: '0.25em',
    }}>
      {[...Array(10)].fill(text).map((t, i) => <span key={i}>{t}</span>)}
    </div>
  </div>
);

// ─── SCAN BEAM ─────────────────────────────────────────────────────────────────
const ScanBeam = () => (
  <div className="fixed left-0 right-0 pointer-events-none z-40" style={{
    height: 2,
    background: 'linear-gradient(90deg, transparent 0%, rgba(232,121,249,0.6) 30%, rgba(255,255,255,0.8) 50%, rgba(232,121,249,0.6) 70%, transparent 100%)',
    animation: 'scanMove 9s linear infinite',
    boxShadow: '0 0 20px rgba(232,121,249,0.5)',
  }} />
);

// ─── CLIP BUTTON ───────────────────────────────────────────────────────────────
const ClipButton = ({
  onClick, disabled, children, variant = 'primary', className = '',
}: {
  onClick?: () => void; disabled?: boolean;
  children: React.ReactNode; variant?: 'primary' | 'ghost'; className?: string;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`relative overflow-hidden font-black uppercase tracking-[0.2em] text-sm transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
    style={{
      clipPath: 'polygon(14px 0%, 100% 0%, calc(100% - 14px) 100%, 0% 100%)',
      background: variant === 'primary' ? 'linear-gradient(135deg, #c026d3 0%, #9333ea 100%)' : 'rgba(232,121,249,0.08)',
      border: variant === 'primary' ? 'none' : '1px solid rgba(232,121,249,0.25)',
      color: '#fff',
      boxShadow: variant === 'primary' && !disabled ? '0 0 40px rgba(192,38,211,0.5), 0 0 80px rgba(168,85,247,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' : 'none',
      padding: '14px 32px',
    }}
    onMouseEnter={(e) => {
      if (!disabled && variant === 'primary') {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 60px rgba(192,38,211,0.8), 0 0 120px rgba(168,85,247,0.4)';
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px) scaleX(1.01)';
      }
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLButtonElement).style.boxShadow = variant === 'primary' ? '0 0 40px rgba(192,38,211,0.5), 0 0 80px rgba(168,85,247,0.2)' : 'none';
      (e.currentTarget as HTMLButtonElement).style.transform = 'none';
    }}
  >
    <span className="absolute inset-0 pointer-events-none" style={{
      background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)',
      backgroundSize: '200% 100%',
      animation: variant === 'primary' ? 'shimmer 3s linear infinite' : 'none',
    }} />
    <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
  </button>
);

// ─── LOGIN PAGE ────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  // ── KEY FIX: onAuthStateChanged only redirects EXISTING users ──────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is already signed in from a previous session
        // Check if they have a doc (returning user)
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (userDoc.exists()) {
          // Returning user → redirect based on saved role
          const role = userDoc.data().role;
          if (role === 'admin') {
            router.replace('/admin');
          } else if (role === 'student') {
            router.replace('/student');
          } else {
            // Unknown role — sign out cleanly
            await auth.signOut();
            setCheckingAuth(false);
          }
        } else {
          // ── KEY FIX: No doc yet = brand new user session ──────────────
          // Don't sign them out! Let them stay signed in.
          // handleGoogleSignIn already handles new user doc creation.
          // This only happens if onAuthStateChanged fires before
          // saveUserToFirestore completes — just wait and do nothing.
          setCheckingAuth(false);
        }
      } else {
        // No user signed in → show login form
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // ── Save user to Firestore ─────────────────────────────────────────────────
  const saveUserToFirestore = async (user: User, role: 'admin' | 'student') => {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        photoURL: user.photoURL,
        role,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
    } else {
      await setDoc(userRef, { lastLogin: new Date().toISOString() }, { merge: true });
    }
  };

  // ── Google Sign In ─────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const email = user.email!;

      if (isAdmin(email)) {
        // ── Admin: save doc then redirect ──────────────────────────────
        await saveUserToFirestore(user, 'admin');
        router.replace('/admin');

      } else if (isAllowedStudent(email)) {
        // ── Student: save doc then redirect ───────────────────────────
        await saveUserToFirestore(user, 'student');
        router.replace('/student');

      } else {
        // ── Not allowed: sign out immediately ─────────────────────────
        await auth.signOut();
        setError(`Access denied. Only @${ALLOWED_STUDENT_DOMAIN} accounts are allowed.`);
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled. Please try again.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error. Check your connection.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Auth checking loader ───────────────────────────────────────────────────
  if (checkingAuth) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden scanlines noise">
        <GlobalStyles />
        <div className="absolute w-[900px] h-[900px] rounded-full bg-fuchsia-700/[0.07] blur-[220px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-purple-800/[0.08] blur-[130px] -top-20 -right-20" />
        <div className="absolute w-[300px] h-[300px] rounded-full bg-pink-700/[0.06] blur-[100px] -bottom-20 -left-20" />
        <ScanBeam />
        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="relative w-28 h-28 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-fuchsia-500/10 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-0 rounded-full border-2 border-transparent" style={{ borderTopColor: '#e879f9', borderRightColor: 'rgba(232,121,249,0.2)', animation: 'spinCW 1.4s linear infinite' }} />
            <div className="absolute inset-3 rounded-full border-2 border-transparent" style={{ borderBottomColor: '#a855f7', borderLeftColor: 'rgba(168,85,247,0.2)', animation: 'spinCCW 1.0s linear infinite' }} />
            <div className="absolute inset-6 rounded-full border border-transparent" style={{ borderTopColor: '#c026d3', animation: 'spinCW 0.7s linear infinite' }} />
            <div className="w-4 h-4 rounded-full bg-white" style={{ boxShadow: '0 0 20px #e879f9, 0 0 60px #a855f7, 0 0 100px rgba(168,85,247,0.5)' }} />
          </div>
          <div className="text-center space-y-2">
            <p className="font-black italic uppercase text-4xl tracking-tight" style={{
              background: 'linear-gradient(135deg, #fdf4ff, #e879f9, #a855f7)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              filter: 'drop-shadow(0 0 20px rgba(232,121,249,0.7))',
            }}>RISE</p>
            <SlashDivider />
            <p className="text-fuchsia-400/50 font-mono text-xs uppercase tracking-[0.4em]">Initializing Session</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Login UI ───────────────────────────────────────────────────────────────
  return (
    <div id="page-root" className="fixed inset-0 bg-black overflow-y-auto stripe-bg scanlines noise">
      <GlobalStyles />

      {/* Atmosphere blobs */}
      <div className="fixed w-[700px] h-[700px] rounded-full bg-fuchsia-700/[0.06] blur-[180px] -top-64 -left-64 pointer-events-none" />
      <div className="fixed w-[500px] h-[500px] rounded-full bg-purple-900/[0.08] blur-[140px] -bottom-48 -right-48 pointer-events-none" />
      <div className="fixed w-[250px] h-[250px] rounded-full bg-pink-600/[0.05] blur-[90px] top-1/3 right-1/4 pointer-events-none" />

      <Ticker text="RISE 2026 · Real-World IoT Systems Exploration · Division of AIML · Karunya Institute · Arduino Workshop · " />
      <ScanBeam />

      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row" style={{ paddingTop: 26 }}>

        {/* ── LEFT: Branding ─────────────────────────────────────────── */}
        <div className="lg:w-1/2 flex flex-col items-center justify-center px-8 py-16 lg:py-0 relative">
          <div className="absolute top-1/4 left-0 w-full h-px pointer-events-none hidden lg:block" style={{ background: 'linear-gradient(90deg, transparent, rgba(232,121,249,0.12), transparent)', transform: 'rotate(-8deg)' }} />
          <div className="absolute bottom-1/3 left-0 w-full h-px pointer-events-none hidden lg:block" style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.1), transparent)', transform: 'rotate(-8deg)' }} />

          <div className="text-center relative">
            <div className="inline-flex items-center gap-2 mb-5">
              <div className="w-2 h-2 rotate-45 bg-fuchsia-500" style={{ boxShadow: '0 0 10px #e879f9' }} />
              <span className="text-fuchsia-400/60 text-xs uppercase tracking-[0.35em] font-mono">Division of AIML Presents</span>
              <div className="w-2 h-2 rotate-45 bg-fuchsia-500" style={{ boxShadow: '0 0 10px #e879f9' }} />
            </div>

            <GlitchTitle />

            <div className="flex justify-center mt-2 mb-5">
              <SlashDivider />
            </div>

            <p className="text-xs uppercase tracking-[0.35em] font-mono mb-8" style={{ color: 'rgba(232,121,249,0.45)' }}>
              Real-World IoT Systems Exploration
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              {[{ label: 'Stations', value: '04' }, { label: 'Format', value: 'Live' }, { label: 'Year', value: '2026' }].map(({ label, value }) => (
                <div key={label} className="relative px-6 py-3 flex flex-col items-center" style={{ background: 'rgba(232,121,249,0.04)', border: '1px solid rgba(232,121,249,0.14)' }}>
                  <Corners size={10} color="rgba(232,121,249,0.5)" pulse />
                  <p className="text-white font-black text-xl leading-none" style={{ fontFamily: 'monospace' }}>{value}</p>
                  <p className="text-fuchsia-400/40 text-xs uppercase tracking-[0.25em] mt-0.5 font-mono">{label}</p>
                </div>
              ))}
            </div>

            <div className="inline-flex items-center gap-2 mt-8 px-5 py-2" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(232,121,249,0.15)', clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" style={{ boxShadow: '0 0 8px #4ade80' }} />
              <span className="text-white/30 text-xs font-mono uppercase tracking-widest">Authentication Open</span>
            </div>
          </div>

          <div className="hidden lg:block absolute right-0 top-1/4 bottom-1/4 w-px" style={{ background: 'linear-gradient(to bottom, transparent, rgba(232,121,249,0.25) 30%, rgba(232,121,249,0.25) 70%, transparent)' }} />
          <div className="hidden lg:block absolute right-0 top-1/2" style={{ width: 10, height: 10, background: '#e879f9', transform: 'translateY(-50%) translateX(50%) rotate(45deg)', boxShadow: '0 0 12px #e879f9' }} />
        </div>

        {/* ── RIGHT: Login form ───────────────────────────────────────── */}
        <div className="lg:w-1/2 flex flex-col justify-center px-6 sm:px-14 lg:px-16 py-16 lg:py-0">

          <div className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-6 h-6 rotate-45 flex items-center justify-center" style={{ background: 'rgba(232,121,249,0.15)', border: '1px solid rgba(232,121,249,0.4)' }}>
                <div className="w-2 h-2 bg-fuchsia-400 rotate-45" />
              </div>
              <p className="text-white/20 text-xs uppercase tracking-[0.4em] font-mono">Secure Access Portal</p>
            </div>
            <h2 className="text-white font-black text-4xl uppercase tracking-tight leading-none">
              Sign In &amp; <span className="shimmer-text" style={{ fontStyle: 'italic' }}>Deploy</span>
            </h2>
            <div className="flex items-center gap-2 mt-3">
              <SlashDivider />
              <p className="text-white/25 text-xs font-mono">Arduino IoT Workshop 2026</p>
            </div>
          </div>

          {/* Error box */}
          {error && (
            <div className="mb-8 py-3 px-5 relative" style={{
              background: 'rgba(248,113,113,0.05)',
              borderLeft: '3px solid rgba(248,113,113,0.7)',
              clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
            }}>
              <p className="text-red-300 text-sm font-mono">
                <span className="text-red-400 font-black mr-2">ERR</span>{error}
              </p>
            </div>
          )}

          <div className="space-y-6 max-w-md">
            <ClipButton onClick={handleGoogleSignIn} disabled={loading} className="w-full py-4">
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white" style={{ animation: 'spinCW 0.7s linear infinite', display: 'inline-block' }} />
                  Authenticating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.3))' }}>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </ClipButton>

            {/* Domain info badge */}
            <div className="relative px-5 py-4 overflow-hidden" style={{ background: 'rgba(232,121,249,0.04)', border: '1px solid rgba(232,121,249,0.12)' }}>
              <Corners size={10} color="rgba(232,121,249,0.35)" />
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rotate-45 flex-shrink-0 mt-0.5 flex items-center justify-center" style={{ background: 'rgba(232,121,249,0.15)', border: '1px solid rgba(232,121,249,0.4)' }}>
                  <div className="w-1.5 h-1.5 bg-fuchsia-400 rotate-45" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-mono leading-relaxed uppercase tracking-[0.15em]">
                    Students — use{' '}
                    <span className="text-fuchsia-400 font-black">@karunya.edu.in</span>{' '}
                    Google account
                  </p>
                  <p className="text-white/20 text-xs font-mono mt-1 uppercase tracking-[0.15em]">
                    Admins — any registered email allowed
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {[0, 1, 2].map((n) => (
                <div key={n} style={{
                  width: 28, height: 3,
                  background: n === 0 ? '#e879f9' : 'rgba(255,255,255,0.07)',
                  boxShadow: n === 0 ? '0 0 10px rgba(232,121,249,0.9)' : 'none',
                  clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                }} />
              ))}
              <span className="text-white/20 text-xs font-mono ml-1">SYS-READY</span>
            </div>
          </div>

          <div className="mt-12 flex items-center gap-4 max-w-md">
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(232,121,249,0.2), transparent)' }} />
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rotate-45 bg-fuchsia-500/40" />
              <p className="text-white/10 text-xs font-mono uppercase tracking-[0.35em]">Karunya AIML · RISE 2026</p>
              <div className="w-1.5 h-1.5 rotate-45 bg-fuchsia-500/40" />
            </div>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(232,121,249,0.2))' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
