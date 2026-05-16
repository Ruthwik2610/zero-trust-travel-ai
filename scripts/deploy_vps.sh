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

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "cd '${REMOTE_DIR}/backend' && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "cd '${REMOTE_DIR}/frontend' && if [ -f package-lock.json ]; then npm ci; else npm install; fi && TRAVEL_API_INTERNAL_URL=http://127.0.0.1:8100 npm run build"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "systemctl daemon-reload && systemctl restart '${BACKEND_SERVICE}' && systemctl restart '${FRONTEND_SERVICE}'"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "systemctl status '${BACKEND_SERVICE}' --no-pager"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "systemctl status '${FRONTEND_SERVICE}' --no-pager"

ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "curl -fsS http://127.0.0.1:8100/health"
ssh -F "${SSH_CONFIG}" "${SSH_ALIAS}" "curl -fsS -I http://127.0.0.1:3100/travel-ai/"

echo "Deploy complete."
