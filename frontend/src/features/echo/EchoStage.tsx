import { EchoAvatar } from '@/components/echo/EchoAvatar';
import { EmotionBadge } from '@/components/echo/EmotionBadge';
import { TrustMeter } from '@/components/echo/TrustMeter';
import { Button } from '@/components/ui/Button';
import { StatusPill, type StatusTone } from '@/components/ui/StatusPill';
import { useGame } from '@/features/game/useGame';
import type { GameState } from '@/features/game/gameState';
import styles from './EchoStage.module.css';

interface StatusView {
  tone: StatusTone;
  label: string;
  title: string;
  retryable: boolean;
}

function describeConnection(state: GameState): StatusView {
  switch (state.status) {
    case 'ready':
      return state.mode === 'offline'
        ? {
            tone: 'offline',
            label: 'Offline',
            title:
              'The server was unreachable, so Echo is running in this browser. Progress is saved on this device only. Start over to try connecting again.',
            retryable: false,
          }
        : {
            tone: 'live',
            label: 'Live',
            title: 'Connected to Echo in real time. Progress is saved to your account.',
            retryable: false,
          };

    case 'reconnecting':
      return {
        tone: 'pending',
        label: 'Reconnecting',
        title: 'The connection dropped. Trying to restore it.',
        retryable: false,
      };

    case 'error':
      return {
        tone: 'down',
        label: 'Disconnected',
        title: state.error ?? 'Cannot reach Echo.',
        retryable: true,
      };

    default:
      return { tone: 'pending', label: 'Connecting', title: 'Waking Echo up.', retryable: false };
  }
}

export interface EchoStageProps {
  /** Shrinks to a portrait strip; used above the chat on small screens. */
  compact?: boolean;
}

/** Echo's presence: who she is, how she feels, how close you have become. */
export function EchoStage({ compact = false }: EchoStageProps) {
  const { state, reset, retry } = useGame();
  const connection = describeConnection(state);

  return (
    <aside className={styles.stage} data-emotion={state.mood} aria-label="Echo">
      <div className={styles.avatarSlot}>
        <EchoAvatar mood={state.mood} speaking={state.thinking} size={compact ? 'md' : 'lg'} />
      </div>

      <div className={styles.info}>
        <h1 className={styles.name}>Echo</h1>
        <EmotionBadge emotion={state.mood} withNote={!compact} />
        <p className={styles.line}>
          {state.thinking ? 'Reaching for something…' : 'Talking is what brings the memories back.'}
        </p>

        <div className={styles.meterWrap}>
          <TrustMeter value={state.trust} showBlurb={!compact} />
        </div>
      </div>

      <div className={styles.actions}>
        <StatusPill
          tone={connection.tone}
          label={connection.label}
          title={connection.title}
          {...(connection.retryable ? { onRetry: retry } : {})}
        />
        <Button variant="ghost" size="sm" block onClick={reset}>
          Start over
        </Button>
      </div>
    </aside>
  );
}
