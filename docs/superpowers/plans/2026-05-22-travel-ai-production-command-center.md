# Travel AI Production Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to continue this plan task-by-task. Use Context7 for current provider/API docs before changing OpenRouter, Duffel, Resend, Next.js, or FastAPI integration details.

**Goal:** Build the standalone `travel-ai/` app into the full production command center represented by `/Users/rajasekharbandreddy/Downloads/stitch_command_center_industrial_high_density_prd`.

**Architecture:** Keep the nested `travel-ai/` app as the deployable unit. Preserve existing corporate request APIs where possible, add missing traveler/policy/mail APIs, and implement all designed screens as native React screens backed by FastAPI/SQLite. Provider search informs planning only; no booking, ticketing, payment, or Duffel order creation.

**Production decisions:** DeepSeek through OpenRouter with provider order `DeepSeek` and fallbacks disabled; Duffel for flight offer search; existing Booking.com/RapidAPI path for hotel search when configured; Resend for transactional mail; no VPS deploy without explicit user approval.

---

## Milestone 0: Repo Cleanup And Baseline

- [ ] Work only in `travel-ai/`; do not stage or deploy parent DataChat files.
- [ ] Remove ignored/generated artifacts only: Python caches, local DB, `.next`, Playwright outputs.
- [ ] Unstage everything, review the current diff, and stage only production-intended files when ready.
- [ ] Keep continuity docs: `CONTEXT.md`, `docs/production-ui-acceptance-checks.md`, this plan, and route files.
- [ ] Verify baseline with `git status --short --untracked-files=all`.

## Milestone 1: Backend Production Domain

- [ ] Add Pydantic models for traveler profiles, traveler documents, loyalty programs, policy groups, policy revisions, policy activity, notification requests, email events, and Resend webhook events.
- [ ] Add SQLite persistence for travelers, policy groups, policy activity, and email events.
- [ ] Add endpoints:
  - `GET /api/travelers`
  - `GET /api/travelers/{traveler_id}`
  - `GET /api/policies`
  - `GET /api/policies/{policy_id}`
  - `GET /api/policies/{policy_id}/versions`
  - `GET /api/policies/{policy_id}/activity`
  - `POST /api/policies/{policy_id}/revisions/{revision_id}/approve`
  - `POST /api/policies/{policy_id}/revisions/{revision_id}/request-changes`
  - `POST /api/corporate/requests/{request_id}/notifications`
  - `POST /api/mail/resend/webhook`
- [ ] Keep final itinerary gated by generated plan, explicit agent review, and approval received when required.
- [ ] Ensure provider/API failures return safe user-facing messages and audit events.

## Milestone 2: Provider Wiring

- [ ] OpenRouter: call `https://openrouter.ai/api/v1/chat/completions`, set configured DeepSeek model, and send `provider: { order: ["DeepSeek"], allow_fallbacks: false }`.
- [ ] Duffel: use `/air/offer_requests`, `Duffel-Version: v2`, slices, passengers, cabin class, `return_offers=true`, and supplier timeout; map priced offers into options.
- [ ] Hotel search: keep existing Booking.com/RapidAPI provider path; if not configured, mark manual sourcing required instead of showing fake hotel inventory as live.
- [ ] Resend: send approval, document-update, and final-itinerary emails through `POST https://api.resend.com/emails`; use idempotency keys and XLSX attachments when requested.
- [ ] Persist provider request/result metadata without tokens, credentials, raw stack traces, or raw provider errors in the UI.

## Milestone 3: Frontend Shell And Routing

- [ ] Create shared command-center shell: sidebar, topbar, role-aware nav, search, notifications, profile, theme toggle.
- [ ] Apply Velocity Corporate design tokens: teal actions, coral urgency, Plus Jakarta Sans, compact cards/tables, status chips, progress rails, policy banners.
- [ ] Add routes:
  - `/dashboard`
  - `/requests/[id]`
  - `/itineraries/[id]`
  - `/travelers`
  - `/travelers/[id]`
  - `/policy`
  - `/policy/[id]`
  - `/policy/[id]/review`
  - `/policy/activity`
  - `/admin`
- [ ] Build native React components from the provided screen concepts; do not ship static HTML screenshots.

## Milestone 4: Full Screen Implementation

- [ ] Dashboard: priority board, request cards, live counts, pending approval, active planning, completed work, and new request action.
- [ ] Request Workspace: request context, communication thread, detected parameters, plan generation, policy/budget checks, approval tracking, notes, finalize/export, and notification actions.
- [ ] Itinerary Builder: budget rail, flight/hotel/transfer segments, selected offer state, policy warnings, AI optimization, save/finalize controls.
- [ ] Traveler Roster/Dossier: search, VIP/document filters, traveler profile, preferences, loyalty, document status, policy guard, recent trips, document-update email.
- [ ] Policy Center/Lifecycle: policy groups, upload context affordance, extracted rules, version comparison, impact analysis, reviewer comments, approve/request changes, activity archive, CSV/export affordance.
- [ ] Admin: live operational summary from APIs; no hardcoded demo totals.

## Milestone 5: Verification And Production Gate

- [ ] Backend tests: finalization gating, OpenRouter request shape, Duffel mapping, Resend send/idempotency/webhook handling, traveler CRUD, policy revision actions, audit redaction.
- [ ] Frontend tests: route rendering, role-aware navigation, board columns, request workspace actions, itinerary selection, traveler roster/dossier, policy lifecycle, safe errors.
- [ ] E2E flow: login -> dashboard -> new request -> provider-backed plan -> edit itinerary -> approval email -> approval received -> final itinerary -> export.
- [ ] Production build: `cd frontend && npm run build -- --webpack`.
- [ ] VPS verification only after explicit deploy approval: `/health`, `/dashboard`, `/requests`, `/travelers`, `/policy`, `/policy/activity`, `/api/corporate/admin/summary`, one provider-backed plan smoke, one Resend test-recipient smoke.

## Continuation Checkpoint

As of plan recording, implementation had started after cleanup. The index was reset, ignored artifacts were removed, and backend domain work began by adding new model classes and store methods. Continue by finishing FastAPI endpoint wiring, adding the Resend mail helper, updating frontend API/types/routes, then implementing the UI screens.

### 2026-05-22 Provider Hardening Checkpoint

- Provider audit events from `/api/agent/plan` are persisted into the admin audit log with sanitized actor output.
- Duffel direct offer search now sends the documented v2 create-offer-request shape: `Duffel-Version: v2`, gzip accept encoding, `return_offers=true`, integer `supplier_timeout`, slices, passengers, cabin class, and no order creation.
- OpenRouter chat completions now explicitly use DeepSeek provider routing with fallbacks disabled and non-streaming responses.
- Itinerary builder surfaces manual-sourcing options with a visible review banner so unavailable provider inventory cannot look finalized.
- Verified after this slice: backend pytest, frontend Vitest, and `npm run build -- --webpack`.

### 2026-05-22 Notification UI Checkpoint

- Request workspace approval-email action now shows a safe manual-follow-up state if the Resend/API call fails.
- Raw provider/configuration error text is not surfaced in the UI.
- Verified after this slice: backend pytest, frontend Vitest, and `npm run build -- --webpack`.

## Implementation Style

Follow the user's requested Karpathy-style discipline: keep the system simple, readable, and easy to debug; avoid speculative abstractions; prefer deterministic rules for policy/budget/visa decisions; use LLM output for narrative drafts, not core authority; keep each change inspectable and backed by tests.
