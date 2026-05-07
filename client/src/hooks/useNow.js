import { useEffect, useState } from 'react';

// Re-renders the calling component periodically with the current Date.now().
// Used as a clock for the playback timer; ~30Hz is plenty smooth for the
// background-fill / shrinking-ball visualizations.
export function useNow(intervalMs = 33) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
