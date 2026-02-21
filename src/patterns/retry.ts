// src/patterns/retry.ts

export interface RetryConfig {
    /** Maximum number of attempts (includes the first) */
    attempts: number;
    /** Base delay in ms; backoff: baseDelayMs * 2^attempt */
    baseDelayMs: number;
}

/**
 * Executes `fn` with exponential retry.
 * Throws the last attempt's error if all attempts fail.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig,
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < config.attempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < config.attempts - 1) {
                const delay = config.baseDelayMs * 2 ** attempt;
                await Bun.sleep(delay);
            }
        }
    }

    throw lastError;
}
