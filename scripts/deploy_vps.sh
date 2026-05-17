#!/usr/bin/env bash
set -euo pipefail

SSH_ALIAS="${SSH_ALIAS:-datachat-vps}"
REMOTE_DIR="${REMOTE_DIR:-/opt/zero-trust-travel-ai}"
SSH_CONFIG="${SSH_CONFIG:-/Users/rajasekharbandreddy/.ssh/config}"
BACKEND_SERVICE="${BACKEND_SERVICE:-travel-ai-backend.service}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-travel-ai-frontend.service}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Deploying Zero Trust Travel AI from ${APP_DIR} to ${SSH_ALIAS}:${REMOTE_DIR}"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "mkdir -p '${REMOTE_DIR}'"

rsync -az --delete --stats \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.venv/' \
  --exclude '.venv' \
  --exclude 'node_modules/' \
  --exclude 'node_modules' \
  --exclude '.next/' \
  --exclude 'dist/' \
  --exclude 'build/' \
  --exclude 'out/' \
  --exclude '.cache/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '*.db' \
  --exclude '*.sqlite' \
  --exclude '*.sqlite3' \
  --exclude '*.duckdb' \
  --exclude 'data/' \
  --exclude 'data' \
  --exclude 'logs/' \
  -e "ssh -F ${SSH_CONFIG}" \
  "${APP_DIR}/" "${SSH_ALIAS}:${REMOTE_DIR}/"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "cd '${REMOTE_DIR}/frontend' && if [ -f package-lock.json ]; then npm ci; else npm install; fi && TRAVEL_API_INTERNAL_URL=http://127.0.0.1:8000 npm run build"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "cp '${REMOTE_DIR}/deploy/systemd/travel-ai-frontend.service' /etc/systemd/system/travel-ai-frontend.service && systemctl daemon-reload && systemctl restart datachat-backend.service && systemctl restart '${FRONTEND_SERVICE}'"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "systemctl status datachat-backend.service --no-pager"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "systemctl status '${FRONTEND_SERVICE}' --no-pager"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "for i in 1 2 3 4 5 6 7 8 9 10; do if curl -fsS http://127.0.0.1:8000/health; then exit 0; fi; sleep 2; done; exit 1"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "for i in 1 2 3 4 5 6 7 8 9 10; do if curl -fsS -I http://127.0.0.1:3100/; then exit 0; fi; sleep 2; done; exit 1"

echo "Deploy complete."
