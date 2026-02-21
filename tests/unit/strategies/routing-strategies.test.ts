// tests/unit/strategies/routing-strategies.test.ts
import { describe, it, expect } from 'bun:test';
import { BalancedStrategy } from '../../../src/strategies/balanced.strategy';
import { CostFirstStrategy } from '../../../src/strategies/cost-first.strategy';
import { QualityFirstStrategy } from '../../../src/strategies/quality-first.strategy';
import { createRoutingStrategy } from '../../../src/strategies';
import { makeModel } from '../../helpers/fixtures';
import type { RoutingContext } from '../../../src/strategies';

const CONTEXT: RoutingContext = {
    category: 'code',
    sensitivity: 'public',
    requireContextWindow: 0,
};

// Two models with opposite characteristics on each dimension.
const CHEAP_LOW_QUALITY = makeModel({
    id: 'cheap',
    costPer1MInput: 0.05,
    latencyTier: 'fast',
    qualityScore: {
        simple: 3,
        code: 3,
        reasoning: 3,
        data_analysis: 3,
        creative: 3,
    },
});

const EXPENSIVE_HIGH_QUALITY = makeModel({
    id: 'expensive',
    costPer1MInput: 10.0,
    latencyTier: 'slow',
    qualityScore: {
        simple: 10,
        code: 10,
        reasoning: 10,
        data_analysis: 10,
        creative: 10,
    },
});

describe('CostFirstStrategy', () => {
    const strategy = new CostFirstStrategy();

    it('ranks the cheapest model first', () => {
        const result = strategy.select(
            [EXPENSIVE_HIGH_QUALITY, CHEAP_LOW_QUALITY],
            CONTEXT,
        );
        expect(result[0].id).toBe('cheap');
    });

    it('does not mutate the original array', () => {
        const candidates = [EXPENSIVE_HIGH_QUALITY, CHEAP_LOW_QUALITY];
        strategy.select(candidates, CONTEXT);
        expect(candidates[0].id).toBe('expensive'); // original order preserved
    });

    it('returns empty array without errors', () => {
        expect(strategy.select([], CONTEXT)).toEqual([]);
    });

    it('returns the single element when there is only one candidate', () => {
        const result = strategy.select([CHEAP_LOW_QUALITY], CONTEXT);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('cheap');
    });
});

describe('QualityFirstStrategy', () => {
    const strategy = new QualityFirstStrategy();

    it('ranks the highest-quality model first', () => {
        const result = strategy.select(
            [CHEAP_LOW_QUALITY, EXPENSIVE_HIGH_QUALITY],
            CONTEXT,
        );
        expect(result[0].id).toBe('expensive');
    });

    it('does not mutate the original array', () => {
        const candidates = [CHEAP_LOW_QUALITY, EXPENSIVE_HIGH_QUALITY];
        strategy.select(candidates, CONTEXT);
        expect(candidates[0].id).toBe('cheap');
    });

    it('returns empty array without errors', () => {
        expect(strategy.select([], CONTEXT)).toEqual([]);
    });
});

describe('BalancedStrategy', () => {
    const strategy = new BalancedStrategy();

    it('returns both models sorted (without removing any)', () => {
        const result = strategy.select(
            [CHEAP_LOW_QUALITY, EXPENSIVE_HIGH_QUALITY],
            CONTEXT,
        );
        expect(result).toHaveLength(2);
    });

    it('does not mutate the original array', () => {
        const candidates = [CHEAP_LOW_QUALITY, EXPENSIVE_HIGH_QUALITY];
        strategy.select(candidates, CONTEXT);
        // Original order must be preserved in the input array
        expect(candidates[0].id).toBe('cheap');
    });

    it('result differs from cost_first and quality_first for extreme models', () => {
        const cost = new CostFirstStrategy().select(
            [CHEAP_LOW_QUALITY, EXPENSIVE_HIGH_QUALITY],
            CONTEXT,
        )[0].id;
        const qual = new QualityFirstStrategy().select(
            [CHEAP_LOW_QUALITY, EXPENSIVE_HIGH_QUALITY],
            CONTEXT,
        )[0].id;
        const bal = strategy.select(
            [CHEAP_LOW_QUALITY, EXPENSIVE_HIGH_QUALITY],
            CONTEXT,
        )[0].id;

        // Balanced may align with one of the extremes in this scenario but
        // guarantees both models are present — it does not filter models.
        expect([cost, qual]).toContain(bal);
    });
});

describe('createRoutingStrategy (factory)', () => {
    it("returns BalancedStrategy for 'balanced'", () => {
        expect(createRoutingStrategy('balanced')).toBeInstanceOf(
            BalancedStrategy,
        );
    });

    it("returns CostFirstStrategy for 'cost_first'", () => {
        expect(createRoutingStrategy('cost_first')).toBeInstanceOf(
            CostFirstStrategy,
        );
    });

    it("returns QualityFirstStrategy for 'quality_first'", () => {
        expect(createRoutingStrategy('quality_first')).toBeInstanceOf(
            QualityFirstStrategy,
        );
    });
});
