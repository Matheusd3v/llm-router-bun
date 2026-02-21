# AGENT.md — Guide for code agents/assistants

This file describes the project, conventions, and essential commands for any code agent (Copilot, Claude, Cursor, etc.) to work effectively in this repository.

---

## What this project is

**LLM Router** is a decision engine that receives a prompt and automatically selects the most suitable LLM model, balancing cost, latency and quality — all without calling external APIs for classification.

Routing uses:

1. Redis cache → avoids reprocessing repeated prompts
2. In-process ONNX embeddings (`Xenova/multilingual-e5-small`, 384-dim, q8)
3. KNN in Qdrant → classifies the prompt into a `TaskCategory`
4. Strategy pattern → ranks candidates by criterion (cost / quality / balanced)
5. Circuit Breaker + Retry → resilience in the I/O layer with OpenRouter

---

## Essential commands

```bash
# Install dependencies
bun install

# Start the server (development)
bun run dev

# Build (verifies the project transpiles)
bun build src/index.ts --target bun

# Full typecheck (zero errors expected)
bunx tsc --noEmit

# Unit tests
bun test

# Tests in watch mode
bun run test:watch

# Seed the Qdrant classifier
bun run scripts/seed-classifier.ts

# Infra local (Qdrant + Redis + Postgres)
docker compose up -d
```

---

## Source-code map

```
src/
├── index.ts                     # Composition root + Elysia routes
├── types.ts                     # Shared types (TaskCategory, LlmResponse…)
├── constants.ts                 # Centralised constants (thresholds, timeouts…)
│
├── clients/
│   └── open-router.client.ts   # Isolated HTTP client for OpenRouter
│
├── patterns/
│   ├── circuit-breaker.ts      # 3 states: CLOSED → OPEN → HALF_OPEN → CLOSED
│   └── retry.ts                # withRetry<T> with exponential backoff
│
├── repositories/
│   └── audit-log.repository.ts # IAuditLogRepository + Postgres + InMemory (tests)
│
├── services/
│   ├── embedding.service.ts    # ONNX pipeline (singleton, warmup on boot)
│   ├── semantic-classifier.service.ts  # classify(), addExample(), ensureCollection()
│   ├── model-registry.service.ts       # getAll(), getCandidates() — filters only
│   └── llm-router.service.ts          # Main orchestrator
│
└── strategies/
    ├── routing-strategy.interface.ts   # IRoutingStrategy, RoutingContext
    ├── balanced.strategy.ts            # quality×0.5 + cost×0.3 + latency×0.2
    ├── cost-first.strategy.ts          # quality×0.2 + cost×0.7 + latency×0.1
    ├── quality-first.strategy.ts       # quality×0.8 + cost×0.1 + latency×0.1
    └── index.ts                        # createRoutingStrategy() factory

tests/
├── helpers/
│   ├── fixtures.ts             # makeModel(), makeClassification(), makeApiResponse()
│   ├── mock-classifier.ts      # makeClassifier(), makeFailingClassifier()
│   └── mock-open-router.ts     # makeOpenRouter(), makeSequentialOpenRouter()
└── unit/
    ├── patterns/               # circuit-breaker.test.ts, retry.test.ts
    ├── repositories/           # audit-log.repository.test.ts
    ├── services/               # model-registry.service.test.ts, llm-router.service.test.ts
    └── strategies/             # routing-strategies.test.ts
```

---

## Patterns and conventions

### Dependency injection

`LlmRouterService` receives all dependencies via constructor. Never instantiate services internally — use the composition root in `src/index.ts`.

### Testability

- Never access infrastructure (Redis, Qdrant, Postgres, HTTP) directly in unit tests.
- Use `InMemoryAuditLogRepository` instead of `PostgresAuditLogRepository`.
- Use `makeClassifier()` / `makeOpenRouter()` from the helpers — they are manual stubs with no mocking-framework dependency.

### Adding a new model

Edit only `src/services/model-registry.service.ts` — the `MODELS` array. Follow the `ModelProfile` format.

### Adding a new routing strategy

1. Create `src/strategies/<name>.strategy.ts` implementing `IRoutingStrategy`.
2. Export it from `src/strategies/index.ts` inside `createRoutingStrategy()`.
3. Add the literal to the `RoutingStrategy` type in `src/types.ts`.

### Adding a new `TaskCategory`

1. Add it to the `TaskCategory` union type in `src/types.ts`.
2. Add examples to the seed in `scripts/seed-classifier.ts`.
3. Update `qualityScore` on all models in the registry.

### Circuit Breaker

The `CircuitBreaker` is lazily created per model inside `LlmRouterService` — one per `model.id`. The instance lives for the lifetime of the process (in-memory). For a manual reset, restart the process.

### Retry

`RETRY_ATTEMPTS = 2` means 2 attempts against the same model before moving to the next in the fallback chain. The delay is `RETRY_BASE_DELAY_MS × 2^attempt`.

---

## Required environment variables

| Variable             | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| `OPENROUTER_API_KEY` | OpenRouter API key                                         |
| `OPENAI_API_KEY`     | OpenAI API key                                             |
| `DEEPSEEK_API_KEY`   | DeepSeek API key                                           |
| `QDRANT_URL`         | Qdrant URL (e.g. `http://localhost:6333`)                  |
| `REDIS_URL`          | Redis URL (e.g. `redis://localhost:6379`)                  |
| `DATABASE_URL`       | Postgres DSN                                               |
| `MODELS_CACHE_DIR`   | Local directory for the ONNX model cache (e.g. `./models`) |

---

## Important constraints

- **Runtime**: Bun — do not use `node:*` APIs that do not exist in Bun. Use `Bun.hash`, `Bun.sleep`, the `sql` template tag, and Bun's native `Redis`.
- **TypeScript target ES2021**: avoid `Array.prototype.at()`, `Object.hasOwn()`, and other ES2022+ APIs without checking `tsconfig.json`.
- **`embeddingService` is a singleton**: imported directly where needed. Do not inject it via constructor — the ONNX pipeline is not serialisable.
- **Audit log is fire-and-forget**: `.insert()` does not block the response. Errors are logged but not propagated.
- **No external mocking framework**: use manual stubs. Adding `jest`, `sinon`, or similar requires explicit approval.

---

## Known gotchas

| Problem                          | Cause                                                                       | Solution                                                                            |
| -------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| TS2590 in `embedding.service.ts` | `pipeline()` overloads from `@huggingface/transformers` exceed the TS limit | Cast as `as unknown as FeaturePipeline` — already applied                           |
| Poor classification at the start | Qdrant lacks sufficient examples                                            | Run `bun run scripts/seed-classifier.ts` and use `POST /feedback` with real prompts |
| First request is slow            | ONNX cold start                                                             | `embeddingService.warmup()` is called on boot — the wait is expected                |
| Circuit stays OPEN in production | `halfOpenTimeoutMs = 60s`                                                   | Wait or restart the process; no CB state persistence                                |
