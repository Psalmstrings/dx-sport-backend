const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../src/config/db');
const League = require('../src/models/League');
const Team = require('../src/models/Team');
const Match = require('../src/models/Match');
const Standings = require('../src/models/Standings');
const tableService = require('../src/services/tableService');

async function migrate() {
  console.log('=== STARTING NPFL & EPL SAFE MIGRATION ===');
  await connectDB();

  // 1. Locate or create NPFL
  let npfl = await League.findOne({ code: 'NPFL' });
  if (!npfl) npfl = await League.findOne({ shortName: 'NPFL' });
  if (!npfl) npfl = await League.findOne({ name: 'Nigeria Premier Football League' });

  if (!npfl) {
    throw new Error('NPFL record not found!');
  }

  npfl.name = 'Nigeria Premier Football League';
  npfl.shortName = 'NPFL';
  npfl.code = 'NPFL';
  npfl.country = 'Nigeria';
  npfl.type = 'League';
  npfl.standingsEnabled = true;
  npfl.isActive = true;
  await npfl.save();
  console.log('✓ NPFL league confirmed:', npfl._id.toString(), npfl.name, `(${npfl.shortName})`);

  // 2. Locate EPL record if present
  const epl = await League.findOne({
    $or: [
      { code: 'EPL' },
      { name: 'English Premier League' },
      { name: 'Premier League', _id: { $ne: npfl._id } }
    ]
  });

  if (epl && epl._id.toString() !== npfl._id.toString()) {
    epl.name = 'English Premier League';
    epl.shortName = 'EPL';
    epl.code = 'EPL';
    epl.country = 'England';
    epl.type = 'League';
    epl.standingsEnabled = false;
    await epl.save();
    console.log('✓ English Premier League (EPL) record updated:', epl._id.toString(), epl.name, `(${epl.shortName})`);

    // 3. Migrate misassigned Nigerian matches from EPL to NPFL
    const npflTeams = await Team.find({ competitions: npfl._id });
    const npflTeamIds = new Set(npflTeams.map(t => t._id.toString()));

    const eplMatches = await Match.find({ league: epl._id });
    let migratedCount = 0;
    for (const m of eplMatches) {
      const homeId = (m.homeTeam?._id || m.homeTeam || '').toString();
      const awayId = (m.awayTeam?._id || m.awayTeam || '').toString();
      if (npflTeamIds.has(homeId) || npflTeamIds.has(awayId)) {
        m.league = npfl._id;
        await m.save();
        migratedCount++;
      }
    }
    console.log(`✓ Migrated ${migratedCount} Nigerian matches from EPL to NPFL`);

    // 4. Remove orphaned standings for EPL
    const delRes = await Standings.deleteMany({ league: epl._id });
    console.log(`✓ Cleaned up ${delRes.deletedCount} orphaned standings records from EPL`);
  }

  // 5. Recalculate NPFL standings
  const freshStandings = await tableService.recalculateTable(npfl._id);
  console.log(`✓ Recalculated NPFL table: ${freshStandings.length} teams in standings`);
  for (const s of freshStandings.slice(0, 5)) {
    const tName = s.team?.name || s.team;
    console.log(`   ${s.position}. ${tName}: P=${s.played}, W=${s.won}, D=${s.drawn}, L=${s.lost}, GF=${s.goalsFor}, GA=${s.goalsAgainst}, GD=${s.goalDifference}, Pts=${s.points}`);
  }

  console.log('=== MIGRATION COMPLETED SUCCESSFULLY ===');
  process.exit(0);
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
