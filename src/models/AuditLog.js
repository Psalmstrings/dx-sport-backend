const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, trim: true },
    targetEntity: { type: String, required: true, trim: true },
    targetId: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '' }
  },
  { timestamps: true }
);

const MongooseAuditLog = mongoose.model('AuditLog', auditLogSchema);
const memoryAuditColl = memoryStore.getCollection('audit_logs');

const AuditLogProxy = new Proxy(MongooseAuditLog, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') return memoryAuditColl.create.bind(memoryAuditColl);
      if (prop === 'find') {
        return (query) => {
          const builder = memoryAuditColl.find(query);
          const origThen = builder.then;
          builder.then = async function (resolve, reject) {
            const list = await new Promise((res) => origThen.call(builder, res));
            const User = require('./User');
            const populated = await Promise.all(
              list.map(async (item) => {
                const userDoc = await User.findById(item.user);
                return { ...item, user: userDoc };
              })
            );
            resolve(populated);
          };
          return builder;
        };
      }
      if (prop === 'countDocuments') return memoryAuditColl.countDocuments.bind(memoryAuditColl);
    }
    return MongooseAuditLog[prop];
  }
});

module.exports = AuditLogProxy;
