// app/login/page.tsx
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

const isAdmin        = (email: string) => ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
const isAllowedStudent = (email: string) => email.toLowerCase().endsWith(`@${ALLOWED_STUDENT_DOMAIN}`);

// ─── SHARED STYLES (mirrors admin page exactly) ────────────────────────────────
const sharedStyles = `
  * { scrollbar-width: none; }
  *::-webkit-scrollbar { display: none; }

  :root { font-family: 'Arial Narrow', 'Impact', 'Haettenschweiler', Arial, sans-serif; }

  @keyframes spin-cw  { to { transform: rotate(360deg);  } }
  @keyframes spin-ccw { to { transform: rotate(-360deg); } }
  @keyframes pulse-glow { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
  @keyframes ticker { 0% { transform:translateX(0); } 100% { transform:translateX(-50%); } }

  @keyframes glitch-1 {
    0%,100% { clip-path: inset(0 0 98% 0); transform: translate(-4px); }
    50%      { clip-path: inset(30% 0 50% 0); transform: translate(4px); }
  }
  @keyframes glitch-2 {
    0%,100% { clip-path: inset(60% 0 20% 0); transform: translate(3px); }
    50%      { clip-path: inset(10% 0 80% 0); transform: translate(-3px); }
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

  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
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
  .shimmer-text {
    background: linear-gradient(105deg, #c4b5fd 30%, #ffffff 50%, #c4b5fd 70%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer 4s linear infinite;
  }
`;

export default function LoginPage() {
  const [loading, setLoading]           = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError]               = useState('');
  const [glitch, setGlitch]             = useState(false);
  const router = useRouter();

  // ── Periodic glitch ──────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // ── Auth state check ─────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          if (role === 'admin')        router.replace('/admin');
          else if (role === 'student') router.replace('/student');
          else { await auth.signOut(); setCheckingAuth(false); }
        } else {
          setCheckingAuth(false);
        }
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // ── Save user to Firestore ────────────────────────────────────────────────
  const saveUserToFirestore = async (user: User, role: 'admin' | 'student') => {
    const userRef  = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid, email: user.email,
        name: user.displayName, photoURL: user.photoURL,
        role, createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
    } else {
      await setDoc(userRef, { lastLogin: new Date().toISOString() }, { merge: true });
    }
  };

  // ── Google Sign In ────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user   = result.user;
      const email  = user.email!;

      if (isAdmin(email)) {
        await saveUserToFirestore(user, 'admin');
        router.replace('/admin');
      } else if (isAllowedStudent(email)) {
        await saveUserToFirestore(user, 'student');
        router.replace('/student');
      } else {
        await auth.signOut();
        setError(`Access denied. Only @${ALLOWED_STUDENT_DOMAIN} accounts are allowed.`);
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user')   setError('Sign-in cancelled. Please try again.');
      else if (err.code === 'auth/network-request-failed') setError('Network error. Check your connection.');
      else setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading screen (matches admin) ────────────────────────────────────────
  if (checkingAuth) return (
    <div className="min-h-screen flex items-center justify-center bg-[#030108]"
      style={{ fontFamily: "'Arial Narrow','Impact',sans-serif" }}>
      <style>{sharedStyles}</style>
      <div className="scanline-bar" />
      <div className="noise-overlay" />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
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

  // ── Login UI ──────────────────────────────────────────────────────────────
  return (
    <div id="page-root" className="min-h-screen bg-[#030108] text-white overflow-x-hidden"
      style={{ fontFamily: "'Arial Narrow','Impact',sans-serif" }}>
      <style>{sharedStyles}</style>
      <div className="scanline-bar" />
      <div className="noise-overlay" />

      {/* Atmosphere blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.13]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #6b21a8, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute top-1/3 right-1/4 w-[250px] h-[250px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, #4c1d95, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* ── TICKER ── */}
      <div className="w-full overflow-hidden bg-[#7c3aed]/10 border-b border-[#7c3aed]/30 py-1">
        <div className="flex whitespace-nowrap" style={{ animation: 'ticker 30s linear infinite' }}>
          {Array(8).fill(null).map((_, i) => (
            <span key={i} className="text-[#a78bfa] text-xs tracking-widest mx-8 font-mono">
              ◈ RISE 2026 &nbsp;
              ◈ Real-World IoT Systems Exploration &nbsp;
              ◈ Division of AI/ML &nbsp;
              ◈ Karunya Institute &nbsp;
              ◈ Arduino IoT Workshop &nbsp;
              ◈ Authentication Portal &nbsp;
            </span>
          ))}
        </div>
      </div>

      <div className="relative min-h-[calc(100vh-26px)] flex flex-col lg:flex-row">

        {/* ── LEFT: Branding ── */}
        <div className="lg:w-1/2 flex flex-col items-center justify-center px-8 py-16 lg:py-0 relative border-b lg:border-b-0 lg:border-r border-[#7c3aed]/15">

          {/* Diagonal accent lines */}
          <div className="absolute top-1/4 left-0 w-full h-px pointer-events-none hidden lg:block"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.12), transparent)', transform: 'rotate(-8deg)' }} />
          <div className="absolute bottom-1/3 left-0 w-full h-px pointer-events-none hidden lg:block"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(107,33,168,0.1), transparent)', transform: 'rotate(-8deg)' }} />

          <div className="text-center relative z-10">

            {/* Tag */}
            <div className="inline-flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rotate-45 bg-[#7c3aed]" style={{ boxShadow: '0 0 10px #7c3aed' }} />
              <span className="text-[#7c3aed]/60 text-xs uppercase tracking-[0.35em] font-mono">Division of AI/ML Presents</span>
              <div className="w-2 h-2 rotate-45 bg-[#7c3aed]" style={{ boxShadow: '0 0 10px #7c3aed' }} />
            </div>

            {/* Glitch RISE title */}
            <div className="relative inline-block select-none" style={{ lineHeight: 0.85 }}>
              {/* Cyan ghost */}
              <span aria-hidden className="absolute inset-0 font-black italic uppercase" style={{
                fontSize: 'clamp(5rem, 18vw, 13rem)',
                WebkitTextFillColor: 'cyan', color: 'cyan',
                animation: 'glitchSlice2 7s infinite', letterSpacing: '-0.03em',
              }}>RISE</span>
              {/* Magenta ghost */}
              <span aria-hidden className="absolute inset-0 font-black italic uppercase" style={{
                fontSize: 'clamp(5rem, 18vw, 13rem)',
                WebkitTextFillColor: '#a78bfa', color: '#a78bfa',
                animation: 'glitchSlice1 6s infinite', letterSpacing: '-0.03em',
              }}>RISE</span>
              {/* Main — purple gradient matching admin */}
              <div className={`glitch-wrap ${glitch ? 'glitch-active' : ''}`} data-text="">
                <span className="relative block font-black italic uppercase" style={{
                  fontSize: 'clamp(5rem, 18vw, 13rem)',
                  background: 'linear-gradient(160deg, #fdf4ff 0%, #c4b5fd 25%, #a78bfa 55%, #7c3aed 80%, #5b21b6 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  letterSpacing: '-0.03em',
                  animation: 'glitchMain 6s infinite',
                  textShadow: 'none',
                }}>RISE</span>
              </div>
            </div>

            {/* Slash divider */}
            <div className="flex items-center justify-center gap-1.5 my-5">
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{
                  width: 2, height: 14,
                  background: 'rgba(124,58,237,0.4)',
                  transform: 'skewX(-20deg)',
                  opacity: 1 - i * 0.1,
                }} />
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
              ].map(({ label, value }) => (
                <div key={label} className="relative stat-pill bg-[#0d0014] border border-[#7c3aed]/30 px-6 py-3 text-center">
                  <div className="corner-tl" /><div className="corner-tr" />
                  <div className="corner-bl" /><div className="corner-br" />
                  <p className="text-white font-black text-xl font-mono">{value}</p>
                  <p className="text-[#7c3aed]/40 text-xs uppercase tracking-[0.25em] font-mono mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Auth open badge */}
            <div className="inline-flex items-center gap-2 mt-8 stat-pill bg-[#0d0014] border border-[#7c3aed]/30 px-5 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"
                style={{ boxShadow: '0 0 8px #4ade80' }} />
              <span className="text-white/30 text-xs font-mono uppercase tracking-widest">Authentication Open</span>
            </div>
          </div>

          {/* Vertical separator */}
          <div className="hidden lg:block absolute right-0 top-1/4 bottom-1/4 w-px"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(124,58,237,0.25) 30%, rgba(124,58,237,0.25) 70%, transparent)' }} />
          {/* Diamond at separator midpoint */}
          <div className="hidden lg:block absolute right-0 top-1/2"
            style={{ width: 10, height: 10, background: '#7c3aed', transform: 'translateY(-50%) translateX(50%) rotate(45deg)', boxShadow: '0 0 12px #7c3aed' }} />
        </div>

        {/* ── RIGHT: Login Form ── */}
        <div className="lg:w-1/2 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 lg:py-0">

          {/* Section heading */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-5 h-5 rotate-45 flex items-center justify-center"
                style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)' }}>
                <div className="w-2 h-2 bg-[#7c3aed] rotate-45" />
              </div>
              <p className="text-[#7c3aed]/40 text-xs uppercase tracking-[0.4em] font-mono">// Secure Access Portal</p>
            </div>
            <h2 className="text-white font-black text-4xl uppercase tracking-tight leading-none">
              Sign In &amp;{' '}
              <span className="shimmer-text" style={{ fontStyle: 'italic' }}>Deploy</span>
            </h2>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center gap-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{ width: 2, height: 10, background: 'rgba(124,58,237,0.3)', transform: 'skewX(-20deg)' }} />
                ))}
              </div>
              <p className="text-white/25 text-xs font-mono">Arduino IoT Workshop 2026</p>
            </div>
          </div>

          <div className="space-y-5 max-w-md w-full">

            {/* Error block */}
            {error && (
              <div className="relative border-l-2 border-red-500/70 bg-red-900/10 py-3 px-5"
                style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}>
                <p className="text-red-300 text-sm font-mono">
                  <span className="text-red-400 font-black mr-2">ERR /</span>{error}
                </p>
              </div>
            )}

            {/* Google Sign-In button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="clip-btn w-full py-4 text-sm font-black border-2 border-[#7c3aed]/60 bg-[#7c3aed]/20 text-white tracking-widest disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden"
              style={{ boxShadow: loading ? 'none' : '0 0 30px rgba(124,58,237,0.25)' }}
            >
              {/* Shimmer sweep */}
              <span className="absolute inset-0 pointer-events-none" style={{
                background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.06) 50%, transparent 65%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 3s linear infinite',
              }} />
              <span className="relative z-10 flex items-center justify-center gap-3">
                {loading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    AUTHENTICATING...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24"
                      style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.2))' }}>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    CONTINUE WITH GOOGLE
                  </>
                )}
              </span>
            </button>

            {/* Domain info panel */}
            <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5">
              <div className="corner-tl" /><div className="corner-tr" />
              <div className="corner-bl" /><div className="corner-br" />
              <p className="text-[#7c3aed]/40 text-xs font-mono uppercase tracking-[0.3em] mb-3">◈ Access Requirements</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 stat-pill bg-[#7c3aed]/20 border border-[#7c3aed]/40 px-2 py-0.5 mt-0.5">
                    <span className="text-[#a78bfa] text-[10px] font-mono tracking-widest">STUDENT</span>
                  </div>
                  <p className="text-white/40 text-xs font-mono leading-relaxed">
                    Use your{' '}
                    <span className="text-[#a78bfa] font-black">@karunya.edu.in</span>{' '}
                    Google account to access the workshop
                  </p>
                </div>
                <div className="w-full h-px bg-[#7c3aed]/10" />
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 stat-pill bg-red-900/20 border border-red-700/30 px-2 py-0.5 mt-0.5">
                    <span className="text-red-400/70 text-[10px] font-mono tracking-widest">ADMIN</span>
                  </div>
                  <p className="text-white/30 text-xs font-mono leading-relaxed">
                    Admin accounts use registered email addresses only
                  </p>
                </div>
              </div>
            </div>

            {/* Progress bar indicator */}
            <div className="flex items-center gap-3">
              {[0, 1, 2].map((n) => (
                <div key={n} style={{
                  width: 28, height: 3,
                  background: n === 0 ? '#7c3aed' : 'rgba(255,255,255,0.07)',
                  boxShadow: n === 0 ? '0 0 8px rgba(124,58,237,0.8)' : 'none',
                  clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
                  transition: 'all 0.3s',
                }} />
              ))}
              <span className="text-[#7c3aed]/30 text-xs font-mono ml-1">SYS-READY</span>
            </div>
          </div>

          {/* Footer line */}
          <div className="mt-12 flex items-center gap-4 max-w-md">
            <div className="flex-1 h-px"
              style={{ background: 'linear-gradient(90deg, rgba(124,58,237,0.3), transparent)' }} />
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rotate-45 bg-[#7c3aed]/40" />
              <p className="text-white/10 text-xs font-mono uppercase tracking-[0.3em]">
                MATRIX · RISE 2026
              </p>
              <div className="w-1.5 h-1.5 rotate-45 bg-[#7c3aed]/40" />
            </div>
            <div className="flex-1 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.3))' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
