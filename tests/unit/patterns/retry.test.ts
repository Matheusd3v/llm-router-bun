// tests/unit/patterns/retry.test.ts
import { describe, it, expect } from 'bun:test';
import { withRetry } from '../../../src/patterns/retry';

// baseDelayMs: 0 — no real sleep; fast tests without mocking Bun.sleep
const INSTANT = { attempts: 3, baseDelayMs: 0 };

describe('withRetry', () => {
    // ── Success ─────────────────────────────────────────────────────────

    it('resolves immediately if the first attempt succeeds', async () => {
        let calls = 0;
        const result = await withRetry(async () => {
            calls++;
            return 'ok';
        }, INSTANT);

        expect(result).toBe('ok');
        expect(calls).toBe(1);
    });

    it('resolves on the second attempt if the first fails', async () => {
        let calls = 0;
        const result = await withRetry(async () => {
            calls++;
            if (calls === 1) throw new Error('transient');
            return 'recovered';
        }, INSTANT);

        expect(result).toBe('recovered');
        expect(calls).toBe(2);
    });

    // ── Total failure ────────────────────────────────────────────────────────

    it('throws the last attempt error when all attempts fail', async () => {
        let calls = 0;
        const errors = [
            new Error('err1'),
            new Error('err2'),
            new Error('err3'),
        ];

        await expect(
            withRetry(async () => {
                throw errors[calls++];
            }, INSTANT),
        ).rejects.toThrow('err3');

        expect(calls).toBe(3);
    });

    it('calls fn exactly `attempts` times on total failure', async () => {
        let calls = 0;
        const config = { attempts: 5, baseDelayMs: 0 };

        await expect(
            withRetry(async () => {
                calls++;
                throw new Error('fail');
            }, config),
        ).rejects.toThrow();

        expect(calls).toBe(5);
    });

    // ── Edge cases ───────────────────────────────────────────────────────────

    it('with attempts: 1 throws immediately without retry', async () => {
        let calls = 0;

        await expect(
            withRetry(
                async () => {
                    calls++;
                    throw new Error('only-once');
                },
                { attempts: 1, baseDelayMs: 0 },
            ),
        ).rejects.toThrow('only-once');

        expect(calls).toBe(1);
    });

    it('preserves the return type', async () => {
        const result = await withRetry(async () => ({ data: 42 }), INSTANT);
        expect(result.data).toBe(42);
    });

    it('stops at the first successful attempt without exhausting the rest', async () => {
        let calls = 0;
        await withRetry(
            async () => {
                calls++;
                return 'done';
            },
            { attempts: 10, baseDelayMs: 0 },
        );

        expect(calls).toBe(1);
    });
});
