// Local constructor logos, whitespace-trimmed (see /public/logos/f1/trimmed).
// Trimming removes each file's transparent padding so object-contain renders
// them at a consistent size. `scale` gives a final nudge to the very wide marks
// (wings/wordmarks) that would otherwise sit shorter than the compact emblems.
const LOCAL_F1_LOGOS = [
  { aliases: ['ferrari', 'scuderia ferrari'], src: '/logos/f1/trimmed/ferrari.png', scale: 1 },
  { aliases: ['mclaren'], src: '/logos/f1/trimmed/mclaren.png', scale: 1 },
  { aliases: ['alpine', 'alpine f1 team'], src: '/logos/f1/trimmed/alpine.png', scale: 1.1 },
  { aliases: ['cadillac'], src: '/logos/f1/trimmed/cadillac.png', scale: 1.2 },
  { aliases: ['aston martin'], src: '/logos/f1/trimmed/aston-martin.png', scale: 1.3 },
  { aliases: ['red bull', 'red bull racing', 'oracle red bull racing'], src: '/logos/f1/trimmed/red-bull.png', scale: 1.2 },
  { aliases: ['racing bulls', 'rb f1 team', 'visa cash app rb', 'vcarb'], src: '/logos/f1/trimmed/racing-bulls.png', scale: 1 },
  { aliases: ['mercedes', 'mercedes-amg', 'mercedes amg'], src: '/logos/f1/trimmed/mercedes.png', scale: 1 },
  { aliases: ['williams'], src: '/logos/f1/trimmed/williams.png', scale: 1 },
  { aliases: ['haas'], src: '/logos/f1/trimmed/haas.png', scale: 1 },
  { aliases: ['audi', 'sauber', 'kick sauber', 'stake', 'alfa romeo'], src: '/logos/f1/trimmed/audi.png', scale: 1.25 },
];

const normalize = (v) =>
  (v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Returns { src, scale } for a constructor, or null if we have no local logo.
export function localConstructorLogo(name) {
  const key = normalize(name);
  if (!key) return null;
  return LOCAL_F1_LOGOS.find(({ aliases }) => aliases.some((a) => key.includes(normalize(a)))) ?? null;
}
