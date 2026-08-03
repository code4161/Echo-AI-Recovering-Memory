import type { EchoPersonality, Emotion, Message } from '@/types/domain';

export interface EchoReply {
  content: string;
  emotion: Emotion;
  /** How much this exchange moved trust, roughly -8..+8. */
  trustDelta: number;
  /** How long to show the typing indicator before the line lands. */
  thinkingMs: number;
}

export interface EchoTurn {
  playerMessage: string;
  /**
   * The transcript *before* this turn. It must not already contain
   * `playerMessage`, or Echo will read the line as the player repeating
   * themselves.
   */
  history: readonly Message[];
  state: EchoPersonality;
  playerName: string;
}

/**
 * The seam between the game and whatever produces Echo's dialogue.
 *
 * Offline play is fulfilled by `localEchoClient`, which runs entirely in the
 * browser. Online, the equivalent boundary lives on the server as
 * `EchoProvider`, and this interface is never used.
 */
export interface EchoClient {
  /** Echo's opening line when a player arrives. */
  greet(playerName: string): Promise<EchoReply>;
  respond(turn: EchoTurn): Promise<EchoReply>;
}
