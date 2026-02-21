// src/clients/llm-client.factory.ts
import type { ILlmClient } from './llm-client.interface';
import { OpenRouterClient } from './open-router.client';
import { GoogleClient } from './google.client';
import { AnthropicClient } from './anthropic.client';
import { OpenAIClient } from './openai.client';
import { DeepSeekClient } from './deepseek.client';
import type { LlmProvider } from '../types';

/**
 * Returns the correct HTTP client for the given provider.
 * Falls back to OpenRouter when no provider is specified or the value is
 * unrecognised — so existing deployments that don't set LLM_PROVIDER keep
 * working with zero changes.
 */
export function createLlmClient(
    provider: LlmProvider = 'openrouter',
): ILlmClient {
    switch (provider) {
        case 'google':
            return new GoogleClient();
        case 'anthropic':
            return new AnthropicClient();
        case 'openai':
            return new OpenAIClient();
        case 'deepseek':
            return new DeepSeekClient();
        case 'openrouter':
        default:
            return new OpenRouterClient();
    }
}
