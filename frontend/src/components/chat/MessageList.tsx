import { useAutoScroll } from '@/hooks/useAutoScroll';
import type { Emotion, Message } from '@/types/domain';
import { ChatMessage } from './ChatMessage';
import styles from './MessageList.module.css';
import { TypingIndicator } from './TypingIndicator';

export interface MessageListProps {
  messages: readonly Message[];
  typing: boolean;
  mood: Emotion;
  emptyHint?: string;
}

export function MessageList({ messages, typing, mood, emptyHint }: MessageListProps) {
  const listRef = useAutoScroll<HTMLOListElement>([messages.length, typing]);

  return (
    <ol className={styles.list} ref={listRef} aria-live="polite" aria-label="Conversation">
      {messages.length === 0 && !typing && (
        <li className={styles.empty}>{emptyHint ?? 'Echo is waiting. Say anything.'}</li>
      )}

      {messages.map((message, index) => {
        const startsRun = messages[index - 1]?.sender !== message.sender;
        return (
          <ChatMessage
            key={message.id}
            message={message}
            startsRun={startsRun}
            {...(startsRun ? {} : { className: styles.continued })}
          />
        );
      })}

      {typing && <TypingIndicator mood={mood} />}
    </ol>
  );
}
