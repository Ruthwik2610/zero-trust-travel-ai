## 2024-06-15 - Missing DB Indexes Cause Bottlenecks
**Learning:** Found that backend/app/store.py lacked CREATE INDEX statements on several frequently queried foreign keys (like owner_id, kind, policy_id, request_id) used in WHERE and ORDER BY clauses, potentially causing full table scans and performance bottlenecks as data grows.
**Action:** When working with SQLite or relational stores where manual queries are done without an ORM, always verify that appropriate indexes are manually created in the schema setup for fields used in query filtering.
