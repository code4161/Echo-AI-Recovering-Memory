import { EchoAvatar } from '@/components/echo/EchoAvatar';
import type { Emotion } from '@/types/domain';
import { SpeechBubble } from './SpeechBubble';
import styles from './TypingIndicator.module.css';

export interface TypingIndicatorProps {
  mood: Emotion;
}

/** Echo composing a reply. Reuses SpeechBubble so it lines up with real messages. */
export function TypingIndicator({ mood }: TypingIndicatorProps) {
  return (
    <li className={styles.row} data-emotion={mood}>
      <div className={styles.portrait}>
        <EchoAvatar mood={mood} size="sm" speaking />
      </div>

      <SpeechBubble sender="echo" emotion={mood}>
        <span className={styles.dots} role="status" aria-label="Echo is thinking">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
      </SpeechBubble>
    </li>
  );
}
