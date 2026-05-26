# Travel AI Reviewer Test Guide

Use the live app at https://uniprotravel.share.zrok.io.

## Login Credentials

| Workspace | Username | Password |
| --- | --- | --- |
| Travel Agent | `agent` | `travel-demo-2026` |
| Application Admin | `admin` | `travel-demo-2026` |

Rule to verify: the admin account can switch into the agent workspace from the top bar. The agent account must not be able to switch into the admin workspace.

## Local Upload Fixtures

Generated demo upload files are local-only and ignored by Git. Place them under `docs/synthetic-forms/` when running the proof workflow:

- `docs/synthetic-forms/agent-upload-vikram-johannesburg.pdf`
- `docs/synthetic-forms/agent-upload-missing-details.pdf`
- `docs/synthetic-forms/manager-company-context.xlsx`
- `docs/synthetic-forms/manager-company-policy.pdf`

## Agent Review Flow

1. Open the app and sign in with `agent` / `travel-demo-2026`.
2. Confirm the sidebar shows Agent Operations and Itineraries, not Application Admin or Traveler Data.
3. Click Upload Forms.
4. Upload a local completed travel request PDF, such as `agent-upload-vikram-johannesburg.pdf`.
5. Confirm a new pending request appears in the request queue.
6. Open the request row.
7. Click Prepare Plan or Generate AI Plan.
8. In the Plan step, confirm flight options appear and one option is selected.
9. Open the Chat step.
10. Confirm the selected flight appears inside the chat panel.
11. Send a message such as `Compare this option against the budget`.
12. Return to the request queue, use Critical Issue to mark `Flight cancelled`, and confirm it opens the Chat step directly.
13. In Recovery Assistant, confirm suggestions focus on same-origin replacement flights, hotel date/night adjustment, traveler updates, and cancellation tasks.
14. Go to Approval, set the approval status, and save edits.
15. Go to Finalize and generate the final itinerary.
16. Download the export and confirm passport numbers are masked.

## Missing Information Flow

1. Stay signed in as `agent`.
2. Upload `agent-upload-missing-details.pdf`.
3. Open the created request.
4. Confirm the Readiness or missing-information fields show items that need review.
5. Confirm the request cannot look complete until the agent updates or verifies the missing details.

## Admin Review Flow

1. Sign out.
2. Sign in with `admin` / `travel-demo-2026`.
3. Confirm Application Admin, Traveler Data, and Policy Control are visible.
4. Upload `manager-company-context.xlsx` from Application Admin.
5. Upload `manager-company-policy.pdf` in Import Company Policy PDF.
6. Confirm Company Pipeline shows the traveler list as Updated and policy as Uploaded.
7. Open Traveler Data.
8. Confirm employees from the workbook appear in the roster.
9. Open a traveler dossier.
10. Confirm passport/document references are masked.
11. Use the top-bar workspace selector to switch to Travel Agent.
12. Confirm the admin user can see the agent workspace after switching.
13. Sign out, sign in as `agent`, and confirm there is no Application Admin option in the selector.

## Provider Smoke

1. As either account, create or open a request with a complete origin, destination, departure date, return date, cabin, and budget.
2. Generate a plan.
3. Confirm provider notes mention live Duffel and Booking.com when the VPS provider keys are available.
4. If a provider is unavailable, confirm the UI says manual sourcing is required instead of pretending a booking exists.
