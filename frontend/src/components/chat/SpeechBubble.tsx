import type { Emotion, MessageSender } from '@/types/domain';
import type { ReactNode } from 'react';
import styles from './SpeechBubble.module.css';

export interface SpeechBubbleProps {
  sender: MessageSender;
  children: ReactNode;
  /** Tints an Echo bubble with the mood the line was said in. */
  emotion?: Emotion;
  /** Small caption under the text, usually a timestamp. */
  meta?: string;
  /** Hide the tail when this message continues the same speaker's run. */
  tail?: boolean;
}

/**
 * A single speech bubble. Presentational and reusable: pass it any content,
 * including the typing indicator, not just message text.
 */
export function SpeechBubble({
  sender,
  children,
  emotion,
  meta,
  tail = true,
}: SpeechBubbleProps) {
  const classes = [styles.bubble, styles[sender], tail ? '' : styles.noTail]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...(emotion ? { 'data-emotion': emotion } : {})}>
      <p className={styles.text}>{children}</p>
      {meta && <span className={styles.meta}>{meta}</span>}
    </div>
  );
}
