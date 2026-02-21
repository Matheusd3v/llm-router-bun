import { redis } from 'bun';
import { QdrantClient } from '@qdrant/js-client-rest';
import { embeddingService } from './embedding.service';
import type { ClassificationResult, TaskCategory } from '../types';
import {
    CACHE_TTL_SECONDS,
    COLLECTION_NAME,
    CONFIDENCE_HIGH,
    K_EXPANDED,
    K_NORMAL,
    VECTOR_DIM,
} from '../constants';

export class SemanticClassifierService {
    private readonly qdrant = new QdrantClient({ url: Bun.env.QDRANT_URL });
    private readonly embedder = embeddingService;

    async classify(prompt: string): Promise<ClassificationResult> {
        const hash = this.embedder.hashPrompt(prompt);
        const cacheKey = `llm:cls:${hash}`;

        // 1. Bun native Redis cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { ...JSON.parse(cached), source: 'cache' };
        }

        // 2. ONNX in-process embedding (~12ms, no server)
        const vector = await this.embedder.embed(prompt);

        // 3. Initial search K=7 with linear weight
        let result = await this.searchAndScore(vector, K_NORMAL, prompt, false);

        // 4. Low confidence → expand to K=20 with exponential weight (no API)
        if (result.confidence < CONFIDENCE_HIGH) {
            const expanded = await this.searchAndScore(
                vector,
                K_EXPANDED,
                prompt,
                true,
            );

            if (expanded.confidence > result.confidence) {
                result = { ...expanded, source: 'semantic' };
            }
        }

        // 5. Cache only confident results to avoid propagating uncertainty
        if (result.confidence >= CONFIDENCE_HIGH) {
            await redis.set(cacheKey, JSON.stringify(result));
            await redis.expire(cacheKey, CACHE_TTL_SECONDS);
        }

        return result;
    }

    private async searchAndScore(
        vector: number[],
        k: number,
        prompt: string,
        exponentialWeight: boolean,
    ): Promise<ClassificationResult> {
        const results = await this.qdrant.search(COLLECTION_NAME, {
            vector,
            limit: k,
            with_payload: true,
        });

        const scores: Record<TaskCategory, number> = {
            simple: 0,
            code: 0,
            reasoning: 0,
            data_analysis: 0,
            creative: 0,
        };

        for (const hit of results) {
            const cat = hit.payload!.category as TaskCategory;
            // Exponential weight: hits with score 0.95 dominate much more than 0.70
            // Example: 0.95^3 = 0.857 vs 0.70^3 = 0.343 (2.5x difference vs linear 1.35x)
            const weight = exponentialWeight
                ? Math.pow(hit.score, 3)
                : hit.score;
            scores[cat] += weight;
        }

        const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
        const normalized = Object.fromEntries(
            Object.entries(scores).map(([k, v]) => [k, v / total]),
        ) as Record<TaskCategory, number>;

        const [[category, confidence]] = Object.entries(normalized).sort(
            ([, a], [, b]) => b - a,
        );

        return {
            category: category as TaskCategory,
            confidence,
            scores: normalized,
            signals: results.map(
                (r) => `${r.payload!.category}(${r.score.toFixed(2)})`,
            ),
            estimatedInputTokens: this.embedder.estimateTokens(prompt),
            source: 'semantic',
        };
    }

    async addExample(text: string, category: TaskCategory): Promise<void> {
        const vector = await this.embedder.embed(text);
        await this.qdrant.upsert(COLLECTION_NAME, {
            points: [
                {
                    id: Date.now(),
                    vector,
                    payload: {
                        category,
                        text,
                        source: 'feedback',
                        addedAt: new Date().toISOString(),
                    },
                },
            ],
        });
    }

    async ensureCollection(): Promise<void> {
        const { collections } = await this.qdrant.getCollections();
        if (!collections.some((c) => c.name === COLLECTION_NAME)) {
            await this.qdrant.createCollection(COLLECTION_NAME, {
                vectors: { size: VECTOR_DIM, distance: 'Cosine' },
            });
            console.log(
                `[Qdrant] Collection '${COLLECTION_NAME}' created with dim=${VECTOR_DIM}`,
            );
        }
    }
}
