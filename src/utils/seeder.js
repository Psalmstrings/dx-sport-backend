const User = require('../models/User');
const Team = require('../models/Team');
const League = require('../models/League');
const Post = require('../models/Post');
const Match = require('../models/Match');
const Transfer = require('../models/Transfer');
const Media = require('../models/Media');
const Standings = require('../models/Standings');
const tableService = require('../services/tableService');
const analyticsService = require('../services/analyticsService');

const seedDatabase = async () => {
  try {
    // 1. Seed Super Admin (admin@dxsport.com)
    let admin = await User.findOne({ email: 'admin@dxsport.com' });
    if (!admin) {
      admin = await User.create({
        name: 'DX Sport Admin',
        email: 'admin@dxsport.com',
        password: 'admin123',
        role: 'admin',
        status: 'active'
      });
      console.log('[Seeder] Super Admin initialized: admin@dxsport.com / admin123');
    }

    // 2. Seed Elite Admin (admin@elitesport.ng)
    let eliteAdmin = await User.findOne({ email: 'admin@elitesport.ng' });
    if (!eliteAdmin) {
      eliteAdmin = await User.create({
        name: 'Elite Sports Admin',
        email: 'admin@elitesport.ng',
        password: 'admin123',
        role: 'admin',
        status: 'active'
      });
      console.log('[Seeder] Elite Admin initialized: admin@elitesport.ng / admin123');
    }

    // 3. Seed Editor (editor@dxsport.com)
    let editor = await User.findOne({ email: 'editor@dxsport.com' });
    if (!editor) {
      editor = await User.create({
        name: 'DX Editor',
        email: 'editor@dxsport.com',
        password: 'editor123',
        role: 'editor',
        status: 'active'
      });
      console.log('[Seeder] Editor initialized: editor@dxsport.com / editor123');
    }

    // 4. Seed / Verify NPFL League (Competition)
    let npflLeague = await League.findOne({ code: 'NPFL' });
    if (!npflLeague) {
      npflLeague = await League.findOne({ shortName: 'NPFL' });
    }
    if (!npflLeague) {
      npflLeague = await League.findOne({ name: 'Nigeria Premier Football League' });
    }

    if (!npflLeague) {
      npflLeague = await League.create({
        name: 'Nigeria Premier Football League',
        shortName: 'NPFL',
        code: 'NPFL',
        type: 'League',
        description: 'Top tier of the Nigerian football league system.',
        country: 'Nigeria',
        season: '2025/2026',
        standingsEnabled: true,
        isActive: true
      });
      console.log('[Seeder] NPFL League Season initialized');
    } else {
      npflLeague.name = 'Nigeria Premier Football League';
      npflLeague.shortName = 'NPFL';
      npflLeague.code = 'NPFL';
      npflLeague.type = 'League';
      npflLeague.country = 'Nigeria';
      npflLeague.standingsEnabled = true;
      npflLeague.isActive = true;
      await npflLeague.save();
      console.log('[Seeder] Verified & updated NPFL competition flags');
    }

    // 5. Verify English Premier League (EPL) record if present
    const eplLeague = await League.findOne({
      $or: [
        { code: 'EPL' },
        { name: 'English Premier League' },
        { name: 'Premier League', _id: { $ne: npflLeague._id } }
      ]
    });

    if (eplLeague && eplLeague._id.toString() !== npflLeague._id.toString()) {
      eplLeague.name = 'English Premier League';
      eplLeague.shortName = 'EPL';
      eplLeague.code = 'EPL';
      eplLeague.country = 'England';
      eplLeague.type = 'League';
      eplLeague.standingsEnabled = false;
      await eplLeague.save();
      console.log('[Seeder] Verified English Premier League (EPL) competition record');

      // Safe Migration: Move any matches involving NPFL clubs from EPL to NPFL
      const npflTeams = await Team.find({ competitions: npflLeague._id });
      const npflTeamIds = new Set(npflTeams.map((t) => t._id.toString()));

      const misassignedMatches = await Match.find({ league: eplLeague._id });
      let migratedCount = 0;
      for (const m of misassignedMatches) {
        const homeId = (m.homeTeam?._id || m.homeTeam || '').toString();
        const awayId = (m.awayTeam?._id || m.awayTeam || '').toString();
        if (npflTeamIds.has(homeId) || npflTeamIds.has(awayId)) {
          m.league = npflLeague._id;
          await m.save();
          migratedCount++;
        }
      }
      if (migratedCount > 0) {
        console.log(`[Seeder] Migrated ${migratedCount} misassigned Nigerian matches from EPL to NPFL`);
      }

      // Purge orphaned standings for EPL
      await Standings.deleteMany({ league: eplLeague._id });
    }

    // 6. Migrate any existing teams without competitions array to NPFL
    const existingTeams = await Team.find({});
    for (const team of existingTeams) {
      if (!Array.isArray(team.competitions) || team.competitions.length === 0) {
        team.competitions = [npflLeague._id];
        if (team.isActive === undefined) team.isActive = true;
        await team.save();
        console.log(`[Seeder] Associated existing team "${team.name}" with NPFL`);
      }
    }

    // 7. Recalculate NPFL standings if teams exist
    if (existingTeams.length > 0) {
      await tableService.recalculateTable(npflLeague._id);
    }

    // 8. Seed baseline visitor analytics data if empty
    await analyticsService.seedRealisticData(false);

    console.log('[Seeder] System ready. Multi-competition & NPFL isolation verified.');
  } catch (error) {
    console.error('[Seeder] Error seeding database:', error.message);
  }
};

module.exports = seedDatabase;
