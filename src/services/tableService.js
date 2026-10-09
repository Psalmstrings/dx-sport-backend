const Match = require('../models/Match');
const Standings = require('../models/Standings');
const Team = require('../models/Team');
const League = require('../models/League');

class TableService {
  /**
   * Helper to resolve the authoritative NPFL competition reference.
   */
  async getNpflLeague() {
    let npfl = await League.findOne({ code: 'NPFL' });
    if (!npfl) {
      npfl = await League.findOne({ name: 'Nigeria Premier Football League' });
    }
    return npfl;
  }

  /**
   * Automatically recalculates the league table for a given competition.
   *
   * CRITICAL ISOLATION RULES:
   * 1. Only processes competitions that have standingsEnabled: true.
   * 2. Scopes team membership strictly to teams assigned to this competition.
   * 3. Scopes match calculation strictly to finished matches for this competition.
   * 4. Completely isolates NPFL from NNL, CAF, EPL, or other competitions.
   */
  async recalculateTable(leagueId) {
    if (!leagueId) return [];

    const actualLeagueId = (leagueId?._id || leagueId || '').toString();
    if (!actualLeagueId) return [];

    const targetLeague = await League.findById(actualLeagueId);
    if (!targetLeague) {
      console.warn(`[TableService] League ${actualLeagueId} not found, skipping recalculation.`);
      return [];
    }

    // Only compute standings if standingsEnabled is explicitly true for this competition
    if (!targetLeague.standingsEnabled) {
      console.log(`[TableService] Standings not enabled for competition "${targetLeague.name}" (${targetLeague.code}). Skipping.`);
      return [];
    }

    // ---------------------------------------------------------
    // 1. Get ONLY teams registered for this specific competition
    // ---------------------------------------------------------
    const eligibleTeams = await Team.find({
      competitions: targetLeague._id,
      isActive: true
    });

    // ---------------------------------------------------------
    // 2. Build a Set of valid team IDs for this competition
    // ---------------------------------------------------------
    const validTeamIds = new Set(eligibleTeams.map((team) => team._id.toString()));

    // ---------------------------------------------------------
    // 3. Initialise every eligible team with zero stats
    // ---------------------------------------------------------
    const teamStats = {};

    eligibleTeams.forEach((team) => {
      const teamId = team._id.toString();
      teamStats[teamId] = {
        team: team._id,
        teamName: team.name || '',
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        form: []
      };
    });

    // ---------------------------------------------------------
    // 4. Get finished matches for THIS competition ONLY
    // ---------------------------------------------------------
    const finishedMatches = await Match.find({
      league: targetLeague._id,
      status: 'FINISHED'
    }).sort({
      matchDate: 1
    });

    // ---------------------------------------------------------
    // 5. Process finished matches
    // ---------------------------------------------------------
    for (const match of finishedMatches) {
      const homeId = (match.homeTeam?._id || match.homeTeam || '').toString();
      const awayId = (match.awayTeam?._id || match.awayTeam || '').toString();

      if (!homeId || !awayId) continue;

      // Both teams must be valid registered members of this competition
      if (!validTeamIds.has(homeId) || !validTeamIds.has(awayId)) {
        continue;
      }

      const home = teamStats[homeId];
      const away = teamStats[awayId];
      if (!home || !away) continue;

      const hScore = Number(match.homeScore ?? 0);
      const aScore = Number(match.awayScore ?? 0);

      home.played += 1;
      away.played += 1;

      home.goalsFor += hScore;
      home.goalsAgainst += aScore;

      away.goalsFor += aScore;
      away.goalsAgainst += hScore;

      if (hScore > aScore) {
        home.won += 1;
        home.points += 3;
        home.form.push('W');

        away.lost += 1;
        away.form.push('L');
      } else if (aScore > hScore) {
        away.won += 1;
        away.points += 3;
        away.form.push('W');

        home.lost += 1;
        home.form.push('L');
      } else {
        home.drawn += 1;
        home.points += 1;
        home.form.push('D');

        away.drawn += 1;
        away.points += 1;
        away.form.push('D');
      }
    }

    // ---------------------------------------------------------
    // 6. Calculate GD and keep latest 5 form results
    // ---------------------------------------------------------
    const standingsList = Object.values(teamStats).map((stats) => {
      stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
      stats.form = stats.form.slice(-5);
      return stats;
    });

    // ---------------------------------------------------------
    // 7. Sort league table by points, GD, goalsFor, alphabetical
    // ---------------------------------------------------------
    standingsList.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return (a.teamName || '').localeCompare(b.teamName || '');
    });

    // ---------------------------------------------------------
    // 8. Remove orphaned standings records for this league
    // ---------------------------------------------------------
    const validTeamIdArray = eligibleTeams.map((team) => team._id);

    await Standings.deleteMany({
      league: targetLeague._id,
      team: { $nin: validTeamIdArray }
    });

    // ---------------------------------------------------------
    // 9. Save completely rebuilt standings
    // ---------------------------------------------------------
    const updateOperations = standingsList.map((entry, index) => {
      return Standings.findOneAndUpdate(
        {
          league: targetLeague._id,
          team: entry.team
        },
        {
          league: targetLeague._id,
          team: entry.team,
          played: entry.played,
          won: entry.won,
          drawn: entry.drawn,
          lost: entry.lost,
          goalsFor: entry.goalsFor,
          goalsAgainst: entry.goalsAgainst,
          goalDifference: entry.goalDifference,
          points: entry.points,
          form: entry.form,
          position: index + 1,
          lastUpdated: new Date()
        },
        {
          upsert: true,
          new: true
        }
      );
    });

    await Promise.all(updateOperations);

    // ---------------------------------------------------------
    // 10. Return fresh table
    // ---------------------------------------------------------
    return this.getStandings(targetLeague._id);
  }

  /**
   * Retrieve the current standings for a specific competition,
   * populated with full team details, sorted by stored position.
   * If leagueId is null or 'current', defaults to NPFL.
   */
  async getStandings(leagueId) {
    let actualLeagueId = (leagueId?._id || leagueId || '').toString();

    if (!actualLeagueId || actualLeagueId === 'current') {
      const npfl = await this.getNpflLeague();
      if (!npfl) return [];
      actualLeagueId = npfl._id.toString();
    }

    return await Standings.find({ league: actualLeagueId })
      .populate('team', 'name shortName code logo stadium city country')
      .sort({ position: 1 });
  }
}

module.exports = new TableService();
