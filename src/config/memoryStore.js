// Fast in-memory MongoDB API emulator fallback for zero-dependency local execution
const crypto = require('crypto');

class MemoryCollection {
  constructor(name) {
    this.name = name;
    this.documents = new Map();
  }

  generateId() {
    return crypto.randomBytes(12).toString('hex');
  }

  async create(data) {
    if (Array.isArray(data)) {
      return Promise.all(data.map((item) => this.create(item)));
    }

    const _id = data._id ? data._id.toString() : this.generateId();
    const doc = {
      ...data,
      _id,
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || new Date()
    };

    // Add helper methods matching Mongoose instance methods
    doc.save = async function () {
      this.updatedAt = new Date();
      return this;
    };

    this.documents.set(_id, doc);
    return doc;
  }

  _matchesQuery(doc, query = {}) {
    for (const key of Object.keys(query)) {
      if (key === '$or' && Array.isArray(query.$or)) {
        const matchesOr = query.$or.some((subQuery) => this._matchesQuery(doc, subQuery));
        if (!matchesOr) return false;
        continue;
      }

      const val = query[key];
      const docVal = doc[key];

      if (val instanceof RegExp) {
        if (!val.test(docVal || '')) return false;
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (val.$gte !== undefined && docVal < val.$gte) return false;
        if (val.$lte !== undefined && docVal > val.$lte) return false;
        if (val.$ne !== undefined && docVal?.toString() === val.$ne?.toString()) return false;
        if (val.$nin !== undefined && Array.isArray(val.$nin)) {
          if (val.$nin.map((x) => x?.toString()).includes(docVal?.toString())) return false;
        }
        if (val.$in !== undefined && Array.isArray(val.$in)) {
          const inStrs = val.$in.map((x) => x?.toString());
          if (Array.isArray(docVal)) {
            if (!docVal.some((item) => inStrs.includes(item?.toString()))) return false;
          } else {
            if (!inStrs.includes(docVal?.toString())) return false;
          }
        }
      } else if (Array.isArray(docVal)) {
        // Checking if docVal array contains val
        const valStr = val?.toString();
        if (!docVal.some((item) => item?.toString() === valStr)) return false;
      } else if (docVal !== undefined) {
        if (docVal?.toString() !== val?.toString()) return false;
      } else {
        return false;
      }
    }
    return true;
  }

  find(query = {}) {
    let results = Array.from(this.documents.values()).filter((doc) =>
      this._matchesQuery(doc, query)
    );

    const queryBuilder = {
      results,
      populate: function () {
        return this;
      },
      sort: function (sortObj) {
        if (!sortObj) return this;
        const keys = Object.keys(sortObj);
        this.results.sort((a, b) => {
          for (const key of keys) {
            const dir = sortObj[key];
            if (a[key] < b[key]) return dir === 1 ? -1 : 1;
            if (a[key] > b[key]) return dir === 1 ? 1 : -1;
          }
          return 0;
        });
        return this;
      },
      skip: function (n) {
        this.results = this.results.slice(n);
        return this;
      },
      limit: function (n) {
        this.results = this.results.slice(0, n);
        return this;
      },
      then: function (resolve, reject) {
        resolve(this.results);
      }
    };

    return queryBuilder;
  }

  async findOne(query = {}) {
    const list = await this.find(query);
    const doc = list[0] || null;
    if (doc) {
      doc.select = function () { return doc; };
    }
    return doc;
  }

  async findById(id) {
    if (!id) return null;
    const doc = this.documents.get(id.toString());
    if (!doc) return null;

    doc.populate = function () {
      return this;
    };
    doc.select = function () {
      return this;
    };
    return doc;
  }

  _applyUpdate(doc, updateData) {
    if (!updateData || typeof updateData !== 'object') return doc;

    if (updateData.$set) {
      Object.assign(doc, updateData.$set);
    }
    if (updateData.$addToSet) {
      for (const [field, val] of Object.entries(updateData.$addToSet)) {
        if (!Array.isArray(doc[field])) doc[field] = [];
        const valStr = val?.toString();
        if (!doc[field].some((item) => item?.toString() === valStr)) {
          doc[field].push(val);
        }
      }
    }
    if (updateData.$pull) {
      for (const [field, val] of Object.entries(updateData.$pull)) {
        if (Array.isArray(doc[field])) {
          const valStr = val?.toString();
          doc[field] = doc[field].filter((item) => item?.toString() !== valStr);
        }
      }
    }

    // Direct keys without operator prefix
    const plainKeys = Object.keys(updateData).filter((k) => !k.startsWith('$'));
    for (const key of plainKeys) {
      doc[key] = updateData[key];
    }

    doc.updatedAt = new Date();
    return doc;
  }

  async findByIdAndUpdate(id, updateData, options = {}) {
    const doc = await this.findById(id);
    if (!doc) return null;
    this._applyUpdate(doc, updateData);
    this.documents.set(id.toString(), doc);
    return doc;
  }

  async findOneAndUpdate(query, updateData, options = {}) {
    let doc = await this.findOne(query);
    if (!doc && options.upsert) {
      const initial = { ...query };
      this._applyUpdate(initial, updateData);
      doc = await this.create(initial);
      return doc;
    }
    if (doc) {
      this._applyUpdate(doc, updateData);
      this.documents.set(doc._id.toString(), doc);
    }
    return doc;
  }

  async findByIdAndDelete(id) {
    if (!id) return null;
    const doc = this.documents.get(id.toString());
    this.documents.delete(id.toString());
    return doc;
  }

  async deleteMany(query = {}) {
    const list = await this.find(query);
    for (const doc of list) {
      if (doc && doc._id) {
        this.documents.delete(doc._id.toString());
      }
    }
    return { acknowledged: true, deletedCount: list.length };
  }

  async countDocuments(query = {}) {
    const list = await this.find(query);
    return list.length;
  }
}

class MemoryStore {
  constructor() {
    this.collections = new Map();
  }

  getCollection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MemoryCollection(name));
    }
    return this.collections.get(name);
  }
}

module.exports = new MemoryStore();
