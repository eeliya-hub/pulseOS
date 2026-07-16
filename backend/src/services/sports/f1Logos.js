const LOGOS = [
  {
    aliases: ['red bull', 'red bull racing', 'oracle red bull racing', 'rbr'],
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/fa/Red_Bull_Racing_Logo_2026.svg/250px-Red_Bull_Racing_Logo_2026.svg.png',
  },
  {
    aliases: ['ferrari', 'scuderia ferrari'],
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/df/Scuderia_Ferrari_HP_logo_24.svg/250px-Scuderia_Ferrari_HP_logo_24.svg.png',
  },
  {
    aliases: ['mclaren'],
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/03/McLarenF1Team.png/250px-McLarenF1Team.png',
  },
  {
    aliases: ['mercedes', 'mercedes-amg', 'mercedes amg'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Mercedes-AMG_Petronas_F1_Team_logo_%282026%29.svg/250px-Mercedes-AMG_Petronas_F1_Team_logo_%282026%29.svg.png',
  },
  {
    aliases: ['aston martin'],
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e7/Aston_Martin_F1_Logo.png/250px-Aston_Martin_F1_Logo.png',
  },
  {
    aliases: ['alpine', 'alpine f1 team'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/BWT_Alpine_F1_Team_Logo.png/250px-BWT_Alpine_F1_Team_Logo.png',
  },
  {
    aliases: ['williams'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Atlassian_Williams_F1_Team_logo.svg/250px-Atlassian_Williams_F1_Team_logo.svg.png',
  },
  {
    aliases: ['haas'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/TGR_Haas_F1_Team_Logo_%282026%29.svg/250px-TGR_Haas_F1_Team_Logo_%282026%29.svg.png',
  },
  {
    aliases: ['racing bulls', 'rb f1 team', 'rb', 'visa cash app rb', 'vcarb', 'alphatauri', 'toro rosso'],
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/VCARB_F1_logo.svg/250px-VCARB_F1_logo.svg.png',
  },
  {
    aliases: ['audi', 'sauber', 'kick sauber', 'stake', 'stake f1 team', 'alfa romeo'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Audif1.com_logo17_%28cropped%29.svg/250px-Audif1.com_logo17_%28cropped%29.svg.png',
  },
  {
    aliases: ['cadillac'],
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/bc/Cadillac_Formula_1_Team_Logo_%282025%29.svg/250px-Cadillac_Formula_1_Team_Logo_%282025%29.svg.png',
  },
];

const normalize = (value) =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function constructorLogo(name) {
  const key = normalize(name);
  if (!key) return null;
  return LOGOS.find(({ aliases }) => aliases.some((alias) => key.includes(normalize(alias))))?.url ?? null;
}
