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
        if (val.$ne !== undefined && docVal === val.$ne) return false;
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

  async findByIdAndUpdate(id, updateData, options = {}) {
    const doc = await this.findById(id);
    if (!doc) return null;
    Object.assign(doc, updateData);
    doc.updatedAt = new Date();
    this.documents.set(id.toString(), doc);
    return doc;
  }

  async findOneAndUpdate(query, updateData, options = {}) {
    let doc = await this.findOne(query);
    if (!doc && options.upsert) {
      doc = await this.create({ ...query, ...updateData });
      return doc;
    }
    if (doc) {
      Object.assign(doc, updateData);
      doc.updatedAt = new Date();
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
