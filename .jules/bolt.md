## 2024-05-24 - Missing SQLite Indexes
**Learning:** The backend database uses raw SQLite in `store.py` without an ORM, and was missing essential indexes on frequently queried fields (e.g. `owner_id`, `created_at`). This causes full table scans on read/sort operations, a critical anti-pattern as data scales.
**Action:** Always include explicit `CREATE INDEX` statements in `_init_schema` for foreign keys and timestamps when working with raw SQLite here.
