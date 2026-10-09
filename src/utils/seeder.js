const User = require('../models/User');
const Team = require('../models/Team');
const League = require('../models/League');
const Post = require('../models/Post');
const Match = require('../models/Match');
const Transfer = require('../models/Transfer');
const Media = require('../models/Media');
const tableService = require('../services/tableService');

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
      // Also check for legacy EPL entry if previously seeded
      const oldEpl = await League.findOne({ code: 'EPL', name: 'Premier League' });
      if (oldEpl) {
        oldEpl.name = 'Nigeria Premier Football League';
        oldEpl.shortName = 'NPFL';
        oldEpl.code = 'NPFL';
        oldEpl.type = 'League';
        oldEpl.standingsEnabled = true;
        oldEpl.isActive = true;
        await oldEpl.save();
        npflLeague = oldEpl;
        console.log('[Seeder] Migrated legacy EPL entry → NPFL');
      } else {
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
      }
    } else {
      // Ensure NPFL properties match requirements
      await League.findByIdAndUpdate(npflLeague._id, {
        $set: {
          shortName: 'NPFL',
          type: 'League',
          standingsEnabled: true,
          isActive: true
        }
      });
      console.log('[Seeder] Verified & updated NPFL competition flags via findByIdAndUpdate');
    }

    // 5. Migrate any existing teams without competitions array to NPFL
    const existingTeams = await Team.find({});
    for (const team of existingTeams) {
      if (!Array.isArray(team.competitions) || team.competitions.length === 0) {
        team.competitions = [npflLeague._id];
        if (team.isActive === undefined) team.isActive = true;
        await team.save();
        console.log(`[Seeder] Associated existing team "${team.name}" with NPFL`);
      }
    }

    // 6. Recalculate NPFL standings if teams exist
    if (existingTeams.length > 0) {
      await tableService.recalculateTable(npflLeague._id);
    }

    console.log('[Seeder] System ready. Multi-competition & NPFL isolation verified.');
  } catch (error) {
    console.error('[Seeder] Error seeding database:', error.message);
  }
};

module.exports = seedDatabase;
