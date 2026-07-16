// ESPN's public logo CDN, keyed by team abbreviation — free, no auth, stable.
const NBA_ABBR = {
  'atlanta hawks': 'atl', 'boston celtics': 'bos', 'brooklyn nets': 'bkn', 'charlotte hornets': 'cha',
  'chicago bulls': 'chi', 'cleveland cavaliers': 'cle', 'dallas mavericks': 'dal', 'denver nuggets': 'den',
  'detroit pistons': 'det', 'golden state warriors': 'gs', 'houston rockets': 'hou', 'indiana pacers': 'ind',
  'los angeles clippers': 'lac', 'la clippers': 'lac', 'los angeles lakers': 'lal', 'memphis grizzlies': 'mem',
  'miami heat': 'mia', 'milwaukee bucks': 'mil', 'minnesota timberwolves': 'min', 'new orleans pelicans': 'no',
  'new york knicks': 'ny', 'oklahoma city thunder': 'okc', 'orlando magic': 'orl', 'philadelphia 76ers': 'phi',
  'phoenix suns': 'phx', 'portland trail blazers': 'por', 'sacramento kings': 'sac', 'san antonio spurs': 'sa',
  'toronto raptors': 'tor', 'utah jazz': 'utah', 'washington wizards': 'wsh',
};

const NFL_ABBR = {
  'arizona cardinals': 'ari', 'atlanta falcons': 'atl', 'baltimore ravens': 'bal', 'buffalo bills': 'buf',
  'carolina panthers': 'car', 'chicago bears': 'chi', 'cincinnati bengals': 'cin', 'cleveland browns': 'cle',
  'dallas cowboys': 'dal', 'denver broncos': 'den', 'detroit lions': 'det', 'green bay packers': 'gb',
  'houston texans': 'hou', 'indianapolis colts': 'ind', 'jacksonville jaguars': 'jax', 'kansas city chiefs': 'kc',
  'las vegas raiders': 'lv', 'los angeles chargers': 'lac', 'los angeles rams': 'lar', 'miami dolphins': 'mia',
  'minnesota vikings': 'min', 'new england patriots': 'ne', 'new orleans saints': 'no', 'new york giants': 'nyg',
  'new york jets': 'nyj', 'philadelphia eagles': 'phi', 'pittsburgh steelers': 'pit', 'san francisco 49ers': 'sf',
  'seattle seahawks': 'sea', 'tampa bay buccaneers': 'tb', 'tennessee titans': 'ten', 'washington commanders': 'wsh',
};

const normalize = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim();

function lookup(table, name) {
  const key = normalize(name);
  if (table[key]) return table[key];
  const match = Object.keys(table).find((k) => key.includes(k) || k.includes(key));
  return match ? table[match] : null;
}

export const nbaLogo = (name) => {
  const abbr = lookup(NBA_ABBR, name);
  return abbr ? `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png` : null;
};

export const nflLogo = (name) => {
  const abbr = lookup(NFL_ABBR, name);
  return abbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png` : null;
};
