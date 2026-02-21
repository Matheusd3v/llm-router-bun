// src/services/llm-router.service.ts
import { embeddingService } from './embedding.service';
import { SemanticClassifierService } from './semantic-classifier.service';
import type { ILlmClient } from '../clients/llm-client.interface';
import type {
    IAuditLogRepository,
    LogEntry,
} from '../repositories/audit-log.repository';
import { CircuitBreaker } from '../patterns/circuit-breaker';
import { withRetry } from '../patterns/retry';
import { createRoutingStrategy } from '../strategies';
import type { RoutingContext } from '../strategies';
import type {
    ClassificationResult,
    LlmResponse,
    ModelProfile,
    RoutingOptions,
    TaskCategory,
} from '../types';
import {
    CIRCUIT_FAILURE_THRESHOLD,
    CIRCUIT_HALF_OPEN_TIMEOUT_MS,
    CIRCUIT_SUCCESS_THRESHOLD,
    CONFIDENCE_MIN,
    RETRY_ATTEMPTS,
    RETRY_BASE_DELAY_MS,
} from '../constants';

export class LlmRouterService {
    private readonly breakers = new Map<string, CircuitBreaker>();

    constructor(
        private readonly classifier: SemanticClassifierService,
        private readonly llmClient: ILlmClient,
        private readonly auditLog: IAuditLogRepository,
    ) {}

    async complete(
        prompt: string,
        opts: RoutingOptions = {},
    ): Promise<LlmResponse> {
        const {
            strategy = 'balanced',
            sensitivity = 'internal',
            requireContextWindow = 0,
            maxCostPer1MTokens,
            forceCategory,
            forceModel,
        } = opts;

        const classification = await this.buildClassification(
            prompt,
            forceCategory,
        );

        const context: RoutingContext = {
            category: classification.category,
            sensitivity,
            requireContextWindow,
            maxCostPer1M: maxCostPer1MTokens,
        };

        const candidates = forceModel
            ? [this.resolveModel(forceModel)]
            : createRoutingStrategy(strategy)
                  .select(
                      this.llmClient.getCandidates(
                          sensitivity,
                          requireContextWindow,
                          maxCostPer1MTokens,
                      ),
                      context,
                  )
                  .filter((m) => this.getBreaker(m.id).canExecute());

        if (!candidates.length) throw new Error('[Router] No models available');

        return this.tryModels(prompt, candidates, classification);
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    private async buildClassification(
        prompt: string,
        forceCategory?: TaskCategory,
    ): Promise<ClassificationResult> {
        if (forceCategory) {
            return {
                category: forceCategory,
                confidence: 1,
                scores: {} as Record<TaskCategory, number>,
                signals: [],
                estimatedInputTokens: embeddingService.estimateTokens(prompt),
                source: 'semantic',
            };
        }

        const result = await this.classifier.classify(prompt);

        if (result.confidence < CONFIDENCE_MIN) {
            console.warn(
                `[Router] Low confidence (${result.confidence.toFixed(2)}) → escalating to reasoning`,
            );
            // Flag for manual review: operator can correct via POST /feedback
            return { ...result, category: 'reasoning', source: 'semantic' };
        }

        return result;
    }

    private resolveModel(modelId: string): ModelProfile {
        const model = this.llmClient.getAll().find((m) => m.id === modelId);
        if (!model) throw new Error(`[Router] Unknown model: ${modelId}`);
        return model;
    }

    private getBreaker(modelId: string): CircuitBreaker {
        if (!this.breakers.has(modelId)) {
            this.breakers.set(
                modelId,
                new CircuitBreaker(modelId, {
                    failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
                    successThreshold: CIRCUIT_SUCCESS_THRESHOLD,
                    halfOpenTimeoutMs: CIRCUIT_HALF_OPEN_TIMEOUT_MS,
                }),
            );
        }
        return this.breakers.get(modelId)!;
    }

    private async tryModels(
        prompt: string,
        candidates: ModelProfile[],
        classification: ClassificationResult,
    ): Promise<LlmResponse> {
        const promptHash = embeddingService.hashPrompt(prompt);

        for (const model of candidates) {
            const breaker = this.getBreaker(model.id);
            try {
                const { data, latencyMs } = await withRetry(
                    () => this.llmClient.complete(prompt, model.id),
                    {
                        attempts: RETRY_ATTEMPTS,
                        baseDelayMs: RETRY_BASE_DELAY_MS,
                    },
                );

                const inputTokens =
                    data.usage?.prompt_tokens ??
                    classification.estimatedInputTokens;
                const outputTokens = data.usage?.completion_tokens ?? 0;
                const estimatedCostUsd =
                    (inputTokens / 1_000_000) * model.costPer1MInput +
                    (outputTokens / 1_000_000) * model.costPer1MOutput;

                breaker.recordSuccess();

                this.auditLog
                    .insert({
                        promptHash,
                        prompt,
                        category: classification.category,
                        confidence: classification.confidence,
                        source: classification.source,
                        model: model.id,
                        costUsd: estimatedCostUsd,
                        latencyMs,
                    } satisfies LogEntry)
                    .catch((err: unknown) =>
                        console.error('[Router] Failed to persist log:', err),
                    );

                return {
                    content: data.choices[0].message.content ?? '',
                    model: model.id,
                    category: classification.category,
                    estimatedCostUsd,
                    latencyMs,
                    fallbackUsed: model.id !== candidates[0].id,
                    usage: { inputTokens, outputTokens },
                };
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : String(err);
                breaker.recordFailure();
                console.warn(`[Router] Failure ${model.id}: ${message}`);
            }
        }

        throw new Error('[Router] All models failed');
    }
}
