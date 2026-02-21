// src/clients/anthropic.client.ts
// Anthropic uses a different response schema; we normalise it to the shared
// OpenRouterApiResponse shape so the rest of the pipeline is unaffected.
import type {
    ModelProfile,
    OpenRouterApiResponse,
    PrivacySensitivity,
} from '../types';
import type { CompletionResult } from './open-router.client';
import type { ILlmClient } from './llm-client.interface';
import { OPENROUTER_TIMEOUT_MS } from '../constants';
import { filterCandidates } from './model-filter';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 8_096;

interface AnthropicResponse {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
}

export class AnthropicClient implements ILlmClient {
    private readonly models: ModelProfile[] = [
        {
            id: 'claude-haiku-4-5',
            displayName: 'Claude Haiku 4.5',
            tier: 'general',
            costPer1MInput: 0.8,
            costPer1MOutput: 4.0,
            contextWindow: 200_000,
            strengths: ['simple', 'code'],
            supportsSensitive: true,
            latencyTier: 'fast',
            qualityScore: {
                simple: 7,
                code: 8,
                reasoning: 7,
                data_analysis: 7,
                creative: 7,
            },
        },
        {
            id: 'claude-sonnet-4-5',
            displayName: 'Claude Sonnet 4.5',
            tier: 'hard',
            costPer1MInput: 3.0,
            costPer1MOutput: 15.0,
            contextWindow: 200_000,
            strengths: ['reasoning', 'code', 'creative'],
            supportsSensitive: true,
            latencyTier: 'medium',
            qualityScore: {
                simple: 8,
                code: 9,
                reasoning: 10,
                data_analysis: 8,
                creative: 10,
            },
        },
    ];

    getAll(): ModelProfile[] {
        return this.models;
    }

    getCandidates(
        sensitivity: PrivacySensitivity,
        minContextWindow: number,
        maxCostPer1M?: number,
    ): ModelProfile[] {
        return filterCandidates(
            this.models,
            sensitivity,
            minContextWindow,
            maxCostPer1M,
        );
    }

    async complete(prompt: string, modelId: string): Promise<CompletionResult> {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), OPENROUTER_TIMEOUT_MS);
        const start = performance.now();

        const res = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: {
                'x-api-key': Bun.env.ANTHROPIC_API_KEY ?? '',
                'anthropic-version': ANTHROPIC_VERSION,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                max_tokens: DEFAULT_MAX_TOKENS,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: abort.signal,
        }).finally(() => clearTimeout(timer));

        if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);

        const raw = (await res.json()) as AnthropicResponse;

        // Normalise to OpenRouterApiResponse so downstream code needs no changes
        const data: OpenRouterApiResponse = {
            choices: [{ message: { content: raw.content[0]?.text ?? null } }],
            usage: {
                prompt_tokens: raw.usage.input_tokens,
                completion_tokens: raw.usage.output_tokens,
            },
        };

        return { data, latencyMs: Math.round(performance.now() - start) };
    }
}
