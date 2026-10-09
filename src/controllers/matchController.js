const Match = require('../models/Match');
const League = require('../models/League');
const Team = require('../models/Team');
const tableService = require('../services/tableService');
const auditService = require('../services/auditService');

// @desc    Get matches (Public filterable listing)
// @route   GET /api/v1/matches
// @access  Public
const getMatches = async (req, res, next) => {
  try {
    const { status, league, date, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (league) query.league = league;

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.matchDate = { $gte: startOfDay, $lte: endOfDay };
    }

    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
      Match.find(query)
        .populate('homeTeam', 'name shortName code logo stadium city country')
        .populate('awayTeam', 'name shortName code logo stadium city country')
        .populate('league', 'name shortName season code type logo standingsEnabled isActive')
        .sort({ matchDate: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Match.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: matches.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      matches
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single match feature & live timeline
// @route   GET /api/v1/matches/:id
// @access  Public
const getMatchById = async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('homeTeam', 'name shortName code logo stadium city country')
      .populate('awayTeam', 'name shortName code logo stadium city country')
      .populate('league', 'name shortName season code type logo standingsEnabled isActive')
      .populate('updatedBy', 'name email role');

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    res.status(200).json({
      success: true,
      match
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create match feature (Competition First & strict membership validation)
// @route   POST /api/v1/matches
// @access  Private (Admin, Editor)
const createMatch = async (req, res, next) => {
  try {
    const { league, homeTeam, awayTeam, matchDate, venue, preview } = req.body;

    if (!league || !homeTeam || !awayTeam || !matchDate) {
      return res.status(400).json({
        success: false,
        message: 'Competition, Home Team, Away Team, and Match Date are required'
      });
    }

    const homeId = homeTeam.toString();
    const awayId = awayTeam.toString();

    if (homeId === awayId) {
      return res.status(400).json({
        success: false,
        message: 'Home team and Away team cannot be the same'
      });
    }

    // 1. Validate competition exists and is active
    const compDoc = await League.findById(league);
    if (!compDoc) {
      return res.status(400).json({
        success: false,
        message: 'Selected competition does not exist'
      });
    }
    if (!compDoc.isActive) {
      return res.status(400).json({
        success: false,
        message: `Competition "${compDoc.name}" is currently inactive. Please activate it first.`
      });
    }

    // 2. Validate teams exist, are active, and have membership in this competition
    const [homeDoc, awayDoc] = await Promise.all([
      Team.findById(homeId),
      Team.findById(awayId)
    ]);

    if (!homeDoc) {
      return res.status(400).json({ success: false, message: 'Home team does not exist' });
    }
    if (!awayDoc) {
      return res.status(400).json({ success: false, message: 'Away team does not exist' });
    }

    if (!homeDoc.isActive) {
      return res.status(400).json({
        success: false,
        message: `Home team "${homeDoc.name}" is marked as inactive`
      });
    }
    if (!awayDoc.isActive) {
      return res.status(400).json({
        success: false,
        message: `Away team "${awayDoc.name}" is marked as inactive`
      });
    }

    const leagueIdStr = compDoc._id.toString();
    const homeMemberships = (homeDoc.competitions || []).map((c) => (c?._id || c).toString());
    const awayMemberships = (awayDoc.competitions || []).map((c) => (c?._id || c).toString());

    if (!homeMemberships.includes(leagueIdStr)) {
      return res.status(400).json({
        success: false,
        message: `Home team "${homeDoc.name}" is not registered in competition "${compDoc.name}" (${compDoc.shortName || compDoc.code})`
      });
    }

    if (!awayMemberships.includes(leagueIdStr)) {
      return res.status(400).json({
        success: false,
        message: `Away team "${awayDoc.name}" is not registered in competition "${compDoc.name}" (${compDoc.shortName || compDoc.code})`
      });
    }

    const match = await Match.create({
      league: compDoc._id,
      homeTeam: homeDoc._id,
      awayTeam: awayDoc._id,
      matchDate: new Date(matchDate),
      venue: venue || homeDoc.stadium || '',
      preview: preview || '',
      updatedBy: req.user._id
    });

    const populatedMatch = await Match.findById(match._id)
      .populate('homeTeam', 'name shortName code logo stadium city country')
      .populate('awayTeam', 'name shortName code logo stadium city country')
      .populate('league', 'name shortName season code type logo standingsEnabled isActive');

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'CREATE_MATCH_FEATURE',
        targetEntity: 'Match',
        targetId: match._id,
        details: {
          home: homeDoc.name,
          away: awayDoc.name,
          competition: compDoc.name,
          matchDate
        },
        req
      });
    }

    res.status(201).json({
      success: true,
      message: 'Match fixture scheduled successfully',
      match: populatedMatch
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update match feature details (preview, report, date, venue, teams, league)
// @route   PUT /api/v1/matches/:id
// @access  Private (Admin, Editor)
const updateMatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    const { league, homeTeam, awayTeam, matchDate, venue, preview, report } = req.body;

    const targetLeagueId = (league || match.league).toString();
    const targetHomeId = (homeTeam || match.homeTeam).toString();
    const targetAwayId = (awayTeam || match.awayTeam).toString();

    if (targetHomeId === targetAwayId) {
      return res.status(400).json({
        success: false,
        message: 'Home team and Away team cannot be the same'
      });
    }

    // Validate competition
    const compDoc = await League.findById(targetLeagueId);
    if (!compDoc) {
      return res.status(400).json({
        success: false,
        message: 'Selected competition does not exist'
      });
    }

    // Validate teams and competition memberships
    const [homeDoc, awayDoc] = await Promise.all([
      Team.findById(targetHomeId),
      Team.findById(targetAwayId)
    ]);

    if (!homeDoc || !awayDoc) {
      return res.status(400).json({
        success: false,
        message: 'One or both selected teams do not exist'
      });
    }

    const leagueIdStr = compDoc._id.toString();
    const homeMemberships = (homeDoc.competitions || []).map((c) => (c?._id || c).toString());
    const awayMemberships = (awayDoc.competitions || []).map((c) => (c?._id || c).toString());

    if (!homeMemberships.includes(leagueIdStr)) {
      return res.status(400).json({
        success: false,
        message: `Home team "${homeDoc.name}" is not registered in competition "${compDoc.name}"`
      });
    }

    if (!awayMemberships.includes(leagueIdStr)) {
      return res.status(400).json({
        success: false,
        message: `Away team "${awayDoc.name}" is not registered in competition "${compDoc.name}"`
      });
    }

    match.league = compDoc._id;
    match.homeTeam = homeDoc._id;
    match.awayTeam = awayDoc._id;
    if (matchDate) match.matchDate = new Date(matchDate);
    if (venue !== undefined) match.venue = venue;
    if (preview !== undefined) match.preview = preview;
    if (report !== undefined) match.report = report;
    match.updatedBy = req.user._id;

    await match.save();

    const populatedMatch = await Match.findById(match._id)
      .populate('homeTeam', 'name shortName code logo stadium city country')
      .populate('awayTeam', 'name shortName code logo stadium city country')
      .populate('league', 'name shortName season code type logo standingsEnabled isActive');

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'UPDATE_MATCH_FEATURE',
        targetEntity: 'Match',
        targetId: match._id,
        details: { updatedByRole: req.user.role },
        req
      });
    }

    res.status(200).json({
      success: true,
      message: 'Match details updated successfully',
      match: populatedMatch
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update match scoreline & status
// @route   PATCH /api/v1/matches/:id/scoreline
// @access  Private (Admin, Editor)
const updateScoreline = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    const {
      homeScore,
      awayScore,
      status,
      currentMinute,
      halfTimeHomeScore,
      halfTimeAwayScore,
      report
    } = req.body;

    const previousStatus = match.status;

    if (homeScore !== undefined) match.homeScore = Number(homeScore);
    if (awayScore !== undefined) match.awayScore = Number(awayScore);
    if (status !== undefined) match.status = status;
    if (currentMinute !== undefined) match.currentMinute = Number(currentMinute);
    if (halfTimeHomeScore !== undefined) match.halfTimeHomeScore = Number(halfTimeHomeScore);
    if (halfTimeAwayScore !== undefined) match.halfTimeAwayScore = Number(halfTimeAwayScore);
    if (report !== undefined) match.report = report;

    match.updatedBy = req.user._id;
    await match.save();

    let tableUpdated = false;

    // Check if competition has standingsEnabled: true
    const compDoc = await League.findById(match.league);
    if (compDoc && compDoc.standingsEnabled) {
      if (match.status === 'FINISHED' || previousStatus === 'FINISHED') {
        await tableService.recalculateTable(compDoc._id);
        tableUpdated = true;
      }
    }

    const populatedMatch = await Match.findById(match._id)
      .populate('homeTeam', 'name shortName code logo')
      .populate('awayTeam', 'name shortName code logo')
      .populate('league', 'name shortName season code type logo standingsEnabled');

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'UPDATE_SCORELINE',
        targetEntity: 'Match',
        targetId: match._id,
        details: {
          score: `${populatedMatch.homeTeam?.shortName} ${match.homeScore} - ${match.awayScore} ${populatedMatch.awayTeam?.shortName}`,
          competition: compDoc?.name,
          status: match.status,
          tableAutoUpdated: tableUpdated
        },
        req
      });
    }

    res.status(200).json({
      success: true,
      message: `Scoreline updated successfully.${tableUpdated ? ' League table automatically updated!' : ''}`,
      tableAutoUpdated: tableUpdated,
      match: populatedMatch
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel a match fixture
// @route   PATCH /api/v1/matches/:id/cancel
// @access  Private (Admin, Editor)
const cancelMatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    const previousStatus = match.status;
    match.status = 'CANCELLED';
    match.updatedBy = req.user._id;
    await match.save();

    const compDoc = await League.findById(match.league);
    if (compDoc && compDoc.standingsEnabled && previousStatus === 'FINISHED') {
      await tableService.recalculateTable(compDoc._id);
    }

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'CANCEL_MATCH',
        targetEntity: 'Match',
        targetId: match._id,
        details: { previousStatus },
        req
      });
    }

    res.status(200).json({
      success: true,
      message: 'Match cancelled successfully',
      match
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add match event (Goal, Card, Sub)
// @route   POST /api/v1/matches/:id/events
// @access  Private (Admin, Editor)
const addMatchEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    const { type, minute, player, team, detail, autoIncrementScore } = req.body;

    if (!type || minute === undefined || !player || !team) {
      return res.status(400).json({
        success: false,
        message: 'Type, minute, player, and team are required'
      });
    }

    match.events.push({
      type,
      minute: Number(minute),
      player,
      team,
      detail: detail || ''
    });

    if (type === 'GOAL' && autoIncrementScore) {
      if (team.toString() === match.homeTeam.toString()) {
        match.homeScore += 1;
      } else if (team.toString() === match.awayTeam.toString()) {
        match.awayScore += 1;
      }
    }

    match.updatedBy = req.user._id;
    await match.save();

    const compDoc = await League.findById(match.league);
    if (compDoc && compDoc.standingsEnabled && match.status === 'FINISHED') {
      await tableService.recalculateTable(compDoc._id);
    }

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'ADD_MATCH_EVENT',
        targetEntity: 'Match',
        targetId: match._id,
        details: { eventType: type, player, minute },
        req
      });
    }

    res.status(200).json({
      success: true,
      message: 'Match event recorded',
      match
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete match
// @route   DELETE /api/v1/matches/:id
// @access  Private (Admin only)
const deleteMatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    const leagueId = match.league;
    await Match.findByIdAndDelete(id);

    const compDoc = await League.findById(leagueId);
    if (compDoc && compDoc.standingsEnabled) {
      await tableService.recalculateTable(leagueId);
    }

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'DELETE_MATCH',
        targetEntity: 'Match',
        targetId: id,
        req
      });
    }

    res.status(200).json({
      success: true,
      message: 'Match deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMatches,
  getMatchById,
  createMatch,
  updateMatch,
  updateScoreline,
  cancelMatch,
  addMatchEvent,
  deleteMatch
};
