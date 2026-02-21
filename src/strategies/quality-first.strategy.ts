// src/strategies/quality-first.strategy.ts
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

/** Quality-first [quality 80%, cost 10%, latency 10%] */
export class QualityFirstStrategy implements IRoutingStrategy {
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
            quality * 0.8 +
            costScore * 0.1 +
            LATENCY_SCORE[model.latencyTier] * 0.1
        );
    }
}
