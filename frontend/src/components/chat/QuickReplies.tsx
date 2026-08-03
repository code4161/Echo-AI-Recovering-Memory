import styles from './QuickReplies.module.css';

export interface QuickRepliesProps {
  options: readonly string[];
  onPick: (value: string) => void;
}

/** Conversation starters, so a blank chat box is never a dead end. */
export function QuickReplies({ options, onPick }: QuickRepliesProps) {
  if (options.length === 0) return null;

  return (
    <div className={styles.wrap} aria-label="Suggested things to say">
      {options.map((option) => (
        <button key={option} type="button" className={styles.chip} onClick={() => onPick(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}
