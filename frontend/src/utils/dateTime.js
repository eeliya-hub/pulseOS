export function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(':', ' : ');
}

export function formatLongDate(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(date);
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';

  return `${weekday} ${day}${suffix} ${month} ${date.getFullYear()}`;
}

export function formatShortDate(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
  const year = String(date.getFullYear()).slice(-2);

  return `${weekday} ${date.getDate()} ${month} ${year}`;
}
