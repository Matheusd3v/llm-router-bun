// src/strategies/index.ts
import type { RoutingStrategy } from '../types';
import type { IRoutingStrategy } from './routing-strategy.interface';
import { BalancedStrategy } from './balanced.strategy';
import { CostFirstStrategy } from './cost-first.strategy';
import { QualityFirstStrategy } from './quality-first.strategy';

export { BalancedStrategy } from './balanced.strategy';
export { CostFirstStrategy } from './cost-first.strategy';
export { QualityFirstStrategy } from './quality-first.strategy';
export type {
    IRoutingStrategy,
    RoutingContext,
} from './routing-strategy.interface';

/** Factory: resolves the correct strategy from the routing option name */
export function createRoutingStrategy(
    strategy: RoutingStrategy,
): IRoutingStrategy {
    switch (strategy) {
        case 'cost_first':
            return new CostFirstStrategy();
        case 'quality_first':
            return new QualityFirstStrategy();
        case 'balanced':
        default:
            return new BalancedStrategy();
    }
}
