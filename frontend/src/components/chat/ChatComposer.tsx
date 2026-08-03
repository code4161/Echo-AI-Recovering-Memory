import { Button } from '@/components/ui/Button';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import styles from './ChatComposer.module.css';

const MAX_LENGTH = 300;

export interface ChatComposerProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = 'Say something to Echo…',
}: ChatComposerProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content instead of scrolling inside a one-line box.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setDraft('');
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const remaining = MAX_LENGTH - draft.length;

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <div className={styles.row}>
        <div className={styles.field}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            rows={1}
            value={draft}
            maxLength={MAX_LENGTH}
            placeholder={placeholder}
            aria-label="Your message to Echo"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <Button type="submit" size="icon" disabled={disabled || !draft.trim()} aria-label="Send">
          <svg className={styles.sendIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
          </svg>
        </Button>
      </div>

      <div className={styles.footer}>
        <span className={styles.hint}>Enter to send · Shift + Enter for a new line</span>
        {remaining < 60 && (
          <span className={`${styles.count} ${remaining < 15 ? styles.countWarn : ''}`}>
            {remaining}
          </span>
        )}
      </div>
    </form>
  );
}
