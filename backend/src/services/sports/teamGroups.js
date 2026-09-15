/**
 * Conference and division for every NBA and NFL team.
 *
 * Neither is available on balldontlie's free tier — the standings endpoint is
 * paid, so the table is tallied from finished games, which carry no grouping at
 * all. Without this the table can only be a flat 1–30 league ladder, which is
 * not how either sport is followed: what matters is the conference race and the
 * playoff line, not that a team is 18th overall.
 *
 * Fixed data, so it lives here rather than costing a request.
 */
const NBA = {
  East: {
    Atlantic: ['Boston Celtics', 'Brooklyn Nets', 'New York Knicks', 'Philadelphia 76ers', 'Toronto Raptors'],
    Central: ['Chicago Bulls', 'Cleveland Cavaliers', 'Detroit Pistons', 'Indiana Pacers', 'Milwaukee Bucks'],
    Southeast: ['Atlanta Hawks', 'Charlotte Hornets', 'Miami Heat', 'Orlando Magic', 'Washington Wizards'],
  },
  West: {
    Northwest: ['Denver Nuggets', 'Minnesota Timberwolves', 'Oklahoma City Thunder', 'Portland Trail Blazers', 'Utah Jazz'],
    Pacific: ['Golden State Warriors', 'LA Clippers', 'Los Angeles Clippers', 'Los Angeles Lakers', 'Phoenix Suns', 'Sacramento Kings'],
    Southwest: ['Dallas Mavericks', 'Houston Rockets', 'Memphis Grizzlies', 'New Orleans Pelicans', 'San Antonio Spurs'],
  },
};

const NFL = {
  AFC: {
    East: ['Buffalo Bills', 'Miami Dolphins', 'New England Patriots', 'New York Jets'],
    North: ['Baltimore Ravens', 'Cincinnati Bengals', 'Cleveland Browns', 'Pittsburgh Steelers'],
    South: ['Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Tennessee Titans'],
    West: ['Denver Broncos', 'Kansas City Chiefs', 'Las Vegas Raiders', 'Los Angeles Chargers'],
  },
  NFC: {
    East: ['Dallas Cowboys', 'New York Giants', 'Philadelphia Eagles', 'Washington Commanders'],
    North: ['Chicago Bears', 'Detroit Lions', 'Green Bay Packers', 'Minnesota Vikings'],
    South: ['Atlanta Falcons', 'Carolina Panthers', 'New Orleans Saints', 'Tampa Bay Buccaneers'],
    West: ['Arizona Cardinals', 'Los Angeles Rams', 'San Francisco 49ers', 'Seattle Seahawks'],
  },
};

/** How many make the playoffs from each conference, and where the line sits. */
export const PLAYOFF_LINES = {
  nba: { line: 6, playIn: 10 }, // top 6 straight in, 7–10 play in
  nfl: { line: 7 }, // seven per conference
};

const index = (table) => {
  const out = new Map();
  for (const [conference, divisions] of Object.entries(table)) {
    for (const [division, teams] of Object.entries(divisions)) {
      for (const team of teams) out.set(team.toLowerCase(), { conference, division });
    }
  }
  return out;
};

const INDEXES = { nba: index(NBA), nfl: index(NFL) };

/**
 * The conference and division a team belongs to. Falls back to a loose match so
 * a feed writing "LA Clippers" for "Los Angeles Clippers" still resolves.
 */
export function teamGroup(sport, team) {
  const table = INDEXES[sport];
  const key = (team ?? '').toLowerCase().trim();
  if (!table || !key) return { conference: null, division: null };

  const exact = table.get(key);
  if (exact) return exact;
  for (const [name, group] of table) {
    if (name.includes(key) || key.includes(name)) return group;
  }
  return { conference: null, division: null };
}

export const conferencesOf = (sport) => (sport === 'nba' ? ['East', 'West'] : sport === 'nfl' ? ['AFC', 'NFC'] : []);
