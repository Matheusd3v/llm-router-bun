// src/index.ts
import { Elysia, t } from 'elysia';
import { embeddingService } from './services/embedding.service';
import { SemanticClassifierService } from './services/semantic-classifier.service';
import { LlmRouterService } from './services/llm-router.service';
import { createLlmClient } from './clients/llm-client.factory';
import { PostgresAuditLogRepository } from './repositories/audit-log.repository';
import type { LlmProvider, TaskCategory } from './types';

const provider = (Bun.env.LLM_PROVIDER ?? 'openrouter') as LlmProvider;

const classifier = new SemanticClassifierService();
const llmClient = createLlmClient(provider);
const auditLog = new PostgresAuditLogRepository();
const router = new LlmRouterService(classifier, llmClient, auditLog);

console.log(`[Router] Provider: ${provider}`);

// Boot sequence: infra → model → requests
await classifier.ensureCollection();
await embeddingService.warmup(); // load ONNX before accepting requests

const app = new Elysia()
    .onError(({ code, error, set }) => {
        const status =
            code === 'VALIDATION' ? 400 : code === 'NOT_FOUND' ? 404 : 500;
        set.status = status;
        const message =
            error instanceof Error ? error.message : 'Internal Server Error';
        console.error(`[HTTP ${status}] ${code}: ${message}`);
        return { error: message, code };
    })
    .post(
        '/complete',
        async ({ body }) => {
            return router.complete(body.prompt, body.options ?? {});
        },
        {
            body: t.Object({
                prompt: t.String({ minLength: 1 }),
                options: t.Optional(
                    t.Object({
                        strategy: t.Optional(
                            t.Union([
                                t.Literal('cost_first'),
                                t.Literal('quality_first'),
                                t.Literal('balanced'),
                            ]),
                        ),
                        sensitivity: t.Optional(
                            t.Union([
                                t.Literal('public'),
                                t.Literal('internal'),
                                t.Literal('sensitive'),
                            ]),
                        ),
                        forceCategory: t.Optional(
                            t.Union([
                                t.Literal('simple'),
                                t.Literal('code'),
                                t.Literal('reasoning'),
                                t.Literal('data_analysis'),
                                t.Literal('creative'),
                            ]),
                        ),
                        forceModel: t.Optional(t.String()),
                        maxCostPer1MTokens: t.Optional(t.Number()),
                        requireContextWindow: t.Optional(t.Number()),
                    }),
                ),
            }),
        },
    )

    // Feedback loop endpoint — corrects wrong classification and trains Qdrant
    .post(
        '/feedback',
        async ({ body }) => {
            await classifier.addExample(
                body.prompt,
                body.correctCategory as TaskCategory,
            );
            return { ok: true, message: 'Example added to classifier' };
        },
        {
            body: t.Object({
                prompt: t.String({ minLength: 1 }),
                correctCategory: t.Union([
                    t.Literal('simple'),
                    t.Literal('code'),
                    t.Literal('reasoning'),
                    t.Literal('data_analysis'),
                    t.Literal('creative'),
                ]),
            }),
        },
    )

    .get('/health', () => ({
        status: 'ok',
        model: Bun.env.HF_MODEL_NAME ?? 'Xenova/multilingual-e5-small',
        ts: new Date().toISOString(),
    }))

    .listen(Bun.env.PORT ?? 3000);

console.log(
    `🚀 LLM Router running at http://${app.server?.hostname}:${app.server?.port}`,
);
