const Match = require('../models/Match');
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
        .populate('homeTeam', 'name shortName code logo stadium city')
        .populate('awayTeam', 'name shortName code logo stadium city')
        .populate('league', 'name season code')
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
      .populate('homeTeam', 'name shortName code logo stadium city')
      .populate('awayTeam', 'name shortName code logo stadium city')
      .populate('league', 'name season code')
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

// @desc    Create match feature
// @route   POST /api/v1/matches
// @access  Private (Admin, Editor)
const createMatch = async (req, res, next) => {
  try {
    const { league, homeTeam, awayTeam, matchDate, venue, preview } = req.body;

    if (!league || !homeTeam || !awayTeam || !matchDate) {
      return res.status(400).json({
        success: false,
        message: 'League, homeTeam, awayTeam, and matchDate are required'
      });
    }

    if (homeTeam === awayTeam) {
      return res.status(400).json({
        success: false,
        message: 'Home team and Away team cannot be the same'
      });
    }

    const match = await Match.create({
      league,
      homeTeam,
      awayTeam,
      matchDate: new Date(matchDate),
      venue: venue || '',
      preview: preview || '',
      updatedBy: req.user._id
    });

    const populatedMatch = await Match.findById(match._id)
      .populate('homeTeam', 'name shortName logo')
      .populate('awayTeam', 'name shortName logo')
      .populate('league', 'name season code');

    await auditService.logActivity({
      userId: req.user._id,
      action: 'CREATE_MATCH_FEATURE',
      targetEntity: 'Match',
      targetId: match._id,
      details: {
        home: populatedMatch.homeTeam?.name,
        away: populatedMatch.awayTeam?.name,
        matchDate
      },
      req
    });

    res.status(201).json({
      success: true,
      message: 'Match feature created successfully',
      match: populatedMatch
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update match feature details (preview, report, date, venue)
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

    if (league) match.league = league;
    if (homeTeam) match.homeTeam = homeTeam;
    if (awayTeam) match.awayTeam = awayTeam;
    if (matchDate) match.matchDate = new Date(matchDate);
    if (venue !== undefined) match.venue = venue;
    if (preview !== undefined) match.preview = preview;
    if (report !== undefined) match.report = report;
    match.updatedBy = req.user._id;

    await match.save();

    await auditService.logActivity({
      userId: req.user._id,
      action: 'UPDATE_MATCH_FEATURE',
      targetEntity: 'Match',
      targetId: match._id,
      details: { updatedByRole: req.user.role },
      req
    });

    res.status(200).json({
      success: true,
      message: 'Match details updated successfully',
      match
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update match current scoreline & status (AUTOMATIC TABLE RECALCULATION TRIGGER)
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

    // Trigger full table recalculation whenever the match is currently FINISHED
    // or was previously FINISHED (e.g. reverting to LIVE/UPCOMING also recalculates
    // so that the old result is removed from standings).
    if (match.status === 'FINISHED' || previousStatus === 'FINISHED') {
      await tableService.recalculateTable(match.league);
      tableUpdated = true;
    }

    const populatedMatch = await Match.findById(match._id)
      .populate('homeTeam', 'name shortName logo')
      .populate('awayTeam', 'name shortName logo');

    await auditService.logActivity({
      userId: req.user._id,
      action: 'UPDATE_SCORELINE',
      targetEntity: 'Match',
      targetId: match._id,
      details: {
        score: `${populatedMatch.homeTeam?.shortName} ${match.homeScore} - ${match.awayScore} ${populatedMatch.awayTeam?.shortName}`,
        status: match.status,
        tableAutoUpdated: tableUpdated
      },
      req
    });

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

// @desc    Cancel a match fixture (sets status to CANCELLED, recalculates table)
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

    // If the match was previously FINISHED, recalculate table to remove its result.
    // If it was UPCOMING/LIVE/POSTPONED, standings are unaffected but we still call
    // recalculate to be safe (it is a no-op for non-FINISHED matches).
    if (previousStatus === 'FINISHED') {
      await tableService.recalculateTable(match.league);
    }

    await auditService.logActivity({
      userId: req.user._id,
      action: 'CANCEL_MATCH',
      targetEntity: 'Match',
      targetId: match._id,
      details: { previousStatus },
      req
    });

    res.status(200).json({
      success: true,
      message: 'Match cancelled successfully. League table updated.',
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

    // Auto increment score if event is a goal and autoIncrementScore is true
    if (type === 'GOAL' && autoIncrementScore) {
      if (team.toString() === match.homeTeam.toString()) {
        match.homeScore += 1;
      } else if (team.toString() === match.awayTeam.toString()) {
        match.awayScore += 1;
      }
    }

    match.updatedBy = req.user._id;
    await match.save();

    // Trigger table update if match is already FINISHED
    if (match.status === 'FINISHED') {
      await tableService.recalculateTable(match.league);
    }

    await auditService.logActivity({
      userId: req.user._id,
      action: 'ADD_MATCH_EVENT',
      targetEntity: 'Match',
      targetId: match._id,
      details: { eventType: type, player, minute },
      req
    });

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

    // Recalculate table after match deletion — if it was FINISHED its stats
    // are automatically removed since we rebuild from scratch.
    await tableService.recalculateTable(leagueId);

    await auditService.logActivity({
      userId: req.user._id,
      action: 'DELETE_MATCH',
      targetEntity: 'Match',
      targetId: id,
      req
    });

    res.status(200).json({
      success: true,
      message: 'Match deleted successfully and league table updated'
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
