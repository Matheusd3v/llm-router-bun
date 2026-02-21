// src/clients/open-router.client.ts
import type {
    ModelProfile,
    OpenRouterApiResponse,
    PrivacySensitivity,
} from '../types';
import { OPENROUTER_TIMEOUT_MS, OPENROUTER_URL } from '../constants';
import type { ILlmClient } from './llm-client.interface';
import { filterCandidates } from './model-filter';

export interface CompletionResult {
    data: OpenRouterApiResponse;
    latencyMs: number;
}

/**
 * HTTP client for OpenRouter.
 * Owns the catalogue of models accessible through OpenRouter.
 * Isolated from the routing service to allow mocking in tests and
 * future provider swaps without changing business logic.
 */
export class OpenRouterClient implements ILlmClient {
    private readonly models: ModelProfile[] = [
        {
            id: 'google/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            tier: 'general',
            costPer1MInput: 0.1,
            costPer1MOutput: 0.4,
            contextWindow: 1_000_000,
            strengths: ['simple', 'data_analysis'],
            supportsSensitive: true,
            latencyTier: 'fast',
            qualityScore: {
                simple: 8,
                code: 6,
                reasoning: 6,
                data_analysis: 9,
                creative: 7,
            },
        },
        {
            id: 'x-ai/grok-4.1-fast',
            displayName: 'Grok 4.1 Fast',
            tier: 'medium',
            costPer1MInput: 0.2,
            costPer1MOutput: 0.5,
            contextWindow: 131_072,
            strengths: ['code', 'simple'],
            supportsSensitive: true,
            latencyTier: 'fast',
            qualityScore: {
                simple: 8,
                code: 9,
                reasoning: 7,
                data_analysis: 7,
                creative: 7,
            },
        },
        {
            id: 'anthropic/claude-sonnet-4-5',
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
        {
            id: 'anthropic/claude-haiku-4-5',
            displayName: 'Claude Haiku 4.5',
            tier: 'general',
            costPer1MInput: 0.8,
            costPer1MOutput: 4.0,
            contextWindow: 200_000,
            strengths: ['code', 'simple'],
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
            id: 'deepseek/deepseek-chat-v3',
            displayName: 'DeepSeek V3',
            tier: 'general',
            costPer1MInput: 0.028,
            costPer1MOutput: 0.42,
            contextWindow: 128_000,
            strengths: ['code', 'simple'],
            supportsSensitive: false, // ⚠️ never route sensitive or internal data
            latencyTier: 'medium',
            qualityScore: {
                simple: 8,
                code: 8,
                reasoning: 7,
                data_analysis: 7,
                creative: 6,
            },
        },
        {
            id: 'google/gemini-2.5-pro',
            displayName: 'Gemini 2.5 Pro',
            tier: 'hard',
            costPer1MInput: 1.25,
            costPer1MOutput: 10.0,
            contextWindow: 1_000_000,
            strengths: ['reasoning', 'data_analysis'],
            supportsSensitive: true,
            latencyTier: 'slow',
            qualityScore: {
                simple: 8,
                code: 8,
                reasoning: 9,
                data_analysis: 10,
                creative: 8,
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

        const res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${Bun.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: abort.signal,
        }).finally(() => clearTimeout(timer));

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = (await res.json()) as OpenRouterApiResponse;
        return { data, latencyMs: Math.round(performance.now() - start) };
    }
}
