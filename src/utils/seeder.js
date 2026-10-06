const User = require('../models/User');
const Team = require('../models/Team');
const League = require('../models/League');
const Post = require('../models/Post');
const Match = require('../models/Match');
const Transfer = require('../models/Transfer');
const Media = require('../models/Media');

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

    // 4. Seed NPFL League
    let league = await League.findOne({ code: 'NPFL' });
    if (!league) {
      // Also check for the old incorrectly-seeded EPL entry and rename it rather
      // than creating a duplicate league.
      const oldEpl = await League.findOne({ code: 'EPL', name: 'Premier League' });
      if (oldEpl) {
        oldEpl.name = 'Nigeria Premier Football League';
        oldEpl.code = 'NPFL';
        await oldEpl.save();
        console.log('[Seeder] Renamed legacy EPL league → NPFL');
      } else {
        await League.create({
          name: 'Nigeria Premier Football League',
          season: '2025/2026',
          code: 'NPFL',
          isActive: true
        });
        console.log('[Seeder] NPFL League Season initialized');
      }
    }

    console.log('[Seeder] System ready for Client testing. Zero dummy posts/matches/teams loaded.');
  } catch (error) {
    console.error('[Seeder] Error seeding database:', error.message);
  }
};

module.exports = seedDatabase;
