## 2024-05-18 - Missing SQLite Indexes for App Queries
**Learning:** Raw SQLite implementations in Python apps often miss index setup for frequent queries (`ORDER BY created_at`, `WHERE owner_id`). This causes O(n) table scans across all queries in list endpoints.
**Action:** When adding or checking database structures manually created via `.execute()`, always verify that indexes exist for any field actively used in standard list endpoints.
