## 2024-05-25 - Missing type attributes on Inputs
**Learning:** Found an instance where an email input in a critical part of the app (Sign-in form) was missing a `type="email"` attribute. Without this, mobile devices won't show the optimized email keyboard (with '@' and '.com' symbols readily available) and basic client-side validation is missed.
**Action:** Always check input semantics. Just having `autoComplete` isn't enough; the `type` attribute dictates the keyboard context and base validation.
