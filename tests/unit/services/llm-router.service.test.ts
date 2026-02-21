// tests/unit/services/llm-router.service.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { LlmRouterService } from '../../../src/services/llm-router.service';
import { InMemoryAuditLogRepository } from '../../../src/repositories/audit-log.repository';
import { makeClassifier } from '../../helpers/mock-classifier';
import {
    makeOpenRouter,
    makeSequentialOpenRouter,
} from '../../helpers/mock-open-router';
import {
    makeModel,
    makeClassification,
    makeApiResponse,
} from '../../helpers/fixtures';
import type { CompletionResult } from '../../../src/clients/open-router.client';

const MODEL_A = makeModel({
    id: 'provider/model-a',
    costPer1MInput: 1.0,
    costPer1MOutput: 2.0,
});
const MODEL_B = makeModel({
    id: 'provider/model-b',
    costPer1MInput: 0.5,
    costPer1MOutput: 1.0,
});

const GOOD_RESPONSE: CompletionResult = {
    data: makeApiResponse('resposta', 100, 50),
    latencyMs: 200,
};

// ── Suite principal ───────────────────────────────────────────────────────

describe('LlmRouterService', () => {
    let auditLog: InMemoryAuditLogRepository;

    beforeEach(() => {
        auditLog = new InMemoryAuditLogRepository();
    });

    // ── forceModel ────────────────────────────────────────────────────────

    describe('forceModel', () => {
        it('uses the specified model and returns fallbackUsed: false', async () => {
            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            const res = await router.complete('hello', {
                forceModel: 'provider/model-a',
            });
            expect(res.model).toBe('provider/model-a');
            expect(res.fallbackUsed).toBe(false);
        });

        it('throws a clear error for an unknown model ID', async () => {
            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            await expect(
                router.complete('hello', { forceModel: 'does/not-exist' }),
            ).rejects.toThrow('[Router] Unknown model: does/not-exist');
        });
    });

    // ── forceCategory ─────────────────────────────────────────────────────

    describe('forceCategory', () => {
        it('uses the forced category without calling the classifier', async () => {
            // Classifier would never be called — if it were, it would return the wrong category
            const classifier = makeClassifier(
                makeClassification({ category: 'code' }),
            );
            const router = new LlmRouterService(
                classifier,
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            const res = await router.complete('write code', {
                forceCategory: 'reasoning',
            });
            expect(res.category).toBe('reasoning');
        });

        it('sets confidence to 1 when forceCategory is used', async () => {
            const router = new LlmRouterService(
                makeClassifier(makeClassification({ confidence: 0.3 })),
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            const res = await router.complete('test', {
                forceCategory: 'simple',
            });
            // confidence is not exposed in LlmResponse, but is recorded in the audit log
            await new Promise((r) => setTimeout(r, 20)); // wait for fire-and-forget log
            expect(auditLog.entries[0].confidence).toBe(1);
        });
    });

    // ── Low confidence escalation ────────────────────────────────────────

    describe('low confidence escalation', () => {
        it('escalates to reasoning when confidence < CONFIDENCE_MIN (0.5)', async () => {
            const router = new LlmRouterService(
                makeClassifier(
                    makeClassification({ category: 'simple', confidence: 0.3 }),
                ),
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            const res = await router.complete('ambiguous question');
            expect(res.category).toBe('reasoning');
        });

        it('does not escalate when confidence >= CONFIDENCE_MIN', async () => {
            const router = new LlmRouterService(
                makeClassifier(
                    makeClassification({ category: 'code', confidence: 0.6 }),
                ),
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            const res = await router.complete('write a function');
            expect(res.category).toBe('code');
        });
    });

    // ── Happy path ────────────────────────────────────────────────────────

    describe('happy path', () => {
        it('returns the response content', async () => {
            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                makeOpenRouter(
                    {
                        data: makeApiResponse('Hello world'),
                        latencyMs: 150,
                    },
                    MODEL_A,
                ),
                auditLog,
            );

            const res = await router.complete('hello');
            expect(res.content).toBe('Hello world');
        });

        it('fallbackUsed: false when the only available model responds', async () => {
            // Single model so it is always candidates[0]
            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            const res = await router.complete('test');
            expect(res.fallbackUsed).toBe(false);
            expect(res.model).toBe('provider/model-a');
        });

        it('returns latencyMs from the openRouter call', async () => {
            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                makeOpenRouter({ ...GOOD_RESPONSE, latencyMs: 777 }, MODEL_A),
                auditLog,
            );

            const res = await router.complete('test');
            expect(res.latencyMs).toBe(777);
        });

        it('treats a null content from the API as an empty string', async () => {
            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                makeOpenRouter(
                    {
                        data: { choices: [{ message: { content: null } }] },
                        latencyMs: 100,
                    },
                    MODEL_A,
                ),
                auditLog,
            );

            const res = await router.complete('test');
            expect(res.content).toBe('');
        });
    });

    // ── Cost calculation ─────────────────────────────────────────────────

    describe('cost calculation', () => {
        it('calculates cost using real API tokens', async () => {
            const model = makeModel({
                costPer1MInput: 2.0,
                costPer1MOutput: 6.0,
            });
            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                makeOpenRouter(
                    {
                        data: makeApiResponse('x', 500, 100),
                        latencyMs: 100,
                    },
                    model,
                ),
                auditLog,
            );

            const res = await router.complete('test');
            // (500/1_000_000) * 2.0 + (100/1_000_000) * 6.0 = 0.001 + 0.0006 = 0.0016
            expect(res.estimatedCostUsd).toBeCloseTo(0.0016, 6);
        });

        it('uses estimatedInputTokens when the API returns no usage field', async () => {
            const model = makeModel({
                costPer1MInput: 1.0,
                costPer1MOutput: 2.0,
            });
            const classifier = makeClassifier(
                makeClassification({ estimatedInputTokens: 200 }),
            );
            const router = new LlmRouterService(
                classifier,
                makeOpenRouter(
                    {
                        data: { choices: [{ message: { content: 'ok' } }] },
                        latencyMs: 100,
                    },
                    model,
                ),
                auditLog,
            );

            const res = await router.complete('test');
            // (200/1_000_000) * 1.0 + (0/1_000_000) * 2.0 = 0.0002
            expect(res.estimatedCostUsd).toBeCloseTo(0.0002, 6);
            expect(res.usage.inputTokens).toBe(200);
            expect(res.usage.outputTokens).toBe(0);
        });
    });

    // ── Audit log ─────────────────────────────────────────────────────────

    describe('audit log', () => {
        it('records one entry in the audit log after a successful response', async () => {
            const router = new LlmRouterService(
                makeClassifier(
                    makeClassification({ category: 'code', confidence: 0.9 }),
                ),
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            await router.complete('refactor this function');
            // Log is fire-and-forget; wait for microtask flush
            await new Promise((r) => setTimeout(r, 20));

            expect(auditLog.entries).toHaveLength(1);
            const entry = auditLog.entries[0];
            expect(entry.model).toBe('provider/model-a');
            expect(entry.category).toBe('code');
            expect(entry.confidence).toBe(0.9);
        });

        it('records a non-empty promptHash', async () => {
            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            await router.complete('my prompt here');
            await new Promise((r) => setTimeout(r, 20));

            expect(auditLog.entries[0].promptHash).toBeTruthy();
        });

        it('records the classification source correctly', async () => {
            const router = new LlmRouterService(
                makeClassifier(makeClassification({ source: 'cache' })),
                makeOpenRouter(GOOD_RESPONSE, MODEL_A),
                auditLog,
            );

            await router.complete('test');
            await new Promise((r) => setTimeout(r, 20));

            expect(auditLog.entries[0].source).toBe('cache');
        });
    });

    // ── Fallback chain ────────────────────────────────────────────────────

    describe('fallback chain', () => {
        it('uses the second model when the first fails', async () => {
            // The strategy may reorder models, so we track which is tried first
            // and make it fail — regardless of the strategy's defined order.
            let firstModelId: string | null = null;
            const fallbackRouter = {
                complete: async (
                    _p: string,
                    modelId: string,
                ): Promise<CompletionResult> => {
                    if (firstModelId === null) firstModelId = modelId;
                    if (modelId === firstModelId)
                        throw new Error(`${modelId} unavailable`);
                    return GOOD_RESPONSE;
                },
                getAll: () => [MODEL_A, MODEL_B],
                getCandidates: () => [MODEL_A, MODEL_B],
            } as any;

            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                fallbackRouter,
                auditLog,
            );

            const res = await router.complete('test');
            expect(res.model).not.toBe(firstModelId); // second model was used
            expect(res.fallbackUsed).toBe(true);
        });

        it('throws when all models fail', async () => {
            // 2 models × 2 attempts each = 4 failing calls
            const openRouter = makeSequentialOpenRouter(
                [
                    new Error('fail'),
                    new Error('fail'),
                    new Error('fail'),
                    new Error('fail'),
                ],
                MODEL_A,
                MODEL_B,
            );

            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                openRouter,
                auditLog,
            );

            await expect(router.complete('test')).rejects.toThrow(
                '[Router] All models failed',
            );
        });
    });

    // ── No candidates ──────────────────────────────────────────────────────

    describe('no candidates', () => {
        it('throws when the registry returns an empty list', async () => {
            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                makeOpenRouter(GOOD_RESPONSE), // no models → getCandidates returns []
                auditLog,
            );

            await expect(router.complete('test')).rejects.toThrow(
                '[Router] No models available',
            );
        });
    });

    // ── Circuit Breaker (integration) ───────────────────────────────────

    describe('circuit breaker', () => {
        it('filters a model with an OPEN circuit from candidates after N failures', async () => {
            // quality_first + model-a with max quality score guarantees
            // deterministic first-place ranking regardless of cost.
            // CIRCUIT_FAILURE_THRESHOLD = 3; RETRY_ATTEMPTS = 2 (300ms sleep each).
            // 3 complete()s where model-a fails → 3 recordFailure()s → CB OPEN.
            // Time cost: 3 × 300ms ≈ 900ms (acceptable as integration test).
            const BEST_A = makeModel({
                id: 'provider/model-a',
                qualityScore: {
                    simple: 10,
                    code: 10,
                    reasoning: 10,
                    data_analysis: 10,
                    creative: 10,
                },
                costPer1MInput: 9.9,
            });
            const CHEAP_B = makeModel({
                id: 'provider/model-b',
                qualityScore: {
                    simple: 1,
                    code: 1,
                    reasoning: 1,
                    data_analysis: 1,
                    creative: 1,
                },
                costPer1MInput: 0.1,
            });

            let callsToModelA = 0;
            const controlledRouter = {
                complete: async (
                    _prompt: string,
                    modelId: string,
                ): Promise<CompletionResult> => {
                    if (modelId === 'provider/model-a') {
                        callsToModelA++;
                        throw new Error('model-a down');
                    }
                    return GOOD_RESPONSE;
                },
                getAll: () => [BEST_A, CHEAP_B],
                getCandidates: () => [BEST_A, CHEAP_B],
            } as any;

            const router = new LlmRouterService(
                makeClassifier(makeClassification()),
                controlledRouter,
                auditLog,
            );

            // Setup: 3 calls with quality_first to open model-a's circuit.
            await router.complete('p1', { strategy: 'quality_first' });
            await router.complete('p2', { strategy: 'quality_first' });
            await router.complete('p3', { strategy: 'quality_first' });

            callsToModelA = 0;

            // Post-open call: model-a filtered by canExecute() === false.
            const res = await router.complete('p4', {
                strategy: 'quality_first',
            });

            expect(callsToModelA).toBe(0); // model-a not attempted
            expect(res.model).toBe('provider/model-b'); // fallback selected
            expect(res.fallbackUsed).toBe(false); // model-b is candidates[0] after filter
        });
    });
});
