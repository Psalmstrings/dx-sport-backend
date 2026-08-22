const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const leagueSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    season: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    logo: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const MongooseLeague = mongoose.model('League', leagueSchema);
const memoryLeagueColl = memoryStore.getCollection('leagues');

const LeagueProxy = new Proxy(MongooseLeague, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') return memoryLeagueColl.create.bind(memoryLeagueColl);
      if (prop === 'find') return memoryLeagueColl.find.bind(memoryLeagueColl);
      if (prop === 'findOne') return memoryLeagueColl.findOne.bind(memoryLeagueColl);
      if (prop === 'findById') return memoryLeagueColl.findById.bind(memoryLeagueColl);
    }
    return MongooseLeague[prop];
  }
});

module.exports = LeagueProxy;
