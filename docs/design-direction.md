# Business Travel Companion Design Direction

Reference artifact:

- `/Users/rajasekharbandreddy/Downloads/business-travel-companion.html`

## Product Goal

The app is an enterprise business travel companion, not a chat demo. The interface should help travelers and travel managers plan, review, approve, and manage business trips with confidence.

## UX Principle

Chat-first is acceptable when the UX case supports it. Do not implement chat as the default surface just because the user says "chat." First reason from the user goal and choose the best workflow. If chat-first reduces friction, supports natural trip requests, and still exposes itinerary, approval, policy, spend, and support decisions clearly, it can be the primary experience.

## Visual Direction

Use the referenced HTML as the design benchmark:

- Enterprise layout with a persistent sidebar, topbar, content workspace, and contextual right panel.
- Professional navy and light surfaces, clear card hierarchy, tight spacing, and readable enterprise typography.
- Role-aware navigation: travelers should not see admin tools; admin controls belong to travel managers or finance operators.
- Every visible option must either work, navigate to a real section, or be removed.
- Buttons should describe the user outcome, such as planning a trip, submitting for approval, reviewing policy, or downloading an itinerary.

## Tone And Theme Research Notes

Use these rules when tuning the Travel AI interface:

- Dark mode is not an inverted light mode. Use layered dark grays for page, panel, and raised surfaces; avoid pure black as the default app canvas.
- Keep the accent color restrained. Use it for active navigation, primary actions, step progress, and selected chips; do not flood the whole screen with brand color.
- Treat the right rail as contextual support, not a second dashboard. It should be shorter than or aligned with the active planner card on desktop.
- Reduce visible decision load. Keep the request, flight, stay, and approval steps clear, and hide or combine secondary details when they are not needed for the current step.
- In dark mode, use surface lightness and borders for hierarchy because shadows are less visible on dark backgrounds.
- Preserve the flight image as a single identity moment inside the planner, not repeated as decoration.

## Research Loop For UI Decisions

Every meaningful UI decision should go through this loop:

1. Define the user job.
   Example: "A traveler needs to turn a trip request into a policy-ready itinerary with minimal uncertainty."

2. Research the pattern.
   Use primary or reputable UX/design-system references first: Material, Apple HIG, Atlassian, Carbon, Baymard, Nielsen Norman Group, or similarly rigorous sources.

3. Convert the research into a local rule.
   Example: "Dark mode needs separate surface tokens; do not invert light-mode colors."

4. Apply the smallest useful change.
   If the change does not reduce friction, improve comprehension, clarify hierarchy, or increase trust, do not add it.

5. Remove redundancy.
   Before adding a new card, chip, panel, metric, image, or label, check whether an existing element already communicates the same thing.

6. Verify in the actual app.
   Check light and dark mode, desktop and mobile, the main workflow, overflow, text contrast, and whether the right rail supports the current step instead of becoming a second dashboard.

7. Record the reason.
   Keep the design note short: source, decision, tradeoff, and what was intentionally not added.

Decision standard: sophisticated means fewer, clearer, better-justified elements. It does not mean more decoration, more panels, or more copy.

## Current Researched Decisions

- Source: Baymard travel and form research.
  Decision: keep the trip flow as visible steps, but reduce default visible controls. Secondary actions like manager-note drafting and preference saving belong in the approval step, where they support the user decision.
  Tradeoff: one extra step is acceptable because it reduces first-screen decision load.

- Source: Nielsen Norman Group progressive-disclosure and cognitive-load guidance.
  Decision: avoid repeating the same status message or route summary as separate cards. "Company profile applied" belongs as metadata in the page header, and the flight wallpaper banner owns the route identity.
  Tradeoff: the status is less visually loud, but the main workflow becomes easier to scan.

- Source: Fluent, Carbon, Atlassian, Apple, and Material dark-mode guidance.
  Decision: use semantic tokens and layered dark-gray surfaces. Avoid pure black, inverted colors, and washed-out disabled-looking controls.
  Tradeoff: dark mode is slightly less dramatic, but it is more legible and professional.

- Source: Fluent elevation guidance.
  Decision: use borders and subtle elevation for app panels; do not stack decorative shadows on every small chip or row.
  Tradeoff: the interface feels quieter, but hierarchy must be maintained with spacing and typography.

- Source: Apple HIG, Material 3, and Atlassian dark-theme guidance.
  Decision: remove decorative dark-mode glow from the app canvas and rely on page, panel, and control surface tokens for depth.
  Tradeoff: dark mode is less atmospheric, but the planner reads more like a focused enterprise workspace.

- Source: Nielsen Norman Group recognition-over-recall guidance.
  Decision: keep the workflow actions visible only when they match the current decision level. Global actions stay limited to policy, fare, and office-near hotel checks; approval-specific actions live inside the approval step.
  Tradeoff: users see fewer shortcuts upfront, but each action appears closer to the decision it supports.

- Source: Baymard form UX and Apple HIG login guidance.
  Decision: keep the login page focused on one brand message and the sign-in task. Remove secondary trust/marketing badges from the hero because the wallpaper and enterprise copy already establish the product context.
  Tradeoff: fewer reassurance labels are visible, but the page has a clearer path to authentication.

- Source: Unsplash free travel imagery and dark-mode surface guidance from Apple and Material.
  Decision: use separate login wallpapers for light and dark mode instead of forcing one image through a heavy overlay. Light mode uses a sunrise wing image; dark mode uses a night city-lights wing image with a lighter, purpose-built overlay.
  Tradeoff: the CSS now references two remote image assets, but the login page keeps visual clarity in both themes.

- Source: Apple and Material dark-mode asset guidance.
  Decision: use the dark-mode Unipro logo asset on a dark glass chip instead of forcing the light-mode white logo chip in every theme.
  Tradeoff: there are two logo treatments to maintain, but the brand no longer looks pasted onto dark mode.

- Source: Nielsen Norman Group progressive-disclosure guidance and Baymard form clarity guidance.
  Decision: fill the login hero's empty space with three product-specific capability cards: plan, approve, and itinerary handoff. Avoid extra slogans or decorative trust badges.
  Tradeoff: the hero has more content, but it explains the post-login value without adding another workflow to the sign-in form.

## Implementation Guidance

When changing the Travel AI frontend:

- Prefer justified workflows over labels. A chat-first layout is fine when it is paired with clear itinerary, approval, policy, spend, and support surfaces.
- Preserve clear information density. Avoid oversized marketing-style hero sections inside the logged-in app.
- Use chat as the primary surface only when the UX rationale is explicit and the surrounding product still helps users review decisions, not just send messages.
- Ask before inventing business rules for roles, approvals, policy thresholds, booking, or identity provider behavior.
