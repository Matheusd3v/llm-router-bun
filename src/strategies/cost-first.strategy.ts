// src/strategies/cost-first.strategy.ts
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

/** Cost-first [quality 20%, cost 70%, latency 10%] */
export class CostFirstStrategy implements IRoutingStrategy {
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
            quality * 0.2 +
            costScore * 0.7 +
            LATENCY_SCORE[model.latencyTier] * 0.1
        );
    }
}
