# Travel AI Current Workflows Developer Guide

Generated from the local standalone `travel-ai` codebase on 2026-05-25.

## Scope

This guide documents implemented workflows in `backend/app`, `frontend/src`, `tests`, and current repo docs. It does not claim live GDS ticketing, SignalR streaming, WhatsApp intake, production SSO, or SendGrid because those are not implemented in this codebase.

## Main lifecycle

```mermaid
flowchart LR
  A[Intake] --> B[Validate]
  B --> C[Plan]
  C --> D[Agent Review]
  D --> E[Approval]
  E --> F[Finalize]
  F --> G[Export / Email Evidence]
```

## Corporate automated pipeline

```mermaid
sequenceDiagram
  participant Source as Upload / Inbound Email / Manual Request
  participant API as FastAPI main.py
  participant Store as TravelStore
  participant Planner as agent.py
  participant Privacy as privacy_gateway.py
  participant Mail as Resend mailer
  Source->>API: Create or import CorporateTravelRequest
  API->>Store: Save request and audit pipeline.started
  API->>API: Check itinerary-critical missing fields
  alt Missing fields
    API->>Store: Save Pending Details plan
  else Complete request
    API->>Planner: generate_corporate_plan
    Planner->>Privacy: Tokenize and leak-check external AI payload
    Privacy-->>Planner: Safe anonymized payload
    Planner->>Planner: Deterministic planning + optional LLM narrative
    Planner-->>API: CorporateTravelPlan
    API->>Store: Save Processing request
    API->>Mail: Send three option PDFs
    Mail-->>Store: EmailEvent
  end
```

## POPIA external AI boundary

```mermaid
sequenceDiagram
  participant Planner as agent.py
  participant Gateway as privacy_gateway.py
  participant LLM as External LLM
  Planner->>Gateway: Payload with request, policy, history, visa, base plan
  Gateway->>Gateway: Collect keyed PII and regex PII
  Gateway->>Gateway: Replace raw values with token hashes
  Gateway->>Gateway: assert_no_raw_pii
  Gateway-->>Planner: Anonymized payload + token map
  Planner->>LLM: Tokenized strict JSON request
  LLM-->>Planner: Tokenized JSON plan
  Planner->>Gateway: Rehydrate values
  Planner->>Planner: Validate model and restore deterministic facts
```

## Key files

| Area | Files |
| --- | --- |
| Routes and gates | `backend/app/main.py` |
| Planning engine | `backend/app/agent.py` |
| Privacy gateway | `backend/app/privacy_gateway.py` |
| Security and redaction | `backend/app/security.py` |
| Persistence and audit | `backend/app/store.py` |
| Mail and webhooks | `backend/app/mailer.py`, `backend/app/main.py` |
| Frontend command center | `frontend/src/components/TravelAppScreens.tsx` |
| API mapping | `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts` |
| Workflow tests | `tests/test_backend_api.py`, `tests/test_backend_security.py`, `tests/test_corporate_backend_api.py`, `frontend/tests/e2e/travel-ui.spec.ts` |

See the PDF for the detailed tables, sequence explanations, screenshots, and implemented-versus-gap analysis.
