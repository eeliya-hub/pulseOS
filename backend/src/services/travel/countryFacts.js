/**
 * Bundled country reference for the Travel view.
 *
 * These facts (currency, sockets, voltage, which side of the road, dialling and
 * emergency numbers) don't change from week to week, and every free "country
 * facts" API has either died or gone behind a key — so they live here. Lookups
 * are instant, work offline, and can't break a trip card when an upstream goes
 * down. Anything genuinely live (rates, weather, opening hours) comes from a
 * provider instead.
 *
 * Table format, keyed by ISO 3166-1 alpha-2:
 *   [currency, socket types, mains volts, driving side, dialling code, emergency]
 */
const COUNTRIES = {
  AE: ['AED', 'G', 240, 'right', '+971', '999'],
  AR: ['ARS', 'C/I', 220, 'right', '+54', '911'],
  AT: ['EUR', 'C/F', 230, 'right', '+43', '112'],
  AU: ['AUD', 'I', 230, 'left', '+61', '000'],
  BE: ['EUR', 'C/E', 230, 'right', '+32', '112'],
  BG: ['BGN', 'C/F', 230, 'right', '+359', '112'],
  BR: ['BRL', 'C/N', 127, 'right', '+55', '190'],
  CA: ['CAD', 'A/B', 120, 'right', '+1', '911'],
  CH: ['CHF', 'C/J', 230, 'right', '+41', '112'],
  CL: ['CLP', 'C/L', 220, 'right', '+56', '133'],
  CN: ['CNY', 'A/C/I', 220, 'right', '+86', '110 / 120'],
  CO: ['COP', 'A/B', 110, 'right', '+57', '123'],
  CR: ['CRC', 'A/B', 120, 'right', '+506', '911'],
  CY: ['EUR', 'G', 240, 'left', '+357', '112'],
  CZ: ['CZK', 'C/E', 230, 'right', '+420', '112'],
  DE: ['EUR', 'C/F', 230, 'right', '+49', '112'],
  DK: ['DKK', 'C/E/K', 230, 'right', '+45', '112'],
  DO: ['DOP', 'A/B', 120, 'right', '+1809', '911'],
  EE: ['EUR', 'C/F', 230, 'right', '+372', '112'],
  EG: ['EGP', 'C/F', 220, 'right', '+20', '122'],
  ES: ['EUR', 'C/F', 230, 'right', '+34', '112'],
  FI: ['EUR', 'C/F', 230, 'right', '+358', '112'],
  FR: ['EUR', 'C/E', 230, 'right', '+33', '112'],
  GB: ['GBP', 'G', 230, 'left', '+44', '999 / 112'],
  GR: ['EUR', 'C/F', 230, 'right', '+30', '112'],
  HK: ['HKD', 'G', 220, 'left', '+852', '999'],
  HR: ['EUR', 'C/F', 230, 'right', '+385', '112'],
  HU: ['HUF', 'C/F', 230, 'right', '+36', '112'],
  ID: ['IDR', 'C/F', 230, 'left', '+62', '112'],
  IE: ['EUR', 'G', 230, 'left', '+353', '112'],
  IL: ['ILS', 'C/H', 230, 'right', '+972', '100'],
  IN: ['INR', 'C/D/M', 230, 'left', '+91', '112'],
  IS: ['ISK', 'C/F', 230, 'right', '+354', '112'],
  IT: ['EUR', 'C/F/L', 230, 'right', '+39', '112'],
  JM: ['JMD', 'A/B', 110, 'left', '+1876', '119'],
  JO: ['JOD', 'C/D/G', 230, 'right', '+962', '911'],
  JP: ['JPY', 'A/B', 100, 'left', '+81', '110 / 119'],
  KE: ['KES', 'G', 240, 'left', '+254', '999'],
  KR: ['KRW', 'C/F', 220, 'right', '+82', '112 / 119'],
  LK: ['LKR', 'D/G', 230, 'left', '+94', '119'],
  LT: ['EUR', 'C/F', 230, 'right', '+370', '112'],
  LU: ['EUR', 'C/F', 230, 'right', '+352', '112'],
  LV: ['EUR', 'C/F', 230, 'right', '+371', '112'],
  MA: ['MAD', 'C/E', 220, 'right', '+212', '19'],
  MT: ['EUR', 'G', 230, 'left', '+356', '112'],
  MU: ['MUR', 'C/G', 230, 'left', '+230', '999'],
  MV: ['MVR', 'D/G', 230, 'left', '+960', '119'],
  MX: ['MXN', 'A/B', 127, 'right', '+52', '911'],
  MY: ['MYR', 'G', 240, 'left', '+60', '999'],
  NL: ['EUR', 'C/F', 230, 'right', '+31', '112'],
  NO: ['NOK', 'C/F', 230, 'right', '+47', '112'],
  NZ: ['NZD', 'I', 230, 'left', '+64', '111'],
  PA: ['PAB', 'A/B', 120, 'right', '+507', '911'],
  PE: ['PEN', 'A/C', 220, 'right', '+51', '105'],
  PH: ['PHP', 'A/B/C', 220, 'right', '+63', '911'],
  PL: ['PLN', 'C/E', 230, 'right', '+48', '112'],
  PT: ['EUR', 'C/F', 230, 'right', '+351', '112'],
  QA: ['QAR', 'G', 240, 'right', '+974', '999'],
  RO: ['RON', 'C/F', 230, 'right', '+40', '112'],
  RS: ['RSD', 'C/F', 230, 'right', '+381', '112'],
  SA: ['SAR', 'G', 230, 'right', '+966', '911'],
  SE: ['SEK', 'C/F', 230, 'right', '+46', '112'],
  SG: ['SGD', 'G', 230, 'left', '+65', '999'],
  SI: ['EUR', 'C/F', 230, 'right', '+386', '112'],
  SK: ['EUR', 'C/E', 230, 'right', '+421', '112'],
  TH: ['THB', 'A/B/C/O', 220, 'left', '+66', '191'],
  TR: ['TRY', 'C/F', 230, 'right', '+90', '112'],
  TW: ['TWD', 'A/B', 110, 'right', '+886', '110 / 119'],
  TZ: ['TZS', 'D/G', 230, 'left', '+255', '112'],
  UA: ['UAH', 'C/F', 230, 'right', '+380', '112'],
  US: ['USD', 'A/B', 120, 'right', '+1', '911'],
  VN: ['VND', 'A/C/F', 220, 'right', '+84', '113 / 115'],
  ZA: ['ZAR', 'C/M/N', 230, 'left', '+27', '10111'],
};

const CURRENCY_SYMBOLS = {
  AED: 'د.إ', ARS: '$', AUD: 'A$', BGN: 'лв', BRL: 'R$', CAD: 'C$', CHF: 'Fr', CLP: '$',
  CNY: '¥', COP: '$', CRC: '₡', CZK: 'Kč', DKK: 'kr', DOP: 'RD$', EGP: 'E£', EUR: '€',
  GBP: '£', HKD: 'HK$', HUF: 'Ft', IDR: 'Rp', ILS: '₪', INR: '₹', ISK: 'kr', JMD: 'J$',
  JOD: 'JD', JPY: '¥', KES: 'KSh', KRW: '₩', LKR: 'Rs', MAD: 'DH', MUR: '₨', MVR: 'Rf',
  MXN: 'MX$', MYR: 'RM', NOK: 'kr', NZD: 'NZ$', PAB: 'B/.', PEN: 'S/', PHP: '₱', PLN: 'zł',
  QAR: 'ر.ق', RON: 'lei', RSD: 'дин', SAR: '﷼', SEK: 'kr', SGD: 'S$', THB: '฿', TRY: '₺',
  TWD: 'NT$', TZS: 'TSh', UAH: '₴', USD: '$', VND: '₫', ZAR: 'R',
};

/** The flag emoji for an ISO alpha-2 code — two regional-indicator letters. */
export function flagEmoji(code) {
  const cc = (code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** The symbol for a currency code, falling back to the code itself. */
export const currencySymbol = (code) => CURRENCY_SYMBOLS[(code || '').toUpperCase()] || code || '';

/**
 * Travel facts for a country code. Unknown countries still return a usable
 * object (flag + empty facts) so the UI never has to special-case them.
 */
export function countryFacts(code) {
  const cc = (code || '').trim().toUpperCase();
  const row = COUNTRIES[cc];
  const currency = row?.[0] ?? null;
  return {
    countryCode: cc || null,
    flag: flagEmoji(cc),
    currency: currency ? { code: currency, symbol: currencySymbol(currency) } : null,
    sockets: row?.[1] ?? null,
    voltage: row?.[2] ?? null,
    drivingSide: row?.[3] ?? null,
    callingCode: row?.[4] ?? null,
    emergency: row?.[5] ?? null,
  };
}
