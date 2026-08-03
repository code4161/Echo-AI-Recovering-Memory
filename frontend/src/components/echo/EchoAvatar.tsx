import type { Emotion } from '@/types/domain';
import type { ReactElement } from 'react';
import styles from './EchoAvatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface EchoAvatarProps {
  mood: Emotion;
  /** Animates the mouth while Echo is composing a reply. */
  speaking?: boolean;
  size?: AvatarSize;
}

const MOOD_DESCRIPTION: Record<Emotion, string> = {
  neutral: 'calm',
  happy: 'delighted',
  curious: 'curious',
  sad: 'downcast',
  afraid: 'frightened',
  nostalgic: 'wistful',
};

/** Eyes are the strongest emotional signal, so each mood gets its own shape. */
function Eyes({ mood }: { mood: Emotion }): ReactElement {
  switch (mood) {
    case 'happy':
      return (
        <g className={`${styles.eyes} ${styles.eyesStatic}`}>
          <path className={styles.eyeArc} d="M70 104 Q80 92 90 104" />
          <path className={styles.eyeArc} d="M110 104 Q120 92 130 104" />
        </g>
      );

    case 'nostalgic':
      return (
        <g className={`${styles.eyes} ${styles.eyesStatic}`}>
          <path className={styles.eyeArc} d="M70 102 Q80 96 90 102" />
          <path className={styles.eyeArc} d="M110 102 Q120 96 130 102" />
        </g>
      );

    case 'sad':
      return (
        <g className={styles.eyes}>
          <circle cx="80" cy="103" r="8" />
          <circle cx="120" cy="103" r="8" />
          <path className={styles.eyeArc} d="M70 93 Q80 89 90 93" />
          <path className={styles.eyeArc} d="M110 93 Q120 89 130 93" />
        </g>
      );

    case 'afraid':
      return (
        <g className={styles.eyes}>
          <circle cx="79" cy="101" r="11" />
          <circle cx="121" cy="101" r="11" />
          <circle className={styles.pupilShine} cx="79" cy="101" r="4" />
          <circle className={styles.pupilShine} cx="121" cy="101" r="4" />
        </g>
      );

    // Curious keeps one eye slightly wider, which reads as a tilt of interest.
    case 'curious':
      return (
        <g className={styles.eyes}>
          <circle cx="80" cy="101" r="10" />
          <circle cx="120" cy="101" r="7.5" />
        </g>
      );

    case 'neutral':
    default:
      return (
        <g className={styles.eyes}>
          <circle cx="80" cy="101" r="9" />
          <circle cx="120" cy="101" r="9" />
        </g>
      );
  }
}

function Mouth({ mood }: { mood: Emotion }): ReactElement {
  switch (mood) {
    case 'happy':
      return <path className={styles.mouth} d="M86 124 Q100 141 114 124" />;
    case 'curious':
      return <circle className={`${styles.mouth} ${styles.mouthFilled}`} cx="100" cy="130" r="5" />;
    case 'sad':
      return <path className={styles.mouth} d="M88 135 Q100 125 112 135" />;
    case 'afraid':
      return <path className={styles.mouth} d="M88 131 q5 -5 10 0 t10 0" />;
    case 'nostalgic':
      return <path className={styles.mouth} d="M88 127 Q100 136 112 127" />;
    case 'neutral':
    default:
      return <path className={styles.mouth} d="M90 128 Q100 133 110 128" />;
  }
}

/**
 * Echo's face. Purely presentational: it reads a mood and draws it, so the same
 * component works as a 44px chat portrait or the full-size character on stage.
 */
export function EchoAvatar({ mood, speaking = false, size = 'md' }: EchoAvatarProps) {
  const classes = [
    styles.avatar,
    styles[size],
    speaking ? styles.speaking : '',
    mood === 'afraid' ? styles.afraid : '',
    mood === 'curious' ? styles.curious : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-emotion={mood}
      role="img"
      aria-label={`Echo looks ${MOOD_DESCRIPTION[mood]}`}
    >
      <svg className={styles.svg} viewBox="0 0 200 190" aria-hidden="true">
        <circle className={styles.aura} cx="100" cy="110" r="72" />

        <line className={styles.antennaStem} x1="100" y1="46" x2="100" y2="30" />
        <circle className={styles.antennaTip} cx="100" cy="24" r="7" />

        <ellipse className={styles.body} cx="100" cy="110" rx="60" ry="56" />
        <ellipse className={styles.shine} cx="76" cy="86" rx="18" ry="12" />

        <g className={styles.face}>
          <Eyes mood={mood} />
          {(mood === 'happy' || mood === 'nostalgic') && (
            <>
              <ellipse className={styles.blush} cx="64" cy="118" rx="9" ry="5.5" />
              <ellipse className={styles.blush} cx="136" cy="118" rx="9" ry="5.5" />
            </>
          )}
          {mood === 'sad' && <ellipse className={styles.tear} cx="86" cy="116" rx="3.5" ry="5" />}
          <Mouth mood={mood} />
        </g>

        {mood === 'happy' && (
          <>
            <circle className={styles.sparkle} cx="34" cy="72" r="4" />
            <circle className={styles.sparkle} cx="168" cy="92" r="3.5" />
            <circle className={styles.sparkle} cx="48" cy="150" r="3" />
          </>
        )}
      </svg>
    </div>
  );
}
