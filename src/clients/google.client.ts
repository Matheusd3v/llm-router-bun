// src/clients/google.client.ts
// Uses Google's OpenAI-compatible endpoint so the response shape is identical
// to OpenRouter: no adapter needed.
import type {
    ModelProfile,
    OpenRouterApiResponse,
    PrivacySensitivity,
} from '../types';
import type { CompletionResult } from './open-router.client';
import type { ILlmClient } from './llm-client.interface';
import { OPENROUTER_TIMEOUT_MS } from '../constants';
import { filterCandidates } from './model-filter';

const GOOGLE_BASE_URL =
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export class GoogleClient implements ILlmClient {
    private readonly models: ModelProfile[] = [
        {
            id: 'gemini-2.5-flash-lite-preview-06-17',
            displayName: 'Gemini 2.5 Flash Lite',
            tier: 'general',
            costPer1MInput: 0.07,
            costPer1MOutput: 0.3,
            contextWindow: 1_000_000,
            strengths: ['simple', 'data_analysis'],
            supportsSensitive: true,
            latencyTier: 'fast',
            qualityScore: {
                simple: 7,
                code: 6,
                reasoning: 5,
                data_analysis: 8,
                creative: 6,
            },
        },
        {
            id: 'gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            tier: 'medium',
            costPer1MInput: 0.1,
            costPer1MOutput: 0.4,
            contextWindow: 1_000_000,
            strengths: ['simple', 'data_analysis', 'code'],
            supportsSensitive: true,
            latencyTier: 'fast',
            qualityScore: {
                simple: 8,
                code: 7,
                reasoning: 7,
                data_analysis: 9,
                creative: 7,
            },
        },
        {
            id: 'gemini-2.5-pro',
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

        const res = await fetch(GOOGLE_BASE_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${Bun.env.GOOGLE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: abort.signal,
        }).finally(() => clearTimeout(timer));

        if (!res.ok) throw new Error(`Google HTTP ${res.status}`);

        const data = (await res.json()) as OpenRouterApiResponse;
        return { data, latencyMs: Math.round(performance.now() - start) };
    }
}
