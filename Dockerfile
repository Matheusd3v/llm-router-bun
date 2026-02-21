FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

# Pre-download ONNX model at build time so the first request is fast
ARG HF_MODEL_NAME=Xenova/multilingual-e5-small
ENV HF_MODEL_NAME=${HF_MODEL_NAME}
ENV MODELS_CACHE_DIR=/app/models
RUN mkdir -p /app/models

EXPOSE 3000

CMD ["bun", "src/index.ts"]
