// src/constants.ts — Centralized constants; avoids magic numbers scattered throughout the code

// ── Qdrant ─────────────────────────────────────────────────────────────────
/** Collection name for classification examples */
export const COLLECTION_NAME = 'llm_router_examples';
/** Embedding dimension for Xenova/multilingual-e5-small with q8 quantization */
export const VECTOR_DIM = 384;

// ── Classifier ─────────────────────────────────────────────────────────────
/** Accept result without search expansion */
export const CONFIDENCE_HIGH = 0.75;
/** Below this, escalate to 'reasoning' without calling an external API */
export const CONFIDENCE_MIN = 0.5;
/** Number of neighbours in the default search */
export const K_NORMAL = 7;
/** Number of neighbours in the expanded search (low confidence) */
export const K_EXPANDED = 20;

// ── Redis Cache ────────────────────────────────────────────────────────────
/** TTL (seconds) for cached classifications: 24 hours */
export const CACHE_TTL_SECONDS = 86_400;

// ── OpenRouter ─────────────────────────────────────────────────────────────
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Maximum timeout for OpenRouter calls (30 s) */
export const OPENROUTER_TIMEOUT_MS = 30_000;

// ── Circuit Breaker ────────────────────────────────────────────────────────
/** Consecutive failures to open the circuit */
export const CIRCUIT_FAILURE_THRESHOLD = 3;
/** Successes in HALF_OPEN to close the circuit */
export const CIRCUIT_SUCCESS_THRESHOLD = 2;
/** Time (ms) in OPEN before attempting HALF_OPEN: 60 s */
export const CIRCUIT_HALF_OPEN_TIMEOUT_MS = 60_000;

// ── Retry ──────────────────────────────────────────────────────────────────
/** Attempts per model before moving to the next in the fallback chain */
export const RETRY_ATTEMPTS = 2;
/** Base delay for exponential backoff (ms): 300 ms, 600 ms, ... */
export const RETRY_BASE_DELAY_MS = 300;
