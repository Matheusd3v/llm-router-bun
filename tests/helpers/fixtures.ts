// tests/helpers/fixtures.ts
// Reusable factories that reduce repetition and make test intent clear.

import type {
    ClassificationResult,
    ModelProfile,
    TaskCategory,
} from '../../src/types';

/** Creates a ModelProfile with sensible defaults; override per field as needed. */
export function makeModel(overrides: Partial<ModelProfile> = {}): ModelProfile {
    return {
        id: 'test/model-a',
        displayName: 'Model A',
        tier: 'general',
        costPer1MInput: 1.0,
        costPer1MOutput: 2.0,
        contextWindow: 100_000,
        strengths: ['simple'],
        supportsSensitive: true,
        latencyTier: 'fast',
        qualityScore: {
            simple: 7,
            code: 7,
            reasoning: 7,
            data_analysis: 7,
            creative: 7,
        },
        ...overrides,
    };
}

/** Creates a ClassificationResult with default values; override per field as needed. */
export function makeClassification(
    overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
    return {
        category: 'simple',
        confidence: 0.9,
        scores: {
            simple: 0.9,
            code: 0.05,
            reasoning: 0.02,
            data_analysis: 0.02,
            creative: 0.01,
        },
        signals: [],
        estimatedInputTokens: 10,
        source: 'semantic',
        ...overrides,
    };
}

/** Minimal valid OpenRouter response. */
export function makeApiResponse(
    content = 'Hello',
    inputTokens = 10,
    outputTokens = 20,
) {
    return {
        choices: [{ message: { content } }],
        usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens },
    };
}

/** Fixed set of models for testing registry filters. */
export const REGISTRY_MODELS: ModelProfile[] = [
    makeModel({
        id: 'safe/cheap-fast',
        costPer1MInput: 0.1,
        contextWindow: 200_000,
        supportsSensitive: true,
        latencyTier: 'fast',
        qualityScore: {
            simple: 6,
            code: 6,
            reasoning: 6,
            data_analysis: 6,
            creative: 6,
        },
    }),
    makeModel({
        id: 'safe/expensive-slow',
        costPer1MInput: 5.0,
        contextWindow: 500_000,
        supportsSensitive: true,
        latencyTier: 'slow',
        qualityScore: {
            simple: 10,
            code: 10,
            reasoning: 10,
            data_analysis: 10,
            creative: 10,
        },
    }),
    makeModel({
        id: 'unsafe/cheap',
        costPer1MInput: 0.03,
        contextWindow: 128_000,
        supportsSensitive: false,
        latencyTier: 'medium',
        qualityScore: {
            simple: 7,
            code: 7,
            reasoning: 7,
            data_analysis: 7,
            creative: 7,
        },
    }),
];
