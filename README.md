# Zero Trust Travel AI

A corporate travel operations workspace for taking a request from intake through planning, review, approval, and itinerary handoff. Travel agents work in a guided request flow; managers maintain company context and review activity. AI can help prepare options and explanations, while people retain the final decision.

## Contents

- [What is implemented](#what-is-implemented)
- [Workflow](#workflow)
- [Architecture](#architecture)
- [Run locally](#run-locally)
- [Configuration and security](#configuration-and-security)
- [Verify](#verify)
- [Current limits](#current-limits)
- [Contributing and support](#contributing-and-support)
- [License](#license)

## What is implemented

- **Request intake:** create requests manually or import travel forms and company workbooks. The queue shows pending work and missing details.
- **Guided planning:** review readiness, generate and compare flight and hotel options, select a plan, and keep the selected context visible during follow-up chat.
- **Approval and handoff:** record review states and prepare PDF or spreadsheet itinerary exports after agent review.
- **Manager workspace:** inspect traveler and company context, policy revisions, request status, and audit activity with role-specific access.
- **Privacy controls:** tokenize personal data before optional external AI calls, check outgoing payloads, and restore protected details only inside the application.
- **Operational evidence:** retain request events and expose workflow tests for the main desktop journey.

This is a travel planning and operations application. It does not issue tickets, place provider orders, collect payments, or replace a human approval process.

## Workflow

1. **Intake:** create or import a request and review the active queue.
2. **Readiness:** resolve missing details and policy concerns.
3. **Plan:** generate options, compare them, and save a selection.
4. **Review:** use request-aware chat and record the approval decision.
5. **Handoff:** export the reviewed itinerary package.

## Architecture

| Layer | Implementation |
| --- | --- |
| Web application | Next.js, React, TypeScript |
| API and workflow | FastAPI, Pydantic, Python |
| Planning | Deterministic rules with optional LLM narrative and provider-backed search |
| Privacy | Role checks, audit events, external-AI payload tokenization |

The API routes and workflow state are in `backend/app/`. The web interface is in `frontend/src/`. See [the workflow feature map](docs/workflow-feature-map.md) for the agent and manager journeys.

## Run locally

Use Python 3.11+ and Node.js compatible with `frontend/package.json`. Start from the repository root. In one terminal:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8100 --reload
```

In another terminal:

```bash
cd frontend
npm ci
NEXT_PUBLIC_TRAVEL_AI_API_BASE_URL=http://127.0.0.1:8100 npm run dev -- --port 3100
```

Open `http://127.0.0.1:3100`. The included sign-in is for local demonstration; set your own `TRAVEL_AI_DEMO_PASSWORD` and do not expose demo authentication as production sign-in.

## Configuration and security

- Keep API credentials in local environment files or a secret manager; do not commit them.
- Production mode (`TRAVEL_AI_ENV=production`) requires `TRAVEL_AI_TOKEN_SECRET`, `TRAVEL_AI_ENCRYPTION_KEY`, `TRAVEL_AI_DB_PATH`, and an allowed frontend origin (`FRONTEND_ORIGIN` or `TRAVEL_AI_ALLOWED_ORIGINS`).
- LLM, travel-provider, and email credentials are optional integrations. Review outbound payloads, supplier results, and exported itineraries before use with real traveler data.

## Verify

From the repository root after installing backend dependencies:

```bash
backend/.venv/bin/python -m pip install pytest
backend/.venv/bin/python -m pytest tests -q
cd frontend
npm test
npm run build
```

The frontend also includes Playwright journey and accessibility checks. The [developer workflow guide](docs/Travel_AI_Current_Workflows_Developer_Guide.md) describes the request lifecycle and privacy boundary.

## Current limits

- Local sign-in is a demo flow; production SSO is not provided by this repository.
- External AI and supplier results depend on separately configured services. Keep generated plans subject to human review.
- The UI supports downstream booking handoff; final bookings and payments are outside this application.

## Contributing and support

Open an issue with reproducible steps, expected behavior, and the affected workflow step. For a change, include the agent or manager journey, any privacy impact, and the checks you ran. Do not include real traveler records, credentials, or unredacted logs.

## License

No license file is currently included. Public visibility alone does not grant permission to reuse or redistribute this code; the repository owner should add an explicit license before inviting external reuse.
