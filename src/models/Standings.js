const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const standingsSchema = new mongoose.Schema(
  {
    league: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    played: { type: Number, default: 0 },
    won: { type: Number, default: 0 },
    drawn: { type: Number, default: 0 },
    lost: { type: Number, default: 0 },
    goalsFor: { type: Number, default: 0 },
    goalsAgainst: { type: Number, default: 0 },
    goalDifference: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    form: [{ type: String, enum: ['W', 'D', 'L'] }],
    position: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const MongooseStandings = mongoose.model('Standings', standingsSchema);
const memoryStandingsColl = memoryStore.getCollection('standings');

const StandingsProxy = new Proxy(MongooseStandings, {
  get(target, prop) {
    if (getIsInMemory()) {
  if (prop === 'findOneAndUpdate') {
    return memoryStandingsColl.findOneAndUpdate.bind(memoryStandingsColl);
  }

  if (prop === 'deleteMany') {
    return memoryStandingsColl.deleteMany.bind(memoryStandingsColl);
  }

  if (prop === 'find') {

        return (query) => {
          const builder = memoryStandingsColl.find(query);
          const origThen = builder.then;
          builder.then = async function (resolve, reject) {
            const list = await new Promise((res) => origThen.call(builder, res));
            const Team = require('./Team');
            const populated = await Promise.all(
              list.map(async (item) => {
                const teamDoc = await Team.findById(item.team);
                return { ...item, team: teamDoc };
              })
            );
            resolve(populated);
          };
          return builder;
        };
      }
    }
    return MongooseStandings[prop];
  }
});

module.exports = StandingsProxy;
