// src/strategies/balanced.strategy.ts
import type {
    IRoutingStrategy,
    RoutingContext,
} from './routing-strategy.interface';
import type { ModelProfile, TaskCategory } from '../types';

const LATENCY_SCORE: Record<ModelProfile['latencyTier'], number> = {
    fast: 3,
    medium: 2,
    slow: 1,
};

/** Balanced [quality 50%, cost 30%, latency 20%] */
export class BalancedStrategy implements IRoutingStrategy {
    select(
        candidates: ModelProfile[],
        context: RoutingContext,
    ): ModelProfile[] {
        return [...candidates].sort(
            (a, b) =>
                this.score(b, context.category) -
                this.score(a, context.category),
        );
    }

    private score(model: ModelProfile, category: TaskCategory): number {
        const quality = model.qualityScore[category];
        const costScore = 10 - Math.min(model.costPer1MInput * 5, 10);
        return (
            quality * 0.5 +
            costScore * 0.3 +
            LATENCY_SCORE[model.latencyTier] * 0.2
        );
    }
}
