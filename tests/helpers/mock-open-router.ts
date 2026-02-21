// tests/helpers/mock-open-router.ts
// Manual stubs for ILlmClient — no real fetch, configurable model list.

import type { CompletionResult } from '../../src/clients/open-router.client';
import type { ILlmClient } from '../../src/clients/llm-client.interface';
import type { ModelProfile } from '../../src/types';

/**
 * Creates a stub that always resolves with the provided result.
 * Pass the models the client should report via getAll/getCandidates.
 */
export function makeOpenRouter(
    result: CompletionResult,
    ...models: ModelProfile[]
): ILlmClient {
    return {
        complete: async (_prompt: string, _modelId: string) => result,
        getAll: () => models,
        getCandidates: () => models, // intentionally ignores filters — keep tests simple
    };
}

/**
 * Creates a stub where each call consumes the next result from the queue.
 * Useful for simulating: 1st attempt fails, 2nd succeeds.
 */
export function makeSequentialOpenRouter(
    responses: Array<CompletionResult | Error>,
    ...models: ModelProfile[]
): ILlmClient {
    let index = 0;
    return {
        complete: async (
            _prompt: string,
            _modelId: string,
        ): Promise<CompletionResult> => {
            const response =
                responses[index++] ?? responses[responses.length - 1]!;
            if (response instanceof Error) throw response;
            return response;
        },
        getAll: () => models,
        getCandidates: () => models,
    };
}
