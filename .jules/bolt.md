## 2024-05-24 - SQLite Manual Schema Indexes
**Learning:** The backend database schema and initialization are managed manually in `backend/app/store.py` (`_init_schema()`) without an ORM or migration framework. As a result, database indexes are not automatically created for foreign keys or frequently queried fields.
**Action:** Always manually add `CREATE INDEX IF NOT EXISTS` statements directly to `_init_schema` whenever a new table or query pattern (e.g. `ORDER BY created_at`, `WHERE owner_id`) is introduced to avoid O(n) full table scans.
