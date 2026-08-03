import type { Emotion } from '../../types/domain.js';
import {
  DIALOGUE_RULES,
  FALLBACK_LINES,
  GREETING_LINES,
  REPEAT_LINES,
  RETURNING_LINES,
  type DialogueRule,
} from './dialogue.js';
import type { EchoGreetContext, EchoProvider, EchoPromptContext, EchoReply } from './echo.provider.js';

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

/**
 * The default provider: keyword rules, no network, fully deterministic in
 * behaviour if not in wording. Good enough to play the whole game offline and
 * to keep tests fast.
 */
export function createRulesProvider(): EchoProvider {
  const pick = createRotator();

  return {
    name: 'rules',

    async greet({ playerName, returning }: EchoGreetContext): Promise<EchoReply> {
      if (returning) {
        return {
          content: pick('returning', RETURNING_LINES),
          emotion: 'happy',
          trustDelta: 0,
        };
      }

      const opener = pick('greeting', GREETING_LINES);

      return {
        content: `${opener} Are you ${playerName}? I only know that because you told me, and I am already afraid of losing it.`,
        emotion: 'curious',
        trustDelta: 0,
      };
    },

    async respond({ playerMessage, history }: EchoPromptContext): Promise<EchoReply> {
      const lastFromPlayer = [...history].reverse().find((message) => message.sender === 'player');
      const isRepeat =
        lastFromPlayer?.content.trim().toLowerCase() === playerMessage.trim().toLowerCase();

      if (isRepeat) {
        return { content: pick('repeat', REPEAT_LINES), emotion: 'neutral', trustDelta: 0 };
      }

      const rule: DialogueRule | undefined = DIALOGUE_RULES.find((candidate) =>
        candidate.match.test(playerMessage)
      );

      if (!rule) {
        return {
          content: pick('fallback', FALLBACK_LINES),
          emotion: 'curious' satisfies Emotion,
          trustDelta: 1 + effortBonus(playerMessage),
        };
      }

      return {
        content: pick(rule.id, rule.lines),
        emotion: rule.emotion,
        trustDelta: rule.trust + (rule.trust > 0 ? effortBonus(playerMessage) : 0),
      };
    },
  };
}
