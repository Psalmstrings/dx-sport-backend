const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { getIsInMemory } = require('../config/db');
const memoryStore = require('../config/memoryStore');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['admin', 'editor'], default: 'editor' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    avatar: { type: String, default: '' }
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const MongooseUser = mongoose.model('User', userSchema);
const memoryUserColl = memoryStore.getCollection('users');

const attachUserMethods = (doc) => {
  if (!doc) return null;
  doc.matchPassword = async (entered) => await bcrypt.compare(entered, doc.password || '');
  doc.select = function () { return doc; };
  return doc;
};

const UserProxy = new Proxy(MongooseUser, {
  get(target, prop) {
    if (getIsInMemory()) {
      if (prop === 'create') {
        return async (data) => {
          if (data.password) {
            const salt = await bcrypt.genSalt(10);
            data.password = await bcrypt.hash(data.password, salt);
          }
          const doc = await memoryUserColl.create(data);
          return attachUserMethods(doc);
        };
      }
      if (prop === 'findOne') {
        return (query) => {
          return {
            select: function () { return this; },
            populate: function () { return this; },
            then: async function (resolve, reject) {
              try {
                const doc = await memoryUserColl.findOne(query);
                resolve(attachUserMethods(doc));
              } catch (e) { reject(e); };
            }
          };
        };
      }
      if (prop === 'findById') {
        return (id) => {
          return {
            select: function () { return this; },
            populate: function () { return this; },
            then: async function (resolve, reject) {
              try {
                const doc = await memoryUserColl.findById(id);
                resolve(attachUserMethods(doc));
              } catch (e) { reject(e); };
            }
          };
        };
      }
      if (prop === 'find') return memoryUserColl.find.bind(memoryUserColl);
      if (prop === 'countDocuments') return memoryUserColl.countDocuments.bind(memoryUserColl);
      if (prop === 'findByIdAndDelete') return memoryUserColl.findByIdAndDelete.bind(memoryUserColl);
    }
    return MongooseUser[prop];
  }
});

module.exports = UserProxy;
