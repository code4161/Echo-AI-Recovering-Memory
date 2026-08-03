import type { Request, Response } from 'express';
import { gameConfig } from '../config/game.js';
import { sessionContext } from '../middleware/requireSession.js';
import { chatService } from '../services/chat.service.js';
import { requireBodyString } from '../utils/http.js';

/**
 * REST access to the conversation.
 *
 * The live game uses the socket handler; these endpoints exist for loading
 * history, for tooling and tests, and as a fallback for clients that cannot
 * hold a websocket open.
 */
export const chatController = {
  async history(req: Request, res: Response): Promise<void> {
    const { conversation } = sessionContext(req);
    res.json({ messages: await chatService.history(conversation.id) });
  },

  /** Same exchange the socket path runs, answered in one response. */
  async send(req: Request, res: Response): Promise<void> {
    const { session, player, conversation } = sessionContext(req);
    const content = requireBodyString(req, 'content', {
      max: gameConfig.chat.maxMessageLength,
    });

    const result = await chatService.exchange({
      sessionId: session.id,
      playerId: player.id,
      conversationId: conversation.id,
      playerName: player.displayName,
      content,
    });

    res.status(201).json({
      playerMessage: result.playerMessage,
      echoMessage: result.echoMessage,
      echo: result.echo,
      restoredFragment: result.restoredFragment,
      progress: result.progress,
      milestones: result.milestones,
    });
  },
};
