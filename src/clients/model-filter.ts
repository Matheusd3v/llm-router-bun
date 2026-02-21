// src/clients/model-filter.ts
// Shared filtering logic used by every provider client.
// Centralised here so the filtering behaviour is tested and changed in one place.
import type { ModelProfile, PrivacySensitivity } from '../types';

export function filterCandidates(
    models: ModelProfile[],
    sensitivity: PrivacySensitivity,
    minContextWindow: number,
    maxCostPer1M?: number,
): ModelProfile[] {
    const requiresSensitive =
        sensitivity === 'sensitive' || sensitivity === 'internal';

    return models.filter(
        (m) =>
            (!requiresSensitive || m.supportsSensitive) &&
            m.contextWindow >= minContextWindow &&
            (!maxCostPer1M || m.costPer1MInput <= maxCostPer1M),
    );
}
