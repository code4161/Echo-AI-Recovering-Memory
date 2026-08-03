import { Button } from '@/components/ui/Button';
import { useGame } from '@/features/game/useGame';
import { useEffect, useRef } from 'react';
import styles from './MemoryToast.module.css';

/**
 * The payoff moment. Recovering a memory is the point of the game, so it gets
 * the whole screen for a beat rather than a corner notification.
 */
export function MemoryToast() {
  const { celebration, dismissCelebration } = useGame();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!celebration) return;

    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissCelebration();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [celebration, dismissCelebration]);

  if (!celebration) return null;

  return (
    <div
      className={styles.backdrop}
      data-emotion={celebration.emotion}
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-toast-title"
      onClick={dismissCelebration}
    >
      <div className={styles.card} onClick={(event) => event.stopPropagation()}>
        <div className={styles.halo} aria-hidden="true" />
        <span className={styles.kicker}>Memory recovered</span>
        <h2 className={styles.title} id="memory-toast-title">
          {celebration.title}
        </h2>
        <p className={styles.text}>{celebration.content}</p>
        <Button ref={closeRef} onClick={dismissCelebration}>
          Keep going
        </Button>
      </div>
    </div>
  );
}
