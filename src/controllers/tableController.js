const tableService = require('../services/tableService');
const League = require('../models/League');
const auditService = require('../services/auditService');

// @desc    Get automated league table standings
// @route   GET /api/v1/table/:leagueId
// @access  Public
const getStandings = async (req, res, next) => {
  try {
    let { leagueId } = req.params;

    // If leagueId is default or 'current', fetch active league
    if (!leagueId || leagueId === 'current') {
      const activeLeague = await League.findOne({ isActive: true });
      if (!activeLeague) {
        return res.status(404).json({
          success: false,
          message: 'No active league found'
        });
      }
      leagueId = activeLeague._id;
    }

    const standings = await tableService.getStandings(leagueId);
    const league = await League.findById(leagueId);

    res.status(200).json({
      success: true,
      league,
      count: standings.length,
      standings
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
    const { leagueId } = req.params;

    const league = await League.findById(leagueId);
    if (!league) {
      return res.status(404).json({
        success: false,
        message: 'League not found'
      });
    }

    const standings = await tableService.recalculateTable(leagueId);

    await auditService.logActivity({
      userId: req.user._id,
      action: 'RECALCULATE_LEAGUE_TABLE',
      targetEntity: 'League',
      targetId: leagueId,
      req
    });

    res.status(200).json({
      success: true,
      message: 'League table standings recalculated successfully',
      league,
      standings
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStandings,
  recalculateStandings
};
