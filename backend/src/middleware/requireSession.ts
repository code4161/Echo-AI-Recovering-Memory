import type { NextFunction, Request, Response } from 'express';
import { sessionService } from '../services/session.service.js';
import type { Conversation, Player, Session } from '../types/domain.js';
import { unauthorized } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireSession. Present on every protected route. */
      session?: Session;
      player?: Player;
      conversation?: Conversation;
    }
  }
}

/**
 * Guards routes that act on behalf of a player.
 *
 * The session id arrives as `Authorization: Session <id>` or `x-session-id`.
 * It is a bearer credential, not authentication: anyone holding it can use the
 * session. What this does guarantee is that the session exists, is still open
 * and has not gone idle, so no controller has to check any of that.
 */
export async function requireSession(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.get('authorization');
    const bearer = header?.startsWith('Session ') ? header.slice('Session '.length) : null;
    const sessionId = bearer ?? req.get('x-session-id') ?? null;

    if (!sessionId) {
      throw unauthorized('A session id is required');
    }

    const { session, player, conversation } = await sessionService.authorize(sessionId);

    req.session = session;
    req.player = player;
    req.conversation = conversation;

    next();
  } catch (error) {
    next(error);
  }
}

/** Narrows the optional request fields for controllers behind the guard. */
export function sessionContext(req: Request): {
  session: Session;
  player: Player;
  conversation: Conversation;
} {
  if (!req.session || !req.player || !req.conversation) {
    throw unauthorized('A session id is required');
  }
  return { session: req.session, player: req.player, conversation: req.conversation };
}
