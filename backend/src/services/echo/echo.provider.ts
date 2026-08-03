import type { EchoPersonality, Emotion, Message } from '../../types/domain.js';

export interface EchoReply {
  content: string;
  emotion: Emotion;
  /** How much this exchange should move trust, before clamping. */
  trustDelta: number;
}

export interface EchoPromptContext {
  playerMessage: string;
  /**
   * The transcript *before* this turn. It must not already contain
   * `playerMessage`, or Echo reads the line as the player repeating themselves.
   */
  history: readonly Message[];
  /** Trust, mood and traits. A model provider would condition its prompt on these. */
  state: EchoPersonality;
  playerName: string;
}

export interface EchoGreetContext {
  playerName: string;
  /** True when the player is resuming an existing conversation. */
  returning: boolean;
}

/**
 * The boundary between the game and whatever generates Echo's dialogue.
 *
 * Everything above this interface is provider-agnostic, so replacing the rules
 * engine with a language model means adding one file and one switch case, not
 * touching the game logic.
 */
export interface EchoProvider {
  readonly name: string;
  greet(context: EchoGreetContext): Promise<EchoReply>;
  respond(context: EchoPromptContext): Promise<EchoReply>;
}
