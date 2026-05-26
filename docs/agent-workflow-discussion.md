# Agent Workflow Discussion

Status: Draft discussion notes
Date: 2026-05-24

## Current Decision

The MVP should focus on the Travel Agent workflow.

Remove Application Admin as a separate user role for the MVP. The app should not feel like a company policy management system. Company policy, traveler history, and employee context can still exist as planning inputs, but they should be treated as background setup data or request/company context used by the agent.

## Working Assumptions

- Primary user: travel agent or travel operations user.
- Primary value: handle requests faster, produce policy-aware plans, track approval, and export reviewed itineraries.
- Company travel managers own policy management outside the MVP.
- The MVP should not create bookings, payments, or ticket confirmations.
- The agent workflow should stay simple enough to demo clearly across multiple scenarios.

## Goal

Define the agent workflow across realistic scenarios before making app updates. Once the scenarios and decisions are reviewed, batch the UI/data-flow updates together.

## Scenario Queue

Use this section to collect scenarios before choosing the final workflow.

1. New complete request
2. Request missing required traveler details
3. Request needs manager approval
4. Policy conflict or over-budget trip
5. Visa/passport/document issue
6. Last-minute disruption or recovery case
7. VIP or frequent traveler preferences
8. Group or multi-traveler request
9. Manual request created by agent
10. Uploaded form or email-style request
11. Traveler registration request

## Solution Options To Review

### Option A: Single Guided Agent Workspace

The agent starts from a request queue, opens one request, and works through a short stepper: intake, options, review, approval, export.

Tradeoff: simplest and strongest MVP story, but policy/company setup becomes less visible.

### Option B: Agent Queue Plus Context Drawer

The agent still works from a queue and stepper, but request/company/traveler/policy context appears in a right-side drawer.

Tradeoff: keeps the agent focused while still showing enterprise context. Slightly more UI complexity.

### Option C: Agent Workspace With Setup Imports

The agent owns everything, including uploading policy PDFs or company workbooks from a setup/import section.

Tradeoff: avoids admin role, but risks making the agent feel responsible for company policy management.

## Open Decisions

- Should policy/context upload be hidden as setup data, or visible in the agent workflow?
- Which scenarios must be polished for demo day, and which can be secondary?
- Which traveler/profile fields are request-only versus long-term reusable traveler data?
- Should emailed forms be ingested through an actual mailbox integration later, or represented in the MVP as uploaded/submitted forms that create the same review queue item?
- What confidence threshold should the LLM need before auto-routing a form type versus asking the agent to choose the type manually?

## Decisions Made

- Remove Application Admin as a separate MVP role.
- Keep policy/company/traveler context as planning inputs, not as a full admin product.
- Keep both intake and queue available from the agent's main screen.
- Do not create a separate urgent-work screen or lane. Highlight urgent items inside the pending/request queue so the agent can prioritize without changing surfaces.
- Missing information should not always block planning. The agent can generate a draft plan with clear missing-info warnings when the missing data does not prevent useful planning.
- The agent workflow needs an editable place to fill and save missing information. Long-term traveler details, such as passport, visa, loyalty, and preference data, should update the traveler roster/profile instead of living only on the current request.
- Approval should not become a full in-app approval workflow for the MVP. Most business approval happens before the request reaches the travel company.
- Policy exceptions should be flagged clearly for the travel agent. The agent can resolve the exception outside the app, such as by calling or emailing for quick approval, then continue the workflow.
- The app should track approval/exception status for agent awareness, but should not require the approver to use the product.
- Keep form-based intake as a core MVP workflow. Requests may come from uploaded PDFs, submitted forms, or email-style form submissions.
- Keep basic traveler registration. Registration forms should appear in the traveler roster area as pending review items before they append to the roster.
- Do not append a new traveler directly to the roster from an external form. The travel agent should review and approve the submitted registration first.
- Use an "Instagram-style" review pattern for registration: incoming registration request, agent reviews details, agent approves, traveler roster is appended.
- Support three intake form types: travel request forms, traveler profile update forms, and new traveler registration forms.
- The LLM should classify incoming forms even when they arrive in different layouts or formats. The classification should route the form to the right review flow, but the agent remains the final reviewer.
- Travel request forms should appear in the main request queue.
- Traveler update forms and new registration forms should appear in the Traveler Roster area as pending review items.
- Add a global notification tab or notification center visible from all main screens so the agent can see new travel requests, registration requests, profile updates, policy exceptions, and other review items without switching context blindly.
- Implementation direction: remove visible Admin login/navigation, redirect the old `/admin` route to the agent dashboard, make Traveler Roster an agent-owned surface, and keep policy management as context rather than a primary MVP role.

## Scenario Notes

### Missing Traveler Details

The app should support a draft-first workflow. If a request is missing details like passport number, visa status, loyalty number, seating preference, or hotel preference, the agent can still create a draft plan when practical.

The missing details should be visible as warnings or required follow-up items, not hidden failures. The agent should also be able to open an edit surface from the request and save missing data either to the current request or to the long-term traveler profile.

Planning should only be blocked when the missing detail makes the plan unreliable or impossible, such as unknown destination, unknown dates, missing traveler identity, or missing company/client context needed for policy matching.

### Approval And Policy Exceptions

The MVP should treat approval as an operational flag, not as a separate approval platform.

Normal business approval usually happens before the travel request reaches the travel company. The app should not force every request through an approval workflow.

When the plan creates a policy exception, the app should show the reason clearly, such as over budget, premium cabin, late booking, non-preferred route, or hotel outside policy. The travel agent can then contact the relevant person outside the app for quick approval and mark the exception as resolved or approved.

The agent should be able to keep planning while the exception is visible. Final export may show the exception status, but the MVP should avoid adding approver accounts, approval inboxes, or company-manager workflows.

### Forms And Traveler Registration

Forms should be one of the product's strongest MVP intake paths. A travel request can arrive as a filled PDF, a submitted form, or an email-style form attachment. The agent should be able to upload a form and see it become a pending request.

The app should also support basic traveler registration. This should live around the traveler roster, since the roster becomes agent-owned after removing the Admin role.

Incoming forms should be treated as one of three types:

1. Travel information form: origin, destination, dates, traveler, purpose, budget, preferences, and other trip details. This creates or updates a travel request.
2. Traveler update form: passport, visa, contact details, loyalty numbers, preferences, documents, or other existing profile data. This creates a pending profile update for agent review.
3. New registration form: a new traveler asks to be added to the roster. This creates a pending registration request for agent review.

The LLM should inspect the submitted form and classify which type it is, because real forms may arrive in different formats. The classification should not silently make trusted long-term changes. The agent should review the extracted fields and approve the action.

Routing should stay simple. Travel request forms go to the main request queue. Traveler update forms and new registration forms go to the Traveler Roster page as pending review items. A global notification tab should be visible across screens so the agent can see new intake and review work from anywhere.

Registration should not instantly create a trusted traveler profile. It should create a pending registration request. The agent reviews the submitted details, confirms the person belongs in the roster, and approves the request. After approval, the traveler roster is appended or updated.

The registration review pattern should feel lightweight and familiar: incoming request, review submitted information, approve or reject, roster updates after approval. This keeps the product simple while making the roster feel alive and operational.
