import type { Request, Response } from 'express';
import { chatService } from '../services/chat.service.js';
import { sessionService } from '../services/session.service.js';
import { requireBodyString, requireParam } from '../utils/http.js';

/**
 * Controllers do three things only: read the request, call one service, shape
 * the response. Game rules live in services, SQL lives in models.
 */
export const playerController = {
  /**
   * Creates a player, opens a session and has Echo say hello.
   * The returned `session.id` is what the client sends on every later request
   * and in the socket handshake.
   */
  async register(req: Request, res: Response): Promise<void> {
    const displayName = requireBodyString(req, 'displayName', { max: 40 });
    const { player, session, conversation } = await sessionService.register(displayName);

    await chatService.openConversation({
      sessionId: session.id,
      playerId: player.id,
      conversationId: conversation.id,
      playerName: player.displayName,
      returning: false,
    });

    res.status(201).json(await sessionService.snapshot(session.id));
  },

  /** Starts or resumes a session for a player who already exists. */
  async startSession(req: Request, res: Response): Promise<void> {
    const playerId = requireParam(req, 'playerId');
    const { player, session, conversation, resumed } = await sessionService.start(playerId);

    // A new visit gets a "welcome back", but the thread it lands in is the same
    // one they left, so Echo is greeting someone she still remembers.
    if (!resumed) {
      await chatService.openConversation({
        sessionId: session.id,
        playerId: player.id,
        conversationId: conversation.id,
        playerName: player.displayName,
        returning: true,
      });
    }

    res.json(await sessionService.snapshot(session.id));
  },
};
