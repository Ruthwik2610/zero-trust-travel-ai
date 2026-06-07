#!/usr/bin/env bash
set -euo pipefail

SSH_ALIAS="${SSH_ALIAS:-datachat-vps}"
REMOTE_DIR="${REMOTE_DIR:-/opt/zero-trust-travel-ai}"
SSH_CONFIG="${SSH_CONFIG:-/Users/rajasekharbandreddy/.ssh/config}"
BACKEND_SERVICE="${BACKEND_SERVICE:-travel-ai-backend.service}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-travel-ai-frontend.service}"
SERVICE_USER="${SERVICE_USER:-travelai}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Deploying Zero Trust Travel AI from ${APP_DIR} to ${SSH_ALIAS}:${REMOTE_DIR}"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "id -u '${SERVICE_USER}' >/dev/null 2>&1 || useradd --system --home '${REMOTE_DIR}' --shell /usr/sbin/nologin '${SERVICE_USER}'; mkdir -p '${REMOTE_DIR}'"

rsync -az --delete --stats \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.venv/' \
  --exclude '.venv' \
  --exclude 'node_modules/' \
  --exclude 'node_modules' \
  --exclude '.next/' \
  --exclude 'frontend/public/videos/' \
  --exclude 'frontend/public/videos' \
  --exclude 'dist/' \
  --exclude 'build/' \
  --exclude 'out/' \
  --exclude '.cache/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '*.tsbuildinfo' \
  --exclude 'test-results/' \
  --exclude 'test_forms/' \
  --exclude 'test_forms' \
  --exclude 'playwright-report/' \
  --exclude '*.db' \
  --exclude '*.sqlite' \
  --exclude '*.sqlite3' \
  --exclude '*.duckdb' \
  --exclude 'data/' \
  --exclude 'data' \
  --exclude 'logs/' \
  -e "ssh -F ${SSH_CONFIG}" \
  "${APP_DIR}/" "${SSH_ALIAS}:${REMOTE_DIR}/"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "cd '${REMOTE_DIR}/backend' && if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi && .venv/bin/python -m pip install -r requirements.txt"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "cd '${REMOTE_DIR}/frontend' && if [ -f package-lock.json ]; then npm ci; else npm install; fi && TRAVEL_AI_API_INTERNAL_URL=http://127.0.0.1:8100 npm run build -- --webpack"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "chown -R '${SERVICE_USER}:${SERVICE_USER}' '${REMOTE_DIR}'"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "cp '${REMOTE_DIR}/deploy/systemd/travel-ai-backend.service' /etc/systemd/system/travel-ai-backend.service && cp '${REMOTE_DIR}/deploy/systemd/travel-ai-frontend.service' /etc/systemd/system/travel-ai-frontend.service && systemctl daemon-reload && systemctl restart '${BACKEND_SERVICE}' && systemctl restart '${FRONTEND_SERVICE}'"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "systemctl status '${BACKEND_SERVICE}' --no-pager"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "systemctl status '${FRONTEND_SERVICE}' --no-pager"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "for i in 1 2 3 4 5 6 7 8 9 10; do if curl -fsS http://127.0.0.1:8100/health; then exit 0; fi; sleep 2; done; exit 1"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "for i in 1 2 3 4 5 6 7 8 9 10; do if curl -fsS -I http://127.0.0.1:3100/; then exit 0; fi; sleep 2; done; exit 1"

if [ "${RUN_E2E_SMOKE:-0}" = "1" ]; then
  echo "Running E2E Smoke Tests..."
  cd "${APP_DIR}/frontend"
  PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:3200}" npm run test:e2e
fi

echo "Deploy complete."
