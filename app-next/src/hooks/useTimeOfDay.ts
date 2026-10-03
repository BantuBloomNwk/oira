import { useEffect, useState } from 'react';

export type TimeOfDay = 'day' | 'night';

/* After Dark starts at seven and ends at six. Deliberately blunt rather than clever: real
   sunrise needs her latitude, and asking a woman for her location so a background can be the
   right colour is a bad trade in an app whose whole pitch is that it does not collect things
   it does not need. */
const NIGHT_FROM = 19;
const NIGHT_UNTIL = 6;

const at = (d: Date): TimeOfDay => {
  const h = d.getHours();
  return h >= NIGHT_FROM || h < NIGHT_UNTIL ? 'night' : 'day';
};

/**
 * Is it night where she is?
 *
 * Her device's clock is already her region. `new Date()` is local time, which is set from
 * her timezone, so this is per-user and per-region without a permission prompt, without an
 * IP lookup and without anything crossing the network. A woman in Lagos gets After Dark at
 * seven in Lagos.
 *
 * Rechecks on the hour rather than on a fast interval, and again whenever she comes back to
 * the app, which is when a stale reading would actually be visible.
 */
export function useTimeOfDay(): TimeOfDay {
  const [tod, setTod] = useState<TimeOfDay>(() => at(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      setTod(at(new Date()));
      const now = new Date();
      const next = new Date(now);
      next.setHours(now.getHours() + 1, 0, 5, 0);
      timer = setTimeout(schedule, next.getTime() - now.getTime());
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') setTod(at(new Date()));
    };

    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return tod;
}
