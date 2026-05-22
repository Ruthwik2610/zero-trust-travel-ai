# Corporate Travel MVP Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Corporate Travel Planning Assistant work as a full MVP operations layer for agents: form/Excel intake, structured AI planning, editable review, approval-status tracking, final itinerary generation, export, and admin operations dashboard.

**Architecture:** Preserve the existing FastAPI + SQLite backend and Next frontend. Keep Admin responsible for uploads, policy/client data, and dashboard; keep Travel Agent responsible for request creation, plan generation, editing, approval-status tracking, final itinerary generation, and export. Do not add booking, payments, or live ticketing APIs.

**Tech Stack:** FastAPI, Pydantic, SQLite, openpyxl, Next 16, React 19, Vitest, Pytest, Playwright.

---

### Task 1: Backend MVP Lifecycle Contract

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/agent.py`
- Modify: `backend/app/store.py`
- Test: `tests/test_corporate_backend_api.py`

- [ ] Add missing MVP form fields to the corporate models: phone, approval manager email, employee level, meeting location, flexible dates, flight preference, preferred hotel area, hotel star rating, past hotel preference, airport transfer needed, and richer budget/special request notes.
- [ ] Add approval tracking as request data, not an admin approval workflow: `Not Required`, `Required`, `Received`, `Rejected`.
- [ ] Add an agent-review gate for final itinerary generation/finalization. Finalization must fail unless a generated plan exists and the agent explicitly marks the plan reviewed.
- [ ] Add a request update endpoint so agents can resolve missing information without creating a copied request.
- [ ] Expand Excel import/template/export to include the MVP fields from the product design.
- [ ] Expand admin summary metrics for missing-info, visa issues, approval-required, finalized itinerary count, and simple average handling time.
- [ ] Write failing tests first for lifecycle gating, request update, approval-status tracking, and Excel field round-trip; then implement the minimum backend changes.
- [ ] Verify: `backend/.venv/bin/python -m pytest tests/test_corporate_backend_api.py -q`.

### Task 2: Frontend Agent/Admin MVP Flow

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/TravelAppScreens.tsx`
- Modify: `frontend/src/components/__tests__/TravelApp.test.tsx`
- Modify: `frontend/src/lib/__tests__/api.test.ts`
- Modify: `frontend/tests/e2e/travel-ui.spec.ts`
- Remove or repurpose: `frontend/src/app/intake/page.tsx`

- [ ] Remove the Research role from login/navigation. Keep only Agent and Admin.
- [ ] Replace sample queue filler and fake counts with live request data and real empty/error states.
- [ ] Keep a Travel Request Form in the Agent workflow for manual request creation.
- [ ] Make Request Detail the main working surface: original request, AI summary, readiness, budget/policy, three plan options, missing information, customer message draft, final itinerary preview, and side chat panel.
- [ ] Make AI output editable before saving.
- [ ] Add approval-status controls for agent tracking only: `Not Required`, `Required`, `Received`, `Rejected`.
- [ ] Add a visible “Generate Final Itinerary” action that sends explicit agent review before finalizing.
- [ ] Add download/export action after final itinerary is generated.
- [ ] Remove or hide every visible control that does not work.
- [ ] Update unit and e2e tests for the current MVP flow.
- [ ] Verify: `npm test` from `frontend/`.

### Task 3: End-to-End Verification

**Files:**
- Modify only if needed: deploy/config/test files.

- [ ] Run backend corporate tests.
- [ ] Run frontend unit tests.
- [ ] Build frontend with `npm run build -- --webpack` if Turbopack sandbox issues appear, otherwise `npm run build`.
- [ ] Start backend and frontend locally.
- [ ] Use browser verification against login, agent dashboard, request creation, plan generation, final itinerary generation/export visibility, and admin dashboard.
- [ ] Run Playwright e2e if local browser dependencies are available.
