const Team = require('../models/Team');
const Standings = require('../models/Standings');
const League = require('../models/League');
const tableService = require('../services/tableService');
const auditService = require('../services/auditService');

// @desc    Get all teams, filterable by competition, active status, search
// @route   GET /api/v1/teams
// @access  Public
const getTeams = async (req, res, next) => {
  try {
    const { competition, league, activeOnly, search } = req.query;
    const targetComp = competition || league;

    const query = {};
    if (activeOnly === 'true') {
      query.isActive = true;
    }
    if (targetComp) {
      query.competitions = targetComp;
    }
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: regex }, { shortName: regex }, { code: regex }];
    }

    const teams = await Team.find(query).sort({ name: 1 });

    // Populate competitions on each team
    const populatedTeams = await Promise.all(
      teams.map(async (t) => {
        const teamObj = typeof t.toObject === 'function' ? t.toObject() : { ...t };
        if (Array.isArray(t.competitions) && t.competitions.length > 0) {
          const comps = await Promise.all(
            t.competitions.map(async (cId) => {
              if (cId && typeof cId === 'object' && cId.name) return cId;
              const found = await League.findById(cId);
              if (found) {
                return {
                  _id: found._id,
                  name: found.name,
                  shortName: found.shortName || found.code,
                  code: found.code,
                  type: found.type,
                  standingsEnabled: found.standingsEnabled,
                  isActive: found.isActive
                };
              }
              return null;
            })
          );
          teamObj.competitions = comps.filter(Boolean);
        } else {
          teamObj.competitions = [];
        }
        return teamObj;
      })
    );

    res.status(200).json({
      success: true,
      count: populatedTeams.length,
      teams: populatedTeams
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single team by ID
// @route   GET /api/v1/teams/:id
// @access  Public
const getTeamById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const team = await Team.findById(id);

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const teamObj = typeof team.toObject === 'function' ? team.toObject() : { ...team };
    if (Array.isArray(team.competitions) && team.competitions.length > 0) {
      const comps = await Promise.all(
        team.competitions.map(async (cId) => {
          if (cId && typeof cId === 'object' && cId.name) return cId;
          const found = await League.findById(cId);
          return found
            ? {
                _id: found._id,
                name: found.name,
                shortName: found.shortName || found.code,
                code: found.code
              }
            : null;
        })
      );
      teamObj.competitions = comps.filter(Boolean);
    }

    res.status(200).json({ success: true, team: teamObj });
  } catch (error) {
    next(error);
  }
};

// @desc    Register a new team with competition memberships
// @route   POST /api/v1/teams
// @access  Private (Admin, Editor)
const createTeam = async (req, res, next) => {
  try {
    const {
      name,
      shortName,
      code,
      logo = '',
      stadium = '',
      city = '',
      country = 'Nigeria',
      competitions = [],
      isActive = true
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Team Name is required' });
    }
    if (!shortName || !shortName.trim()) {
      return res.status(400).json({ success: false, message: 'Team Short Name is required' });
    }

    const normalizedName = name.trim();
    const normalizedShortName = shortName.trim();
    const normalizedCode = (code || normalizedShortName.slice(0, 3)).trim().toUpperCase();

    // Check duplicate team name
    const existing = await Team.findOne({
      name: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `A team named "${normalizedName}" is already registered. To associate this club with another competition, edit its competition memberships.`
      });
    }

    // Process competition memberships
    let compArray = [];
    if (Array.isArray(competitions)) {
      compArray = competitions.map((c) => (typeof c === 'object' && c?._id ? c._id.toString() : c.toString()));
    } else if (competitions) {
      compArray = [competitions.toString()];
    }

    // Deduplicate competition IDs
    compArray = [...new Set(compArray.filter(Boolean))];

    // Validate that all referenced competitions exist and are active
    if (compArray.length > 0) {
      const validCompetitions = await Promise.all(compArray.map((cId) => League.findById(cId)));
      const invalid = validCompetitions.some((c) => !c);
      if (invalid) {
        return res.status(400).json({
          success: false,
          message: 'One or more selected competitions do not exist'
        });
      }
    }

    const team = await Team.create({
      name: normalizedName,
      shortName: normalizedShortName,
      code: normalizedCode,
      logo: logo.trim(),
      stadium: stadium.trim(),
      city: city.trim(),
      country: country.trim(),
      competitions: compArray,
      isActive: isActive !== undefined ? Boolean(isActive) : true
    });

    // If assigned to a competition with standings enabled (e.g. NPFL), initialize standings row
    for (const compId of compArray) {
      try {
        const comp = await League.findById(compId);
        if (comp && comp.standingsEnabled) {
          await Standings.findOneAndUpdate(
            { league: comp._id, team: team._id },
            {
              league: comp._id,
              team: team._id,
              played: 0,
              won: 0,
              drawn: 0,
              lost: 0,
              goalsFor: 0,
              goalsAgainst: 0,
              goalDifference: 0,
              points: 0,
              form: [],
              position: 0,
              lastUpdated: new Date()
            },
            { upsert: true, new: true }
          );
          await tableService.recalculateTable(comp._id);
        }
      } catch (err) {
        console.warn('[TeamController] Standings init warning:', err.message);
      }
    }

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'CREATE_TEAM',
        targetEntity: 'Team',
        targetId: team._id,
        details: { name: team.name, competitions: compArray },
        req
      });
    }

    res.status(201).json({
      success: true,
      message: 'Team registered successfully',
      team
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update existing team details and competition memberships
// @route   PUT /api/v1/teams/:id
// @access  Private (Admin, Editor)
const updateTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const team = await Team.findById(id);

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const {
      name,
      shortName,
      code,
      logo,
      stadium,
      city,
      country,
      competitions,
      isActive
    } = req.body;

    // Check duplicate name if changing
    if (name && name.trim().toLowerCase() !== team.name.toLowerCase()) {
      const duplicate = await Team.findOne({
        _id: { $ne: id },
        name: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Another team named "${name.trim()}" already exists.`
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (shortName !== undefined) updateData.shortName = shortName.trim();
    if (code !== undefined) updateData.code = code.trim().toUpperCase();
    if (logo !== undefined) updateData.logo = logo.trim();
    if (stadium !== undefined) updateData.stadium = stadium.trim();
    if (city !== undefined) updateData.city = city.trim();
    if (country !== undefined) updateData.country = country.trim();
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const prevCompetitions = (team.competitions || []).map((c) => (c?._id || c).toString());

    if (competitions !== undefined) {
      let compArray = [];
      if (Array.isArray(competitions)) {
        compArray = competitions.map((c) => (typeof c === 'object' && c?._id ? c._id.toString() : c.toString()));
      } else if (competitions) {
        compArray = [competitions.toString()];
      }
      compArray = [...new Set(compArray.filter(Boolean))];

      // Validate all exist
      if (compArray.length > 0) {
        const validCompetitions = await Promise.all(compArray.map((cId) => League.findById(cId)));
        if (validCompetitions.some((c) => !c)) {
          return res.status(400).json({
            success: false,
            message: 'One or more selected competitions do not exist'
          });
        }
      }
      updateData.competitions = compArray;
    }

    const updatedTeam = await Team.findByIdAndUpdate(id, updateData, { new: true });

    // Handle standings adjustments for standings-enabled competitions
    if (updateData.competitions) {
      const newComps = updateData.competitions;
      // Removed competitions that have standings enabled
      const removedComps = prevCompetitions.filter((c) => !newComps.includes(c));
      for (const compId of removedComps) {
        const comp = await League.findById(compId);
        if (comp && comp.standingsEnabled) {
          await Standings.deleteMany({ league: compId, team: id });
          await tableService.recalculateTable(compId);
        }
      }

      // Added competitions that have standings enabled
      const addedComps = newComps.filter((c) => !prevCompetitions.includes(c));
      for (const compId of addedComps) {
        const comp = await League.findById(compId);
        if (comp && comp.standingsEnabled) {
          await Standings.findOneAndUpdate(
            { league: compId, team: id },
            {
              league: compId,
              team: id,
              played: 0,
              won: 0,
              drawn: 0,
              lost: 0,
              goalsFor: 0,
              goalsAgainst: 0,
              goalDifference: 0,
              points: 0,
              form: [],
              position: 0,
              lastUpdated: new Date()
            },
            { upsert: true, new: true }
          );
          await tableService.recalculateTable(compId);
        }
      }
    }

    if (auditService && req.user) {
      await auditService.logActivity({
        userId: req.user._id,
        action: 'UPDATE_TEAM',
        targetEntity: 'Team',
        targetId: id,
        details: updateData,
        req
      });
    }

    res.status(200).json({
      success: true,
      message: 'Team updated successfully',
      team: updatedTeam
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign team to a competition
// @route   POST /api/v1/teams/:id/competitions
// @access  Private (Admin, Editor)
const assignCompetition = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { competitionId } = req.body;

    if (!competitionId) {
      return res.status(400).json({ success: false, message: 'competitionId is required' });
    }

    const [team, competition] = await Promise.all([
      Team.findById(id),
      League.findById(competitionId)
    ]);

    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    if (!competition) return res.status(404).json({ success: false, message: 'Competition not found' });

    const currentComps = (team.competitions || []).map((c) => (c?._id || c).toString());
    if (currentComps.includes(competitionId.toString())) {
      return res.status(400).json({
        success: false,
        message: `Team "${team.name}" already belongs to competition "${competition.name}"`
      });
    }

    const updated = await Team.findByIdAndUpdate(
      id,
      { $addToSet: { competitions: competitionId } },
      { new: true }
    );

    if (competition.standingsEnabled) {
      await tableService.recalculateTable(competition._id);
    }

    res.status(200).json({
      success: true,
      message: `Team "${team.name}" successfully added to "${competition.name}"`,
      team: updated
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove team from a competition without deleting the club
// @route   DELETE /api/v1/teams/:id/competitions/:competitionId
// @access  Private (Admin, Editor)
const removeCompetition = async (req, res, next) => {
  try {
    const { id, competitionId } = req.params;

    const [team, competition] = await Promise.all([
      Team.findById(id),
      League.findById(competitionId)
    ]);

    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    const updated = await Team.findByIdAndUpdate(
      id,
      { $pull: { competitions: competitionId } },
      { new: true }
    );

    // If standings enabled, remove standings and recalculate
    if (competition && competition.standingsEnabled) {
      await Standings.deleteMany({ league: competitionId, team: id });
      await tableService.recalculateTable(competitionId);
    }

    res.status(200).json({
      success: true,
      message: `Team "${team.name}" removed from competition "${competition ? competition.name : competitionId}"`,
      team: updated
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete team
// @route   DELETE /api/v1/teams/:id
// @access  Private (Admin, Editor)
const deleteTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const team = await Team.findById(id);

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const teamStandings = await Standings.find({ team: id });
    const affectedLeagueIds = [
      ...new Set(
        teamStandings
          .map((standing) => (standing.league?._id || standing.league || '').toString())
          .filter(Boolean)
      )
    ];

    await Standings.deleteMany({ team: id });
    await Team.findByIdAndDelete(id);

    for (const leagueId of affectedLeagueIds) {
      await tableService.recalculateTable(leagueId);
    }

    res.status(200).json({
      success: true,
      message: `Team "${team.name}" deleted successfully.`,
      deletedTeamId: id,
      deletedTeamName: team.name,
      affectedLeagues: affectedLeagueIds
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  assignCompetition,
  removeCompetition,
  deleteTeam
};
