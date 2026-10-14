const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;
  const leagues = await db.collection('leagues').find({}).toArray();
  console.log('=== LEAGUES ===');
  for (const l of leagues) {
    console.log(l._id.toString(), '| name:', l.name, '| shortName:', l.shortName, '| code:', l.code, '| standingsEnabled:', l.standingsEnabled);
  }

  console.log('\n=== STANDINGS PER LEAGUE ===');
  const standings = await db.collection('standings').find({}).toArray();
  const byLeague = {};
  for (const s of standings) {
    const lId = s.league.toString();
    byLeague[lId] = (byLeague[lId] || 0) + 1;
  }
  for (const [lId, count] of Object.entries(byLeague)) {
    const lg = leagues.find(l => l._id.toString() === lId);
    console.log(`League: ${lg ? lg.name : lId} (${lg ? lg.code : '?'}) -> ${count} teams in standings`);
    const leagueStandings = standings.filter(s => s.league.toString() === lId);
    const teamIds = leagueStandings.map(s => s.team);
    const teams = await db.collection('teams').find({ _id: { $in: teamIds } }).toArray();
    console.log('  Teams:', teams.map(t => t.name).join(', '));
  }

  console.log('\n=== MATCHES PER LEAGUE ===');
  const matches = await db.collection('matches').find({}).toArray();
  const matchesByLeague = {};
  for (const m of matches) {
    const lId = m.league?.toString();
    matchesByLeague[lId] = (matchesByLeague[lId] || 0) + 1;
  }
  for (const [lId, count] of Object.entries(matchesByLeague)) {
    const lg = leagues.find(l => l._id.toString() === lId);
    console.log(`League: ${lg ? lg.name : lId} (${lg ? lg.code : '?'}) -> ${count} matches`);
  }

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
