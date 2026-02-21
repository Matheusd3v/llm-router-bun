// src/strategies/routing-strategy.interface.ts
import type { ModelProfile, PrivacySensitivity, TaskCategory } from '../types';

/** Context passed to each strategy so it can score the models */
export interface RoutingContext {
    category: TaskCategory;
    sensitivity: PrivacySensitivity;
    requireContextWindow: number;
    maxCostPer1M?: number;
}

/** Contract that every routing strategy must implement */
export interface IRoutingStrategy {
    /**
     * Sorts `candidates` from most to least suitable for the given `context`.
     * May also filter additional candidates if the strategy requires it.
     */
    select(candidates: ModelProfile[], context: RoutingContext): ModelProfile[];
}
