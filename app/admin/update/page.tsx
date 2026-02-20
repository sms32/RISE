// app/admin/update/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/useAuth';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import {
  collection,
  onSnapshot,
  doc,
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
  createdAt: string;
}

type EditDraft = {
  station1Score: string;
  station2Score: string;
  station3Score: string;
  station4Score: string;
  station1Attempts: string;
  station2Attempts: string;
  station3Attempts: string;
  station4Attempts: string;
};

const STATION_NAMES = ['', 'Shield', 'Oxygen', 'Pressure', 'Override'];

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminUpdatePage() {
  const { user, role, loading } = useAuth('admin');
  const router = useRouter();

  const [teams, setTeams]           = useState<Team[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [editDraft, setEditDraft]     = useState<EditDraft | null>(null);
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [glitch, setGlitch]           = useState(false);
  const [confirmReset, setConfirmReset] = useState<number | null>(null); // station number or 0 = full

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

  // ── Sync selectedTeam from live data ─────────────────────────────────────
  useEffect(() => {
    if (!selectedTeam) return;
    const live = teams.find((t) => t.teamId === selectedTeam.teamId);
    if (live) setSelectedTeam(live);
  }, [teams]);

  // ── Open edit panel ───────────────────────────────────────────────────────
  const openTeam = useCallback((team: Team) => {
    setSelectedTeam(team);
    setEditDraft({
      station1Score:    String(team.station1Score    || 0),
      station2Score:    String(team.station2Score    || 0),
      station3Score:    String(team.station3Score    || 0),
      station4Score:    String(team.station4Score    || 0),
      station1Attempts: String(team.station1Attempts || 0),
      station2Attempts: String(team.station2Attempts || 0),
      station3Attempts: String(team.station3Attempts || 0),
      station4Attempts: String(team.station4Attempts || 0),
    });
    setSaveMsg(null);
    setConfirmReset(null);
  }, []);

  // ── Save edits ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedTeam || !editDraft) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const s1 = Math.max(0, parseInt(editDraft.station1Score) || 0);
      const s2 = Math.max(0, parseInt(editDraft.station2Score) || 0);
      const s3 = Math.max(0, parseInt(editDraft.station3Score) || 0);
      const s4 = Math.max(0, parseInt(editDraft.station4Score) || 0);

      const a1 = Math.max(0, parseInt(editDraft.station1Attempts) || 0);
      const a2 = Math.max(0, parseInt(editDraft.station2Attempts) || 0);
      const a3 = Math.max(0, parseInt(editDraft.station3Attempts) || 0);
      const a4 = Math.max(0, parseInt(editDraft.station4Attempts) || 0);

      const totalScore = s1 + s2 + s3 + s4;

      // Rebuild completedStations: station is "done" only if score > 0
      const completedStations = [
        ...(s1 > 0 ? [1] : []),
        ...(s2 > 0 ? [2] : []),
        ...(s3 > 0 ? [3] : []),
        ...(s4 > 0 ? [4] : []),
      ];

      await updateDoc(doc(db, 'teams', selectedTeam.teamId), {
        station1Score: s1,
        station2Score: s2,
        station3Score: s3,
        station4Score: s4,
        station1Attempts: a1,
        station2Attempts: a2,
        station3Attempts: a3,
        station4Attempts: a4,
        totalScore,
        completedStations,
      });

      setSaveMsg({ type: 'ok', text: `Saved! Total: ${totalScore} pts` });
    } catch (e) {
      console.error(e);
      setSaveMsg({ type: 'err', text: 'Save failed. Check console.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Reset a single station ────────────────────────────────────────────────
  const handleStationReset = async (station: number) => {
    if (!selectedTeam) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const scoreKey   = `station${station}Score`;
      const attemptKey = `station${station}Attempts`;

      const otherScores = [1, 2, 3, 4]
        .filter((s) => s !== station)
        .reduce((sum, s) => sum + ((selectedTeam[`station${s}Score` as keyof Team] as number) || 0), 0);

      const newCompleted = (selectedTeam.completedStations || []).filter(
        (s) => s !== station
      );

      await updateDoc(doc(db, 'teams', selectedTeam.teamId), {
        [scoreKey]:          0,
        [attemptKey]:        0,
        totalScore:          otherScores,
        completedStations:   newCompleted,
      });

      // Sync draft
      if (editDraft) {
        setEditDraft({
          ...editDraft,
          [`station${station}Score`]:    '0',
          [`station${station}Attempts`]: '0',
        });
      }

      setSaveMsg({ type: 'ok', text: `Station ${station} (${STATION_NAMES[station]}) reset.` });
    } catch (e) {
      console.error(e);
      setSaveMsg({ type: 'err', text: 'Reset failed.' });
    } finally {
      setSaving(false);
      setConfirmReset(null);
    }
  };

  // ── Full team reset ───────────────────────────────────────────────────────
  const handleFullReset = async () => {
    if (!selectedTeam) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await updateDoc(doc(db, 'teams', selectedTeam.teamId), {
        station1Score: 0, station2Score: 0, station3Score: 0, station4Score: 0,
        station1Attempts: 0, station2Attempts: 0, station3Attempts: 0, station4Attempts: 0,
        totalScore: 0, completedStations: [],
      });
      setEditDraft({
        station1Score: '0', station2Score: '0', station3Score: '0', station4Score: '0',
        station1Attempts: '0', station2Attempts: '0', station3Attempts: '0', station4Attempts: '0',
      });
      setSaveMsg({ type: 'ok', text: 'Full reset done. All scores & attempts cleared.' });
    } catch (e) {
      console.error(e);
      setSaveMsg({ type: 'err', text: 'Reset failed.' });
    } finally {
      setSaving(false);
      setConfirmReset(null);
    }
  };

  // ── Filtered teams ────────────────────────────────────────────────────────
  const filteredTeams = teams.filter(
    (t) =>
      t.teamName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.teamCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.members?.some((m) => m.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
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
    .panel-fade { animation: fadeIn 0.25s ease both; }
    .num-input {
      background: rgba(124,58,237,0.05);
      border: 1px solid rgba(124,58,237,0.25);
      color: white;
      font-family: 'Share Tech Mono', monospace;
      font-size: 1.1rem;
      font-weight: 900;
      text-align: center;
      width: 100%;
      padding: 10px 6px;
      outline: none;
      transition: border-color 0.2s;
    }
    .num-input:focus { border-color: #7c3aed; background: rgba(124,58,237,0.10); }
    .num-input::-webkit-inner-spin-button,
    .num-input::-webkit-outer-spin-button { -webkit-appearance: none; }
  `;

  // ── Loading screen ────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#030108] text-white"
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

      {/* ── TICKER ──────────────────────────────────────────────────────────── */}
      <div className="w-full overflow-hidden bg-[#7c3aed]/10 border-b border-[#7c3aed]/30 py-1">
        <div className="flex whitespace-nowrap" style={{ animation: 'ticker 30s linear infinite' }}>
          {Array(8).fill(null).map((_, i) => (
            <span key={i} className="text-[#a78bfa] text-xs tracking-widest mx-8 font-mono">
              ◈ ADMIN SCORE EDITOR &nbsp;
              ◈ {teams.length} TEAMS &nbsp;
              ◈ SEARCH BY NAME / CODE / MEMBER &nbsp;
              ◈ EDIT SCORES AND ATTEMPTS &nbsp;
              ◈ PER-STATION RESET AVAILABLE &nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="relative px-6 pt-6 pb-4 border-b border-[#7c3aed]/20">
        <div className="flex items-start justify-between max-w-7xl mx-auto">
          <div>
            <div className={`glitch-wrap ${glitch ? 'glitch-active' : ''}`} data-text="">
              <h1 className="text-4xl font-black uppercase tracking-[0.15em] text-white"
                style={{ textShadow: '0 0 30px rgba(124,58,237,0.5)' }}>
                SCORE EDITOR
              </h1>
            </div>
            <p className="text-[#7c3aed]/70 text-xs tracking-[0.3em] mt-1 font-mono">
              RISE 2026 — ADMIN // MANUAL OVERRIDE
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Back to admin */}
            <button
              onClick={() => router.push('/admin')}
              className="clip-btn px-4 py-2 text-xs border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa]"
            >
              ← BACK
            </button>
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
        <div className="flex gap-3 mt-4 flex-wrap max-w-7xl mx-auto">
          {[
            { label: 'TOTAL TEAMS',   value: teams.length },
            { label: 'SCORED',        value: teams.filter(t => t.totalScore > 0).length },
            { label: 'ALL COMPLETE',  value: teams.filter(t => t.completedStations?.length === 4).length },
            { label: 'SEARCH HITS',   value: filteredTeams.length },
          ].map((s) => (
            <div key={s.label} className="stat-pill bg-[#0d0014] border border-[#7c3aed]/30 px-4 py-1.5">
              <span className="text-[#7c3aed]/50 text-xs font-mono tracking-widest">{s.label} </span>
              <span className="text-sm font-black text-white">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row max-w-7xl mx-auto min-h-[calc(100vh-160px)]">

        {/* ── LEFT: Team List ─────────────────────────────────────────────── */}
        <div className="lg:w-[380px] shrink-0 border-r border-[#7c3aed]/15 flex flex-col">

          {/* Search bar */}
          <div className="p-4 border-b border-[#7c3aed]/15 sticky top-0 bg-[#030108] z-10">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7c3aed]/40 font-mono text-sm">⌕</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="SEARCH NAME, CODE, MEMBER..."
                className="w-full bg-[#0a0015] border border-[#7c3aed]/30 text-white font-mono text-xs px-9 py-3
                  focus:outline-none focus:border-[#7c3aed] placeholder-white/20 tracking-widest uppercase"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7c3aed]/40 hover:text-[#7c3aed] font-mono"
                >✕</button>
              )}
            </div>
            <p className="text-[#7c3aed]/30 text-[10px] font-mono mt-2 tracking-widest">
              {filteredTeams.length} / {teams.length} TEAMS — CLICK TO EDIT
            </p>
          </div>

          {/* Team list */}
          <div className="overflow-y-auto flex-1">
            {filteredTeams.length === 0 ? (
              <div className="text-center py-16 text-white/20 font-mono tracking-widest text-xs">
                NO TEAMS FOUND
              </div>
            ) : (
              filteredTeams.map((team, idx) => {
                const isSelected = selectedTeam?.teamId === team.teamId;
                const totalAttempts =
                  (team.station1Attempts || 0) + (team.station2Attempts || 0) +
                  (team.station3Attempts || 0) + (team.station4Attempts || 0);

                return (
                  <button
                    key={team.teamId}
                    onClick={() => openTeam(team)}
                    className={`w-full text-left px-4 py-4 border-b border-[#7c3aed]/10 transition-all hover:bg-[#7c3aed]/5
                      ${isSelected ? 'bg-[#7c3aed]/10 border-l-2 border-l-[#7c3aed]' : 'border-l-2 border-l-transparent'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white font-black uppercase tracking-wide text-sm truncate">
                          {team.teamName}
                        </p>
                        <p className="text-[#7c3aed]/50 text-xs font-mono mt-0.5">{team.teamCode}</p>
                        {team.members?.length > 0 && (
                          <p className="text-white/25 text-[10px] font-mono mt-1 truncate">
                            {team.members.join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[#a78bfa] font-black font-mono text-base">{team.totalScore}</p>
                        <p className="text-white/20 text-[10px] font-mono">pts</p>
                        {totalAttempts > 0 && (
                          <p className="text-yellow-500/50 text-[10px] font-mono mt-0.5">{totalAttempts} att</p>
                        )}
                      </div>
                    </div>

                    {/* Station badges */}
                    <div className="flex gap-1 mt-2">
                      {[1, 2, 3, 4].map((s) => {
                        const done  = team.completedStations?.includes(s);
                        const score = team[`station${s}Score` as keyof Team] as number || 0;
                        return (
                          <div key={s}
                            className={`flex-1 text-center py-0.5 text-[9px] font-mono font-bold border
                              ${done
                                ? 'border-[#7c3aed]/50 bg-[#7c3aed]/10 text-[#a78bfa]'
                                : 'border-white/10 text-white/15'}`}
                          >
                            S{s} {done ? score : '—'}
                          </div>
                        );
                      })}
                    </div>

                    {isSelected && (
                      <div className="mt-2 text-[#7c3aed]/60 text-[9px] font-mono tracking-widest">
                        ◈ EDITING →
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT: Edit Panel ────────────────────────────────────────────── */}
        <div className="flex-1 p-6 overflow-y-auto">
          {!selectedTeam ? (
            // Empty state
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 border-2 border-[#7c3aed]/20 rotate-45" />
                <div className="absolute inset-3 border border-[#7c3aed]/40 rotate-45" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[#7c3aed]/40 text-2xl">✎</span>
                </div>
              </div>
              <p className="text-white/20 font-mono text-sm tracking-widest uppercase">
                Select a team to edit
              </p>
              <p className="text-[#7c3aed]/25 text-xs font-mono mt-2">
                Search by name, code, or member name
              </p>
            </div>
          ) : editDraft && (
            <div className="panel-fade max-w-2xl mx-auto space-y-6">

              {/* ── Team header ──────────────────────────────────────── */}
              <div className="relative border border-[#7c3aed]/30 bg-[#0a0015] p-5 overflow-hidden">
                <div className="corner-tl" /><div className="corner-tr" />
                <div className="corner-bl" /><div className="corner-br" />
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at left, rgba(124,58,237,0.06) 0%, transparent 60%)' }} />

                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[#7c3aed]/40 text-xs font-mono tracking-[0.3em] uppercase mb-1">◈ Editing Team</p>
                    <h2 className="text-white font-black text-2xl uppercase tracking-wide">{selectedTeam.teamName}</h2>
                    <p className="text-[#a78bfa] font-mono text-sm mt-0.5">{selectedTeam.teamCode}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedTeam.members?.map((m, i) => (
                        <span key={i} className="text-[10px] font-mono text-white/40 border border-white/10 px-2 py-0.5">
                          {i === 0 ? '★ ' : ''}{m}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[#7c3aed]/40 text-xs font-mono tracking-widest">CURRENT TOTAL</p>
                    <p className="text-[#a78bfa] font-black font-mono text-4xl"
                      style={{ textShadow: '0 0 20px rgba(167,139,250,0.4)' }}>
                      {selectedTeam.totalScore}
                    </p>
                    <p className="text-[#7c3aed]/30 text-xs font-mono">pts</p>
                  </div>
                </div>
              </div>

              {/* ── Station editors ───────────────────────────────────── */}
              <div className="relative border border-[#7c3aed]/20 bg-[#0a0015] p-5">
                <div className="corner-tl" /><div className="corner-tr" />
                <div className="corner-bl" /><div className="corner-br" />

                <p className="text-[#7c3aed]/50 text-xs tracking-[0.3em] font-mono mb-4">◈ STATION SCORES & ATTEMPTS</p>

                <div className="space-y-3">
                  {[1, 2, 3, 4].map((s) => {
                    const scoreKey   = `station${s}Score`   as keyof EditDraft;
                    const attemptKey = `station${s}Attempts` as keyof EditDraft;
                    const done       = selectedTeam.completedStations?.includes(s);

                    return (
                      <div key={s}
                        className={`relative p-4 border transition-all
                          ${done
                            ? 'border-[#7c3aed]/40 bg-[#7c3aed]/5'
                            : 'border-white/8 bg-white/[0.01]'}`}
                      >
                        {/* Station label */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 flex items-center justify-center text-xs font-black font-mono
                              ${done ? 'bg-[#7c3aed]/20 text-[#a78bfa]' : 'bg-white/5 text-white/30'}`}
                              style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
                              {s}
                            </div>
                            <div>
                              <p className={`text-xs font-black font-mono tracking-widest
                                ${done ? 'text-[#a78bfa]' : 'text-white/40'}`}>
                                STATION {s} — {STATION_NAMES[s].toUpperCase()}
                              </p>
                              {done && (
                                <p className="text-[#7c3aed]/50 text-[10px] font-mono">✓ COMPLETED</p>
                              )}
                            </div>
                          </div>

                          {/* Per-station reset */}
                          {confirmReset === s ? (
                            <div className="flex items-center gap-2">
                              <span className="text-yellow-400/80 text-[10px] font-mono">CONFIRM?</span>
                              <button
                                onClick={() => handleStationReset(s)}
                                disabled={saving}
                                className="clip-btn px-3 py-1 text-[10px] border border-red-700/50 bg-red-900/20 text-red-400 disabled:opacity-40"
                              >YES</button>
                              <button
                                onClick={() => setConfirmReset(null)}
                                className="clip-btn px-3 py-1 text-[10px] border border-white/10 bg-white/5 text-white/40"
                              >NO</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmReset(s)}
                              className="clip-btn px-3 py-1 text-[10px] border border-red-800/30 bg-red-900/10 text-red-500/60 hover:text-red-400 hover:border-red-700/50"
                            >
                              ✕ RESET S{s}
                            </button>
                          )}
                        </div>

                        {/* Score + Attempts inputs */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[#7c3aed]/40 text-[10px] font-mono tracking-widest mb-1.5">SCORE (0–1000)</p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditDraft({
                                  ...editDraft,
                                  [scoreKey]: String(Math.max(0, (parseInt(editDraft[scoreKey]) || 0) - 50))
                                })}
                                className="w-8 h-9 border border-[#7c3aed]/20 bg-[#7c3aed]/5 text-[#a78bfa] font-mono text-lg hover:bg-[#7c3aed]/15 transition-all flex items-center justify-center"
                              >−</button>
                              <input
                                type="number"
                                min={0}
                                max={1000}
                                value={editDraft[scoreKey]}
                                onChange={(e) => setEditDraft({ ...editDraft, [scoreKey]: e.target.value })}
                                className="num-input"
                              />
                              <button
                                onClick={() => setEditDraft({
                                  ...editDraft,
                                  [scoreKey]: String(Math.min(1000, (parseInt(editDraft[scoreKey]) || 0) + 50))
                                })}
                                className="w-8 h-9 border border-[#7c3aed]/20 bg-[#7c3aed]/5 text-[#a78bfa] font-mono text-lg hover:bg-[#7c3aed]/15 transition-all flex items-center justify-center"
                              >+</button>
                            </div>
                          </div>
                          <div>
                            <p className="text-[#7c3aed]/40 text-[10px] font-mono tracking-widest mb-1.5">ATTEMPTS</p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditDraft({
                                  ...editDraft,
                                  [attemptKey]: String(Math.max(0, (parseInt(editDraft[attemptKey]) || 0) - 1))
                                })}
                                className="w-8 h-9 border border-[#7c3aed]/20 bg-[#7c3aed]/5 text-[#a78bfa] font-mono text-lg hover:bg-[#7c3aed]/15 transition-all flex items-center justify-center"
                              >−</button>
                              <input
                                type="number"
                                min={0}
                                value={editDraft[attemptKey]}
                                onChange={(e) => setEditDraft({ ...editDraft, [attemptKey]: e.target.value })}
                                className="num-input"
                              />
                              <button
                                onClick={() => setEditDraft({
                                  ...editDraft,
                                  [attemptKey]: String((parseInt(editDraft[attemptKey]) || 0) + 1)
                                })}
                                className="w-8 h-9 border border-[#7c3aed]/20 bg-[#7c3aed]/5 text-[#a78bfa] font-mono text-lg hover:bg-[#7c3aed]/15 transition-all flex items-center justify-center"
                              >+</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Live preview total */}
                <div className="mt-4 pt-4 border-t border-[#7c3aed]/15 flex items-center justify-between">
                  <p className="text-[#7c3aed]/40 text-xs font-mono tracking-widest">PREVIEW TOTAL</p>
                  <p className="text-[#a78bfa] font-black font-mono text-2xl">
                    {
                      (parseInt(editDraft.station1Score) || 0) +
                      (parseInt(editDraft.station2Score) || 0) +
                      (parseInt(editDraft.station3Score) || 0) +
                      (parseInt(editDraft.station4Score) || 0)
                    }
                    <span className="text-[#7c3aed]/30 text-sm ml-1">pts</span>
                  </p>
                </div>
              </div>

              {/* ── Save message ───────────────────────────────────────── */}
              {saveMsg && (
                <div className={`panel-fade px-5 py-3 border font-mono text-sm
                  ${saveMsg.type === 'ok'
                    ? 'border-green-500/40 bg-green-900/10 text-green-400'
                    : 'border-red-500/40 bg-red-900/10 text-red-400'}`}
                  style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
                >
                  {saveMsg.type === 'ok' ? '✓ ' : '✕ '}{saveMsg.text}
                </div>
              )}

              {/* ── Action buttons ─────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                {/* Save */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="clip-btn col-span-2 py-4 text-sm font-black border-2 border-[#7c3aed]/60 bg-[#7c3aed]/20 text-white tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ boxShadow: '0 0 20px rgba(124,58,237,0.15)' }}
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      SAVING...
                    </span>
                  ) : '💾 SAVE ALL CHANGES'}
                </button>

                {/* Full reset */}
                {confirmReset === 0 ? (
                  <>
                    <button
                      onClick={handleFullReset}
                      disabled={saving}
                      className="clip-btn py-3 text-sm font-black border border-red-600/60 bg-red-900/30 text-red-300 disabled:opacity-40"
                    >
                      ⚠ CONFIRM FULL RESET
                    </button>
                    <button
                      onClick={() => setConfirmReset(null)}
                      className="clip-btn py-3 text-sm font-black border border-white/10 bg-white/5 text-white/40"
                    >
                      CANCEL
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setConfirmReset(0)}
                      className="clip-btn py-3 text-sm font-black border border-red-800/40 bg-red-900/10 text-red-500/70 hover:text-red-400 hover:border-red-700/50"
                    >
                      ✕ RESET ALL SCORES
                    </button>
                    <button
                      onClick={() => { setSelectedTeam(null); setEditDraft(null); setSaveMsg(null); }}
                      className="clip-btn py-3 text-sm font-black border border-white/10 bg-white/5 text-white/40"
                    >
                      CLOSE
                    </button>
                  </>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
