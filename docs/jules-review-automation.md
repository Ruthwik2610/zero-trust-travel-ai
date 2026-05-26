# Jules Review Automation

This repo can create three review-only Jules sessions for the current Travel AI branch:

- Backend security and provider review.
- Frontend review workflow review.
- Quality and regression review.

The runner is `scripts/run_jules_code_reviews.py`.

## Secret Handling

Do not commit or paste API keys into the repo.

The Jules API key must be supplied as `JULES_API_KEY` in the local or automation environment. The runner does not read repo-local `.env` files. If a key was pasted into chat, rotate it in Jules settings before using it again.

The runner does not upload raw `.env` files. It sends only an allowlisted present/missing manifest for provider variables so Jules knows whether live checks are possible without seeing values.

For live provider testing inside Jules, add sandbox-safe values in Jules repository settings and enable them for the task. Do not use production payment, ticketing, passport, identity, or VPS credentials in Jules.

Suggested sandbox variables:

- `DUFFEL_API_TOKEN`
- `DUFFEL_API_BASE_URL`
- `RAPIDAPI_BOOKING_KEY`
- `BOOKING_CURRENCY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_WEBHOOK_SECRET`
- `OPENROUTER_API_KEY`
- `OPENROUTER_PROVIDER_ORDER`
- `TRAVEL_AI_TOKEN_SECRET`
- `TRAVEL_AI_ENCRYPTION_KEY`
- `FRONTEND_ORIGIN`
- `TRAVEL_AI_ALLOWED_ORIGINS`

## Manual Run

```bash
export JULES_API_KEY="rotated-key-from-jules-settings"
python3 scripts/run_jules_code_reviews.py --branch codex/guided-itinerary-builder
```

Dry run:

```bash
python3 scripts/run_jules_code_reviews.py --dry-run --branch codex/guided-itinerary-builder
```

## Review Boundaries

Jules is instructed to review only:

- No file modifications.
- No commits.
- No branches.
- No pull requests.
- No raw secret access.

Any findings still need human review and local verification before merge or deploy.
