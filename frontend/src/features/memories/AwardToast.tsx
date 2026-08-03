import { useGame } from '@/features/game/useGame';
import { useEffect } from 'react';
import styles from './AwardToast.module.css';

/** How long an award sits on screen before dismissing itself. */
const VISIBLE_MS = 4200;

/**
 * A quieter counterpart to the memory celebration: awards mark how far the
 * player has come rather than what Echo remembered, so they take a corner
 * instead of the whole screen and leave on their own.
 */
export function AwardToast() {
  const { award, dismissAward } = useGame();

  useEffect(() => {
    if (!award) return;

    const timer = window.setTimeout(dismissAward, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [award, dismissAward]);

  if (!award) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.kicker}>Moment</span>
      <strong className={styles.title}>{award.title}</strong>
      <p className={styles.text}>{award.description}</p>
    </div>
  );
}
