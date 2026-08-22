const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const transferSchema = new mongoose.Schema(
  {
    player: { type: String, required: true, trim: true },
    position: { type: String, default: 'FW', trim: true },
    fromClub: { type: String, required: true, trim: true },
    toClub: { type: String, required: true, trim: true },
    fee: { type: String, default: 'Undisclosed Fee', trim: true },
    status: { type: String, enum: ['HOT RUMOR', 'TALKS ADVANCED', 'COMPLETED DEAL'], default: 'HOT RUMOR' },
    probability: { type: String, default: '80%' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const MongooseTransfer = mongoose.model('Transfer', transferSchema);
const memoryTransferColl = memoryStore.getCollection('transfers');

const TransferProxy = new Proxy(MongooseTransfer, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') {
        return async (data) => {
          const doc = await memoryTransferColl.create(data);
          doc.save = async function () {
            this.updatedAt = new Date();
            memoryTransferColl.documents.set(this._id.toString(), this);
            return this;
          };
          return doc;
        };
      }
      if (prop === 'find') return memoryTransferColl.find.bind(memoryTransferColl);
      if (prop === 'findById') return memoryTransferColl.findById.bind(memoryTransferColl);
      if (prop === 'findByIdAndUpdate') return memoryTransferColl.findByIdAndUpdate.bind(memoryTransferColl);
      if (prop === 'findByIdAndDelete') return memoryTransferColl.findByIdAndDelete.bind(memoryTransferColl);
      if (prop === 'countDocuments') return memoryTransferColl.countDocuments.bind(memoryTransferColl);
    }
    return MongooseTransfer[prop];
  }
});

module.exports = TransferProxy;
