// src/patterns/circuit-breaker.ts

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
    /** Consecutive failures to open the circuit */
    failureThreshold: number;
    /** Successes in HALF_OPEN to close the circuit again */
    successThreshold: number;
    /** Time (ms) in OPEN before attempting HALF_OPEN */
    halfOpenTimeoutMs: number;
}

/**
 * Circuit Breaker with three states: CLOSED → OPEN → HALF_OPEN → CLOSED.
 *
 * - CLOSED    : normal operation; failures increment the counter.
 * - OPEN      : open circuit; calls rejected until halfOpenTimeoutMs expires.
 * - HALF_OPEN : allows a probe request; success closes, failure reopens.
 */
export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private failureCount = 0;
    private successCount = 0;
    private lastFailureTime = 0;

    constructor(
        private readonly id: string,
        private readonly config: CircuitBreakerConfig,
    ) {}

    canExecute(): boolean {
        if (this.state === 'CLOSED') return true;

        if (this.state === 'OPEN') {
            const elapsed = Date.now() - this.lastFailureTime;
            if (elapsed >= this.config.halfOpenTimeoutMs) {
                this.transition('HALF_OPEN');
                return true;
            }
            return false;
        }

        // HALF_OPEN: allows a probe attempt
        return true;
    }

    recordSuccess(): void {
        this.failureCount = 0;

        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.successCount = 0;
                this.transition('CLOSED');
            }
        }
    }

    recordFailure(): void {
        this.lastFailureTime = Date.now();
        this.successCount = 0;
        this.failureCount++;

        if (
            this.state === 'HALF_OPEN' ||
            this.failureCount >= this.config.failureThreshold
        ) {
            this.failureCount = 0;
            this.transition('OPEN');
        }
    }

    getState(): CircuitState {
        return this.state;
    }

    private transition(next: CircuitState): void {
        if (this.state !== next) {
            console.warn(
                `[CircuitBreaker] ${this.id}: ${this.state} → ${next}`,
            );
            this.state = next;
        }
    }
}
