import type { Emotion } from '@/types/domain';
import styles from './EmotionBadge.module.css';

/** Player-facing wording for each mood. */
export const EMOTION_LABEL: Record<Emotion, string> = {
  neutral: 'Calm',
  happy: 'Happy',
  curious: 'Curious',
  sad: 'Sad',
  afraid: 'Uneasy',
  nostalgic: 'Wistful',
};

const EMOTION_NOTE: Record<Emotion, string> = {
  neutral: 'listening quietly',
  happy: 'glowing a little',
  curious: 'leaning closer',
  sad: 'holding something back',
  afraid: 'not quite safe',
  nostalgic: 'somewhere far away',
};

export interface EmotionBadgeProps {
  emotion: Emotion;
  /** Adds the short descriptive phrase after the label. */
  withNote?: boolean;
}

export function EmotionBadge({ emotion, withNote = false }: EmotionBadgeProps) {
  return (
    <span className={styles.badge} data-emotion={emotion}>
      <span className={styles.dot} aria-hidden="true" />
      <span>
        {EMOTION_LABEL[emotion]}
        {withNote && <span className={styles.note}> · {EMOTION_NOTE[emotion]}</span>}
      </span>
    </span>
  );
}
