import type { Emotion } from '@/types/domain';
import {
  DIALOGUE_RULES,
  FALLBACK_LINES,
  GREETING_LINES,
  REPEAT_LINES,
  type DialogueRule,
} from './dialogue';
import type { EchoClient, EchoReply, EchoTurn } from './types';

/** Rotates through a pool so Echo does not repeat herself back to back. */
function createRotator() {
  const cursors = new Map<string, number>();

  return (key: string, pool: readonly string[]): string => {
    const index = cursors.get(key) ?? Math.floor(Math.random() * pool.length);
    cursors.set(key, (index + 1) % pool.length);
    return pool[index % pool.length]!;
  };
}

/** Longer, more considered messages earn a little extra, up to a cap. */
function effortBonus(message: string): number {
  const words = message.trim().split(/\s+/).length;
  if (words >= 14) return 2;
  if (words >= 6) return 1;
  return 0;
}

function thinkingTimeFor(content: string): number {
  return Math.min(2200, 550 + content.length * 11);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Echo's brain, running entirely in the browser.
 *
 * This is a stand-in for the server: it matches keywords, picks a mood and
 * adjusts trust. Swapping it for a real backend means writing another
 * `EchoClient` — no component or hook needs to change.
 */
export function createLocalEchoClient(): EchoClient {
  const pick = createRotator();

  return {
    async greet(playerName: string): Promise<EchoReply> {
      const opener = pick('greeting', GREETING_LINES);
      const content = playerName
        ? `${opener} Are you ${playerName}? I only know that because you told me, and I am already afraid of losing it.`
        : opener;

      await wait(700);

      return { content, emotion: 'curious', trustDelta: 0, thinkingMs: 0 };
    },

    async respond({ playerMessage, history }: EchoTurn): Promise<EchoReply> {
      const lastFromPlayer = [...history].reverse().find((message) => message.sender === 'player');
      const isRepeat =
        lastFromPlayer?.content.trim().toLowerCase() === playerMessage.trim().toLowerCase();

      let content: string;
      let emotion: Emotion;
      let trustDelta: number;

      if (isRepeat) {
        content = pick('repeat', REPEAT_LINES);
        emotion = 'neutral';
        trustDelta = 0;
      } else {
        const rule: DialogueRule | undefined = DIALOGUE_RULES.find((candidate) =>
          candidate.match.test(playerMessage)
        );

        if (rule) {
          content = pick(rule.id, rule.lines);
          emotion = rule.emotion;
          trustDelta = rule.trust + (rule.trust > 0 ? effortBonus(playerMessage) : 0);
        } else {
          content = pick('fallback', FALLBACK_LINES);
          emotion = 'curious';
          trustDelta = 1 + effortBonus(playerMessage);
        }
      }

      const thinkingMs = thinkingTimeFor(content);
      await wait(thinkingMs);

      return { content, emotion, trustDelta, thinkingMs };
    },
  };
}
