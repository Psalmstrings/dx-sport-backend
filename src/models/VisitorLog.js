const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const visitorLogSchema = new mongoose.Schema(
  {
    visitorId: { type: String, required: true, index: true },
    sessionId: { type: String, default: '', index: true },
    path: { type: String, required: true, default: '/', index: true },
    title: { type: String, default: '' },
    referrer: { type: String, default: '' },
    referrerSource: { type: String, default: 'Direct', index: true },
    device: { type: String, default: 'Desktop', index: true },
    browser: { type: String, default: 'Other' },
    os: { type: String, default: 'Other' },
    ip: { type: String, default: '' },
    country: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

// Composite indexes for fast period and path analytics queries
visitorLogSchema.index({ timestamp: -1, visitorId: 1 });
visitorLogSchema.index({ timestamp: -1, path: 1 });

const MongooseVisitorLog = mongoose.model('VisitorLog', visitorLogSchema);
const memoryVisitorColl = memoryStore.getCollection('visitor_logs');

const VisitorLogProxy = new Proxy(MongooseVisitorLog, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') return memoryVisitorColl.create.bind(memoryVisitorColl);
      if (prop === 'find') return memoryVisitorColl.find.bind(memoryVisitorColl);
      if (prop === 'findOne') return memoryVisitorColl.findOne.bind(memoryVisitorColl);
      if (prop === 'countDocuments') return memoryVisitorColl.countDocuments.bind(memoryVisitorColl);
      if (prop === 'deleteMany') return memoryVisitorColl.deleteMany.bind(memoryVisitorColl);
    }
    return MongooseVisitorLog[prop];
  }
});

module.exports = VisitorLogProxy;
module.exports.MongooseVisitorLog = MongooseVisitorLog;
