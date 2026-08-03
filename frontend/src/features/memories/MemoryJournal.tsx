import { MemoryCard } from '@/components/memories/MemoryCard';
import { Panel } from '@/components/ui/Panel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useGame } from '@/features/game/useGame';
import styles from './MemoryJournal.module.css';

export function MemoryJournal() {
  const { state, celebration } = useGame();
  const { memories, progress, milestones } = state;

  const { memoriesRestored, memoriesTotal } = progress;
  const percent = memoriesTotal === 0 ? 0 : (memoriesRestored / memoriesTotal) * 100;

  const earned = milestones.filter((milestone) => milestone.achieved);

  return (
    <Panel
      title="Memories"
      aside={`${memoriesRestored} of ${memoriesTotal}`}
      flush
      className={styles.panel}
      aria-label="Recovered memories"
    >
      <div className={styles.progress}>
        <ProgressBar value={percent} label="Memories recovered" />
      </div>

      <ul className={styles.list}>
        {memories.map((memory) => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            fresh={celebration?.id === memory.id}
          />
        ))}
      </ul>

      {earned.length > 0 && (
        <div className={styles.awards}>
          <h3 className={styles.awardsTitle}>Moments</h3>
          <ul className={styles.awardsList}>
            {earned.map((milestone) => (
              <li key={milestone.id} className={styles.award} title={milestone.description}>
                {milestone.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
