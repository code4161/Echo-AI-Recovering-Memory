import { memoryModel } from '../models/memory.model.js';
import { progressModel } from '../models/progress.model.js';
import type { GameProgress, MemoryChapter, PlayerMemory } from '../types/domain.js';

export interface Journal {
  chapters: MemoryChapter[];
  memories: PlayerMemory[];
  progress: GameProgress;
}

/**
 * The memory journal.
 *
 * Locked fragments are returned with their title and content stripped. The
 * player still sees that something is there and what it costs, but the text
 * never reaches the browser before it is earned — hiding it in CSS would not
 * be hiding it at all.
 */
export const memoryService = {
  async journal(playerId: string): Promise<Journal> {
    const [chapters, memories, progress] = await Promise.all([
      memoryModel.listChapters(),
      memoryModel.listForPlayer(playerId),
      progressModel.ensure(playerId),
    ]);

    return {
      chapters,
      memories: memories.map((memory) =>
        memory.restored ? memory : { ...memory, title: 'Lost', content: '' }
      ),
      progress,
    };
  },
};
