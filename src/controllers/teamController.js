const Team = require('../models/Team');
const Standings = require('../models/Standings');
const League = require('../models/League');
const tableService = require('../services/tableService');

const getTeams = async (req, res, next) => {
  try {
    const teams = await Team.find().sort({ name: 1 });
    res.status(200).json({ success: true, count: teams.length, teams });
  } catch (error) {
    next(error);
  }
};

const createTeam = async (req, res, next) => {
  try {
    const { name, shortName, code, logo, stadium, city } = req.body;
    if (!name || !shortName) {
      return res.status(400).json({ success: false, message: 'Name and shortName are required' });
    }

    const team = await Team.create({
      name,
      shortName,
      code: code || shortName.slice(0, 3).toUpperCase(),
      logo: logo || '',
      stadium: stadium || '',
      city: city || ''
    });

    // Auto-seed the league table with zero stats for this team
    try {
      const activeLeague = await League.findOne({ isActive: true });
      if (activeLeague) {
        await Standings.findOneAndUpdate(
          { league: activeLeague._id, team: team._id },
          {
            league: activeLeague._id,
            team: team._id,
            played: 0, won: 0, drawn: 0, lost: 0,
            goalsFor: 0, goalsAgainst: 0, goalDifference: 0,
            points: 0, form: [], position: 0,
            lastUpdated: new Date()
          },
          { upsert: true, new: true }
        );
      }
    } catch (seedErr) {
      console.warn('[TeamController] Could not seed league standings:', seedErr.message);
    }

    res.status(201).json({ success: true, message: 'Team created', team });
  } catch (error) {
    next(error);
  }
};

const updateTeam = async (req, res, next) => {
  try {
    const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.status(200).json({ success: true, message: 'Team updated', team });
  } catch (error) {
    next(error);
  }
};

const deleteTeam = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Find the team before deleting it
    const team = await Team.findById(id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // 2. Find all standings records belonging to this team.
    //    We need the league IDs so we know which tables to rebuild.
    const teamStandings = await Standings.find({
      team: id
    });

    const affectedLeagueIds = [
      ...new Set(
        teamStandings
          .map((standing) => {
            return (standing.league?._id || standing.league || '').toString();
          })
          .filter(Boolean)
      )
    ];

    // 3. Delete ALL standings records belonging to this team.
    await Standings.deleteMany({
      team: id
    });

    // 4. Delete the actual team.
    await Team.findByIdAndDelete(id);

    // 5. Recalculate every affected league.
    //
    // The table service will rebuild the table from the teams
    // that still exist in the database.
    for (const leagueId of affectedLeagueIds) {
      await tableService.recalculateTable(leagueId);
    }

    res.status(200).json({
      success: true,
      message: `Team "${team.name}" deleted successfully. League table automatically reset.`,
      deletedTeamId: id,
      deletedTeamName: team.name,
      affectedLeagues: affectedLeagueIds
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTeams, createTeam, updateTeam, deleteTeam };
