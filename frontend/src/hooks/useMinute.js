import { useEffect, useState } from 'react';

/** The time now, kept current to within a few seconds — enough for a clock that shows minutes. */
export function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
