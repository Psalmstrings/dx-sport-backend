const tableService = require('../services/tableService');
const League = require('../models/League');
const auditService = require('../services/auditService');

// @desc    Get automated league table standings (defaults exclusively to NPFL)
// @route   GET /api/v1/table
// @route   GET /api/v1/table/:leagueId
// @access  Public
const getStandings = async (req, res, next) => {
  try {
    let { leagueId } = req.params;

    let targetLeague = null;

    // Default / public table is strictly NPFL
    if (!leagueId || leagueId === 'current') {
      targetLeague = await tableService.getNpflLeague();
      if (!targetLeague) {
        return res.status(404).json({
          success: false,
          message: 'NPFL competition not found'
        });
      }
      leagueId = targetLeague._id;
    } else {
      targetLeague = await League.findById(leagueId);
      if (!targetLeague) {
        return res.status(404).json({
          success: false,
          message: 'Competition not found'
        });
      }
    }

    // If standings are not enabled for this competition, return empty set
    if (!targetLeague.standingsEnabled) {
      return res.status(200).json({
        success: true,
        league: targetLeague,
        count: 0,
        standings: [],
        table: [],
        message: 'Standings are not enabled for this competition'
      });
    }

    const standings = await tableService.getStandings(leagueId);

    res.status(200).json({
      success: true,
      league: targetLeague,
      count: standings.length,
      standings,
      table: standings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Manually trigger recalculation of league table standings
// @route   POST /api/v1/table/:leagueId/recalculate
// @access  Private (Admin, Editor)
const recalculateStandings = async (req, res, next) => {
  try {
    let { leagueId } = req.params;

    if (!leagueId || leagueId === 'current') {
      const npfl = await tableService.getNpflLeague();
      if (!npfl) return res.status(404).json({ success: false, message: 'NPFL league not found' });
      leagueId = npfl._id;
    }

    const league = await League.findById(leagueId);
    if (!league) {
      return res.status(404).json({
        success: false,
        message: 'Competition not found'
      });
    }

    const standings = await tableService.recalculateTable(leagueId);

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'RECALCULATE_LEAGUE_TABLE',
        targetEntity: 'League',
        targetId: leagueId,
        req
      });
    }

    res.status(200).json({
      success: true,
      message: `Table standings for "${league.name}" recalculated successfully`,
      league,
      standings,
      table: standings
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStandings,
  recalculateStandings
};
