/**
 * Tiny structured-ish logger. Swap for pino/winston later without touching
 * call sites. Kept dependency-free so the server boots with zero install.
 */
const stamp = () => new Date().toISOString();

export const logger = {
  info: (...args) => console.log(`[${stamp()}] [info]`, ...args),
  warn: (...args) => console.warn(`[${stamp()}] [warn]`, ...args),
  error: (...args) => console.error(`[${stamp()}] [error]`, ...args),
};
