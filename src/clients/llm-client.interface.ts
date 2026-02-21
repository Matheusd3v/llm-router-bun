// src/clients/llm-client.interface.ts
import type { CompletionResult } from './open-router.client';
import type { ModelProfile, PrivacySensitivity } from '../types';

/** Unified contract every LLM provider client must satisfy. */
export interface ILlmClient {
    /** Executes a completion request against a specific model. */
    complete(prompt: string, modelId: string): Promise<CompletionResult>;
    /** Returns all models registered on this client. */
    getAll(): ModelProfile[];
    /** Returns models filtered by routing criteria. */
    getCandidates(
        sensitivity: PrivacySensitivity,
        minContextWindow: number,
        maxCostPer1M?: number,
    ): ModelProfile[];
}
