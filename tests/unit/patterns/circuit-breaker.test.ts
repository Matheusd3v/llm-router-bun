// tests/unit/patterns/circuit-breaker.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { CircuitBreaker } from '../../../src/patterns/circuit-breaker';

// Base config: no timeout (halfOpenTimeoutMs: 0) so the OPEN → HALF_OPEN
// transition happens immediately — removes dependency on real timers.
const BASE_CONFIG = {
    failureThreshold: 3,
    successThreshold: 2,
    halfOpenTimeoutMs: 0,
};

describe('CircuitBreaker', () => {
    let cb: CircuitBreaker;

    beforeEach(() => {
        cb = new CircuitBreaker('test-model', BASE_CONFIG);
    });

    // ── Initial state ─────────────────────────────────────────────────────

    it('starts in CLOSED state', () => {
        expect(cb.getState()).toBe('CLOSED');
    });

    it('allows execution when CLOSED', () => {
        expect(cb.canExecute()).toBe(true);
    });

    // ── CLOSED → OPEN ────────────────────────────────────────────────────

    it('stays CLOSED with N-1 failures', () => {
        cb.recordFailure();
        cb.recordFailure();
        expect(cb.getState()).toBe('CLOSED');
    });

    it('opens the circuit at failureThreshold', () => {
        cb.recordFailure();
        cb.recordFailure();
        cb.recordFailure();
        expect(cb.getState()).toBe('OPEN');
    });

    it('blocks execution when OPEN within timeout', () => {
        const cbWithTimeout = new CircuitBreaker('model', {
            ...BASE_CONFIG,
            halfOpenTimeoutMs: 60_000,
        });
        cbWithTimeout.recordFailure();
        cbWithTimeout.recordFailure();
        cbWithTimeout.recordFailure();

        expect(cbWithTimeout.getState()).toBe('OPEN');
        expect(cbWithTimeout.canExecute()).toBe(false);
    });

    // ── OPEN → HALF_OPEN (halfOpenTimeoutMs: 0 = immediate) ─────────────

    it('transitions to HALF_OPEN after timeout expires', () => {
        cb.recordFailure();
        cb.recordFailure();
        cb.recordFailure();

        expect(cb.canExecute()).toBe(true); // timeout already expired (0ms)
        expect(cb.getState()).toBe('HALF_OPEN');
    });

    // ── HALF_OPEN → CLOSED ────────────────────────────────────────────────

    it('closes the circuit after successThreshold successes in HALF_OPEN', () => {
        // Open the circuit
        cb.recordFailure();
        cb.recordFailure();
        cb.recordFailure();
        cb.canExecute(); // force transition to HALF_OPEN

        cb.recordSuccess();
        expect(cb.getState()).toBe('HALF_OPEN'); // still below threshold
        cb.recordSuccess();
        expect(cb.getState()).toBe('CLOSED');
    });

    it('stays HALF_OPEN with fewer successes than threshold', () => {
        cb.recordFailure();
        cb.recordFailure();
        cb.recordFailure();
        cb.canExecute();

        cb.recordSuccess(); // apenas 1 de 2
        expect(cb.getState()).toBe('HALF_OPEN');
    });

    // ── HALF_OPEN → OPEN ──────────────────────────────────────────────────

    it('reopens the circuit on failure in HALF_OPEN', () => {
        cb.recordFailure();
        cb.recordFailure();
        cb.recordFailure();
        cb.canExecute(); // → HALF_OPEN

        cb.recordFailure();
        expect(cb.getState()).toBe('OPEN');
    });

    // ── recordSuccess in CLOSED ─────────────────────────────────────────

    it('success resets failureCount and prevents opening', () => {
        cb.recordFailure();
        cb.recordFailure();
        cb.recordSuccess(); // zera o contador
        cb.recordFailure();
        cb.recordFailure(); // apenas 2 falhas desde o reset

        expect(cb.getState()).toBe('CLOSED');
    });

    // ── Idempotency ─────────────────────────────────────────────────────────

    it('transitioning to the same state causes no side effects', () => {
        // Calling recordSuccess() in CLOSED should change nothing
        cb.recordSuccess();
        expect(cb.getState()).toBe('CLOSED');
    });
});
