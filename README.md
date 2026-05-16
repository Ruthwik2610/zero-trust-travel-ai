# Zero Trust Travel AI

Separate travel AI application scaffold for packaging, GitHub setup, and VPS deployment. This directory is intentionally independent from the existing data analysis chatbot app.

## App Overview

Zero Trust Travel AI is expected to run as two separate services:

- Backend API on port `8100`
- Frontend web app on port `3100`

Suggested VPS layout:

- Remote app path: `/opt/zero-trust-travel-ai/`
- Backend service: `travel-ai-backend.service`
- Frontend service: `travel-ai-frontend.service`
- Optional nginx route: `/travel-ai/`

## Local Development

Use the commands that match the app code once the backend and frontend packages are added.

```bash
# backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8100 --reload

# frontend
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 3100
```

If the codebase uses different backend or frontend entrypoints, update the systemd service examples before deployment.

## Environment Variables

Do not commit `.env` files. Create environment files directly on the VPS and local machine as needed.

Expected backend variables:

- `TRAVEL_AI_ENV`
- `TRAVEL_AI_HOST`
- `TRAVEL_AI_PORT`
- `TRAVEL_AI_DATABASE_URL`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_PROVIDER_ORDER`
- `AMADEUS_CLIENT_ID`
- `AMADEUS_CLIENT_SECRET`
- `AMADEUS_BASE_URL`
- `FRONTEND_ORIGIN`

Expected frontend variables:

- `NEXT_PUBLIC_TRAVEL_AI_API_BASE_URL`
- `NEXT_PUBLIC_TRAVEL_AI_APP_BASE_PATH`

## GitHub Repository

Local `gh auth status` has reported invalid tokens in this environment. Do not assume repository creation will work until GitHub CLI auth is fixed.

After authentication is repaired, create and push the private repository from inside `travel-ai/`:

```bash
gh auth status
./scripts/create_github_repo.sh
```

The script runs:

```bash
gh repo create zero-trust-travel-ai --private --source . --remote origin --push
```

## VPS Deploy Overview

The deployment script copies this app to `/opt/zero-trust-travel-ai/` using rsync while excluding secrets, dependency folders, caches, and build outputs. It then installs frontend dependencies when needed, builds the frontend, restarts both services, and runs basic health checks.

```bash
./scripts/deploy_vps.sh
```

Before first deploy on the VPS:

1. Create `/opt/zero-trust-travel-ai/`.
2. Create backend and frontend environment files on the VPS only.
3. Copy or adapt the service examples from `deploy/systemd/`.
4. Copy or adapt the nginx example from `deploy/nginx/travel-ai.conf`.
5. Run `systemctl daemon-reload`.
6. Enable services with `systemctl enable travel-ai-backend.service travel-ai-frontend.service`.

The nginx example is inert until manually installed into nginx. It does not overwrite the existing datachat nginx config by itself.
