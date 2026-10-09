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
    city: { type: String, default: '' },
    country: { type: String, trim: true, default: 'Nigeria' },
    competitions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'League' }],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

teamSchema.index({ name: 1 }, { unique: true });

const MongooseTeam = mongoose.model('Team', teamSchema);
const memoryTeamColl = memoryStore.getCollection('teams');

const populateTeamCompetitions = async (doc) => {
  if (!doc) return null;
  const League = require('./League');
  if (Array.isArray(doc.competitions)) {
    const popComps = await Promise.all(
      doc.competitions.map(async (cId) => {
        if (!cId) return null;
        if (typeof cId === 'object' && cId._id) return cId;
        const leagueDoc = await League.findById(cId);
        return leagueDoc || cId;
      })
    );
    doc.competitions = popComps.filter(Boolean);
  }
  return doc;
};

const TeamProxy = new Proxy(MongooseTeam, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') return memoryTeamColl.create.bind(memoryTeamColl);
      if (prop === 'find') {
        return (query = {}) => {
          const builder = memoryTeamColl.find(query);
          const origThen = builder.then;
          builder.then = async function (resolve, reject) {
            const list = await new Promise((res) => origThen.call(builder, res));
            const populated = await Promise.all(list.map((t) => populateTeamCompetitions({ ...t })));
            resolve(populated);
          };
          return builder;
        };
      }
      if (prop === 'findOne') {
        return async (query = {}) => {
          const doc = await memoryTeamColl.findOne(query);
          if (!doc) return null;
          return await populateTeamCompetitions(doc);
        };
      }
      if (prop === 'findById') {
        return async (id) => {
          if (!id) return null;
          const doc = await memoryTeamColl.findById(id);
          if (!doc) return null;
          return await populateTeamCompetitions(doc);
        };
      }
      if (prop === 'findByIdAndUpdate') return memoryTeamColl.findByIdAndUpdate.bind(memoryTeamColl);
      if (prop === 'findOneAndUpdate') return memoryTeamColl.findOneAndUpdate.bind(memoryTeamColl);
      if (prop === 'countDocuments') return memoryTeamColl.countDocuments.bind(memoryTeamColl);
      if (prop === 'findByIdAndDelete') return memoryTeamColl.findByIdAndDelete.bind(memoryTeamColl);
    }
    return MongooseTeam[prop];
  }
});

module.exports = TeamProxy;
