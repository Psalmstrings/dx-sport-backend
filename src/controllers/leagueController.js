const League = require('../models/League');
const Team = require('../models/Team');
const Match = require('../models/Match');
const auditService = require('../services/auditService');

// @desc    Get all competitions with counts of teams and matches
// @route   GET /api/v1/leagues
// @access  Public
const getLeagues = async (req, res, next) => {
  try {
    const { activeOnly, type, search } = req.query;

    const query = {};
    if (activeOnly === 'true') {
      query.isActive = true;
    }
    if (type) {
      query.type = type;
    }
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: regex }, { shortName: regex }, { code: regex }];
    }

    const leagues = await League.find(query).sort({ createdAt: -1 });

    // Augment with counts of teams and matches
    const augmentedLeagues = await Promise.all(
      leagues.map(async (league) => {
        const [teamsCount, matchesCount] = await Promise.all([
          Team.countDocuments({ competitions: league._id }),
          Match.countDocuments({ league: league._id })
        ]);

        const leagueObj = typeof league.toObject === 'function' ? league.toObject() : league;

        return {
          ...leagueObj,
          teamsCount,
          matchesCount
        };
      })
    );

    res.status(200).json({
      success: true,
      count: augmentedLeagues.length,
      leagues: augmentedLeagues
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single competition by ID
// @route   GET /api/v1/leagues/:id
// @access  Public
const getLeagueById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const league = await League.findById(id);

    if (!league) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    const [teamsCount, matchesCount] = await Promise.all([
      Team.countDocuments({ competitions: league._id }),
      Match.countDocuments({ league: league._id })
    ]);

    const leagueObj = typeof league.toObject === 'function' ? league.toObject() : league;

    res.status(200).json({
      success: true,
      league: {
        ...leagueObj,
        teamsCount,
        matchesCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register a new competition
// @route   POST /api/v1/leagues
// @access  Private (Admin, Editor)
const createLeague = async (req, res, next) => {
  try {
    const {
      name,
      shortName,
      code,
      type = 'League',
      description = '',
      country = '',
      logo = '',
      season = '2025/2026',
      standingsEnabled = false,
      isActive = true
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Competition Name is required' });
    }

    const normalizedName = name.trim();
    const normalizedShortName = (shortName || normalizedName.slice(0, 5)).trim();
    const normalizedCode = (code || normalizedShortName).trim().toUpperCase();

    // Check for duplicate competition by code or name
    const existing = await League.findOne({
      $or: [
        { code: normalizedCode },
        { name: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      ]
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `A competition with code "${normalizedCode}" or name "${normalizedName}" already exists.`
      });
    }

    // Notice: newly registered competitions have standingsEnabled disabled by default unless explicitly configured otherwise
    const league = await League.create({
      name: normalizedName,
      shortName: normalizedShortName,
      code: normalizedCode,
      type: ['League', 'Cup', 'International Competition'].includes(type) ? type : 'League',
      description: description.trim(),
      country: country.trim(),
      logo: logo.trim(),
      season: (season || '2025/2026').trim(),
      standingsEnabled: Boolean(standingsEnabled),
      isActive: isActive !== undefined ? Boolean(isActive) : true
    });

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'CREATE_COMPETITION',
        targetEntity: 'League',
        targetId: league._id,
        details: { name: league.name, code: league.code, type: league.type },
        req
      });
    }

    res.status(201).json({
      success: true,
      message: 'Competition registered successfully',
      league
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update competition details
// @route   PUT /api/v1/leagues/:id
// @access  Private (Admin, Editor)
const updateLeague = async (req, res, next) => {
  try {
    const { id } = req.params;
    const league = await League.findById(id);

    if (!league) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    const {
      name,
      shortName,
      code,
      type,
      description,
      country,
      logo,
      season,
      standingsEnabled,
      isActive
    } = req.body;

    // Check duplicate code / name if changed
    if (code || name) {
      const checkCode = (code || league.code).toUpperCase().trim();
      const checkName = (name || league.name).trim();

      const duplicate = await League.findOne({
        _id: { $ne: id },
        $or: [
          { code: checkCode },
          { name: new RegExp(`^${checkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        ]
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Another competition already exists with name "${checkName}" or code "${checkCode}".`
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (shortName !== undefined) updateData.shortName = shortName.trim();
    if (code !== undefined) updateData.code = code.trim().toUpperCase();
    if (type !== undefined) updateData.type = type;
    if (description !== undefined) updateData.description = description.trim();
    if (country !== undefined) updateData.country = country.trim();
    if (logo !== undefined) updateData.logo = logo.trim();
    if (season !== undefined) updateData.season = season.trim();
    if (standingsEnabled !== undefined) updateData.standingsEnabled = Boolean(standingsEnabled);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const updated = await League.findByIdAndUpdate(id, updateData, { new: true });

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'UPDATE_COMPETITION',
        targetEntity: 'League',
        targetId: id,
        details: updateData,
        req
      });
    }

    res.status(200).json({
      success: true,
      message: 'Competition updated successfully',
      league: updated
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle competition active status
// @route   PATCH /api/v1/leagues/:id/status
// @access  Private (Admin, Editor)
const toggleLeagueStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const league = await League.findById(id);

    if (!league) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    const newStatus = !league.isActive;
    const updated = await League.findByIdAndUpdate(id, { isActive: newStatus }, { new: true });

    res.status(200).json({
      success: true,
      message: `Competition ${newStatus ? 'activated' : 'deactivated'} successfully`,
      league: updated
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLeagues,
  getLeagueById,
  createLeague,
  updateLeague,
  toggleLeagueStatus
};
