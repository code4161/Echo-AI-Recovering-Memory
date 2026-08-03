import styles from './StatusPill.module.css';

export type StatusTone = 'live' | 'offline' | 'pending' | 'down';

interface StatusPillProps {
  tone: StatusTone;
  label: string;
  title?: string;
  onRetry?: () => void;
}

/** Small connection indicator. Never let the link's state be invisible. */
export function StatusPill({ tone, label, title, onRetry }: StatusPillProps) {
  return (
    <span className={`${styles.pill} ${styles[tone]}`} title={title ?? label}>
      <span className={styles.dot} aria-hidden="true" />
      <span>{label}</span>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Retry
        </button>
      )}
    </span>
  );
}
