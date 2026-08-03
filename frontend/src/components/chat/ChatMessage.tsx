import { EchoAvatar } from '@/components/echo/EchoAvatar';
import { formatClock } from '@/lib/time';
import type { Message } from '@/types/domain';
import styles from './ChatMessage.module.css';
import { SpeechBubble } from './SpeechBubble';

export interface ChatMessageProps {
  message: Message;
  /** False when the previous message came from the same speaker. */
  startsRun?: boolean;
  className?: string;
}

/** One row of the transcript: optional portrait plus a speech bubble. */
export function ChatMessage({ message, startsRun = true, className }: ChatMessageProps) {
  const isEcho = message.sender === 'echo';

  return (
    <li
      className={[styles.row, isEcho ? styles.echo : styles.player, className]
        .filter(Boolean)
        .join(' ')}
    >
      {isEcho &&
        (startsRun ? (
          <div className={styles.portrait}>
            <EchoAvatar mood={message.emotion} size="sm" />
          </div>
        ) : (
          <div className={styles.portraitSpacer} aria-hidden="true" />
        ))}

      <div className={styles.bubbleWrap}>
        <SpeechBubble
          sender={message.sender}
          emotion={isEcho ? message.emotion : undefined}
          meta={formatClock(message.createdAt)}
          tail={startsRun}
        >
          {message.content}
        </SpeechBubble>
      </div>
    </li>
  );
}
