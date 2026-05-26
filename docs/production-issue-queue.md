# Production Issue Queue

Use this queue whenever a review issue is flagged. Each item maps the issue to the workflow, expected behavior, fix status, and regression check so older fixes do not get broken while new ones land.

| ID | Workflow | Flagged issue | Expected behavior | Status | Regression check |
| --- | --- | --- | --- | --- | --- |
| PIQ-001 | Sign in | Login needs username and password, not an email-only demo shortcut. | Agent signs in with `agent` / `travel-demo-2026`; admin signs in with `admin` / `travel-demo-2026`; wrong or missing password is rejected. | Fixed | `tests/test_backend_api.py::test_demo_login_accepts_username_password_and_rejects_wrong_password`, `frontend/src/lib/__tests__/api.test.ts` login payload test |
| PIQ-002 | Role switch | Agent must not switch to Application Admin from the dashboard. | Agent auth has no `admin:summary`; topbar selector only exposes Travel Agent; direct admin/traveler-data routes remain blocked. | Fixed | Component role-selector test, `frontend/tests/e2e/travel-ui.spec.ts` agent workspace and direct admin/traveler route checks |
| PIQ-003 | Role switch | Admin can switch from Application Admin to Travel Agent. | Admin auth keeps admin identity; selector can switch workspace to `/dashboard`; admin-only nav/data panels disappear in agent workspace. | Fixed | Component admin switch test, `frontend/tests/e2e/travel-ui.spec.ts` manager workspace switch check |
| PIQ-004 | Branding | Login/sidebar logo must use the actual Unipro/DataChat logo, not the placeholder icon. | Brand lockup uses `unipro-full-logo.svg` and the dark variant in dark theme. | Fixed | `frontend/src/components/__tests__/TravelApp.test.tsx`, `frontend/tests/e2e/theme-logo.spec.ts` |
| PIQ-005 | Form intake | Agent/admin uploads must create pending requests from PDF/workbook forms. | Uploaded travel forms appear in the pending queue; company workbook imports requests and employee profiles. | Fixed | `frontend/tests/e2e/travel-ui.spec.ts` PDF import and admin workbook import checks |
| PIQ-006 | Data privacy | Passport numbers must be obfuscated in itinerary/customer-facing exports. | Customer drafts and exported itinerary workbooks never contain raw passport numbers; masked value uses `*`. | Fixed | `tests/test_corporate_backend_api.py::test_edit_plan_and_finalize_flow` |
| PIQ-007 | Chat + selected flights | Flights selected in the dashboard must be available in request chat context. | Plan tab shows flight offers; Chat tab receives the selected flight context and suggested actions. | Fixed | `frontend/tests/e2e/travel-ui.spec.ts` chat-with-selected-flight check |
| PIQ-008 | Workflow purpose | Every visible button/card should support a current workflow or be removed/documented. | Workflow map identifies owner, action, and purpose for each production surface. | Fixed | `docs/workflow-feature-map.md` plus e2e checks for dead duplicate controls/search |
| PIQ-009 | Manager pipeline | Manager needs one company card per company showing whether traveler roster and policy PDF are uploaded. | Company profile Excel updates traveler/context status; company policy PDF updates policy status; cards show both for each company. | Fixed | Backend company pipeline status tests and manager dashboard component/e2e checks |
| PIQ-010 | Agent critical issues | Agent needs urgent visibility for cancellations, itinerary changes, and flight disruptions. | Request queue has a Critical Issue column; agent can mark an issue urgent; Work Issue opens the request Chat tab with recovery context for same-origin alternative flights and hotel adjustments. | Fixed | Component/e2e checks for urgent issue update and chat redirect |

## New Issue Intake

When a new issue is flagged:

1. Add one row with the workflow and expected behavior before editing.
2. Fix the smallest surface that owns the issue.
3. Add or update at least one regression check.
4. Re-run the affected checks plus any earlier queue items that share the same workflow.
