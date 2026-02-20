// app/api/score/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, User-Agent',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamCode, station, score, isFail } = body;

    console.log('Score submission:', { teamCode, station, score, isFail });

    if (!teamCode || station === undefined || score === undefined) {
      return NextResponse.json(
        { error: 'Missing fields' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const stationNum = Number(station);

    // ── Check round is active for this station ─────────────────────────────
    const workshopSnap = await db.doc('workshops/feb2026').get();
    if (workshopSnap.exists) {
      const ws = workshopSnap.data()!;

      // ── ALL-STATIONS MODE ──────────────────────────────────────────────
      // When admin clicks "Start All", allActive=true and activeStation=null.
      // In this mode, check the per-station sub-document instead.
      const isAllMode = ws.allActive === true;

      if (isAllMode) {
        // Check per-station sub-doc: ws.station1, ws.station2, etc.
        const stationKey  = `station${stationNum}`;
        const stationData = ws[stationKey];

        if (!stationData || stationData.roundActive !== true) {
          console.log(`[ALL MODE] Rejected: station${stationNum} not active`);
          return NextResponse.json(
            { error: 'Round not active for this station' },
            { status: 403, headers: CORS_HEADERS }
          );
        }

        // Check if this station's timer has expired
        if (stationData.roundStartedAt && stationData.roundTimeLimit) {
          const elapsedSec =
            (Date.now() - stationData.roundStartedAt) / 1000;
          if (elapsedSec > stationData.roundTimeLimit) {
            console.log(`[ALL MODE] Rejected: station${stationNum} timer expired`);
            return NextResponse.json(
              { error: 'Round not active' },
              { status: 403, headers: CORS_HEADERS }
            );
          }
        }

        console.log(`[ALL MODE] station${stationNum} accepted`);

      } else {
        // ── SINGLE-STATION MODE (original logic) ────────────────────────
        if (!ws.roundActive) {
          console.log('Rejected: round not active');
          return NextResponse.json(
            { error: 'Round not active' },
            { status: 403, headers: CORS_HEADERS }
          );
        }

        // activeStation === null means no station launched yet
        if (ws.activeStation === null || ws.activeStation === undefined) {
          console.log('Rejected: no active station');
          return NextResponse.json(
            { error: 'Round not active' },
            { status: 403, headers: CORS_HEADERS }
          );
        }

        if (ws.activeStation !== stationNum) {
          console.log(
            `Rejected: active station is ${ws.activeStation}, got ${stationNum}`
          );
          return NextResponse.json(
            { error: 'Wrong station — not your turn' },
            { status: 403, headers: CORS_HEADERS }
          );
        }

        // Check top-level timer expiry for single-station mode
        if (ws.roundStartedAt && ws.roundTimeLimit) {
          const elapsedSec = (Date.now() - ws.roundStartedAt) / 1000;
          if (elapsedSec > ws.roundTimeLimit) {
            console.log('Rejected: round timer expired');
            return NextResponse.json(
              { error: 'Round not active' },
              { status: 403, headers: CORS_HEADERS }
            );
          }
        }

        console.log(`[SINGLE MODE] station${stationNum} accepted`);
      }
    }

    // ── Find team ──────────────────────────────────────────────────────────
    const teamsSnap = await db
      .collection('teams')
      .where('teamCode', '==', teamCode)
      .limit(1)
      .get();

    if (teamsSnap.empty) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const teamDoc  = teamsSnap.docs[0];
    const teamData = teamDoc.data();

    const attemptKey        = `station${stationNum}Attempts`;
    const stationKey        = `station${stationNum}Score`;
    const completedStations = teamData.completedStations || [];
    const currentAttempts   = teamData[attemptKey] || 0;

    // ── If fail, just register attempt — don't save score ─────────────────
    if (isFail) {
      console.log('Fail attempt registered — no score saved');
      return NextResponse.json(
        { message: 'Fail registered', attempts: currentAttempts + 1 },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // ── Increment attempt count for winning submissions only ───────────────
    await teamDoc.ref.update({
      [attemptKey]: FieldValue.increment(1),
    });

    console.log(
      `Attempt #${currentAttempts + 1} for team=${teamCode} station=${stationNum}`
    );

    // ── Guard: already submitted a winning score ───────────────────────────
    if (completedStations.includes(stationNum)) {
      console.log('Already completed — keeping first score');
      return NextResponse.json(
        { message: 'Already submitted', score: teamData[stationKey] },
        { status: 409, headers: CORS_HEADERS }
      );
    }

    // ── Apply attempt penalty cap ──────────────────────────────────────────
    let cappedScore = score;
    if      (currentAttempts === 1) cappedScore = Math.min(score, 800);
    else if (currentAttempts === 2) cappedScore = Math.min(score, 600);
    else if (currentAttempts >= 3)  cappedScore = Math.min(score, 400);
    // currentAttempts === 0 → first winning attempt → no cap → full score

    console.log(
      `Score: raw=${score} attempts=${currentAttempts} capped=${cappedScore}`
    );

    // ── Save score ─────────────────────────────────────────────────────────
    await teamDoc.ref.update({
      [stationKey]:       cappedScore,
      completedStations:  FieldValue.arrayUnion(stationNum),
      totalScore:         FieldValue.increment(cappedScore),
    });

    console.log(
      `Saved: team=${teamCode} station=${stationNum} score=${cappedScore}`
    );

    return NextResponse.json(
      {
        success:  true,
        score:    cappedScore,
        raw:      score,
        attempts: currentAttempts + 1,
      },
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
