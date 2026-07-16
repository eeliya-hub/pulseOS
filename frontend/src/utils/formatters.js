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
