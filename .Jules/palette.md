## 2024-06-06 - Login Accessibility Improvements
**Learning:** Input tags within login forms implicitly wrapped in labels still benefit from explicitly setting `id` and `htmlFor` properties to be perfectly screen reader friendly.
**Action:** Ensure inputs with generic placeholder wrappers inside labels get explicit `id` mappings to `htmlFor` for better accessibility.
