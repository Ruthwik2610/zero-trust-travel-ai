# Travel AI Production UI Acceptance Checks

Use this as the manual and automated review gate for the Travel AI production experience. These checks cover the dashboard-first workflow, request workspace, UI quality, operational confidence, and isolation from the main chat app.

## First-Use Clarity

1. A first-time agent can identify the app as Unipro Corporate Travel without reading helper text.
2. The first screen after sign-in opens to the Agent Operations Dashboard.
3. The dashboard makes the Priority Board more prominent than analytics.
4. The New Request action is visible without scrolling on desktop.
5. The role switcher does not expose admin-only workflows as agent tasks.
6. The sidebar labels are short enough to scan quickly.
7. The current role is visible in the shell.
8. Empty request states explain that no live requests exist.
9. Loading states do not look like failed states.
10. Sign-in failure uses a safe generic error message.

## Priority Board

11. Priority Board is the default dashboard view.
12. Board columns represent workflow stage, not priority.
13. Waiting For Information column is visible.
14. Ready To Plan column is visible.
15. In Process column is visible.
16. Waiting For Approval column is visible.
17. Ready To Finalize column is visible.
18. Completed column is visible.
19. Each column shows its request count.
20. Empty columns show a quiet empty state.
21. Board cards are clickable and open the workspace.
22. Selected card is visually distinct.
23. Board can scroll horizontally when needed without breaking layout.
24. Board remains readable with one request.
25. Board remains readable with many requests.

## Request Cards

26. Each card shows request id.
27. Each card shows traveler name.
28. Each card shows company.
29. Each card shows route.
30. Each card shows travel dates.
31. Each card shows priority.
32. Each card shows priority reasons.
33. Missing information appears as a reason chip.
34. Visa issue appears as a reason chip.
35. Over budget appears as a reason chip.
36. Approval needed appears as a reason chip.
37. Each card shows next action.
38. Each card shows assigned owner.
39. Each card shows last updated freshness.
40. Cards do not show full itinerary text.
41. Cards do not show passport numbers or sensitive personal details.
42. Cards do not show raw backend errors.
43. Long traveler names do not break the card.
44. Long company names do not break the card.
45. Long route names do not overlap other content.

## Workspace Structure

46. Workspace opens from a selected board card.
47. Workspace has Overview tab.
48. Workspace has Missing Info tab.
49. Workspace has Plan tab.
50. Workspace has Policy & Budget tab.
51. Workspace has Documents & Visa tab.
52. Workspace has Approval & Finalize tab.
53. Workspace has Activity tab.
54. Active tab has clear visual state.
55. Tabs are keyboard-focusable.
56. Tabs fit or scroll on smaller screens.
57. Overview shows traveler, company, route, dates, priority, and next action.
58. Missing Info contains editable missing-information text.
59. Plan contains generated options and customer draft.
60. Policy & Budget contains budget and approval context.
61. Documents & Visa contains readiness and visa context.
62. Approval & Finalize contains approval status and final itinerary controls.
63. Activity states that no booking or payment is created.
64. Workspace does not expose admin metrics.
65. Workspace does not require the AI chat to complete the workflow.

## Workflow Functionality

66. Agent can create a new request.
67. Created request appears in the dashboard without refresh.
68. Agent can generate a plan.
69. Generated plan updates the workspace.
70. Agent can edit plan summary.
71. Agent can save edits.
72. Agent can select a recommended plan.
73. Changing selected plan clears final approval.
74. Agent can update approval status.
75. Rejected approval disables final itinerary generation.
76. Final itinerary requires agent action.
77. Finalized requests expose export download.
78. Export failure shows a safe retry message.
79. Planning failure shows a safe retry message.
80. AI assistant never claims the trip is booked.

## Visual Standards

81. Light mode text meets contrast expectations.
82. Dark mode text meets contrast expectations.
83. Theme toggle remains visible in the shell.
84. Cards use restrained elevation and borders.
85. No card is nested inside another card unnecessarily.
86. Accent color is used for action and selection, not decoration everywhere.
87. Dashboard uses enterprise information density.
88. Workspace headings are smaller than page headings.
89. Buttons use icons where useful.
90. Focus rings are visible.

## Responsiveness And Performance

91. Dashboard is usable at 1440px desktop width.
92. Dashboard is usable at 1024px tablet width.
93. Dashboard is usable at 390px mobile width.
94. Board columns stack cleanly on mobile.
95. Workspace tabs remain reachable on mobile.
96. No text overlaps on mobile.
97. Initial dashboard load feels responsive under normal network conditions.
98. Generating a plan shows an in-progress button state.
99. Refreshing does not lose stored auth unexpectedly.
100. Travel AI frontend changes do not alter or regress the main DataChat chat UI.
