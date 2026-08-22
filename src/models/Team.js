const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    shortName: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true },
    logo: { type: String, default: '' },
    stadium: { type: String, default: '' },
    city: { type: String, default: '' }
  },
  { timestamps: true }
);

const MongooseTeam = mongoose.model('Team', teamSchema);
const memoryTeamColl = memoryStore.getCollection('teams');

const TeamProxy = new Proxy(MongooseTeam, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') return memoryTeamColl.create.bind(memoryTeamColl);
      if (prop === 'find') return memoryTeamColl.find.bind(memoryTeamColl);
      if (prop === 'findOne') return memoryTeamColl.findOne.bind(memoryTeamColl);
      if (prop === 'findById') return memoryTeamColl.findById.bind(memoryTeamColl);
      if (prop === 'findByIdAndUpdate') return memoryTeamColl.findByIdAndUpdate.bind(memoryTeamColl);
    }
    return MongooseTeam[prop];
  }
});

module.exports = TeamProxy;
