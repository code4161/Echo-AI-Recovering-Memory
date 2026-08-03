import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  label: string;
  /** Tint the fill with the ambient emotion colour instead of the brand gradient. */
  mood?: boolean;
  shimmer?: boolean;
}

export function ProgressBar({ value, label, mood = false, shimmer = false }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div
      className={[styles.track, shimmer ? styles.shimmer : ''].filter(Boolean).join(' ')}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={[styles.fill, mood ? styles.moodFill : ''].filter(Boolean).join(' ')}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
