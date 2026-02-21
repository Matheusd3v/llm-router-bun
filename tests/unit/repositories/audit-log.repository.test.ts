// tests/unit/repositories/audit-log.repository.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { InMemoryAuditLogRepository } from '../../../src/repositories/audit-log.repository';
import type { LogEntry } from '../../../src/repositories/audit-log.repository';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
    return {
        promptHash: 'hash-abc',
        prompt: 'What is the capital of France?',
        category: 'simple',
        confidence: 0.95,
        source: 'semantic',
        model: 'test/model',
        costUsd: 0.0001,
        latencyMs: 120,
        ...overrides,
    };
}

describe('InMemoryAuditLogRepository', () => {
    let repo: InMemoryAuditLogRepository;

    beforeEach(() => {
        repo = new InMemoryAuditLogRepository();
    });

    it('starts with zero entries', () => {
        expect(repo.entries).toHaveLength(0);
    });

    it('inserts one entry correctly', async () => {
        await repo.insert(makeEntry());
        expect(repo.entries).toHaveLength(1);
    });

    it('preserves all fields of the inserted entry', async () => {
        const entry = makeEntry({
            promptHash: 'xyz-123',
            prompt: 'Explain recursion',
            category: 'code',
            confidence: 0.88,
            source: 'cache',
            model: 'anthropic/claude-sonnet-4-5',
            costUsd: 0.0042,
            latencyMs: 450,
        });

        await repo.insert(entry);
        expect(repo.entries[0]).toEqual(entry);
    });

    it('accumulates sequential entries without overwriting previous ones', async () => {
        await repo.insert(makeEntry({ promptHash: 'h1' }));
        await repo.insert(makeEntry({ promptHash: 'h2' }));
        await repo.insert(makeEntry({ promptHash: 'h3' }));

        expect(repo.entries).toHaveLength(3);
        expect(repo.entries.map((e) => e.promptHash)).toEqual([
            'h1',
            'h2',
            'h3',
        ]);
    });

    it('concurrent inserts do not lose data', async () => {
        await Promise.all([
            repo.insert(makeEntry({ promptHash: 'c1' })),
            repo.insert(makeEntry({ promptHash: 'c2' })),
            repo.insert(makeEntry({ promptHash: 'c3' })),
        ]);

        expect(repo.entries).toHaveLength(3);
    });

    it('does not share state between distinct instances', async () => {
        const repo2 = new InMemoryAuditLogRepository();
        await repo.insert(makeEntry());
        expect(repo2.entries).toHaveLength(0);
    });
});
