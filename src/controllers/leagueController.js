const League = require('../models/League');

const getLeagues = async (req, res, next) => {
  try {
    const leagues = await League.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: leagues.length, leagues });
  } catch (error) {
    next(error);
  }
};

const createLeague = async (req, res, next) => {
  try {
    const { name, season, code, logo, isActive } = req.body;
    if (!name || !season || !code) {
      return res.status(400).json({ success: false, message: 'Name, season, and code are required' });
    }

    const league = await League.create({
      name,
      season,
      code: code.toUpperCase(),
      logo: logo || '',
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json({ success: true, message: 'League created', league });
  } catch (error) {
    next(error);
  }
};

module.exports = { getLeagues, createLeague };
