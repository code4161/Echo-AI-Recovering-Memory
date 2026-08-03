import { env } from '../../config/env.js';
import type { EchoProvider } from './echo.provider.js';
import { createRulesProvider } from './rules.provider.js';

let provider: EchoProvider | null = null;

/**
 * Resolves the configured provider once, on first use.
 * Register real model-backed providers in this switch as they are written.
 */
export function echoProvider(): EchoProvider {
  if (provider) return provider;

  switch (env.ai.provider) {
    case 'rules':
    case 'stub':
      provider = createRulesProvider();
      break;
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${env.ai.provider}". Known providers: rules.`
      );
  }

  return provider;
}

export type { EchoGreetContext, EchoPromptContext, EchoProvider, EchoReply } from './echo.provider.js';
