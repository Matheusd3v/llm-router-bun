export type TaskCategory =
    | 'simple'
    | 'code'
    | 'reasoning'
    | 'data_analysis'
    | 'creative';
export type RoutingStrategy = 'cost_first' | 'quality_first' | 'balanced';
export type PrivacySensitivity = 'public' | 'internal' | 'sensitive';
export type LlmProvider =
    | 'openrouter'
    | 'google'
    | 'anthropic'
    | 'openai'
    | 'deepseek';
/** Complexity hint used to rank models within the same provider */
export type ModelTier = 'general' | 'medium' | 'hard';

export interface RoutingOptions {
    strategy?: RoutingStrategy; // default: 'balanced'
    forceCategory?: TaskCategory; // bypass classifier
    forceModel?: string; // bypass everything
    maxCostPer1MTokens?: number; // budget cap in USD
    sensitivity?: PrivacySensitivity; // 'sensitive' blocks DeepSeek/Kimi
    requireContextWindow?: number; // minimum context tokens
}

export interface ClassificationResult {
    category: TaskCategory;
    confidence: number; // 0-1
    scores: Record<TaskCategory, number>;
    signals: string[]; // debug: Qdrant hits
    estimatedInputTokens: number;
    source: 'cache' | 'semantic' | 'llm';
}

export interface ModelProfile {
    id: string;
    displayName: string;
    tier: ModelTier;
    costPer1MInput: number;
    costPer1MOutput: number;
    contextWindow: number;
    strengths: TaskCategory[];
    supportsSensitive: boolean;
    latencyTier: 'fast' | 'medium' | 'slow';
    qualityScore: Record<TaskCategory, number>; // 0-10
}

export interface LlmResponse {
    content: string;
    model: string;
    category: TaskCategory;
    estimatedCostUsd: number;
    latencyMs: number;
    usage: { inputTokens: number; outputTokens: number };
    fallbackUsed: boolean;
}

/** OpenRouter API response schema */
export interface OpenRouterApiResponse {
    choices: Array<{ message: { content: string | null } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
}
