export const formatCurrency = (value, options = {}) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: options.currency ?? 'GBP',
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
  }).format(value);

export const formatCurrencyDetailed = (value, options = {}) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: options.currency ?? 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const formatPercent = (value, options = {}) =>
  new Intl.NumberFormat('en-GB', {
    style: 'percent',
    maximumFractionDigits: options.maximumFractionDigits ?? 1,
    signDisplay: options.signDisplay ?? 'exceptZero',
  }).format(value);

export const formatCompactNumber = (value) =>
  new Intl.NumberFormat('en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

export const classNames = (...classes) => classes.filter(Boolean).join(' ');

export const getChangeTone = (value) =>
  value >= 0 ? 'text-emerald-200 bg-emerald-300/10' : 'text-rose-200 bg-rose-300/10';

export const getProgressTone = (value) => {
  if (value >= 0.82) return 'from-emerald-300 to-cyan-300';
  if (value >= 0.55) return 'from-cyan-300 to-purple-300';
  return 'from-purple-300 to-pink-300';
};

/** "3 min ago" — how long since something happened, in words. */
export function since(at, now = Date.now()) {
  if (!at) return 'not yet';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/**
 * A file size as a person would say it. Whole numbers above a megabyte, since
 * "2.4 MB" and "2 MB" tell an attachment list the same thing.
 */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
