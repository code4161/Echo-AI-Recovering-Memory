import { ChatComposer } from '@/components/chat/ChatComposer';
import { MessageList } from '@/components/chat/MessageList';
import { QuickReplies } from '@/components/chat/QuickReplies';
import { Panel } from '@/components/ui/Panel';
import { useGame } from '@/features/game/useGame';
import { QUICK_REPLIES } from '@/services/echo/dialogue';
import styles from './ChatPanel.module.css';

function composerHint(status: string): string | null {
  switch (status) {
    case 'connecting':
      return 'Waking Echo up…';
    case 'reconnecting':
      return 'Lost the connection. Trying to get back to Echo…';
    case 'error':
      return 'Echo is out of reach right now.';
    default:
      return null;
  }
}

export function ChatPanel() {
  const { state, send, busy } = useGame();
  const hint = composerHint(state.status);

  // Starters are only useful before the conversation finds its footing.
  const showQuickReplies =
    !hint && state.messages.filter((message) => message.sender === 'player').length < 2;

  return (
    <Panel flush className={styles.panel} aria-label="Conversation with Echo">
      <div className={styles.inner}>
        <MessageList
          messages={state.messages}
          typing={state.thinking}
          mood={state.mood}
          emptyHint="Echo is listening. Anything at all will do."
        />

        {showQuickReplies && <QuickReplies options={QUICK_REPLIES} onPick={send} />}

        {state.error && (
          <p className={styles.notice} role="status">
            {state.error}
          </p>
        )}

        <ChatComposer
          onSend={send}
          disabled={busy}
          {...(hint ? { placeholder: hint } : {})}
        />
      </div>
    </Panel>
  );
}
