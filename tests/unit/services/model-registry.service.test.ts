// tests/unit/services/provider-models.test.ts
// Verifies that each provider client owns the correct models and that the
// shared filtering logic (filterCandidates) behaves correctly on real data.
import { describe, it, expect, beforeEach } from 'bun:test';
import { OpenRouterClient } from '../../../src/clients/open-router.client';
import { GoogleClient } from '../../../src/clients/google.client';
import { AnthropicClient } from '../../../src/clients/anthropic.client';

// ── OpenRouterClient ──────────────────────────────────────────────────────

describe('OpenRouterClient — model catalogue', () => {
    let client: OpenRouterClient;

    beforeEach(() => {
        client = new OpenRouterClient();
    });

    it('owns exactly 6 models', () => {
        expect(client.getAll()).toHaveLength(6);
    });

    it('returns models with all required fields present', () => {
        for (const m of client.getAll()) {
            expect(m.id).toBeTruthy();
            expect(m.costPer1MInput).toBeGreaterThan(0);
            expect(m.contextWindow).toBeGreaterThan(0);
        }
    });

    it("excludes models with supportsSensitive=false when sensitivity='sensitive'", () => {
        const result = client.getCandidates('sensitive', 0);
        const ids = result.map((m) => m.id);
        expect(ids).not.toContain('deepseek/deepseek-chat-v3');
        expect(result.every((m) => m.supportsSensitive)).toBe(true);
    });

    it("excludes models with supportsSensitive=false when sensitivity='internal'", () => {
        const result = client.getCandidates('internal', 0);
        expect(result.every((m) => m.supportsSensitive)).toBe(true);
    });

    it("includes all 6 models when sensitivity='public'", () => {
        expect(client.getCandidates('public', 0)).toHaveLength(6);
    });

    it('excludes models below the minimum context window', () => {
        // deepseek: 128k, grok: 131k — both excluded with 200_000
        const result = client.getCandidates('public', 200_000);
        const ids = result.map((m) => m.id);
        expect(ids).not.toContain('deepseek/deepseek-chat-v3');
        expect(ids).not.toContain('x-ai/grok-4.1-fast');
        expect(result.every((m) => m.contextWindow >= 200_000)).toBe(true);
    });

    it('excludes models above the cost budget per 1M tokens', () => {
        const result = client.getCandidates('public', 0, 0.5);
        expect(result.every((m) => m.costPer1MInput <= 0.5)).toBe(true);
        const ids = result.map((m) => m.id);
        expect(ids).not.toContain('anthropic/claude-sonnet-4-5');
        expect(ids).not.toContain('google/gemini-2.5-pro');
    });

    it('does not apply cost filter when maxCostPer1M is undefined', () => {
        expect(client.getCandidates('public', 0, undefined)).toHaveLength(6);
    });

    it('applies all filters simultaneously', () => {
        const result = client.getCandidates('sensitive', 200_000, 1.0);
        for (const m of result) {
            expect(m.supportsSensitive).toBe(true);
            expect(m.contextWindow).toBeGreaterThanOrEqual(200_000);
            expect(m.costPer1MInput).toBeLessThanOrEqual(1.0);
        }
    });

    it('returns empty when no model passes the filters', () => {
        expect(client.getCandidates('sensitive', 999_000_000)).toHaveLength(0);
    });

    it('getAll is not mutated by getCandidates calls', () => {
        client.getCandidates('sensitive', 200_000, 0.1);
        expect(client.getAll()).toHaveLength(6);
    });
});

// ── GoogleClient ──────────────────────────────────────────────────────────

describe('GoogleClient — model catalogue', () => {
    let client: GoogleClient;

    beforeEach(() => {
        client = new GoogleClient();
    });

    it('owns exactly 3 models (general / medium / hard)', () => {
        expect(client.getAll()).toHaveLength(3);
    });

    it('covers all three tiers', () => {
        const tiers = client.getAll().map((m) => m.tier);
        expect(tiers).toContain('general');
        expect(tiers).toContain('medium');
        expect(tiers).toContain('hard');
    });

    it('all models support sensitive data', () => {
        expect(client.getAll().every((m) => m.supportsSensitive)).toBe(true);
    });

    it('returns empty when budget is below the cheapest model', () => {
        // cheapest is 0.07 — cap at 0.05 removes all
        expect(client.getCandidates('public', 0, 0.05)).toHaveLength(0);
    });

    it('getAll is not mutated by getCandidates calls', () => {
        client.getCandidates('sensitive', 0);
        expect(client.getAll()).toHaveLength(3);
    });
});

// ── AnthropicClient ───────────────────────────────────────────────────────

describe('AnthropicClient — model catalogue', () => {
    let client: AnthropicClient;

    beforeEach(() => {
        client = new AnthropicClient();
    });

    it('owns exactly 2 models (general / hard)', () => {
        expect(client.getAll()).toHaveLength(2);
    });

    it('covers general and hard tiers', () => {
        const tiers = client.getAll().map((m) => m.tier);
        expect(tiers).toContain('general');
        expect(tiers).toContain('hard');
    });

    it('all models support sensitive data', () => {
        expect(client.getAll().every((m) => m.supportsSensitive)).toBe(true);
    });

    it('excludes the hard model when budget cap is below 1.0', () => {
        // haiku: 0.8 → passes; sonnet: 3.0 → excluded
        const result = client.getCandidates('public', 0, 1.0);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('claude-haiku-4-5');
    });

    it('getAll is not mutated by getCandidates calls', () => {
        client.getCandidates('sensitive', 0);
        expect(client.getAll()).toHaveLength(2);
    });
});
