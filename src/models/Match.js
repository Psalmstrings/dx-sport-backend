const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const matchEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION', 'PENALTY'], required: true },
    minute: { type: Number, required: true },
    player: { type: String, required: true, trim: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    detail: { type: String, default: '' }
  },
  { _id: true, timestamps: true }
);

const matchSchema = new mongoose.Schema(
  {
    league: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true },
    homeTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    awayTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    matchDate: { type: Date, required: true },
    venue: { type: String, default: '' },
    status: { type: String, enum: ['UPCOMING', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED'], default: 'UPCOMING' },
    homeScore: { type: Number, default: 0 },
    awayScore: { type: Number, default: 0 },
    halfTimeHomeScore: { type: Number, default: 0 },
    halfTimeAwayScore: { type: Number, default: 0 },
    currentMinute: { type: Number, default: 0 },
    events: [matchEventSchema],
    preview: { type: String, default: '' },
    report: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const MongooseMatch = mongoose.model('Match', matchSchema);
const memoryMatchColl = memoryStore.getCollection('matches');

const populateTeams = async (doc) => {
  if (!doc) return null;
  const Team = require('./Team');
  const League = require('./League');
  doc.homeTeam = await Team.findById(doc.homeTeam);
  doc.awayTeam = await Team.findById(doc.awayTeam);
  doc.league = await League.findById(doc.league);
  return doc;
};

const MatchProxy = new Proxy(MongooseMatch, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') {
        return async (data) => {
          const doc = await memoryMatchColl.create(data);
          doc.save = async function () {
            this.updatedAt = new Date();
            memoryMatchColl.documents.set(this._id.toString(), this);
            return this;
          };
          return doc;
        };
      }
      if (prop === 'find') {
        return (query) => {
          const builder = memoryMatchColl.find(query);
          const origThen = builder.then;
          builder.then = async function (resolve, reject) {
            const list = await new Promise((res) => origThen.call(builder, res));
            const populated = await Promise.all(list.map((m) => populateTeams({ ...m })));
            resolve(populated);
          };
          return builder;
        };
      }
      if (prop === 'findById') {
        return (id) => {
          return {
            populate: function () { return this; },
            select: function () { return this; },
            then: async function (resolve, reject) {
              try {
                const doc = await memoryMatchColl.findById(id);
                if (!doc) return resolve(null);
                doc.save = async function () {
                  this.updatedAt = new Date();
                  memoryMatchColl.documents.set(this._id.toString(), this);
                  return this;
                };
                resolve(await populateTeams(doc));
              } catch (e) { reject(e); }
            }
          };
        };
      }
      if (prop === 'countDocuments') return memoryMatchColl.countDocuments.bind(memoryMatchColl);
      if (prop === 'findByIdAndDelete') return memoryMatchColl.findByIdAndDelete.bind(memoryMatchColl);
    }
    return MongooseMatch[prop];
  }
});

module.exports = MatchProxy;
