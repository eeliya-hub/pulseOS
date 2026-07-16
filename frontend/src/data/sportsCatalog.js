// Curated preset list for the Sports settings picker. Football league `id`s are
// mapped to Football-Data.org competition codes on the backend
// (39→PL, 140→PD, 135→SA, 78→BL1, 61→FL1). NBA/NFL/F1 resolve by team name.
export const SPORTS_CATALOG = [
  {
    sport: 'football',
    label: 'Football',
    icon: '⚽',
    leagues: [
      {
        id: 39,
        label: 'Premier League',
        teams: [
          'Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton', 'Chelsea',
          'Crystal Palace', 'Everton', 'Fulham', 'Liverpool', 'Manchester City',
          'Manchester United', 'Newcastle', 'Nottingham Forest', 'Tottenham', 'West Ham', 'Wolves',
        ],
      },
      {
        id: 140,
        label: 'La Liga',
        teams: [
          'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Real Sociedad',
          'Villarreal', 'Athletic Club', 'Real Betis', 'Valencia',
        ],
      },
      {
        id: 135,
        label: 'Serie A',
        teams: ['Inter', 'AC Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta'],
      },
      {
        id: 78,
        label: 'Bundesliga',
        teams: ['Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen'],
      },
      {
        id: 61,
        label: 'Ligue 1',
        teams: ['Paris Saint Germain', 'Marseille', 'Monaco', 'Lyon'],
      },
    ],
  },
  {
    sport: 'basketball',
    label: 'Basketball',
    icon: '🏀',
    leagues: [
      {
        id: 12,
        label: 'NBA',
        teams: [
          'Los Angeles Lakers', 'Boston Celtics', 'Golden State Warriors', 'Miami Heat',
          'Milwaukee Bucks', 'Denver Nuggets', 'Phoenix Suns', 'New York Knicks', 'Chicago Bulls',
        ],
      },
    ],
  },
  {
    sport: 'nfl',
    label: 'NFL',
    icon: '🏈',
    leagues: [
      {
        id: 1,
        label: 'NFL',
        teams: [
          'Jacksonville Jaguars', 'Kansas City Chiefs', 'San Francisco 49ers', 'Dallas Cowboys',
          'Buffalo Bills', 'Philadelphia Eagles', 'Green Bay Packers', 'Miami Dolphins',
        ],
      },
    ],
  },
  {
    sport: 'f1',
    label: 'Formula 1',
    icon: '🏎️',
    leagues: [
      {
        id: null,
        label: 'Formula 1',
        // F1 isn't team-specific — one toggle follows the whole season (races +
        // driver/constructor standings), not a single constructor.
        teams: ['Formula 1'],
      },
    ],
  },
];

export const leagueKeyOf = (sport, league) => `${sport}:${league.id ?? league.label}`;

export function findLeague(key) {
  for (const s of SPORTS_CATALOG) {
    for (const l of s.leagues) {
      if (leagueKeyOf(s.sport, l) === key) return { ...l, sport: s.sport, icon: s.icon };
    }
  }
  return null;
}

export const firstLeagueKey = () => leagueKeyOf(SPORTS_CATALOG[0].sport, SPORTS_CATALOG[0].leagues[0]);

export const sportIcon = (sport) => SPORTS_CATALOG.find((s) => s.sport === sport)?.icon ?? '•';
