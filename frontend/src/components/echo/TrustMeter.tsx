import { ProgressBar } from '@/components/ui/ProgressBar';
import { friendshipFor, nextFriendshipLevel } from '@/lib/friendship';
import { useEffect, useRef, useState } from 'react';
import styles from './TrustMeter.module.css';

export interface TrustMeterProps {
  /** Trust percentage, 0–100. */
  value: number;
  showBlurb?: boolean;
}

/**
 * The friendship meter. Shows the relationship as a named level first and a
 * number second, and flashes when the player crosses into a new band.
 */
export function TrustMeter({ value, showBlurb = true }: TrustMeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const level = friendshipFor(clamped);
  const next = nextFriendshipLevel(clamped);

  const [celebrating, setCelebrating] = useState(false);
  const previousLevel = useRef(level.name);

  useEffect(() => {
    if (previousLevel.current === level.name) return;

    previousLevel.current = level.name;
    setCelebrating(true);
    const timer = window.setTimeout(() => setCelebrating(false), 1600);
    return () => window.clearTimeout(timer);
  }, [level.name]);

  return (
    <div className={styles.meter}>
      <div className={styles.top}>
        <span className={[styles.level, celebrating ? styles.levelUp : ''].filter(Boolean).join(' ')}>
          {level.name}
        </span>
        <span className={styles.value}>{clamped}%</span>
      </div>

      <ProgressBar value={clamped} label="Echo's trust in you" shimmer={clamped > 0} />

      {showBlurb && <p className={styles.blurb}>{level.blurb}</p>}

      {next && (
        <p className={styles.next}>
          {next.min - clamped}% until {next.name}
        </p>
      )}
    </div>
  );
}
