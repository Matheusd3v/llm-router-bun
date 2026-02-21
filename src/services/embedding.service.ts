import { pipeline, env } from '@huggingface/transformers';

// Configure local cache to avoid re-downloading the model on every deploy
env.allowLocalModels = true;
env.cacheDir = Bun.env.MODELS_CACHE_DIR ?? './models';

// Feature-extraction pipeline type
type FeaturePipeline = Awaited<
    ReturnType<typeof pipeline<'feature-extraction'>>
>;

export class EmbeddingService {
    private pipe: FeaturePipeline | null = null;
    private readonly modelName =
        Bun.env.HF_MODEL_NAME ?? 'Xenova/multilingual-e5-small';

    private async getPipeline(): Promise<FeaturePipeline> {
        if (!this.pipe) {
            console.log(`[Embedding] Loading ONNX model: ${this.modelName}`);
            // `as unknown as` required: @huggingface/transformers generates a
            // union of overloads too large for tsc to represent (TS2590)
            this.pipe = (await pipeline('feature-extraction', this.modelName, {
                dtype: 'q8', // int8 quantization: ~60MB RAM, ~12ms/embed, minimal quality loss
            })) as unknown as FeaturePipeline;
            console.log('[Embedding] Model ready ✓');
        }
        return this.pipe;
    }

    async embed(text: string): Promise<number[]> {
        const extractor = await this.getPipeline();

        // Required prefix for multilingual-e5 (improves retrieval quality)
        const output = await extractor(`query: ${text}`, {
            pooling: 'mean',
            normalize: true,
        });

        return Array.from(output.data as Float32Array);
    }

    // Pre-warms the pipeline at startup — eliminates cold start on the first request
    async warmup(): Promise<void> {
        console.log('[Embedding] Warming up pipeline...');
        await this.embed('warmup');
        console.log('[Embedding] Pipeline warm ✓');
    }

    // Bun.hash: ~3x faster than crypto.createHash for short cache keys
    hashPrompt(prompt: string): string {
        return String(Bun.hash(prompt.trim().toLowerCase()));
    }

    estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }
}

// Singleton: mesmo pipeline reutilizado em todo o processo Bun
export const embeddingService = new EmbeddingService();
