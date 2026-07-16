import { fetchJson } from '../../../utils/httpClient.js';

// Jolpica F1 — Ergast-compatible, no API key. Every path must end in `.json`.
const BASE = 'https://api.jolpi.ca/ergast/f1';
const INTEGRATION = 'Jolpica F1';

export const jolpicaProvider = {
  get: (path) =>
    fetchJson(`${BASE}/${path}`, {
      integration: INTEGRATION,
      timeoutMs: 12_000,
      headers: { 'user-agent': 'PulseOS/0.1 (personal dashboard)' },
    }),
};
