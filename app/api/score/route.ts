// app/api/score/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// ── CORS headers — required for Arduino/non-browser clients ──────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, User-Agent',
};

// ── Handle OPTIONS preflight ──────────────────────────────────────────────────
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: CORS_HEADERS });
}

// ── POST /api/score ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamCode, station, score } = body;

    console.log('Score submission:', { teamCode, station, score });

    if (!teamCode || station === undefined || score === undefined) {
      return NextResponse.json(
        { error: 'Missing fields' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ── Find team by teamCode ─────────────────────────────────────────────
    const teamsSnap = await db
      .collection('teams')
      .where('teamCode', '==', teamCode)
      .limit(1)
      .get();

    if (teamsSnap.empty) {
      console.log('Team not found:', teamCode);
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const teamDoc  = teamsSnap.docs[0];
    const teamData = teamDoc.data();

    const stationNum = Number(station);
    const stationKey = `station${stationNum}Score`;
    const completedStations: number[] = teamData.completedStations || [];

    // ── Guard: don't overwrite already submitted station ──────────────────
    if (completedStations.includes(stationNum)) {
      console.log('Station already completed:', stationNum);
      return NextResponse.json(
        { message: 'Already submitted', score: teamData[stationKey] },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // ── Update team doc ───────────────────────────────────────────────────
    await teamDoc.ref.update({
      [stationKey]: score,
      completedStations: FieldValue.arrayUnion(stationNum),
      totalScore: FieldValue.increment(score),
    });

    console.log(`Score saved: team=${teamCode} station=${stationNum} score=${score}`);

    return NextResponse.json(
      { success: true, score, station: stationNum },
      { status: 200, headers: CORS_HEADERS }
    );

  } catch (err) {
    console.error('Score API error:', err);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
