## $(date +%Y-%m-%d) - Debouncing Search Inputs to Prevent Unnecessary Renders
**Learning:** React re-evaluates `useMemo` hooks on every keystroke if they depend on an input's raw value, leading to poor UI performance in long lists.
**Action:** Implement and use a `useDebounce` custom hook for search term state passed to list filtering logic, minimizing redundant re-renders while typing.
