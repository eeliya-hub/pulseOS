/**
 * IATA → ICAO airline codes, used to turn a ticket's flight number into the
 * callsign an aircraft actually broadcasts.
 *
 * A boarding pass says "BA117"; the transponder says "BAW117", and the live
 * ADS-B feeds are keyed on the latter. The route database accepts either form
 * for most carriers, so this table is what lets us try both before giving up.
 */
const IATA_TO_ICAO = {
  A3: 'AEE', AA: 'AAL', AC: 'ACA', AF: 'AFR', AI: 'AIC', AM: 'AMX', AR: 'ARG', AS: 'ASA',
  AT: 'RAM', AV: 'AVA', AY: 'FIN', AZ: 'ITY', B6: 'JBU', BA: 'BAW', BR: 'EVA', BT: 'BTI',
  CA: 'CCA', CI: 'CAL', CM: 'CMP', CX: 'CPA', CZ: 'CSN', DE: 'CFG', DL: 'DAL', DY: 'NOZ',
  EI: 'EIN', EK: 'UAE', EN: 'DLA', ET: 'ETH', EW: 'EWG', EY: 'ETD', F9: 'FFT', FI: 'ICE',
  FR: 'RYR', GA: 'GIA', GF: 'GFA', HA: 'HAL', HU: 'CHH', HV: 'TRA', IB: 'IBE', JL: 'JAL',
  KE: 'KAL', KL: 'KLM', KM: 'AMC', KQ: 'KQA', LA: 'LAN', LH: 'DLH', LO: 'LOT', LX: 'SWR',
  LY: 'ELY', MH: 'MAS', MS: 'MSR', MU: 'CES', NH: 'ANA', NK: 'NKS', NZ: 'ANZ', OA: 'OAL',
  OS: 'AUA', OU: 'CTN', PC: 'PGT', PR: 'PAL', QF: 'QFA', QR: 'QTR', RJ: 'RJA', RO: 'ROT',
  SK: 'SAS', SN: 'BEL', SQ: 'SIA', SU: 'AFL', SV: 'SVA', TG: 'THA', TK: 'THY', TP: 'TAP',
  TR: 'TGW', U2: 'EZY', UA: 'UAL', UX: 'AEA', VA: 'VOZ', VN: 'HVN', VS: 'VIR', VY: 'VLG',
  W6: 'WZZ', WF: 'WIF', WN: 'SWA', WS: 'WJA', WY: 'OMA', ZH: 'CSZ',
};

const ICAO_CODES = new Set(Object.values(IATA_TO_ICAO));

/**
 * Candidate callsigns to try for a flight number the user typed, best guess
 * first. "BA117" yields BA117 then BAW117; "ba7" also tries the zero-padded
 * BA007 / BAW007 forms airlines use for low flight numbers.
 *
 * @param {string} input a flight number or callsign, any spacing/casing
 * @returns {string[]} unique candidates, never empty for a parseable input
 */
export function callsignCandidates(input) {
  const raw = (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const parsed = raw.match(/^([A-Z0-9]{2,3}?)(\d{1,4}[A-Z]?)$/);
  if (!parsed) return raw ? [raw] : [];

  const [, prefix, suffix] = parsed;
  const digits = suffix.replace(/\D/g, '');
  const letter = suffix.slice(digits.length);
  const padded = digits.padStart(3, '0') + letter;

  const prefixes = [prefix];
  const icao = IATA_TO_ICAO[prefix];
  if (icao) prefixes.push(icao);

  const out = [];
  for (const p of prefixes) {
    out.push(`${p}${suffix}`);
    if (padded !== suffix) out.push(`${p}${padded}`);
  }
  return [...new Set(out)];
}

/** True when a callsign already uses a known 3-letter ICAO airline prefix. */
export const isIcaoCallsign = (callsign) => ICAO_CODES.has((callsign || '').slice(0, 3).toUpperCase());
