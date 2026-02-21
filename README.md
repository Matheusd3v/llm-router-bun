# LLM Router

> Prompt-routing decision engine built on **Bun + Elysia**.  
> Automatically selects the best LLM model per request — balancing cost, latency and quality — without any external classification API.

![CI](https://github.com/Matheusd3v/llm-router-bun/actions/workflows/ci.yml/badge.svg)
![Bun](https://img.shields.io/badge/runtime-Bun-black?logo=bun)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6?logo=typescript)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Contents

- [Why this exists](#why-this-exists)
- [Stack](#stack)
- [Routing pipeline](#routing-pipeline)
- [Providers & models](#providers--models)
    - [`openrouter` (default)](#openrouter-default)
    - [`google`](#google)
    - [`anthropic`](#anthropic)
    - [`openai`](#openai)
    - [`deepseek`](#deepseek)
- [Categories](#categories)
- [API](#api)
    - [`POST /complete`](#post-complete)
    - [`POST /feedback`](#post-feedback)
    - [`GET /health`](#get-health)
- [Getting started](#getting-started)
    - [1. Start local infra](#1-start-local-infra)
    - [2. Install dependencies](#2-install-dependencies)
    - [3. Configure environment](#3-configure-environment)
    - [4. Run migration](#4-run-migration)
    - [5. Seed the classifier](#5-seed-the-classifier)
    - [6. Start the server](#6-start-the-server)
- [Testing](#testing)
- [Performance (estimates)](#performance-estimates)
- [Security & data sensitivity](#security--data-sensitivity)
- [Troubleshooting](#troubleshooting)
- [Kubernetes](#kubernetes)

---

## Why this exists

When running personal projects with heavy LLM usage, two problems appear quickly:

- **Cost explosion** — using a powerful model for a simple task.
- **Latency overhead** — calling an external API just to decide which model to use.

This router solves both without any external calls in the critical path:

| Problem                     | Solution                                 |
| --------------------------- | ---------------------------------------- |
| Repeated prompts            | Redis cache (TTL 24h)                    |
| Classification at zero cost | In-process ONNX embeddings               |
| Wrong model for the task    | KNN in Qdrant → `TaskCategory`           |
| Provider failure            | Circuit Breaker + Retry + fallback chain |

---

## Stack

| Layer         | Technology                                  |
| ------------- | ------------------------------------------- |
| Runtime       | Bun                                         |
| HTTP          | Elysia                                      |
| Cache         | Redis (Bun native client)                   |
| Vector store  | Qdrant (HNSW · Cosine)                      |
| Audit log     | Postgres (Bun `sql` template)               |
| Embeddings    | `@huggingface/transformers` ONNX in-process |
| LLM providers | OpenRouter · Google · Anthropic             |

---

## Routing pipeline

```
POST /complete
      │
      ├─ 1. Redis GET ──────────── HIT ──────────────────────────────┐
      │         MISS                                                  │
      ▼                                                               │
      2. ONNX embed (in-process, ~12ms, 384-dim)                     │
      │                                                               │
      ▼                                                               │
      3. Qdrant KNN K=7 → per-category scores                        │
      │                                                               │
      ├─ confidence ≥ 0.75 ── Redis SET async ────────────────────── │
      │                                                               │
      └─ confidence < 0.75                                            │
               │                                                      │
               ▼                                                      │
         Qdrant KNN K=20 (score³ weighting)                          │
               │                                                      │
               ├─ improved ──── Redis SET async ─────────────────────┤
               │                                                      │
               └─ confidence < 0.50 → force category=reasoning ──────┘
                         (no external API, zero overhead)             │
                                                                      │
      ◄─────────────────────────────────────────────────────────────┘
      │  ClassificationResult
      ▼
      4. ILlmClient.getCandidates(sensitivity, contextWindow, budget)
            └─ filterCandidates() · strategy ranking · CB filter
      │
      ▼
      5. withRetry → CircuitBreaker → provider HTTP call
      │
      ▼
      6. Response + async Postgres audit log
```

---

## Providers & models

Set `LLM_PROVIDER` to select the active provider. Each provider owns its model catalog.

### `openrouter` (default)

| Model             | Tier    | Cost/1M in | Strengths                               |
| ----------------- | ------- | ---------- | --------------------------------------- |
| Gemini 2.5 Flash  | general | $0.10      | simple, data_analysis                   |
| Grok 4.1 Fast     | general | $0.20      | code, simple                            |
| Claude Haiku 4.5  | medium  | $0.80      | code, simple                            |
| DeepSeek V3 ⚠️    | general | $0.028     | code _(blocked for sensitive/internal)_ |
| Gemini 2.5 Pro    | hard    | $1.25      | reasoning, data_analysis                |
| Claude Sonnet 4.5 | hard    | $3.00      | reasoning, creative                     |

### `google`

| Model                 | Tier    | Cost/1M in | Strengths             |
| --------------------- | ------- | ---------- | --------------------- |
| Gemini 2.0 Flash Lite | general | $0.075     | simple, data_analysis |
| Gemini 2.5 Flash      | medium  | $0.10      | code, data_analysis   |
| Gemini 2.5 Pro        | hard    | $1.25      | reasoning, creative   |

### `anthropic`

| Model             | Tier    | Cost/1M in | Strengths           |
| ----------------- | ------- | ---------- | ------------------- |
| Claude Haiku 4.5  | general | $0.80      | simple, code        |
| Claude Sonnet 4.5 | hard    | $3.00      | reasoning, creative |

### `openai`

| Model       | Tier    | Cost/1M in | Strengths       |
| ----------- | ------- | ---------- | --------------- |
| GPT-4o Mini | general | $0.15      | simple, code    |
| GPT-4o      | medium  | $2.50      | code, reasoning |
| o4-mini     | hard    | $3.00      | reasoning, code |

### `deepseek`

| Model          | Tier    | Cost/1M in | Strengths                                    |
| -------------- | ------- | ---------- | -------------------------------------------- |
| DeepSeek V3 ⚠️ | general | $0.07      | code _(blocked for sensitive/internal)_      |
| DeepSeek R1 ⚠️ | hard    | $0.55      | reasoning _(blocked for sensitive/internal)_ |

---

## Categories

| Category        | Examples                                      |
| --------------- | --------------------------------------------- |
| `simple`        | Factual questions, translation, short summary |
| `code`          | Implementation, refactor, debug               |
| `reasoning`     | Architecture, tradeoffs, strategy             |
| `data_analysis` | JSON/log parsing, SQL, dataset analysis       |
| `creative`      | README, docs, email, copy                     |

**Confidence thresholds** (see `src/constants.ts`):

- `CONFIDENCE_HIGH = 0.75` → accept & cache
- `CONFIDENCE_MIN = 0.50` → below this, force `reasoning` (no external call)

---

## API

### `POST /complete`

```json
{
    "prompt": "Implement a circuit breaker in TypeScript",
    "options": {
        "strategy": "balanced",
        "sensitivity": "internal",
        "requireContextWindow": 0,
        "maxCostPer1MTokens": 1.0,
        "forceCategory": "code",
        "forceModel": "x-ai/grok-4.1-fast"
    }
}
```

**Options:**

| Field                  | Type                                          | Default    | Description                                                        |
| ---------------------- | --------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `strategy`             | `cost_first` \| `quality_first` \| `balanced` | `balanced` | Model ranking criterion                                            |
| `sensitivity`          | `public` \| `internal` \| `sensitive`         | `public`   | `internal`/`sensitive` block providers without `supportsSensitive` |
| `maxCostPer1MTokens`   | `number`                                      | —          | Hard budget cap in USD per 1M input tokens                         |
| `requireContextWindow` | `number`                                      | `0`        | Minimum context window (tokens)                                    |
| `forceCategory`        | `TaskCategory`                                | —          | Skip classifier entirely                                           |
| `forceModel`           | `string`                                      | —          | Skip routing entirely, go direct to model                          |

**Response:**

```json
{
    "content": "...",
    "model": "x-ai/grok-4.1-fast",
    "category": "code",
    "estimatedCostUsd": 0.00012,
    "latencyMs": 512,
    "usage": { "inputTokens": 820, "outputTokens": 420 },
    "fallbackUsed": false
}
```

### `POST /feedback`

Upserts an embedding into Qdrant — incrementally trains the classifier.

```json
{ "prompt": "I have a weird bug here", "correctCategory": "code" }
```

### `GET /health`

```json
{
    "status": "ok",
    "model": "Xenova/multilingual-e5-small",
    "ts": "2026-02-21T12:00:00.000Z"
}
```

---

## Getting started

### 1. Start local infra

```bash
docker compose up -d   # Qdrant :6333 · Redis :6379 · Postgres :5432
```

### 2. Install dependencies

```bash
bun install
```

### 3. Configure environment

```env
LLM_PROVIDER=openrouter           # openrouter | google | anthropic

OPENROUTER_API_KEY=sk-or-...
GOOGLE_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...

QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgres://router:router@localhost:5432/llm_router

MODELS_CACHE_DIR=./models
```

### 4. Run migration

```bash
psql $DATABASE_URL -f migrations/001_create_classification_logs.sql
```

### 5. Seed the classifier

```bash
mkdir -p models
bun run seed
```

### 6. Start the server

```bash
bun run dev      # watch mode
bun run start    # production
```

---

## Testing

```bash
bun test                 # run once
bun test --watch         # watch mode
bun test --coverage      # with coverage
bunx tsc --noEmit        # typecheck only
```

Tests live under `tests/unit/`, mirroring `src/` by layer:

```
tests/unit/
├── patterns/        circuit-breaker, retry
├── repositories/    audit-log
├── services/        llm-router, client model catalogs
└── strategies/      cost_first, balanced, quality_first
```

No infrastructure is accessed in unit tests — all I/O is stubbed via helpers in `tests/helpers/`.

---

## Performance (estimates)

| Path                    | Frequency          | Router overhead |
| ----------------------- | ------------------ | --------------- |
| Cache HIT               | ~40% after warm-up | ~2ms            |
| High confidence (K=7)   | ~35%               | ~17ms           |
| Low confidence (K=20)   | ~20%               | ~22ms           |
| Escalation to reasoning | ~5%                | ~22ms           |

The dominant latency in `/complete` is always the **LLM response itself**, not the router.

---

## Security & data sensitivity

`sensitivity` controls which providers are eligible:

| Value       | Effect                                               |
| ----------- | ---------------------------------------------------- |
| `public`    | All providers allowed                                |
| `internal`  | Only providers with `supportsSensitive = true`       |
| `sensitive` | Same as `internal` — use for PII / confidential data |

Providers blocked for `internal`/`sensitive`: **DeepSeek V3** (data may leave trusted regions).

---

## Troubleshooting

**First request is slow**

> Expected. The ONNX model cold-starts on first use and then stays in memory. `embeddingService.warmup()` is called on boot to front-load this.

**Circuit breaker stays OPEN**

> `halfOpenTimeoutMs = 60s`. Wait one minute or restart the process — there is no persistent CB state.

**Poor classification quality**

> Run `bun run seed` and use `POST /feedback` with real examples. Quality improves fast because routing is similarity-based.

**Qdrant dimension mismatch**

> If you swap the embedding model, the vector dimension changes. Drop the collection and re-run the seed.

---

## Kubernetes

Manifests live in `k8s/`.

```
k8s/
├── namespace.yaml          # llm-router namespace
├── configmap.yaml          # non-secret env vars
├── secret.yaml             # API keys — fill in and keep out of git
├── deployment.yaml         # app Deployment + ONNX models PVC (RWX)
├── service.yaml            # ClusterIP → port 80
├── hpa.yaml                # HPA cpu 70% / mem 80%, 2–6 replicas
└── infra/
    ├── qdrant-statefulset.yaml
    ├── redis-deployment.yaml
    └── postgres-statefulset.yaml
```

```bash
# 1. Namespace + infra
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/infra/

# 2. Fill in secrets then apply
# edit k8s/secret.yaml with real API keys
kubectl apply -f k8s/secret.yaml

# 3. Application
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml

# 4. Run DB migration (once)
kubectl run migrate --rm -it \
  --image=postgres:16-alpine \
  --env="PGPASSWORD=router" \
  -- psql -h postgres.llm-router.svc -U router llm_router \
     -f /dev/stdin < migrations/001_create_classification_logs.sql

# 5. Seed the classifier
kubectl exec -n llm-router deploy/llm-router -- bun scripts/seed-classifier.ts
```
