const mongoose = require('mongoose');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    summary: { type: String, trim: true, default: '' },
    content: { type: String, required: true },
    coverImage: { type: String, default: '' },
    category: { type: String, default: 'News', trim: true },
    tags: [{ type: String, trim: true }],
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    views: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const MongoosePost = mongoose.model('Post', postSchema);
const memoryPostColl = memoryStore.getCollection('posts');

const populateAuthor = async (doc) => {
  if (!doc) return null;
  const User = require('./User');
  doc.author = await User.findById(doc.author);
  return doc;
};

const PostProxy = new Proxy(MongoosePost, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') {
        return async (data) => {
          const doc = await memoryPostColl.create(data);
          doc.save = async function () {
            this.updatedAt = new Date();
            memoryPostColl.documents.set(this._id.toString(), this);
            return this;
          };
          return doc;
        };
      }
      if (prop === 'find') {
        return (query) => {
          const builder = memoryPostColl.find(query);
          const origThen = builder.then;
          builder.then = async function (resolve, reject) {
            const list = await new Promise((res) => origThen.call(builder, res));
            const populated = await Promise.all(list.map((p) => populateAuthor({ ...p })));
            resolve(populated);
          };
          return builder;
        };
      }
      if (prop === 'findOne') {
        return (query) => {
          return {
            populate: function () { return this; },
            then: async function (resolve, reject) {
              try {
                const doc = await memoryPostColl.findOne(query);
                if (!doc) return resolve(null);
                doc.save = async function () {
                  this.updatedAt = new Date();
                  memoryPostColl.documents.set(this._id.toString(), this);
                  return this;
                };
                resolve(await populateAuthor(doc));
              } catch (e) { reject(e); }
            }
          };
        };
      }
      if (prop === 'findById') {
        return (id) => {
          return {
            populate: function () { return this; },
            then: async function (resolve, reject) {
              try {
                const doc = await memoryPostColl.findById(id);
                if (!doc) return resolve(null);
                doc.save = async function () {
                  this.updatedAt = new Date();
                  memoryPostColl.documents.set(this._id.toString(), this);
                  return this;
                };
                resolve(await populateAuthor(doc));
              } catch (e) { reject(e); }
            }
          };
        };
      }
      if (prop === 'countDocuments') return memoryPostColl.countDocuments.bind(memoryPostColl);
      if (prop === 'findByIdAndDelete') return memoryPostColl.findByIdAndDelete.bind(memoryPostColl);
    }
    return MongoosePost[prop];
  }
});

module.exports = PostProxy;
