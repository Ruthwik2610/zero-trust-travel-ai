# Travel AI

Travel AI is the business travel operations context for turning corporate trip requests into reviewed, policy-aware itineraries.

## Language

**Travel Operations Workflow**:
The end-to-end flow for intake, policy review, provider-backed planning, agent review, approval, finalization, and export.
_Avoid_: Booking engine, travel chatbot

**Provider Search**:
Live or configured external inventory lookup used to inform planning options before any booking is created.
_Avoid_: Booking, order creation, payment

**Final Itinerary**:
A reviewed itinerary artifact generated only after the agent has reviewed the plan and required approval has been received.
_Avoid_: Ticket, reservation, booking confirmation

**Dashboard**:
The first production surface that summarizes request volume, priority work, risk, approvals, and operational status.
_Avoid_: Landing page, marketing page

**Workspace**:
The focused surface where an agent reviews one request, generates or edits the plan, resolves issues, and finalizes the itinerary.
_Avoid_: Chat screen, detail page

**Urgent Work Queue**:
The dashboard list of travel requests that need agent action before routine monitoring or analytics.
_Avoid_: Activity feed, recent items

**Priority Board**:
A dashboard board that organizes request cards by workflow stage while surfacing priority on each card.
_Avoid_: Generic kanban, analytics board

**Request Card**:
A compact representation of one corporate travel request with status, priority, blocker, route, traveler, and next action.
_Avoid_: Task, ticket

**Waiting For Information**:
A workflow stage for requests blocked until the traveler, client, or another source provides required information.
_Avoid_: Blocked, pending

**In Process**:
A workflow stage for requests actively being planned, reviewed, or edited by an agent.
_Avoid_: Doing, active

**Completed**:
A workflow stage for finalized requests whose itinerary/export work is complete.
_Avoid_: Done, closed

## Relationships

- A **Travel Operations Workflow** may use one or more **Provider Searches**.
- A **Provider Search** never creates a **Final Itinerary** by itself.
- A **Final Itinerary** belongs to exactly one reviewed corporate travel request.
- A **Dashboard** leads an agent into one or more **Workspaces**.
- A **Dashboard** prioritizes the **Urgent Work Queue** before summary metrics.
- A **Dashboard** defaults to the **Priority Board** view.
- A **Priority Board** contains one or more **Request Cards**.
- A **Request Card** has one workflow stage, such as **Waiting For Information**, **In Process**, or **Completed**.
- A **Workspace** may use sidebar tabs when showing all request details at once would overload the agent.

## Example dialogue

> **Dev:** "When Duffel returns flight options, should we create the booking immediately?"
> **Domain expert:** "No — provider search only informs the plan. A final itinerary is generated after agent review and approval, but this MVP does not create bookings or payments."

> **Dev:** "Should the app open straight into a request detail page?"
> **Domain expert:** "No — start with the dashboard, then let agents enter a focused workspace for each request."

> **Dev:** "Should dashboard metrics be the first thing agents work from?"
> **Domain expert:** "No — metrics are useful, but the urgent queue should tell agents what to do next."

> **Dev:** "Should priority be a separate board column?"
> **Domain expert:** "No — columns should show where the request is in the workflow. Priority belongs on the card so agents know what to handle first inside each stage."

> **Dev:** "Should the request card include all policy, passport, and audit details?"
> **Domain expert:** "No — the card should show traveler, company, route, dates, stage, priority, reason, next action, owner, and freshness. Full details belong in the workspace."

## Flagged ambiguities

- "Production" can mean a booking engine or an operations workflow — resolved: this context means a production-grade **Travel Operations Workflow** without direct booking, payment, or order creation.
