## 2024-06-07 - React Testing Library and Debounce
**Learning:** Adding debouncing to synchronous UI inputs (like search bars) will break synchronous assertions in Vitest/React Testing Library. The tests will expect the UI to filter immediately, but the debounce introduces a delay.
**Action:** When adding `useDebounce` or other delays to React components, always update corresponding tests to wrap assertions about state changes in `await waitFor(() => { ... })`.
