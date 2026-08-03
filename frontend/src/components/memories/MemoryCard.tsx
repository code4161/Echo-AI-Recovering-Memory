import type { PlayerMemory } from '@/types/domain';
import styles from './MemoryCard.module.css';

export interface MemoryCardProps {
  memory: PlayerMemory;
  /** Plays the reveal animation for a just-recovered memory. */
  fresh?: boolean;
}

/**
 * One entry in the journal. Locked fragments show no content at all, so the
 * player never sees a memory they have not earned.
 */
export function MemoryCard({ memory, fresh = false }: MemoryCardProps) {
  const classes = [
    styles.card,
    memory.restored ? styles.restored : styles.locked,
    fresh ? styles.fresh : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={classes} data-emotion={memory.emotion}>
      <div className={styles.head}>
        {memory.restored && <span className={styles.dot} aria-hidden="true" />}
        <h3 className={`${styles.title} ${memory.restored ? '' : styles.lockedTitle}`}>
          {memory.restored ? memory.title : 'Lost'}
        </h3>
      </div>

      {memory.restored ? (
        <p className={styles.text}>{memory.content}</p>
      ) : (
        <p className={styles.hint}>Recovers at {memory.requiredTrust}% trust</p>
      )}
    </li>
  );
}
