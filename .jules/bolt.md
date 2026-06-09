## 2025-06-09 - Missing Database Indexes
**Learning:** The SQLite database initialization in `backend/app/store.py` uses raw SQL to create tables but completely lacks `CREATE INDEX` statements for frequently queried foreign keys (`owner_id`, `policy_id`, `request_id`), which causes full table scans on queries.
**Action:** Always verify if raw SQLite schema definitions in `store.py` include appropriate indexes for fields used in `WHERE` and `ORDER BY` clauses to prevent O(N) query performance scaling with data size.
