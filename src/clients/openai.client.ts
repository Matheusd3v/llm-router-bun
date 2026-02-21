// src/clients/openai.client.ts
// Uses OpenAI's native chat completions endpoint.
// The response schema matches the shared OpenRouterApiResponse shape,
// so no adapter is needed.
import type {
    ModelProfile,
    OpenRouterApiResponse,
    PrivacySensitivity,
} from '../types';
import type { CompletionResult } from './open-router.client';
import type { ILlmClient } from './llm-client.interface';
import { OPENROUTER_TIMEOUT_MS } from '../constants';
import { filterCandidates } from './model-filter';

const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIClient implements ILlmClient {
    private readonly models: ModelProfile[] = [
        {
            id: 'gpt-4o-mini',
            displayName: 'GPT-4o Mini',
            tier: 'general',
            costPer1MInput: 0.15,
            costPer1MOutput: 0.6,
            contextWindow: 128_000,
            strengths: ['simple', 'code'],
            supportsSensitive: true,
            latencyTier: 'fast',
            qualityScore: {
                simple: 8,
                code: 7,
                reasoning: 6,
                data_analysis: 7,
                creative: 7,
            },
        },
        {
            id: 'gpt-4o',
            displayName: 'GPT-4o',
            tier: 'medium',
            costPer1MInput: 2.5,
            costPer1MOutput: 10.0,
            contextWindow: 128_000,
            strengths: ['code', 'reasoning', 'creative'],
            supportsSensitive: true,
            latencyTier: 'medium',
            qualityScore: {
                simple: 9,
                code: 9,
                reasoning: 9,
                data_analysis: 9,
                creative: 9,
            },
        },
        {
            id: 'o4-mini',
            displayName: 'o4-mini',
            tier: 'hard',
            costPer1MInput: 3.0,
            costPer1MOutput: 12.0,
            contextWindow: 128_000,
            strengths: ['reasoning', 'code'],
            supportsSensitive: true,
            latencyTier: 'slow',
            qualityScore: {
                simple: 7,
                code: 10,
                reasoning: 10,
                data_analysis: 9,
                creative: 7,
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

        const res = await fetch(OPENAI_BASE_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${Bun.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: abort.signal,
        }).finally(() => clearTimeout(timer));

        if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);

        const data = (await res.json()) as OpenRouterApiResponse;
        return { data, latencyMs: Math.round(performance.now() - start) };
    }
}
