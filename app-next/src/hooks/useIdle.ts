import { useEffect, useState } from 'react';

const IDLE_MS = 4000;
const WAKE_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'] as const;

/**
 * She is still. Ported from the idle watcher in app/index.html.
 *
 * On a desktop the iris rim appeared on hover. There is no hover on a phone, so the
 * equivalent is stillness: the rim fades in once she has not touched anything for a
 * moment, and fades out the instant she does.
 *
 * `suppressed` is for the camera screen. A drifting light over a live preview reads as
 * the scan doing something, and it is not.
 */
export function useIdle(suppressed = false): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (suppressed) {
      setIdle(false);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') setIdle(true);
      }, IDLE_MS);
    };

    WAKE_EVENTS.forEach((ev) =>
      window.addEventListener(ev, wake, { passive: true, capture: true })
    );
    document.addEventListener('visibilitychange', wake);
    wake();

    return () => {
      clearTimeout(timer);
      WAKE_EVENTS.forEach((ev) =>
        window.removeEventListener(ev, wake, { capture: true })
      );
      document.removeEventListener('visibilitychange', wake);
    };
  }, [suppressed]);

  return idle;
}
