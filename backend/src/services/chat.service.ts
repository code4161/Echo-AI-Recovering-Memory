import { gameConfig } from '../config/game.js';
import { memoryModel } from '../models/memory.model.js';
import { messageModel } from '../models/message.model.js';
import { progressModel } from '../models/progress.model.js';
import type {
  EchoPersonality,
  GameProgress,
  MemoryFragment,
  Message,
  PlayerMilestone,
} from '../types/domain.js';
import { unprocessable } from '../utils/errors.js';
import { clamp } from '../utils/numbers.js';
import { echoProvider } from './echo/index.js';
import { gameStateService, type PersonalityChange } from './gameState.service.js';
import { sessionService } from './session.service.js';

export interface ExchangeResult {
  playerMessage: Message;
  echoMessage: Message;
  echo: EchoPersonality;
  personality: PersonalityChange;
  restoredFragment: MemoryFragment | null;
  progress: GameProgress;
  /** Only the awards earned by this exchange, so the client can celebrate them. */
  milestones: PlayerMilestone[];
  /** How long the transport should show a typing indicator before delivering. */
  thinkingMs: number;
}

export interface ExchangeInput {
  sessionId: string;
  playerId: string;
  conversationId: string;
  playerName: string;
  content: string;
}

function thinkingTimeFor(content: string): number {
  const { minThinkingMs, maxThinkingMs, msPerCharacter } = gameConfig.pacing;
  return clamp(minThinkingMs + content.length * msPerCharacter, minThinkingMs, maxThinkingMs);
}

/**
 * The core game loop, deliberately transport-agnostic: the socket handler and
 * the REST controller both call `exchange` and differ only in how they deliver
 * the result.
 */
export const chatService = {
  async exchange(input: ExchangeInput): Promise<ExchangeResult> {
    const content = input.content.trim();

    if (!content) throw unprocessable('Message cannot be empty');
    if (content.length > gameConfig.chat.maxMessageLength) {
      throw unprocessable(
        `Message must be at most ${gameConfig.chat.maxMessageLength} characters`
      );
    }

    const state = await gameStateService.load({
      sessionId: input.sessionId,
      playerId: input.playerId,
      conversationId: input.conversationId,
    });

    // Captured before the new message is recorded: the provider's contract is
    // that `history` excludes the line it is answering.
    const history = [...state.history];

    const playerMessage = await gameStateService.recordMessage(state, {
      sender: 'player',
      content,
    });

    const reply = await echoProvider().respond({
      playerMessage: content,
      history,
      state: state.echo,
      playerName: input.playerName,
    });

    const personality = await gameStateService.applyExchange(state, {
      requestedTrust: reply.trustDelta,
      mood: reply.emotion,
      messageId: playerMessage.id,
      reason: 'chat_exchange',
    });

    const echoMessage = await gameStateService.recordMessage(state, {
      sender: 'echo',
      content: reply.content,
      emotion: reply.emotion,
      trustDelta: personality.trust.applied,
    });

    const restoredFragment = await gameStateService.tryRestoreMemory(state, playerMessage.id);

    // Recomputing the chapter only matters when a memory just moved the player
    // through the story.
    const currentChapter = restoredFragment
      ? await memoryModel.currentChapterFor(input.playerId)
      : undefined;

    const progress = await progressModel.apply(input.playerId, {
      messagesSent: 1,
      memoriesRestored: restoredFragment ? 1 : 0,
      trustLevel: personality.trust.after,
      ...(currentChapter === undefined ? {} : { currentChapter }),
    });

    const milestones = await progressModel.awardMilestones(input.playerId, {
      trust: progress.highestTrust,
      memories: progress.memoriesRestored,
      messages: progress.messagesSent,
      chapter: progress.currentChapter,
    });

    await sessionService.touch(input.sessionId);

    return {
      playerMessage,
      echoMessage,
      echo: state.echo,
      personality,
      restoredFragment,
      progress,
      milestones,
      thinkingMs: thinkingTimeFor(reply.content),
    };
  },

  /** Echo's opening line. Recorded like any other message so history is complete. */
  async openConversation(input: {
    sessionId: string;
    playerId: string;
    conversationId: string;
    playerName: string;
    returning: boolean;
  }): Promise<Message> {
    const state = await gameStateService.load({
      sessionId: input.sessionId,
      playerId: input.playerId,
      conversationId: input.conversationId,
    });

    const reply = await echoProvider().greet({
      playerName: input.playerName,
      returning: input.returning,
    });

    return gameStateService.recordMessage(state, {
      sender: 'echo',
      content: reply.content,
      emotion: reply.emotion,
    });
  },

  async history(conversationId: string): Promise<Message[]> {
    return messageModel.listRecent(conversationId, gameConfig.chat.historyWindow);
  },
};
