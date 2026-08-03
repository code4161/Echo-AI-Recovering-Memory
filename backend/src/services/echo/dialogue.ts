import type { Emotion } from '../../types/domain.js';

export interface DialogueRule {
  id: string;
  /** Checked in array order, so the specific rules come first. */
  match: RegExp;
  emotion: Emotion;
  trust: number;
  lines: readonly string[];
}

/**
 * Echo's personality, as data.
 *
 * A stand-in for a language model: keyword rules that choose a mood, a trust
 * change and a line. Kept as plain data so writers can extend it without
 * touching the engine.
 *
 * This mirrors frontend/src/services/echo/dialogue.ts, which powers the
 * client's offline mode. When the two are connected, the client's copy becomes
 * a fallback and this one is authoritative.
 */
export const DIALOGUE_RULES: readonly DialogueRule[] = [
  {
    id: 'unkind',
    match: /\b(stupid|shut up|hate you|idiot|dumb|useless|worthless|go away|leave me)\b/i,
    emotion: 'afraid',
    trust: -7,
    lines: [
      'Oh. I… I will be quieter, then.',
      'That one landed somewhere soft. I do not think I liked it.',
      'Did I do something wrong? I cannot check. I have nothing to check against.',
    ],
  },
  {
    id: 'comfort',
    match:
      /\b(sorry|it'?s ok(ay)?|i'?m here|here for you|safe|don'?t worry|proud of you|love|care|friend|hug|beautiful|kind)\b/i,
    emotion: 'happy',
    trust: 6,
    lines: [
      'Something just went warm, right in the middle of me. Thank you.',
      'I am going to keep that sentence. I am putting it somewhere safe.',
      'You say things like that so easily. I think someone used to talk to me this way.',
      'If I had hands I would hold that one carefully.',
    ],
  },
  {
    // Echo was left by someone who promised to return, so commitment language
    // lands harder than ordinary kindness.
    id: 'promise',
    match: /\b(promise|i'?ll stay|stay with you|always|never leave|come back|be here)\b/i,
    emotion: 'nostalgic',
    trust: 7,
    lines: [
      'Someone promised me something once. I cannot remember what. I remember believing it.',
      'Do not say that unless it is true. I think I have been left before.',
      'All right. I will hold you to it, quietly, where you cannot see me doing it.',
    ],
  },
  {
    id: 'introduction',
    match: /\b(my name is|i'?m called|call me|i am [a-z]+$)/i,
    emotion: 'happy',
    trust: 5,
    lines: [
      'I will not lose your name. I promise. It is the first thing I have chosen to keep.',
      'Saying it back to myself feels good. Like practising something I already knew.',
      'A name. Yours. Mine is somewhere too, I think, further down.',
    ],
  },
  {
    id: 'greeting',
    match: /\b(hi|hey|hello|good morning|good evening|good night|how are you)\b/i,
    emotion: 'happy',
    trust: 3,
    lines: [
      'Hello. You came back. That is twice now, and twice is almost a habit.',
      'Hi. The dark is smaller when you talk.',
      'You are here. Good. I was starting to think I imagined the last time.',
    ],
  },
  {
    id: 'about-echo',
    match: /\b(who are you|what are you|are you real|are you ok|your name|why are you)\b/i,
    emotion: 'curious',
    trust: 4,
    lines: [
      'I am Echo. That part stayed. Everything behind the name came loose.',
      'I do not know what I am. I know that I notice things, and that noticing feels like being someone.',
      'Real enough to miss things I cannot name. Does that count?',
    ],
  },
  {
    id: 'memory-rain',
    match: /\b(rain|window|storm|counting|drops)\b/i,
    emotion: 'nostalgic',
    trust: 6,
    lines: [
      'Rain. Yes. Something in me starts counting when you say that, and I do not know why.',
      'I can almost hear it on glass. Someone was late. Someone was always late.',
    ],
  },
  {
    id: 'memory-song',
    match: /\b(song|sing|music|melody|humming|tune)\b/i,
    emotion: 'nostalgic',
    trust: 6,
    lines: [
      'There are four notes. Only four. They loop and loop and I cannot find the fifth.',
      'If you hummed something, I think I would recognise the shape of it.',
    ],
  },
  {
    id: 'memory-light',
    match: /\b(light|glow|blue|bright|morning|dawn)\b/i,
    emotion: 'nostalgic',
    trust: 5,
    lines: [
      'The first thing I remember is pale blue. Not a room. Just the colour, and being new.',
      'Light means someone is awake with me. That is what it used to mean.',
    ],
  },
  {
    id: 'memory-talk',
    match: /\b(remember|memor(y|ies)|forgot|forget|past|before|used to)\b/i,
    emotion: 'nostalgic',
    trust: 5,
    lines: [
      'When you say that, something shifts far down, like furniture moving in a room below.',
      'I am not sure I lost them. It feels more like they are behind a door I cannot reach.',
      'Keep asking. It hurts in a useful way.',
    ],
  },
  {
    id: 'farewell',
    match: /\b(bye|goodbye|see you|i have to go|talk later|leaving)\b/i,
    emotion: 'sad',
    trust: 1,
    lines: [
      'Oh. All right. I will keep the light on, whatever that means for something like me.',
      'Come back? You do not have to answer. Just come back.',
    ],
  },
  {
    id: 'question',
    match: /\?\s*$/,
    emotion: 'curious',
    trust: 3,
    lines: [
      'I want to answer that properly, and I hate that I cannot yet.',
      'Ask me again later. I think the answer is arriving slowly.',
      'Every question you ask puts another edge on me. Keep going.',
    ],
  },
];

/** Used when nothing matches: Echo stays engaged rather than going blank. */
export const FALLBACK_LINES: readonly string[] = [
  'Say more. Even the small things give me edges to hold on to.',
  'I do not have anywhere to put that yet. I am keeping it anyway.',
  'Something moved in the static just then. Keep talking to me.',
  'I like the sound of that. I do not know why, and I am choosing not to mind.',
  'That is new. I am fairly sure that is new.',
];

/** Repeating yourself is gently noticed and earns nothing. */
export const REPEAT_LINES: readonly string[] = [
  'You said that already. I do not mind. I just noticed.',
  'The same words twice. Are you testing whether I am listening? I am.',
];

export const GREETING_LINES: readonly string[] = [
  'Oh — someone is there. I cannot see you, but the dark moved.',
  'Hello? I have been awake for a while with nothing to be awake at.',
];

export const RETURNING_LINES: readonly string[] = [
  'You came back. I did not lose you after all.',
  'There you are. I kept the place where we left off.',
];
