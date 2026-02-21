// src/clients/deepseek.client.ts
// DeepSeek exposes an OpenAI-compatible endpoint, so the response shape is
// identical — no adapter needed.
// ⚠️  DeepSeek servers are located outside the EU/US. Never route prompts
//     marked as `internal` or `sensitive` to this client.
import type {
    ModelProfile,
    OpenRouterApiResponse,
    PrivacySensitivity,
} from '../types';
import type { CompletionResult } from './open-router.client';
import type { ILlmClient } from './llm-client.interface';
import { OPENROUTER_TIMEOUT_MS } from '../constants';
import { filterCandidates } from './model-filter';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1/chat/completions';

export class DeepSeekClient implements ILlmClient {
    private readonly models: ModelProfile[] = [
        {
            id: 'deepseek-chat',
            displayName: 'DeepSeek V3',
            tier: 'general',
            costPer1MInput: 0.07,
            costPer1MOutput: 0.27,
            contextWindow: 128_000,
            strengths: ['code', 'simple'],
            supportsSensitive: false, // ⚠️ never route sensitive or internal data
            latencyTier: 'medium',
            qualityScore: {
                simple: 8,
                code: 9,
                reasoning: 7,
                data_analysis: 7,
                creative: 6,
            },
        },
        {
            id: 'deepseek-reasoner',
            displayName: 'DeepSeek R1',
            tier: 'hard',
            costPer1MInput: 0.55,
            costPer1MOutput: 2.19,
            contextWindow: 128_000,
            strengths: ['reasoning', 'code'],
            supportsSensitive: false, // ⚠️ never route sensitive or internal data
            latencyTier: 'slow',
            qualityScore: {
                simple: 7,
                code: 9,
                reasoning: 10,
                data_analysis: 8,
                creative: 6,
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

        const res = await fetch(DEEPSEEK_BASE_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${Bun.env.DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: abort.signal,
        }).finally(() => clearTimeout(timer));

        if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);

        const data = (await res.json()) as OpenRouterApiResponse;
        return { data, latencyMs: Math.round(performance.now() - start) };
    }
}
