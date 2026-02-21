CREATE TABLE IF NOT EXISTS classification_logs (
  id              BIGSERIAL PRIMARY KEY,
  prompt_hash     TEXT,
  prompt_preview  TEXT,
  category        TEXT        NOT NULL,
  confidence      FLOAT,
  source          TEXT,       -- 'cache' | 'semantic' | 'llm'
  model_used      TEXT,
  cost_usd        FLOAT,
  latency_ms      INT,
  corrected_to    TEXT,       -- preenchido via /feedback
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_hash       ON classification_logs (prompt_hash);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON classification_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_category   ON classification_logs (category);
CREATE INDEX IF NOT EXISTS idx_logs_model      ON classification_logs (model_used);
