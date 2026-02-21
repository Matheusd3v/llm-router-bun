// Seeds Qdrant with initial examples per category
// Run: bun run scripts/seed-classifier.ts

import { QdrantClient } from '@qdrant/js-client-rest';
import { embeddingService } from '../src/services/embedding.service';
import { COLLECTION_NAME, VECTOR_DIM } from '../src/constants';
import type { TaskCategory } from '../src/types';

const EXAMPLES: Record<TaskCategory, string[]> = {
    simple: [
        'What is a REST API?',
        'What is the capital of France?',
        'Translate this text to Spanish',
        'How much is 1 BTC today?',
        'What does idempotency mean?',
        'Summarize this paragraph in one sentence',
        'What is the difference between HTTP and HTTPS?',
        'What is a JWT token?',
        'What does SOLID stand for?',
        'What is 15% of 340?',
    ],
    code: [
        'Implement a NestJS service with auto retry',
        'Create a Prisma migration to add a composite index',
        'I have a bug in this async function, can you help?',
        'Refactor this code to use the repository pattern',
        'Write a multi-stage Dockerfile for Node.js',
        'How do I implement cursor-based pagination in TypeScript?',
        'Fix this TypeScript error: Type X is not assignable to Y',
        'I need to create a webhook handler in Elysia',
        'How do I configure jest to test this module?',
        'Implement debounce in TypeScript without a library',
        'What is the best way to implement retry with exponential backoff in Bun?',
        'Create a decorator to log method execution time',
    ],
    reasoning: [
        'What is the best architecture for a high-frequency trading system?',
        'Compare event sourcing vs CQRS for my use case',
        'What are the tradeoffs of using Kafka vs RabbitMQ in fintech?',
        'Why does my system have high latency during load spikes?',
        'How should I structure my microservices to scale?',
        'Analyze the risks of this investment strategy',
        'Does the Saga pattern make sense here or should I use Two-Phase Commit?',
        'How do I balance consistency and availability in this distributed system?',
        'When is GraphQL worth using instead of REST?',
        'What is the best blue-green vs canary deploy strategy for this service?',
    ],
    data_analysis: [
        'Analyze this JSON and tell me the data pattern',
        'Group these records by date and calculate the average',
        'Parse this CSV and find anomalies',
        'What is the most efficient SQL query for this 3-table JOIN?',
        'What do these error logs have in common?',
        'How do I create a composite index to optimize this query?',
        'Filter this array of objects and return only the valid ones',
        'Analyze this webhook payload and extract the relevant fields',
        'What is the fastest Postgres query for this sales report?',
        'Transform this XML to JSON while preserving the hierarchy',
    ],
    creative: [
        'Write a professional README for this project',
        'Create a clear PR description for this diff',
        'Help me write a technical email to the team',
        'Write the documentation for this endpoint in OpenAPI',
        'Create a CHANGELOG for this version based on the commits',
        'Write a job description for a senior backend engineer',
        'Help me put together a technical presentation on microservices',
        'Create an onboarding guide for new team developers',
    ],
};

async function seed() {
    const qdrant = new QdrantClient({
        url: Bun.env.QDRANT_URL ?? 'http://localhost:6333',
    });

    // Warmup: load ONNX model before generating embeddings
    await embeddingService.warmup();

    // Recreate the collection
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(
        (c) => c.name === COLLECTION_NAME,
    );
    if (exists) {
        await qdrant.deleteCollection(COLLECTION_NAME);
        console.log(`[Seed] Existing collection removed`);
    }

    await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: VECTOR_DIM, distance: 'Cosine' },
    });
    console.log(`[Seed] Collection '${COLLECTION_NAME}' created`);

    let id = 1;
    let total = 0;

    for (const [category, examples] of Object.entries(EXAMPLES) as [
        TaskCategory,
        string[],
    ][]) {
        console.log(
            `[Seed] Processing category: ${category} (${examples.length} examples)`,
        );

        // Generate all embeddings for the category concurrently
        const vectors = await Promise.all(
            examples.map((text) => embeddingService.embed(text)),
        );

        // Batch upsert: one HTTP call per category instead of one per example
        await qdrant.upsert(COLLECTION_NAME, {
            points: examples.map((text, i) => ({
                id: id + i,
                vector: vectors[i],
                payload: {
                    category,
                    text,
                    source: 'seed',
                    addedAt: new Date().toISOString(),
                },
            })),
        });

        id += examples.length;
        total += examples.length;
    }

    console.log(
        `✅ Seed complete: ${total} examples inserted across ${id - 1} points`,
    );
    process.exit(0);
}

seed().catch((err) => {
    console.error('[Seed] Error:', err);
    process.exit(1);
});
