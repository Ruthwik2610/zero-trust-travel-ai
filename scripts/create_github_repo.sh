#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="${REPO_NAME:-zero-trust-travel-ai}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is not installed or not on PATH." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI auth is not valid. Run 'gh auth login' or refresh the token, then retry." >&2
  gh auth status || true
  exit 1
fi

gh repo create "${REPO_NAME}" --private --source . --remote origin --push
