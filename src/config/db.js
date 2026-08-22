const mongoose = require('mongoose');

let isInMemory = false;

const connectDB = async () => {
  const connUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dx_sport';
  try {
    const conn = await mongoose.connect(connUri, {
      serverSelectionTimeoutMS: 2000
    });
    console.log(`[Database] Connected to MongoDB: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.log(`[Database] Local MongoDB server not detected on ${connUri}. Running fast in-memory database store...`);
    isInMemory = true;
    return null;
  }
};

const getIsInMemory = () => isInMemory;

module.exports = connectDB;
module.exports.getIsInMemory = getIsInMemory;
