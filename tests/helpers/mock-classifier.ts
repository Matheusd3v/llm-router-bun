// tests/helpers/mock-classifier.ts
// Manual stub for SemanticClassifierService — no Qdrant, Redis, or ONNX.

import type { ClassificationResult } from '../../src/types';
import type { SemanticClassifierService } from '../../src/services/semantic-classifier.service';

/**
 * Returns a stub of SemanticClassifierService that always resolves
 * with the provided result. Can be replaced with a spy to verify calls.
 */
export function makeClassifier(
    result: ClassificationResult,
): SemanticClassifierService {
    return {
        classify: async (_prompt: string) => result,
    } as unknown as SemanticClassifierService;
}

/**
 * Returns a stub that always rejects with the given error.
 * Useful for testing circuit breaker and fallback behaviour.
 */
export function makeFailingClassifier(error: Error): SemanticClassifierService {
    return {
        classify: async (_prompt: string) => {
            throw error;
        },
    } as unknown as SemanticClassifierService;
}
