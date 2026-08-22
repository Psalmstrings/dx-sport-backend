const Match = require('../models/Match');
const Standings = require('../models/Standings');
const Team = require('../models/Team');

class TableService {
  /**
   * Automatically recalculates the full league table for a given league ID.
   * Called whenever a match status changes to FINISHED, scores are edited,
   * or a completed match is deleted.
   *
   * This approach rebuilds stats entirely from completed match records,
   * which prevents double-counting if a score is edited multiple times.
   */
async recalculateTable(leagueId) {
  if (!leagueId) return;

  const actualLeagueId = (
    leagueId?._id ||
    leagueId ||
    ''
  ).toString();

  if (!actualLeagueId) return;

  // ---------------------------------------------------------
  // 1. Get ONLY teams that currently exist.
  // ---------------------------------------------------------
  const allTeams = await Team.find({});

  // ---------------------------------------------------------
  // 2. Build a Set of valid team IDs.
  // ---------------------------------------------------------
  const validTeamIds = new Set(
    allTeams.map((team) => team._id.toString())
  );

  // ---------------------------------------------------------
  // 3. Initialise every currently registered team with zero stats.
  // ---------------------------------------------------------
  const teamStats = {};

  allTeams.forEach((team) => {
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
  // 4. Get finished matches for this league.
  // ---------------------------------------------------------
  const finishedMatches = await Match.find({
    league: actualLeagueId,
    status: 'FINISHED'
  }).sort({
    matchDate: 1
  });

  // ---------------------------------------------------------
  // 5. Process finished matches.
  //
  // IMPORTANT:
  // If either team has been deleted, completely ignore
  // that match. This prevents deleted teams from appearing
  // in the league table again.
  // ---------------------------------------------------------
  for (const match of finishedMatches) {
    const homeId = (
      match.homeTeam?._id ||
      match.homeTeam ||
      ''
    ).toString();

    const awayId = (
      match.awayTeam?._id ||
      match.awayTeam ||
      ''
    ).toString();

    if (!homeId || !awayId) {
      continue;
    }

    // -------------------------------------------------------
    // CRITICAL FIX:
    // Never create a standings record for a team that no
    // longer exists.
    // -------------------------------------------------------
    if (
      !validTeamIds.has(homeId) ||
      !validTeamIds.has(awayId)
    ) {
      continue;
    }

    const home = teamStats[homeId];
    const away = teamStats[awayId];

    const hScore = Number(match.homeScore ?? 0);
    const aScore = Number(match.awayScore ?? 0);

    // -------------------------------------------------------
    // Played
    // -------------------------------------------------------
    home.played += 1;
    away.played += 1;

    // -------------------------------------------------------
    // Goals
    // -------------------------------------------------------
    home.goalsFor += hScore;
    home.goalsAgainst += aScore;

    away.goalsFor += aScore;
    away.goalsAgainst += hScore;

    // -------------------------------------------------------
    // Result
    // -------------------------------------------------------
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
  // 6. Calculate GD and keep latest 5 form results.
  // ---------------------------------------------------------
  const standingsList = Object.values(teamStats).map((stats) => {
    stats.goalDifference =
      stats.goalsFor - stats.goalsAgainst;

    stats.form = stats.form.slice(-5);

    return stats;
  });

  // ---------------------------------------------------------
  // 7. Sort league table.
  // ---------------------------------------------------------
  standingsList.sort((a, b) => {
    // Points
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    // Goal difference
    if (b.goalDifference !== a.goalDifference) {
      return b.goalDifference - a.goalDifference;
    }

    // Goals scored
    if (b.goalsFor !== a.goalsFor) {
      return b.goalsFor - a.goalsFor;
    }

    // Alphabetical
    return (a.teamName || '').localeCompare(
      b.teamName || ''
    );
  });

  // ---------------------------------------------------------
  // 8. Remove orphaned standings records.
  //
  // This is VERY important.
  // If a team was deleted, its old Standings document must
  // not remain in MongoDB.
  // ---------------------------------------------------------
  const validTeamIdArray = allTeams.map(
    (team) => team._id
  );

  await Standings.deleteMany({
    league: actualLeagueId,
    team: {
      $nin: validTeamIdArray
    }
  });

  // ---------------------------------------------------------
  // 9. Save completely rebuilt standings.
  // ---------------------------------------------------------
  const updateOperations = standingsList.map(
    (entry, index) => {
      return Standings.findOneAndUpdate(
        {
          league: actualLeagueId,
          team: entry.team
        },
        {
          league: actualLeagueId,
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
    }
  );

  await Promise.all(updateOperations);

  // ---------------------------------------------------------
  // 10. Return fresh table.
  // ---------------------------------------------------------
  return this.getStandings(actualLeagueId);
}

  /**
   * Retrieve the current standings for a specific league,
   * populated with full team details, sorted by stored position.
   */
  async getStandings(leagueId) {
    const actualLeagueId = (leagueId?._id || leagueId || '').toString();
    return await Standings.find({ league: actualLeagueId })
      .populate('team', 'name shortName code logo stadium city')
      .sort({ position: 1 });
  }
}

module.exports = new TableService();
