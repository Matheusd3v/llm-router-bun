// src/repositories/audit-log.repository.ts
import { sql } from 'bun';

export interface LogEntry {
    promptHash: string;
    prompt: string;
    category: string;
    confidence: number;
    source: string;
    model: string;
    costUsd: number;
    latencyMs: number;
}

/** Contract for classification log persistence */
export interface IAuditLogRepository {
    insert(entry: LogEntry): Promise<void>;
}

/** Production implementation: persists to Postgres via Bun native SQL */
export class PostgresAuditLogRepository implements IAuditLogRepository {
    async insert(entry: LogEntry): Promise<void> {
        await sql`
            INSERT INTO classification_logs
                (prompt_hash, prompt_preview, category, confidence, source, model_used, cost_usd, latency_ms)
            VALUES
                (${entry.promptHash}, ${entry.prompt.slice(0, 200)}, ${entry.category},
                 ${entry.confidence}, ${entry.source}, ${entry.model}, ${entry.costUsd}, ${entry.latencyMs})
        `;
    }
}

/** Test implementation: stores in memory without I/O */
export class InMemoryAuditLogRepository implements IAuditLogRepository {
    readonly entries: LogEntry[] = [];

    async insert(entry: LogEntry): Promise<void> {
        this.entries.push(entry);
    }
}
