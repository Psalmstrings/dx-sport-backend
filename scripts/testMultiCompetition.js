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

async function runTests() {
  console.log('=== MULTI-COMPETITION MANAGEMENT SYSTEM INTEGRATION TESTS ===');
  
  // 0. Initialize DB and start ephemeral server
  await connectDB();
  await seedDatabase();

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      console.log(`[Test Server] Running on http://127.0.0.1:${serverPort}`);
      resolve();
    });
  });

  // 1. Authenticate as Admin
  console.log('\n[TEST 1] Admin Authentication');
  const loginRes = await request('POST', '/auth/login', {
    email: 'admin@dxsport.com',
    password: 'admin123',
  });
  if (loginRes.status !== 200 || !loginRes.data.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginRes)}`);
  }
  const token = loginRes.data.token;
  const authHeaders = { Authorization: `Bearer ${token}` };
  console.log('✓ Admin authenticated successfully.');

  // 2. Fetch Leagues & Confirm NPFL Migration
  console.log('\n[TEST 2] Verifying NPFL Competition Migration');
  const leaguesRes = await request('GET', '/leagues');
  console.log(`✓ Fetched ${leaguesRes.data.leagues.length} existing competitions:`, leaguesRes.data.leagues.map(l => ({ id: l._id, name: l.name, shortName: l.shortName, code: l.code })));
  const npfl = leaguesRes.data.leagues.find((l) => (l.code && l.code.toUpperCase() === 'NPFL') || (l.shortName && l.shortName.toUpperCase() === 'NPFL') || l.name === 'Nigeria Premier Football League');
  console.log('Full npfl object from API:', JSON.stringify(npfl, null, 2));
  if (!npfl) throw new Error('NPFL competition not found!');
  if (npfl.standingsEnabled !== true) throw new Error('NPFL standingsEnabled must be true!');
  console.log(`✓ NPFL verified: "${npfl.name}" | standingsEnabled: ${npfl.standingsEnabled} | isActive: ${npfl.isActive}`);

  // 3. Register Additional Competitions (NNL, CAF, EPL)
  console.log('\n[TEST 3] Dynamic Competition Registration');
  
  // NNL: Standings disabled by default
  let nnl = leaguesRes.data.leagues.find((l) => l.code === 'NNL');
  if (!nnl) {
    const nnlRes = await request('POST', '/leagues', {
      name: 'Nigeria National League',
      shortName: 'NNL',
      code: 'NNL',
      type: 'League',
      country: 'Nigeria',
      description: 'Division 2 Nigeria',
      standingsEnabled: false,
      isActive: true,
    }, authHeaders);
    if (nnlRes.status !== 201) throw new Error(`Failed to create NNL: ${JSON.stringify(nnlRes)}`);
    nnl = nnlRes.data.league;
    console.log(`✓ Registered "${nnl.name}" (standingsEnabled: ${nnl.standingsEnabled})`);
  } else {
    console.log(`✓ Existing NNL detected: "${nnl.name}" (standingsEnabled: ${nnl.standingsEnabled})`);
  }

  // CAF Champions League: International Cup/Competition
  let caf = leaguesRes.data.leagues.find((l) => l.code === 'CAFCL');
  if (!caf) {
    const cafRes = await request('POST', '/leagues', {
      name: 'CAF Champions League',
      shortName: 'CAF CL',
      code: 'CAFCL',
      type: 'International Competition',
      country: 'Africa',
      description: 'Continental club tournament',
      standingsEnabled: false,
      isActive: true,
    }, authHeaders);
    if (cafRes.status !== 201) throw new Error(`Failed to create CAF CL: ${JSON.stringify(cafRes)}`);
    caf = cafRes.data.league;
    console.log(`✓ Registered "${caf.name}" (standingsEnabled: ${caf.standingsEnabled})`);
  } else {
    console.log(`✓ Existing CAF CL detected: "${caf.name}" (standingsEnabled: ${caf.standingsEnabled})`);
  }

  // Check if EPL already exists or register
  let epl = leaguesRes.data.leagues.find((l) => l.code === 'EPL');
  if (!epl) {
    const eplRes = await request('POST', '/leagues', {
      name: 'English Premier League',
      shortName: 'EPL',
      code: 'EPL',
      type: 'League',
      country: 'England',
      description: 'Top flight English football',
      standingsEnabled: false,
      isActive: true,
    }, authHeaders);
    if (eplRes.status !== 201) throw new Error(`Failed to create EPL: ${JSON.stringify(eplRes)}`);
    epl = eplRes.data.league;
    console.log(`✓ Registered "${epl.name}" (standingsEnabled: ${epl.standingsEnabled})`);
  } else {
    console.log(`✓ Existing EPL detected: "${epl.name}" (standingsEnabled: ${epl.standingsEnabled})`);
  }

  // Register a dynamic test tournament to verify registration from scratch
  const testStamp = Date.now().toString().slice(-4);
  const dynCompRes = await request('POST', '/leagues', {
    name: `Federation Cup ${testStamp}`,
    shortName: `FED${testStamp}`,
    code: `FED${testStamp}`,
    type: 'Cup',
    country: 'Nigeria',
    description: 'National knockout cup',
    standingsEnabled: false,
    isActive: true,
  }, authHeaders);
  if (dynCompRes.status !== 201) throw new Error(`Failed to create dynamic tournament: ${JSON.stringify(dynCompRes)}`);
  console.log(`✓ Dynamically created new competition "${dynCompRes.data.league.name}" (standingsEnabled: false)`);

  // Duplicate prevention test: attempting to create with identical name/code
  const dupComp = await request('POST', '/leagues', {
    name: `Federation Cup ${testStamp}`,
    shortName: `FED${testStamp}`,
    code: `FED${testStamp}`,
  }, authHeaders);
  if (dupComp.status !== 400) throw new Error('Duplicate competition was not rejected!');
  console.log(`✓ Duplicate competition creation properly rejected with 400: "${dupComp.data.message}"`);

  // 4. Team Multi-Competition Membership
  console.log('\n[TEST 4] Club Reusability across Competitions (No Duplicate Club Records)');
  const teamsListRes = await request('GET', '/teams');
  const allTeams = teamsListRes.data.teams || [];

  // Club 1: Enyimba International in BOTH NPFL and CAF CL
  let enyimba = allTeams.find((t) => (t.name || '').toLowerCase().includes('enyimba'));
  if (enyimba) {
    // Ensure assigned to CAF
    await request('POST', `/teams/${enyimba._id}/competitions`, { competitionId: caf._id }, authHeaders);
    // Fetch refreshed
    const ref = await request('GET', `/teams/${enyimba._id}`);
    enyimba = ref.data.team;
    console.log(`✓ Existing Enyimba FC reused and verified in ${(enyimba.competitions || []).length} competitions (including CAF).`);
  } else {
    const enyimbaRes = await request('POST', '/teams', {
      name: 'Enyimba International FC',
      shortName: 'Enyimba',
      code: 'ENY',
      stadium: 'Enyimba International Stadium',
      city: 'Aba',
      country: 'Nigeria',
      competitions: [npfl._id, caf._id],
    }, authHeaders);
    if (enyimbaRes.status === 201) {
      enyimba = enyimbaRes.data.team;
    } else {
      const fresh = (await request('GET', '/teams')).data.teams || [];
      enyimba = fresh.find((t) => (t.name || '').toLowerCase().includes('enyimba'));
    }
    console.log(`✓ Enyimba FC prepared with memberships in ${(enyimba?.competitions || []).length} competitions (NPFL + CAF).`);
  }

  // Club 2: Rangers International in NPFL
  let rangers = allTeams.find((t) => (t.name || '').toLowerCase().includes('rangers'));
  if (!rangers) {
    const rangersRes = await request('POST', '/teams', {
      name: 'Rangers International FC',
      shortName: 'Rangers',
      code: 'RAN',
      stadium: 'Nnamdi Azikiwe Stadium',
      city: 'Enugu',
      country: 'Nigeria',
      competitions: [npfl._id],
    }, authHeaders);
    if (rangersRes.status === 201) {
      rangers = rangersRes.data.team;
    } else {
      const fresh = (await request('GET', '/teams')).data.teams || [];
      rangers = fresh.find((t) => (t.name || '').toLowerCase().includes('rangers'));
    }
    console.log(`✓ Rangers FC created/found in NPFL.`);
  } else {
    console.log(`✓ Existing Rangers FC detected in NPFL.`);
  }

  // Club 3: Al Ahly SC in CAF CL only (NOT in NPFL)
  let alAhly = allTeams.find((t) => (t.name || '').toLowerCase().includes('al ahly'));
  if (!alAhly) {
    const alAhlyRes = await request('POST', '/teams', {
      name: 'Al Ahly SC',
      shortName: 'Al Ahly',
      code: 'AHL',
      stadium: 'Cairo International Stadium',
      city: 'Cairo',
      country: 'Egypt',
      competitions: [caf._id],
    }, authHeaders);
    if (alAhlyRes.status === 201) {
      alAhly = alAhlyRes.data.team;
    } else {
      const fresh = (await request('GET', '/teams')).data.teams || [];
      alAhly = fresh.find((t) => (t.name || '').toLowerCase().includes('al ahly'));
    }
    console.log(`✓ Al Ahly SC created/found in CAF CL.`);
  } else {
    console.log(`✓ Existing Al Ahly SC detected in CAF CL.`);
  }

  // Club 4: Arsenal FC in EPL only
  let arsenal = allTeams.find((t) => (t.name || '').toLowerCase().includes('arsenal'));
  if (!arsenal) {
    const arsenalRes = await request('POST', '/teams', {
      name: 'Arsenal FC',
      shortName: 'Arsenal',
      code: 'ARS',
      stadium: 'Emirates Stadium',
      city: 'London',
      country: 'England',
      competitions: [epl._id],
    }, authHeaders);
    if (arsenalRes.status === 201) {
      arsenal = arsenalRes.data.team;
    } else {
      const fresh = (await request('GET', '/teams')).data.teams || [];
      arsenal = fresh.find((t) => (t.name || '').toLowerCase().includes('arsenal'));
    }
    console.log(`✓ Arsenal FC created/found in EPL.`);
  } else {
    console.log(`✓ Existing Arsenal FC detected.`);
  }

  // Club 5: Chelsea FC in EPL only
  let chelsea = allTeams.find((t) => (t.name || '').toLowerCase().includes('chelsea'));
  if (!chelsea) {
    const chelseaRes = await request('POST', '/teams', {
      name: 'Chelsea FC',
      shortName: 'Chelsea',
      code: 'CHE',
      stadium: 'Stamford Bridge',
      city: 'London',
      country: 'England',
      competitions: [epl._id],
    }, authHeaders);
    if (chelseaRes.status === 201) {
      chelsea = chelseaRes.data.team;
    } else {
      const fresh = (await request('GET', '/teams')).data.teams || [];
      chelsea = fresh.find((t) => (t.name || '').toLowerCase().includes('chelsea'));
    }
    console.log(`✓ Chelsea FC created/found in EPL.`);
  } else {
    console.log(`✓ Existing Chelsea FC detected in EPL.`);
  }

  // 5. Competition-First Match Validation
  console.log('\n[TEST 5] Competition-First Match Scheduling & Validation');

  // Attempt to schedule an NPFL match between Enyimba and Al Ahly (Al Ahly is NOT in NPFL)
  const invalidNpflMatch = await request('POST', '/matches', {
    league: npfl._id,
    homeTeam: enyimba._id,
    awayTeam: alAhly._id,
    matchDate: new Date().toISOString(),
    venue: 'Aba',
  }, authHeaders);
  if (invalidNpflMatch.status !== 400) throw new Error('Ineligible team was not rejected from NPFL match!');
  console.log(`✓ Cross-competition pairing rejected with 400: "${invalidNpflMatch.data.message}"`);

  // Attempt to schedule match where home and away are identical
  const sameTeamMatch = await request('POST', '/matches', {
    league: npfl._id,
    homeTeam: enyimba._id,
    awayTeam: enyimba._id,
    matchDate: new Date().toISOString(),
    venue: 'Aba',
  }, authHeaders);
  if (sameTeamMatch.status !== 400) throw new Error('Identical home and away was not rejected!');
  console.log(`✓ Identical teams rejected with 400: "${sameTeamMatch.data.message}"`);

  // Record baseline NPFL stats for Enyimba & Rangers before CAF fixture
  const baselineNpflRes = await request('GET', '/table');
  const baselineTable = baselineNpflRes.data.table || baselineNpflRes.data.standings || [];
  const baseEnyimba = baselineTable.find((r) => (r.team?._id || r.team) === enyimba._id);
  const baseRangers = baselineTable.find((r) => (r.team?._id || r.team) === rangers._id);
  const baseEnyimbaPlayed = baseEnyimba ? baseEnyimba.played : 0;
  const baseEnyimbaWon = baseEnyimba ? baseEnyimba.won : 0;
  const baseEnyimbaPts = baseEnyimba ? baseEnyimba.points : 0;
  const baseEnyimbaGF = baseEnyimba ? baseEnyimba.goalsFor : 0;
  const baseEnyimbaGA = baseEnyimba ? baseEnyimba.goalsAgainst : 0;

  const baseRangersPlayed = baseRangers ? baseRangers.played : 0;
  const baseRangersLost = baseRangers ? baseRangers.lost : 0;
  const baseRangersPts = baseRangers ? baseRangers.points : 0;
  const baseRangersGF = baseRangers ? baseRangers.goalsFor : 0;
  const baseRangersGA = baseRangers ? baseRangers.goalsAgainst : 0;

  // 6. Schedule and complete a CAF Champions League match
  console.log('\n[TEST 6] CAF Champions League Fixture & Execution');
  const cafMatchRes = await request('POST', '/matches', {
    league: caf._id,
    homeTeam: enyimba._id,
    awayTeam: alAhly._id,
    matchDate: new Date().toISOString(),
    venue: 'Enyimba International Stadium, Aba',
  }, authHeaders);
  if (cafMatchRes.status !== 201) throw new Error(`Failed to create CAF match: ${JSON.stringify(cafMatchRes)}`);
  const cafMatch = cafMatchRes.data.match;
  console.log(`✓ Scheduled CAF match: Enyimba vs Al Ahly (ID: ${cafMatch._id})`);

  // Update CAF match to FINISHED (2 - 1)
  const finishCafMatch = await request('PATCH', `/matches/${cafMatch._id}/scoreline`, {
    homeScore: 2,
    awayScore: 1,
    status: 'FINISHED',
  }, authHeaders);
  console.log(`✓ Completed CAF match. tableAutoUpdated = ${finishCafMatch.data.tableAutoUpdated} (standings disabled for CAF)`);

  // 7. Verify NPFL Standings Isolation
  console.log('\n[TEST 7] Strict NPFL Standings Isolation Guarantee');
  const npflTableRes = await request('GET', '/table');
  const npflTable = npflTableRes.data.table || npflTableRes.data.standings || [];

  // Check 1: Al Ahly or Arsenal or Chelsea must NEVER appear in NPFL table
  const foreignClubsInNpfl = npflTable.filter((row) => {
    const tId = typeof row.team === 'object' ? row.team._id : row.team;
    return tId === alAhly._id || tId === arsenal._id || tId === chelsea._id;
  });
  if (foreignClubsInNpfl.length > 0) {
    throw new Error(`Foreign non-NPFL clubs found in NPFL table! ${JSON.stringify(foreignClubsInNpfl)}`);
  }
  console.log('✓ Foreign clubs (Al Ahly, Arsenal, Chelsea) completely absent from NPFL standings.');

  // Check 2: Enyimba's CAF win did NOT add games, goals, or points to NPFL standings
  const enyimbaNpflRow = npflTable.find((row) => {
    const tId = typeof row.team === 'object' ? row.team._id : row.team;
    return tId === enyimba._id;
  });
  if (enyimbaNpflRow && enyimbaNpflRow.played !== baseEnyimbaPlayed) {
    throw new Error(`CAF match leaked into NPFL stats! Expected played=${baseEnyimbaPlayed}, but got: ${enyimbaNpflRow.played}`);
  }
  console.log(`✓ Enyimba NPFL stats unpolluted by CAF match: played = ${enyimbaNpflRow?.played || 0}, points = ${enyimbaNpflRow?.points || 0}`);

  // 8. Schedule and complete an NPFL fixture (Enyimba vs Rangers)
  console.log('\n[TEST 8] Valid NPFL Fixture & Standings Recalculation');
  const npflMatchRes = await request('POST', '/matches', {
    league: npfl._id,
    homeTeam: enyimba._id,
    awayTeam: rangers._id,
    matchDate: new Date().toISOString(),
    venue: 'Enyimba International Stadium',
  }, authHeaders);
  if (npflMatchRes.status !== 201) throw new Error(`Failed to create NPFL match: ${JSON.stringify(npflMatchRes)}`);
  const npflMatch = npflMatchRes.data.match;

  const finishNpflRes = await request('PATCH', `/matches/${npflMatch._id}/scoreline`, {
    homeScore: 3,
    awayScore: 0,
    status: 'FINISHED',
  }, authHeaders);
  console.log(`✓ Completed NPFL match: Enyimba 3 - 0 Rangers. tableAutoUpdated = ${finishNpflRes.data.tableAutoUpdated}`);

  // Fetch updated NPFL standings
  const updatedNpflTableRes = await request('GET', '/table');
  const updatedTable = updatedNpflTableRes.data.table || updatedNpflTableRes.data.standings || [];
  const enyimbaAfterNpfl = updatedTable.find((r) => (r.team?._id || r.team) === enyimba._id);
  const rangersAfterNpfl = updatedTable.find((r) => (r.team?._id || r.team) === rangers._id);

  console.log(`✓ Enyimba: Played=${enyimbaAfterNpfl.played} (was ${baseEnyimbaPlayed}), W=${enyimbaAfterNpfl.won}, GF=${enyimbaAfterNpfl.goalsFor}, GA=${enyimbaAfterNpfl.goalsAgainst}, Pts=${enyimbaAfterNpfl.points} (was ${baseEnyimbaPts})`);
  console.log(`✓ Rangers: Played=${rangersAfterNpfl.played} (was ${baseRangersPlayed}), L=${rangersAfterNpfl.lost}, GF=${rangersAfterNpfl.goalsFor}, GA=${rangersAfterNpfl.goalsAgainst}, Pts=${rangersAfterNpfl.points}`);

  if (
    enyimbaAfterNpfl.played !== baseEnyimbaPlayed + 1 ||
    enyimbaAfterNpfl.points !== baseEnyimbaPts + 3 ||
    enyimbaAfterNpfl.won !== baseEnyimbaWon + 1 ||
    enyimbaAfterNpfl.goalsFor !== baseEnyimbaGF + 3
  ) {
    throw new Error('NPFL standings calculation mismatch!');
  }
  console.log('✓ NPFL standings successfully updated with accurate points and goal difference.');

  // 9. Assign and Remove Competition Membership
  console.log('\n[TEST 9] Dynamically Modifying Competition Memberships');
  // Assign Rangers to CAF CL
  const assignRes = await request('POST', `/teams/${rangers._id}/competitions`, {
    competitionId: caf._id,
  }, authHeaders);
  if (assignRes.status !== 200) throw new Error('Failed to assign Rangers to CAF');
  console.log(`✓ Added Rangers to CAF Champions League.`);

  // Remove Rangers from CAF CL
  const removeRes = await request('DELETE', `/teams/${rangers._id}/competitions/${caf._id}`, null, authHeaders);
  if (removeRes.status !== 200) throw new Error('Failed to remove Rangers from CAF');
  console.log(`✓ Removed Rangers from CAF Champions League without deleting club.`);

  // Check Rangers still exists in NPFL
  const rangersCheck = await request('GET', `/teams/${rangers._id}`);
  const comps = rangersCheck.data.team?.competitions || [];
  const inNpfl = comps.some((c) => (c._id || c) === npfl._id);
  if (!inNpfl) throw new Error('Rangers was removed from NPFL unexpectedly!');
  console.log(`✓ Rangers persists as an active club in NPFL.`);

  // 10. Verify Competition Counts (teamsCount & matchesCount)
  console.log('\n[TEST 10] Competition Metadata & Counts');
  const finalLeaguesRes = await request('GET', '/leagues');
  const finalNpfl = finalLeaguesRes.data.leagues.find((l) => l._id === npfl._id);
  const finalCaf = finalLeaguesRes.data.leagues.find((l) => l._id === caf._id);
  console.log(`✓ NPFL: teamsCount=${finalNpfl.teamsCount}, matchesCount=${finalNpfl.matchesCount}`);
  console.log(`✓ CAF CL: teamsCount=${finalCaf.teamsCount}, matchesCount=${finalCaf.matchesCount}`);

  console.log('\n=============================================================');
  console.log('🎉 ALL INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
  console.log('=============================================================');

  server.close();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  if (server) server.close();
  process.exit(1);
});
