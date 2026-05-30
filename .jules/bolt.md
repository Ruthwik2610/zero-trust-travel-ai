
## 2026-05-30 - React Array Filtering & Redundant Parsing in Render
**Learning:** Missing early returns inside React array filtering and running redundant string parsing inside frequent rendering maps can noticeably degrade performance, especially on user inputs triggering rapid updates (like search fields or text inputs).
**Action:** Always include early returns in `.filter()` logic when dealing with multiple conditions, and pre-compute repetitive parsing using `useMemo` outside of mapped loops inside components.
