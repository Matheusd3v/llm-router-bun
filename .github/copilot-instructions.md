# GitHub Copilot Instructions

This file provides context for AI coding assistants working in this repository.

---

## What this project is

**LLM Router** is a prompt-routing decision engine built on **Bun + Elysia**. It receives a prompt and automatically selects the most suitable LLM model, balancing cost, latency, and quality — without calling external APIs for classification.

Routing pipeline:

1. Redis cache → skips classification for repeated prompts
2. In-process ONNX embeddings (`Xenova/multilingual-e5-small`, 384-dim, q8)
3. KNN in Qdrant → classifies the prompt into a `TaskCategory`
4. Strategy pattern → ranks candidates (cost / quality / balanced)
5. Circuit Breaker + Retry → resilience in the I/O layer

---

## Runtime & language constraints

- **Runtime**: Bun — use `Bun.hash`, `Bun.sleep`, the `sql` template tag, Bun's native `Redis`. Avoid `node:*` APIs that do not exist in Bun.
- **TypeScript target ES2021** — avoid `Array.prototype.at()`, `Object.hasOwn()`, `structuredClone()`, and other ES2022+ APIs without checking `tsconfig.json`.
- **No external mocking framework** — manual stubs only. Do not add `jest`, `sinon`, `vitest`, or `msw` without explicit approval.
- **Module system**: ESM (`"type": "module"`).

---

## Source-code map

```
src/
├── index.ts                            # Composition root + Elysia routes
├── types.ts                            # Shared types (TaskCategory, ModelProfile, LlmProvider…)
├── constants.ts                        # Centralised constants (thresholds, timeouts…)
│
├── clients/
│   ├── llm-client.interface.ts         # ILlmClient — complete / getAll / getCandidates
│   ├── llm-client.factory.ts           # createLlmClient(provider) factory
│   ├── model-filter.ts                 # Shared filterCandidates() utility
│   ├── open-router.client.ts           # OpenRouter via HTTP (6 models)
│   ├── google.client.ts                # Google via OpenAI-compat endpoint (3 models)
│   └── anthropic.client.ts             # Anthropic native API (2 models)
│
├── patterns/
│   ├── circuit-breaker.ts              # 3 states: CLOSED → OPEN → HALF_OPEN → CLOSED
│   └── retry.ts                        # withRetry<T> with exponential backoff
│
├── repositories/
│   └── audit-log.repository.ts         # IAuditLogRepository + Postgres + InMemory (tests)
│
├── services/
│   ├── embedding.service.ts            # ONNX pipeline (singleton, warmup on boot)
│   ├── semantic-classifier.service.ts  # classify(), addExample(), ensureCollection()
│   └── llm-router.service.ts           # Main orchestrator
│
└── strategies/
    ├── routing-strategy.interface.ts   # IRoutingStrategy, RoutingContext
    ├── balanced.strategy.ts            # quality×0.5 + cost×0.3 + latency×0.2
    ├── cost-first.strategy.ts          # quality×0.2 + cost×0.7 + latency×0.1
    ├── quality-first.strategy.ts       # quality×0.8 + cost×0.1 + latency×0.1
    └── index.ts                        # createRoutingStrategy() factory

tests/
├── helpers/
│   ├── fixtures.ts                     # makeModel(), makeClassification(), makeApiResponse()
│   ├── mock-classifier.ts              # makeClassifier(), makeFailingClassifier()
│   └── mock-open-router.ts             # makeOpenRouter(...models), makeSequentialOpenRouter(responses, ...models)
└── unit/
    ├── patterns/
    ├── repositories/
    ├── services/
    └── strategies/
```

---

## Key interfaces and types

### `ILlmClient` (`src/clients/llm-client.interface.ts`)

Every provider client must implement all three methods:

```typescript
interface ILlmClient {
    complete(prompt: string, modelId: string): Promise<CompletionResult>;
    getAll(): ModelProfile[];
    getCandidates(
        sensitivity: PrivacySensitivity,
        minContextWindow: number,
        maxCostPer1M?: number,
    ): ModelProfile[];
}
```

Use `filterCandidates()` from `src/clients/model-filter.ts` inside `getCandidates()` — never duplicate the filter logic.

### `ModelProfile` (`src/types.ts`)

```typescript
interface ModelProfile {
    id: string; // must match the provider's model ID exactly
    displayName: string;
    tier: ModelTier; // 'general' | 'medium' | 'hard'
    costPer1MInput: number;
    costPer1MOutput: number;
    contextWindow: number;
    strengths: TaskCategory[];
    supportsSensitive: boolean;
    latencyTier: 'fast' | 'medium' | 'slow';
    qualityScore: Record<TaskCategory, number>;
}
```

`ModelProfile` does **not** have a `provider` field — each client owns its own model list and knows its own provider.

### `LlmRouterService` constructor

```typescript
new LlmRouterService(classifier, llmClient, auditLog);
```

- `classifier`: `SemanticClassifierService`
- `llmClient`: `ILlmClient`
- `auditLog`: `IAuditLogRepository`

`ModelRegistryService` no longer exists — models live inside each provider client.

---

## Patterns and conventions

### Adding a new provider

1. Create `src/clients/<name>.client.ts` implementing `ILlmClient`.
2. Define the model catalog as a private `readonly` array inside the class.
3. Implement `getCandidates()` by delegating to `filterCandidates()`.
4. Register the new provider literal in `LlmProvider` in `src/types.ts`.
5. Add the case to `createLlmClient()` in `src/clients/llm-client.factory.ts`.
6. Add a `describe` block in `tests/unit/services/model-registry.service.test.ts` (or a new file) testing `getAll()` and `getCandidates()`.

### Adding a new model

Edit only the `MODELS` array inside the relevant client file (`open-router.client.ts`, `google.client.ts`, or `anthropic.client.ts`). Follow the `ModelProfile` shape exactly. Update `qualityScore` for all `TaskCategory` values.

### Adding a new routing strategy

1. Create `src/strategies/<name>.strategy.ts` implementing `IRoutingStrategy`.
2. Export it from `src/strategies/index.ts` inside `createRoutingStrategy()`.
3. Add the literal to the `RoutingStrategy` type in `src/types.ts`.

### Adding a new `TaskCategory`

1. Add it to the `TaskCategory` union type in `src/types.ts`.
2. Add examples to the seed in `scripts/seed-classifier.ts`.
3. Update `qualityScore` on all models in all three clients.

### Dependency injection

`LlmRouterService` receives all dependencies via constructor. Never instantiate services internally — use the composition root `src/index.ts`.

### `embeddingService` is a singleton

Imported directly where needed (`import { embeddingService } from './embedding.service'`). Do not inject via constructor — the ONNX pipeline is not serialisable.

### Audit log is fire-and-forget

`.insert()` does not block the response. Errors are logged but never propagated.

### Circuit Breaker

One `CircuitBreaker` per `model.id`, lazily created inside `LlmRouterService`. Lives for the lifetime of the process (no persistence). Reset by restarting the process.

### Retry

`RETRY_ATTEMPTS = 2` → 2 attempts on the same model before moving to the next in the fallback chain. Delay = `RETRY_BASE_DELAY_MS × 2^attempt`.

---

## Testing conventions

- **Never access infrastructure** (Redis, Qdrant, Postgres, HTTP) in unit tests.
- Use `InMemoryAuditLogRepository` — never `PostgresAuditLogRepository`.
- Use helpers from `tests/helpers/`:
    - `makeModel(overrides?)` — creates a valid `ModelProfile`
    - `makeClassification(overrides?)` — creates a `ClassificationResult`
    - `makeApiResponse(content, inputTokens, outputTokens)` — creates an OpenRouter-shaped response
    - `makeClassifier(result)` / `makeFailingClassifier()` — stub `SemanticClassifierService`
    - `makeOpenRouter(result, ...models)` — stub `ILlmClient` with `getAll`/`getCandidates` returning the given models
    - `makeSequentialOpenRouter(responses, ...models)` — returns responses in sequence
- All test files live under `tests/unit/` mirroring the `src/` structure.
- Tests use Bun's built-in test runner (`import { describe, it, expect, beforeEach } from 'bun:test'`).

---

## Environment variables

| Variable             | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| `LLM_PROVIDER`       | `openrouter` \| `google` \| `anthropic` (default: `openrouter`) |
| `OPENROUTER_API_KEY` | OpenRouter API key                                              |
| `GOOGLE_API_KEY`     | Google AI Studio API key                                        |
| `ANTHROPIC_API_KEY`  | Anthropic API key                                               |
| `OPENAI_API_KEY`     | OpenAI API key                                                  |
| `DEEPSEEK_API_KEY`   | DeepSeek API key                                                |
| `QDRANT_URL`         | Qdrant URL (e.g. `http://localhost:6333`)                       |
| `REDIS_URL`          | Redis URL (e.g. `redis://localhost:6379`)                       |
| `DATABASE_URL`       | Postgres DSN                                                    |
| `MODELS_CACHE_DIR`   | Local directory for ONNX model cache (e.g. `./models`)          |

---

## Essential commands

```bash
bun install              # Install dependencies
bun run dev              # Start server (watch mode)
bunx tsc --noEmit        # Full typecheck
bun test                 # Unit tests
bun build src/index.ts --target bun   # Verify build
bun run scripts/seed-classifier.ts    # Seed Qdrant classifier
docker compose up -d     # Start Qdrant + Redis + Postgres
```

---

## Known gotchas

| Problem                                    | Cause                                  | Solution                                                        |
| ------------------------------------------ | -------------------------------------- | --------------------------------------------------------------- |
| TS2590 in `embedding.service.ts`           | `pipeline()` overloads exceed TS limit | Cast as `as unknown as FeaturePipeline` — already applied       |
| First request slow                         | ONNX cold start                        | `embeddingService.warmup()` called on boot — expected           |
| Circuit stays OPEN                         | `halfOpenTimeoutMs = 60s`              | Wait or restart the process                                     |
| Poor classification                        | Qdrant lacks examples                  | Run seed script + use `POST /feedback`                          |
| `Array.at()` / `Object.hasOwn()` TS errors | ES2021 target                          | Use bracket notation / `Object.prototype.hasOwnProperty.call()` |
