## 2024-10-18 - Manual SQLite indexing
**Learning:** The backend database schema and its initialization are managed directly in `backend/app/store.py` using raw SQLite execution (`CREATE TABLE`, etc.) rather than an external ORM or migration framework.
**Action:** When adding database tables or making query optimizations, ensure proper `CREATE INDEX` statements are included in `_init_schema` for frequently queried fields like foreign keys and timestamps to avoid full table scans.
