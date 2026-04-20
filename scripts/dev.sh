#!/usr/bin/env bash
# Dev helper — start backend or frontend locally
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

usage() {
  echo "Usage: $0 <backend|frontend|lint>"
  exit 1
}

case "${1:-}" in
  backend)
    cd "$ROOT_DIR/backend"
    echo "Starting backend on http://127.0.0.1:8000 ..."
    uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
    ;;
  frontend)
    cd "$ROOT_DIR/frontend"
    echo "Starting frontend dev server ..."
    npm run dev
    ;;
  lint)
    echo "=== Backend lint ==="
    cd "$ROOT_DIR/backend"
    ruff check .
    ruff format --check .
    echo ""
    echo "=== Frontend lint ==="
    cd "$ROOT_DIR/frontend"
    npm run lint
    echo ""
    echo "=== Frontend build ==="
    npm run build
    echo ""
    echo "All checks passed."
    ;;
  *)
    usage
    ;;
esac
