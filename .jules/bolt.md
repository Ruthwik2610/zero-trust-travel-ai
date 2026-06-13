## 2024-06-13 - Manual SQLite Schema Management
**Learning:** The application manages database schema directly in raw SQLite (via `_init_schema` in `backend/app/store.py`), without an ORM or migration framework. Consequently, performance-critical database indexes are not automatically created from model definitions and must be explicitly added to `_init_schema` to maintain performance.
**Action:** When adding database tables or making query optimizations, ensure proper `CREATE INDEX` statements are included in `_init_schema` for frequently queried fields like foreign keys and timestamps.
