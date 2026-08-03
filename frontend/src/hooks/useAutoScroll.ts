import { useEffect, useRef } from 'react';

/**
 * Keeps a scroll container pinned to the bottom as content arrives, unless the
 * player has scrolled up to re-read something.
 */
export function useAutoScroll<T extends HTMLElement>(dependencies: readonly unknown[]) {
  const ref = useRef<T>(null);
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const onScroll = () => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      pinnedToBottom.current = distanceFromBottom < 80;
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || !pinnedToBottom.current) return;

    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return ref;
}
