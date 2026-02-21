#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="llm-router"

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[deploy]${NC} $*"; }
error()   { echo -e "${RED}[deploy]${NC} $*" >&2; exit 1; }

# ── helpers ───────────────────────────────────────────────────────────────────
apply() { info "Applying $1..."; kubectl apply -f "$SCRIPT_DIR/$1"; }

wait_deploy() {
  info "Waiting for deployment/$1 to be ready..."
  kubectl rollout status deployment/"$1" -n "$NAMESPACE" --timeout=120s
}

wait_statefulset() {
  info "Waiting for statefulset/$1 to be ready..."
  kubectl rollout status statefulset/"$1" -n "$NAMESPACE" --timeout=120s
}

# ── preflight ─────────────────────────────────────────────────────────────────
command -v kubectl &>/dev/null || error "kubectl not found in PATH"

SECRET_FILE="$SCRIPT_DIR/secret.yaml"
if [[ ! -f "$SECRET_FILE" ]]; then
  error "secret.yaml not found. Copy secret.yaml.example and fill in the API keys."
fi

# Warn if any API key placeholder is still empty
if grep -q '""' "$SECRET_FILE"; then
  warn "One or more API keys in secret.yaml appear to be empty."
  warn "Continue anyway? [y/N] "
  read -r confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

# ── deploy ────────────────────────────────────────────────────────────────────
info "=== Step 1/6: Namespace ==="
apply namespace.yaml

info "=== Step 2/6: Infra (Qdrant, Redis, Postgres) ==="
apply infra/qdrant-statefulset.yaml
apply infra/redis-deployment.yaml
apply infra/postgres-statefulset.yaml

wait_statefulset qdrant
wait_deploy      redis
wait_statefulset postgres

info "=== Step 3/6: Secrets & ConfigMap ==="
apply secret.yaml
apply configmap.yaml

info "=== Step 4/6: Application ==="
apply deployment.yaml
apply service.yaml
apply hpa.yaml

wait_deploy llm-router

info "=== Step 5/6: DB migration ==="
kubectl run llm-router-migrate \
  --rm --attach --restart=Never \
  -n "$NAMESPACE" \
  --image=postgres:16-alpine \
  --env="PGPASSWORD=$(kubectl get secret llm-router-secrets -n "$NAMESPACE" \
      -o jsonpath='{.data.DB_PASSWORD}' | base64 -d)" \
  -- psql \
    -h postgres \
    -U router \
    llm_router \
    -c "$(cat "$SCRIPT_DIR/../migrations/001_create_classification_logs.sql")"

info "=== Step 6/6: Seed classifier ==="
kubectl exec -n "$NAMESPACE" deploy/llm-router \
  -- bun scripts/seed-classifier.ts

info "=== Done! ==="
kubectl get pods -n "$NAMESPACE"
