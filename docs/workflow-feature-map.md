# Travel AI Workflow Feature Map

This checklist is the product contract for the desktop MVP. If a visible button, card, link, or panel does not belong to one of these workflow steps, it should be removed or explicitly marked as a future feature before it appears in the UI.

## Roles

### Travel Agent

The agent owns daily request handling.

1. Open Agent Operations
   - Purpose: see the active travel request queue.
   - UI: Active Requests, Need Approval, Blocked by Visa metric cards.
   - UI: request queue search, status filters, refresh, and row action.

2. Create or Import Requests
   - Purpose: add requests from customer forms or manual entry.
   - UI: Upload Forms, Import Forms, New Request.
   - Accepted inputs: Excel workbook or PDF travel form.
   - Expected result: imported or created request appears in the pending queue.

3. Open Request Workspace
   - Purpose: work one traveler request from intake to final export.
   - UI: request hero card, Intake, Readiness, Plan, Chat, Approval, Finalize steps.

4. Readiness
   - Purpose: collect missing details and traveler readiness notes.
   - UI: Missing Information, Customer Message Draft, Readiness Check, Save Edits.

5. Plan
   - Purpose: generate and compare policy-aware flight/hotel options.
   - UI: Generate AI Plan, Select Airline, plan option cards, Select buttons, Save Edits.
   - Expected result: selected flight is stored on the request and visible in Chat.

6. Chat
   - Purpose: ask questions about the selected request and selected flight.
   - UI: AI Assistant, selected flight result card, chat input, Send, suggested action buttons.
   - Expected result: assistant receives request, budget, uploaded form, and selected flight context.

7. Approval
   - Purpose: mark manager approval state before finalization.
   - UI: Budget Policy Check, Approval status, Save Edits, Send Approval.

8. Finalize
   - Purpose: create the reviewed itinerary package after agent review.
   - UI: Final Itinerary Preview, Generate Final Itinerary, Download Export.
   - Privacy rule: passport numbers must be masked in exports.

### Application Admin / Manager

The manager owns company data and governance.

1. Open Application Admin
   - Purpose: manage company-level travel context and monitor activity.
   - UI: Total Requests, New, Pending Approvals, Missing Info, Visa Issues, Finalized Itineraries, Average Handling Time.

2. Import Company Data
   - Purpose: upload manager-controlled workbook context for agents.
   - UI: Download Template, Select Excel file, Import Workbook.
   - Expected result: upload status shows processed rows, employee profiles, skipped rows, and created request IDs.

3. Review Common Destinations
   - Purpose: monitor high-frequency destinations for planning and policy tuning.
   - UI: Common Destinations card.

4. Review Audit Activity
   - Purpose: see recent governance and action audit events.
   - UI: Recent Audit Activity card.

5. Traveler Data
   - Purpose: inspect traveler profile, loyalty, documents, policy notes, and recent trips.
   - UI: Traveler Roster, Traveler Dossier, Send Document Update.
   - Access rule: agents must not see this data.

6. Policy Control
   - Purpose: inspect and review policy rules and policy revision activity.
   - UI: Policy Center, Audit Log, policy detail cards, review actions.

## Removed or Disallowed

- No duplicate topbar search when the request queue already has the active search.
- No disabled fake pagination buttons.
- No duplicate navigation links that route to the same screen with different labels.
- No manager-only data screens in the agent workspace.
- No future-only controls in the main workflow without a test and a workflow owner.

## Test Coverage

The Playwright workflow contract lives in `frontend/tests/e2e/travel-ui.spec.ts`.

- Login role selection
- Agent navigation and single search surface
- PDF form import to pending queue
- Request planning and selected flight visibility
- Chat using selected flight context
- Approval and final export
- Separate manager/admin workspace
- Manager-only traveler data access
