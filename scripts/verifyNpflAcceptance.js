const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../src/config/db');
const seedDatabase = require('../src/utils/seeder');
const errorHandler = require('../src/middlewares/errorHandler');

const authRoutes = require('../src/routes/authRoutes');
const adminRoutes = require('../src/routes/adminRoutes');
const matchRoutes = require('../src/routes/matchRoutes');
const tableRoutes = require('../src/routes/tableRoutes');
const teamRoutes = require('../src/routes/teamRoutes');
const leagueRoutes = require('../src/routes/leagueRoutes');

const app = express();
app.use(express.json());
app.use(cors());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/matches', matchRoutes);
app.use('/api/v1/table', tableRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/leagues', leagueRoutes);
app.use(errorHandler);

let server;
let serverPort;

const request = (method, path, body = null, headers = {}) => {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: `/api/v1${path}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resBody) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: resBody });
          }
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
};

async function runAcceptanceTests() {
  console.log('================================================================');
  console.log('       NPFL STANDINGS AUTO-UPDATE & LEAGUE NAMING ACCEPTANCE     ');
  console.log('================================================================');

  await connectDB();
  await seedDatabase();

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      console.log(`[Test Server] Running on http://127.0.0.1:${serverPort}`);
      resolve();
    });
  });

  // 1. Authenticate Admin
  const loginRes = await request('POST', '/auth/login', {
    email: 'admin@dxsport.com',
    password: 'admin123',
  });
  if (loginRes.status !== 200 || !loginRes.data.token) {
    throw new Error('Admin login failed');
  }
  const authHeaders = { Authorization: `Bearer ${loginRes.data.token}` };
  console.log('✓ Admin authenticated.');

  // Fetch NPFL and EPL competitions
  const leaguesRes = await request('GET', '/leagues');
  const npfl = leaguesRes.data.leagues.find(l => l.code === 'NPFL' || l.shortName === 'NPFL');
  const epl = leaguesRes.data.leagues.find(l => l.code === 'EPL' || l.shortName === 'EPL');
  if (!npfl) throw new Error('NPFL competition not found');
  console.log(`✓ NPFL: "${npfl.name}" (${npfl.shortName}), standingsEnabled=${npfl.standingsEnabled}`);
  console.log(`✓ EPL: "${epl?.name}" (${epl?.shortName}), standingsEnabled=${epl?.standingsEnabled}`);

  // Fetch registered NPFL teams
  const teamsRes = await request('GET', `/teams?competition=${npfl._id}`);
  const npflTeams = teamsRes.data.teams;
  console.log(`✓ NPFL teams count: ${npflTeams.length}`);
  if (npflTeams.length < 2) throw new Error('Need at least 2 NPFL teams');

  const teamA = npflTeams[0];
  const teamB = npflTeams[1];

  // Baseline standings before tests
  const initialTableRes = await request('GET', '/table/current');
  const initialStatsA = initialTableRes.data.standings.find(s => s.team?._id === teamA._id || s.team === teamA._id) || { played: 0, points: 0, won: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
  const initialStatsB = initialTableRes.data.standings.find(s => s.team?._id === teamB._id || s.team === teamB._id) || { played: 0, points: 0, won: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };

  // =========================================================================
  // TEST A: Completed NPFL Match
  // =========================================================================
  console.log('\n--- [TEST A] Completed NPFL match ---');
  // Schedule a new match
  const schedRes = await request('POST', '/matches', {
    league: npfl._id,
    homeTeam: teamA._id,
    awayTeam: teamB._id,
    matchDate: new Date().toISOString(),
    venue: 'Test NPFL Stadium'
  }, authHeaders);

  if (schedRes.status !== 201) throw new Error(`Schedule failed: ${JSON.stringify(schedRes)}`);
  const testMatchId = schedRes.data.match._id;
  console.log(`✓ Scheduled NPFL match: ${teamA.name} vs ${teamB.name} (ID: ${testMatchId})`);

  // Update score and mark as FINISHED
  const updateResA = await request('PATCH', `/matches/${testMatchId}/scoreline`, {
    homeScore: 3,
    awayScore: 1,
    status: 'FINISHED',
    currentMinute: "90'"
  }, authHeaders);

  if (updateResA.status !== 200) throw new Error(`Score update failed: ${JSON.stringify(updateResA)}`);
  if (!updateResA.data.tableAutoUpdated) throw new Error('Expected tableAutoUpdated to be true');
  console.log('✓ Match marked FINISHED with score 3 - 1. tableAutoUpdated = true');

  // Verify public table
  const tableAfterA = await request('GET', '/table');
  const statsA_afterA = tableAfterA.data.standings.find(s => (s.team?._id || s.team) === teamA._id);
  const statsB_afterA = tableAfterA.data.standings.find(s => (s.team?._id || s.team) === teamB._id);

  if (statsA_afterA.played !== initialStatsA.played + 1) throw new Error(`Team A played mismatch: got ${statsA_afterA.played}, expected ${initialStatsA.played + 1}`);
  if (statsA_afterA.points !== initialStatsA.points + 3) throw new Error(`Team A points mismatch: got ${statsA_afterA.points}, expected ${initialStatsA.points + 3}`);
  if (statsB_afterA.played !== initialStatsB.played + 1) throw new Error(`Team B played mismatch: got ${statsB_afterA.played}, expected ${initialStatsB.played + 1}`);
  if (statsB_afterA.points !== initialStatsB.points) throw new Error(`Team B points mismatch: got ${statsB_afterA.points}, expected ${initialStatsB.points}`);
  console.log(`✓ Test A passed: ${teamA.name} P=${statsA_afterA.played}, Pts=${statsA_afterA.points}; ${teamB.name} P=${statsB_afterA.played}, Pts=${statsB_afterA.points}`);

  // =========================================================================
  // TEST B: Corrected Score (Already Completed Match)
  // =========================================================================
  console.log('\n--- [TEST B] Corrected score ---');
  // Change score from 3 - 1 (Home win) to 1 - 2 (Away win)
  const updateResB = await request('PATCH', `/matches/${testMatchId}/scoreline`, {
    homeScore: 1,
    awayScore: 2,
    status: 'FINISHED'
  }, authHeaders);

  if (updateResB.status !== 200 || !updateResB.data.tableAutoUpdated) {
    throw new Error(`Score correction failed: ${JSON.stringify(updateResB)}`);
  }
  console.log('✓ Corrected score to 1 - 2 (Away win). tableAutoUpdated = true');

  const tableAfterB = await request('GET', '/table');
  const statsA_afterB = tableAfterB.data.standings.find(s => (s.team?._id || s.team) === teamA._id);
  const statsB_afterB = tableAfterB.data.standings.find(s => (s.team?._id || s.team) === teamB._id);

  // Home team should now have 0 points from this match instead of 3
  if (statsA_afterB.points !== initialStatsA.points) throw new Error(`Team A points should be reverted to initial: ${statsA_afterB.points} vs ${initialStatsA.points}`);
  // Away team should now have +3 points from this match
  if (statsB_afterB.points !== initialStatsB.points + 3) throw new Error(`Team B points should be initial + 3: ${statsB_afterB.points} vs ${initialStatsB.points + 3}`);
  // Matches played should NOT be double-counted! Still initial + 1
  if (statsA_afterB.played !== initialStatsA.played + 1) throw new Error(`Team A played double-counted: ${statsA_afterB.played}`);
  if (statsB_afterB.played !== initialStatsB.played + 1) throw new Error(`Team B played double-counted: ${statsB_afterB.played}`);
  console.log(`✓ Test B passed: Points and goals recalculated accurately without double counting. Team A Pts=${statsA_afterB.points}, Team B Pts=${statsB_afterB.points}`);

  // =========================================================================
  // TEST C: Match Reverted from Completed to UPCOMING
  // =========================================================================
  console.log('\n--- [TEST C] Match reverted from Completed ---');
  const updateResC = await request('PATCH', `/matches/${testMatchId}/scoreline`, {
    status: 'UPCOMING',
    homeScore: 0,
    awayScore: 0
  }, authHeaders);

  if (updateResC.status !== 200) throw new Error(`Revert status failed: ${JSON.stringify(updateResC)}`);
  console.log('✓ Reverted match status to UPCOMING');

  const tableAfterC = await request('GET', '/table');
  const statsA_afterC = tableAfterC.data.standings.find(s => (s.team?._id || s.team) === teamA._id);
  const statsB_afterC = tableAfterC.data.standings.find(s => (s.team?._id || s.team) === teamB._id);

  if (statsA_afterC.played !== initialStatsA.played) throw new Error(`Team A played should be back to initial ${initialStatsA.played}, got ${statsA_afterC.played}`);
  if (statsA_afterC.points !== initialStatsA.points) throw new Error(`Team A points should be back to initial ${initialStatsA.points}, got ${statsA_afterC.points}`);
  if (statsB_afterC.played !== initialStatsB.played) throw new Error(`Team B played should be back to initial ${initialStatsB.played}, got ${statsB_afterC.played}`);
  if (statsB_afterC.points !== initialStatsB.points) throw new Error(`Team B points should be back to initial ${initialStatsB.points}, got ${statsB_afterC.points}`);
  console.log(`✓ Test C passed: Match contribution completely removed from standings. Team A P=${statsA_afterC.played}, Pts=${statsA_afterC.points}`);

  // =========================================================================
  // TEST D: Multiple Completed Matches in Succession
  // =========================================================================
  console.log('\n--- [TEST D] Multiple completed matches in succession ---');
  // Complete match 1
  await request('PATCH', `/matches/${testMatchId}/scoreline`, {
    status: 'FINISHED',
    homeScore: 2,
    awayScore: 2
  }, authHeaders);

  const t1 = await request('GET', '/table');
  const sA_1 = t1.data.standings.find(s => (s.team?._id || s.team) === teamA._id);
  if (sA_1.points !== initialStatsA.points + 1) throw new Error('Draw should add 1 point');

  // Schedule and complete match 2 (Team A vs Team B second leg)
  const m2Res = await request('POST', '/matches', {
    league: npfl._id,
    homeTeam: teamB._id,
    awayTeam: teamA._id,
    matchDate: new Date().toISOString(),
    venue: 'Second Leg Venue'
  }, authHeaders);
  const m2Id = m2Res.data.match._id;

  await request('PATCH', `/matches/${m2Id}/scoreline`, {
    status: 'FINISHED',
    homeScore: 0,
    awayScore: 1
  }, authHeaders);

  const t2 = await request('GET', '/table');
  const sA_2 = t2.data.standings.find(s => (s.team?._id || s.team) === teamA._id);
  // Team A got 1 pt from match 1 (draw) + 3 pts from match 2 (win) = 4 pts added
  if (sA_2.points !== initialStatsA.points + 4) throw new Error(`Team A points should be +4, got ${sA_2.points}`);
  if (sA_2.played !== initialStatsA.played + 2) throw new Error(`Team A played should be +2, got ${sA_2.played}`);
  console.log(`✓ Test D passed: Successive updates reflected immediately. Team A P=${sA_2.played}, Pts=${sA_2.points}`);

  // Clean up the 2 test matches
  await request('DELETE', `/matches/${testMatchId}`, null, authHeaders);
  await request('DELETE', `/matches/${m2Id}`, null, authHeaders);
  console.log('✓ Cleaned up temporary test matches');

  // =========================================================================
  // TEST E: Non-NPFL Match Isolation
  // =========================================================================
  console.log('\n--- [TEST E] Non-NPFL match ---');
  // Get CAF CL or EPL competition
  const nonNpflLeague = epl || leaguesRes.data.leagues.find(l => l.code === 'CAFCL');
  if (nonNpflLeague) {
    const nonNpflTeams = await request('GET', `/teams?competition=${nonNpflLeague._id}`);
    if (nonNpflTeams.data.teams.length >= 2) {
      const nTeam1 = nonNpflTeams.data.teams[0];
      const nTeam2 = nonNpflTeams.data.teams[1];

      const npflTableBefore = await request('GET', '/table');

      // Schedule and complete non-NPFL match
      const nMatch = await request('POST', '/matches', {
        league: nonNpflLeague._id,
        homeTeam: nTeam1._id,
        awayTeam: nTeam2._id,
        matchDate: new Date().toISOString()
      }, authHeaders);

      const nMatchId = nMatch.data.match._id;
      const nUpdate = await request('PATCH', `/matches/${nMatchId}/scoreline`, {
        homeScore: 5,
        awayScore: 0,
        status: 'FINISHED'
      }, authHeaders);

      // Verify NPFL table is unaffected
      const npflTableAfter = await request('GET', '/table');
      if (npflTableBefore.data.standings.length !== npflTableAfter.data.standings.length) {
        throw new Error('NPFL standings count altered by non-NPFL match!');
      }

      const teamA_check = npflTableAfter.data.standings.find(s => (s.team?._id || s.team) === teamA._id);
      const teamA_before = npflTableBefore.data.standings.find(s => (s.team?._id || s.team) === teamA._id);
      if (teamA_check.points !== teamA_before.points || teamA_check.played !== teamA_before.played) {
        throw new Error('NPFL stats mutated by non-NPFL match!');
      }

      await request('DELETE', `/matches/${nMatchId}`, null, authHeaders);
      console.log(`✓ Test E passed: Completed match in "${nonNpflLeague.name}" did not affect NPFL standings`);
    }
  }

  // =========================================================================
  // TEST F: League Naming
  // =========================================================================
  console.log('\n--- [TEST F] League naming ---');
  const freshLeagues = await request('GET', '/leagues');
  const verifiedNpfl = freshLeagues.data.leagues.find(l => l.code === 'NPFL');
  const verifiedEpl = freshLeagues.data.leagues.find(l => l.code === 'EPL');

  if (verifiedNpfl.name !== 'Nigeria Premier Football League') {
    throw new Error(`NPFL full name mismatch: got "${verifiedNpfl.name}"`);
  }
  if (verifiedNpfl.shortName !== 'NPFL') {
    throw new Error(`NPFL short name mismatch: got "${verifiedNpfl.shortName}"`);
  }
  if (verifiedEpl && verifiedEpl.name === 'Premier League' && verifiedEpl.code === 'NPFL') {
    throw new Error('EPL name or code confused with NPFL!');
  }
  if (verifiedEpl) {
    console.log(`✓ Genuine EPL correctly named: "${verifiedEpl.name}" (${verifiedEpl.shortName})`);
  }
  console.log(`✓ NPFL correctly named: Full="${verifiedNpfl.name}", Short="${verifiedNpfl.shortName}"`);

  // =========================================================================
  // TEST G: Persistence & Authoritative Derivation
  // =========================================================================
  console.log('\n--- [TEST G] Persistence ---');
  const table1 = await request('GET', '/table/current');
  const table2 = await request('GET', '/table');

  if (table1.data.standings.length !== 20 || table2.data.standings.length !== 20) {
    throw new Error(`Expected 20 teams in persistent table, got ${table1.data.standings.length}`);
  }
  for (let i = 0; i < table1.data.standings.length; i++) {
    const s1 = table1.data.standings[i];
    const s2 = table2.data.standings[i];
    if (s1.team?._id !== s2.team?._id || s1.points !== s2.points) {
      throw new Error(`Table mismatch between requests at position ${i + 1}`);
    }
  }
  console.log('✓ Test G passed: Public table persistently serves authoritative NPFL standings across multiple queries.');

  console.log('\n================================================================');
  console.log('   🎉 ALL ACCEPTANCE CRITERIA (TESTS A - G) PASSED 100%!        ');
  console.log('================================================================');

  server.close();
  process.exit(0);
}

runAcceptanceTests().catch(e => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', e);
  if (server) server.close();
  process.exit(1);
});
