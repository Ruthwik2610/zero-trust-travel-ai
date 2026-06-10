
## 2025-06-25 - SQLite Indexing
**Learning:** In a direct SQLite application without an ORM, sorting and filtering large sets by date/owner (e.g. `list_trips_for_owner`, `list_corporate_requests_for_owner`) scales linearly/O(N log N) without explicit indexing in the raw SQL schema definitions.
**Action:** Always add performance indices alongside `CREATE TABLE` execution on frequent lookup/sort columns (`created_at`, `owner_id`) to maintain backend performance at scale and avoid full table scan bottlenecks.
