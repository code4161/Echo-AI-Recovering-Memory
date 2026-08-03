import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { EchoStage } from '@/features/echo/EchoStage';
import { useGame } from '@/features/game/useGame';
import { AwardToast } from '@/features/memories/AwardToast';
import { MemoryJournal } from '@/features/memories/MemoryJournal';
import { MemoryToast } from '@/features/memories/MemoryToast';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useState } from 'react';
import styles from './GamePage.module.css';

type PanelId = 'chat' | 'memories';

export function GamePage() {
  const { state } = useGame();
  const narrow = useMediaQuery('(max-width: 1024px)');
  const [tab, setTab] = useState<PanelId>('chat');

  const tabs: readonly TabItem<PanelId>[] = [
    { id: 'chat', label: 'Talk' },
    { id: 'memories', label: 'Memories', badge: state.progress.memoriesRestored },
  ];

  return (
    <main className={styles.game}>
      <EchoStage compact={narrow} />

      {narrow ? (
        <>
          <div className={styles.tabs}>
            <Tabs items={tabs} value={tab} onChange={setTab} label="Game panels" />
          </div>
          {tab === 'chat' ? <ChatPanel /> : <MemoryJournal />}
        </>
      ) : (
        <>
          <ChatPanel />
          <MemoryJournal />
        </>
      )}

      <MemoryToast />
      <AwardToast />
    </main>
  );
}
