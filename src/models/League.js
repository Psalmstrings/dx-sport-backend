const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const leagueSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    shortName: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    type: {
      type: String,
      enum: ['League', 'Cup', 'International Competition'],
      default: 'League'
    },
    description: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    logo: { type: String, default: '' },
    season: { type: String, trim: true, default: '2025/2026' },
    standingsEnabled: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Prevent duplicate competition records by code / shortName
leagueSchema.index({ code: 1 }, { unique: true });

const MongooseLeague = mongoose.model('League', leagueSchema);
const memoryLeagueColl = memoryStore.getCollection('leagues');

const LeagueProxy = new Proxy(MongooseLeague, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') return memoryLeagueColl.create.bind(memoryLeagueColl);
      if (prop === 'find') return memoryLeagueColl.find.bind(memoryLeagueColl);
      if (prop === 'findOne') return memoryLeagueColl.findOne.bind(memoryLeagueColl);
      if (prop === 'findById') return memoryLeagueColl.findById.bind(memoryLeagueColl);
      if (prop === 'findByIdAndUpdate') return memoryLeagueColl.findByIdAndUpdate.bind(memoryLeagueColl);
      if (prop === 'findOneAndUpdate') return memoryLeagueColl.findOneAndUpdate.bind(memoryLeagueColl);
      if (prop === 'countDocuments') return memoryLeagueColl.countDocuments.bind(memoryLeagueColl);
    }
    return MongooseLeague[prop];
  }
});

module.exports = LeagueProxy;
