import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Persisted usage counters, bucketed by calendar period (minute / hour / day /
 * month) in UTC. Used to enforce hard spend caps on metered providers — chiefly
 * Gemini, where the goal is to stay strictly inside the free tier.
 *
 * Persisted to disk (like tokenStore) so a backend restart can't reset a daily
 * cap back to zero — otherwise `npm run dev`'s file watcher would hand out a
 * fresh quota on every save. For Firebase, swap the file for a Firestore doc;
 * the peek/check/record call sites stay identical.
 */
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.usage.json');

// A period key is just the truncated ISO timestamp, so the bucket rolls over on
// its own — no timers, no reset job.
const PERIOD_KEY = {
  minute: (d) => d.toISOString().slice(0, 16), // 2026-07-14T18:32
  hour: (d) => d.toISOString().slice(0, 13), // 2026-07-14T18
  day: (d) => d.toISOString().slice(0, 10), // 2026-07-14
  month: (d) => d.toISOString().slice(0, 7), // 2026-07
};

// Start of the NEXT bucket, in UTC. Months are calendar months, so they can't be
// a fixed number of milliseconds — they're computed from the date parts.
const PERIOD_END = {
  minute: (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes() + 1),
  hour: (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1),
  day: (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
  month: (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

const store = load(); // { [scope]: { [period]: { key, requests, tokens } } }

let persistTimer = null;
function persist() {
  // Coalesce bursts of writes — the counters live in memory and only need to
  // survive a restart, not every individual increment.
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
    } catch {
      // disk unavailable (e.g. read-only Functions filesystem) — stay in-memory
    }
  }, 1000);
  persistTimer.unref?.();
}

function bucket(scope, period, now) {
  const key = PERIOD_KEY[period](now);
  const scoped = (store[scope] ??= {});
  const current = scoped[period];
  if (current?.key !== key) scoped[period] = { key, requests: 0, tokens: 0 };
  return scoped[period];
}

/** When the current `period` bucket rolls over, as an ISO string. */
function resetAt(period, now) {
  return new Date(PERIOD_END[period](now)).toISOString();
}

export const usageMeter = {
  /**
   * Current counts for a scope, without mutating anything.
   * @param {string} scope e.g. 'ai:gemini'
   * @returns {{[period: string]: {requests: number, tokens: number, resetAt: string}}}
   */
  peek(scope, periods = ['minute', 'day', 'month']) {
    const now = new Date();
    return Object.fromEntries(
      periods.map((period) => {
        const b = bucket(scope, period, now);
        return [period, { requests: b.requests, tokens: b.tokens, resetAt: resetAt(period, now) }];
      }),
    );
  },

  /**
   * The first limit this scope has already reached, or null if it's under all of
   * them. Checked BEFORE a call goes out, so a cap is never exceeded — only met.
   *
   * @param {string} scope
   * @param {{[period: string]: {requests?: number, tokens?: number}}} limits
   *        e.g. { minute: { requests: 10 }, day: { requests: 200, tokens: 500000 } }
   *        A limit of 0 or undefined means "no cap for that metric".
   */
  exceeded(scope, limits) {
    const now = new Date();
    for (const [period, limit] of Object.entries(limits)) {
      const b = bucket(scope, period, now);
      for (const metric of ['requests', 'tokens']) {
        const max = limit?.[metric];
        if (max > 0 && b[metric] >= max) {
          return { period, metric, limit: max, used: b[metric], resetAt: resetAt(period, now) };
        }
      }
    }
    return null;
  },

  /** Count a call against every period bucket for this scope. */
  record(scope, { requests = 1, tokens = 0 } = {}, periods = ['minute', 'hour', 'day', 'month']) {
    const now = new Date();
    for (const period of periods) {
      const b = bucket(scope, period, now);
      b.requests += requests;
      b.tokens += tokens;
    }
    persist();
  },

  /** Test/admin escape hatch. */
  reset(scope) {
    if (scope) delete store[scope];
    else for (const key of Object.keys(store)) delete store[key];
    persist();
  },
};
