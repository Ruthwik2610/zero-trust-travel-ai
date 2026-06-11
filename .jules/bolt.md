## 2026-06-11 - Missing SQLite indices
**Learning:** The application uses raw SQLite in `backend/app/store.py` instead of an ORM or migration framework. The `_init_schema` sets up tables but frequently queried fields like `created_at`, `owner_id`, and `trip_id` were missing indexes. This creates an N+1 query problem, slowing down list/filter operations significantly.
**Action:** Always check the raw SQLite schema initialization to ensure appropriate indexes exist on foreign keys and frequently sorted/filtered fields.
