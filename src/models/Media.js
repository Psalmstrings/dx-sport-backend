const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const mediaSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: 'Untitled Media' },
    filename: { type: String, required: true },
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    mimeType: { type: String, default: 'image/jpeg' },
    size: { type: Number, default: 0 },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tags: [{ type: String, trim: true }],
    caption: { type: String, default: '' }
  },
  { timestamps: true }
);

const MongooseMedia = mongoose.model('Media', mediaSchema);
const memoryMediaColl = memoryStore.getCollection('media');

const MediaProxy = new Proxy(MongooseMedia, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') return memoryMediaColl.create.bind(memoryMediaColl);
      if (prop === 'find') return memoryMediaColl.find.bind(memoryMediaColl);
      if (prop === 'findOne') return memoryMediaColl.findOne.bind(memoryMediaColl);
      if (prop === 'findById') return memoryMediaColl.findById.bind(memoryMediaColl);
      if (prop === 'countDocuments') return memoryMediaColl.countDocuments.bind(memoryMediaColl);
      if (prop === 'findByIdAndDelete') return memoryMediaColl.findByIdAndDelete.bind(memoryMediaColl);
    }
    return MongooseMedia[prop];
  }
});

module.exports = MediaProxy;
