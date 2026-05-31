## 2026-05-31 - [Memoize allRequests filter counts]
**Learning:** Found an O(N*M) calculation when calculating filter counts inside of a React render. There were 4 queue filters and allRequests array which led to N requests * M filters filtering loops.
**Action:** Replace filter counting logic inside of a render with an N lookup algorithm via a `reduce` wrapped in a `useMemo`.
