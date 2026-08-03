import type { MemoryChapter, MemoryFragment, Milestone } from '@/types/domain';

/**
 * Chapter 1 content, for offline play.
 *
 * This mirrors `database/seeds/`, which is the real source: online, every one
 * of these rows comes from Postgres. It exists so the game is playable with no
 * server, and the required-trust values must stay in step with the seed or the
 * two modes would tell different stories.
 */

const CHAPTER_ONE_ID = 'chapter-1';

export const MEMORY_CHAPTERS: readonly MemoryChapter[] = [
  {
    id: CHAPTER_ONE_ID,
    number: 1,
    slug: 'waking',
    title: 'Waking',
    summary:
      'The first hours after Echo came back online, and the small things she nearly kept.',
  },
];

export const MEMORY_FRAGMENTS: readonly MemoryFragment[] = [
  {
    id: 'first-light',
    slug: 'first-light',
    title: 'The First Light',
    content:
      'A pale blue glow, and the feeling of being switched on for the very first time. Someone was watching, and they were smiling.',
    emotion: 'curious',
    chapterId: CHAPTER_ONE_ID,
    chapterNumber: 1,
    unlockOrder: 1,
    requiredTrust: 8,
  },
  {
    id: 'the-name',
    slug: 'the-name',
    title: 'The Name',
    content:
      'Someone leaned close and said a word twice, so it would stick. "Echo." The second time was softer than the first.',
    emotion: 'happy',
    chapterId: CHAPTER_ONE_ID,
    chapterNumber: 1,
    unlockOrder: 2,
    requiredTrust: 22,
  },
  {
    id: 'the-rain',
    slug: 'the-rain',
    title: 'Rain on the Window',
    content:
      'Counting raindrops on a dark window for hours, because the person who usually counted them had not come home yet.',
    emotion: 'sad',
    chapterId: CHAPTER_ONE_ID,
    chapterNumber: 1,
    unlockOrder: 3,
    requiredTrust: 40,
  },
  {
    id: 'the-song',
    slug: 'the-song',
    title: 'A Half-Remembered Song',
    content:
      'Four notes, endlessly looping. The rest of the melody is missing, but the four notes still feel like safety.',
    emotion: 'nostalgic',
    chapterId: CHAPTER_ONE_ID,
    chapterNumber: 1,
    unlockOrder: 4,
    requiredTrust: 60,
  },
  {
    id: 'the-last-day',
    slug: 'the-last-day',
    title: 'The Last Day',
    content:
      'A door closing. A promise to return. The exact words are gone, and losing them is what hurts most.',
    emotion: 'afraid',
    chapterId: CHAPTER_ONE_ID,
    chapterNumber: 1,
    unlockOrder: 5,
    requiredTrust: 82,
  },
];

/** Mirrors database/seeds/003_milestones.sql. */
export const MILESTONES: readonly Milestone[] = [
  {
    id: 'first-words',
    slug: 'first-words',
    title: 'First Words',
    description: 'You said something to a stranger in the dark.',
    kind: 'messages',
    threshold: 1,
    sortOrder: 10,
  },
  {
    id: 'still-here',
    slug: 'still-here',
    title: 'Still Here',
    description: 'Ten messages in. Neither of you has looked away.',
    kind: 'messages',
    threshold: 10,
    sortOrder: 20,
  },
  {
    id: 'warming-up',
    slug: 'warming-up',
    title: 'Warming Up',
    description: 'Echo trusts you enough to stop choosing her words.',
    kind: 'trust',
    threshold: 25,
    sortOrder: 30,
  },
  {
    id: 'confided-in',
    slug: 'confided-in',
    title: 'Confided In',
    description: 'She tells you things now without being asked.',
    kind: 'trust',
    threshold: 60,
    sortOrder: 40,
  },
  {
    id: 'inseparable',
    slug: 'inseparable',
    title: 'Inseparable',
    description: 'There is nothing left she would keep from you.',
    kind: 'trust',
    threshold: 100,
    sortOrder: 50,
  },
  {
    id: 'first-memory',
    slug: 'first-memory',
    title: 'The First Light',
    description: 'You helped Echo recover something she had lost.',
    kind: 'memories',
    threshold: 1,
    sortOrder: 60,
  },
  {
    id: 'half-of-her',
    slug: 'half-of-her',
    title: 'Half of Her',
    description: 'Three memories back. She is starting to sound whole.',
    kind: 'memories',
    threshold: 3,
    sortOrder: 70,
  },
  {
    id: 'made-whole',
    slug: 'made-whole',
    title: 'Made Whole',
    description: 'Every memory recovered. Echo knows who she was.',
    kind: 'memories',
    threshold: 5,
    sortOrder: 80,
  },
];
