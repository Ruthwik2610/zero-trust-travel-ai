# Travel AI User Guide

## Overview

Travel AI is an enterprise travel operations workspace for request intake, policy-aware itinerary planning, recovery handling, manager approvals, and final itinerary export.

The product is split into two role-based workspaces:

- Travel Agent: manages daily requests, plans itineraries, handles recovery issues, sends approvals, and exports reviewed itineraries.
- Application Admin: imports company context and can switch into the agent workspace when needed.

The guided itinerary builder replaces separate readiness, planning, and chat tabs with one workflow. The agent works through missing information, flights, hotel, itinerary review, and approval/export in a single request workspace.

## Sign In

Use the role selector on the sign-in screen.

| Workspace | Username | Password |
| --- | --- | --- |
| Travel Agent | `agent` | `travel-demo-2026` |
| Application Admin | `admin` | `travel-demo-2026` |

The agent account opens only the agent workspace. The admin account opens the manager workspace and can switch into Travel Agent from the top bar.

## Agent Workflow

### 1. Open Travel Operations

After sign-in, the agent lands in Travel Operations. This is the daily request queue.

Use this screen to:

- Review active, pending, needs-details, approval, finalized, and critical requests.
- Search by traveler, company, route, or request details.
- Upload travel forms into the queue.
- Create a manual request from email, phone, or chat intake.
- Open a request into the guided itinerary builder.

### 2. Upload Travel Forms

The agent can import PDF travel forms. Uploaded forms create pending travel requests.

Local demo fixture files are ignored by Git. Place files like these under `docs/synthetic-forms/` when testing uploads:

- `docs/synthetic-forms/agent-upload-vikram-johannesburg.pdf`
- `docs/synthetic-forms/agent-upload-missing-details.pdf`

Expected result: the new request appears in the pending queue and can be opened for planning.

### 3. Create A Manual Request

Use New Request when the request arrives through a call, email, or message instead of a file.

Capture the traveler, company, origin, destination, dates, budget, purpose, preferences, and special requests. After saving, the request appears in the same queue as uploaded requests.

### 4. Open The Guided Builder

Open a request row to enter the guided itinerary builder.

The builder has five steps:

- Missing Info: verify traveler readiness, visa or document gaps, customer messages, and internal notes.
- Flights: generate and compare flight options with provider source, price, route, policy notes, and selection state.
- Hotel: choose a hotel after the flight is selected, using stay cards with images, location, room details, and policy notes.
- Itinerary: review the combined flight, hotel, readiness, and traveler context.
- Approval and Export: send approval, record approval status, generate the final itinerary, and download the export.

Each step has one inline AI command box. Use it for targeted requests such as comparing options against budget, explaining a blocker, or drafting a traveler update. The helper panel can explain the current step, but it only changes itinerary state when the agent applies the suggestion.

### 5. Generate And Select Options

Click Generate Options to create flight and hotel recommendations.

For flights, review:

- Airline and provider source.
- Total amount and currency.
- Route, departure, arrival, and layover notes.
- Policy fit and approval requirements.
- Selected state.

After selecting a flight, move to Hotel. The selected flight is included in hotel and itinerary context.

For hotels, review:

- Hotel name and provider source.
- Total stay amount and currency.
- Star rating, address, check-in, check-out, nights, room count, and guest count.
- Image and notes.
- Selected state.

After selecting a hotel, move to Itinerary.

### 6. Review, Approve, And Export

Use the Itinerary step to confirm the plan is ready for approval. Then move to Approval and Export.

In Approval and Export:

- Send the approval request.
- Set the approval status when a response is received.
- Save edits.
- Generate the final itinerary.
- Download the export workbook.

The export is the reviewed itinerary handoff. The screen does not claim ticketing or hotel booking.

## Critical Issue Recovery

When a request has a critical issue, such as a flight cancellation, the agent can mark the issue from the queue.

Expected behavior:

- The request opens directly on the Flights step.
- The guide copy focuses on recovery.
- Commands include the critical issue, selected flight, selected hotel, active step, and recovery mode.
- Recovery guidance should focus on same-origin alternative flights, hotel date adjustments, traveler updates, and cancellation tasks.

The old separate recovery chat should not appear in the request workspace.

## Admin Workflow

### 1. Open Application Admin

The admin workspace manages company data and governance.

Use this screen to:

- Review request and readiness metrics.
- Import company traveler workbooks.
- Import company policy PDFs.
- Confirm company pipeline readiness.
- Confirm the agent workspace receives company context after uploads.

### 2. Import Company Workbook

Use Download Template when a fresh structure is needed. Then upload the company workbook.

Local demo fixture files are ignored by Git. Place the workbook under `docs/synthetic-forms/` when testing:

- `docs/synthetic-forms/manager-company-context.xlsx`

Expected result: the import status shows processed rows, employee profiles, skipped rows, and created request IDs where applicable.

### 3. Import Company Policy PDF

Upload the company policy PDF in the admin workspace.

Local demo fixture files are ignored by Git. Place the policy PDF under `docs/synthetic-forms/` when testing:

- `docs/synthetic-forms/manager-company-policy.pdf`

Expected result: the company pipeline card shows policy uploaded, and planning/recovery can use the policy context.

### 4. Confirm Agent Handoff

After the manager uploads the workbook and policy PDF, switch to Travel Agent and confirm the uploaded company request appears in the queue.

Expected result: the agent can search for the traveler or company and continue planning with the company context already applied.

## Review Checklist

Use this checklist before presenting the workflow:

- Agent can sign in with `agent` / `travel-demo-2026`.
- Agent cannot access manager-only screens.
- Admin can sign in with `admin` / `travel-demo-2026`.
- Admin can upload the workbook and policy PDF.
- Agent receives the uploaded company request after the manager import.
- Uploaded agent forms create pending requests.
- The request workspace shows the guided builder, not separate Readiness, Plan, or Chat tabs.
- Flight cards and hotel cards show visual media.
- Selecting a flight unlocks the Hotel step.
- Selecting a hotel unlocks Itinerary.
- The helper explanation does not update the request until Apply to itinerary is clicked.
- Critical issue recovery opens directly on Flights and focuses on same-origin alternatives.
- Approval can be sent, saved, finalized, and exported.
- Exports mask passport and sensitive document values.

## Local Demo Artifacts

Generated videos, PDFs, workbooks, and upload fixtures stay local and are ignored by Git. Common local output paths are:

- `frontend/public/videos/unipro-travel-ai-tutorial-voiced.mp4`
- `docs/Travel_AI_User_Guide.pdf`

The committed guide sources are:

- `docs/Travel_AI_User_Guide.md`
- `docs/Travel_AI_Tutorial_Transcript.md`
