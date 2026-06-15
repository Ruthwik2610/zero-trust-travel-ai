## 2024-06-15 - Added tooltip to icon-only Sign out button
**Learning:** Icon-only buttons lacking accessible tooltip text can be confusing, especially if not explicitly labelled by text on screen.
**Action:** When an icon-only button performs a significant action (like signing out), we should ensure it has a `title` attribute in addition to an `aria-label` to provide an accessible tooltip for mouse users.
