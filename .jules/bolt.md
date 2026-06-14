## 2024-06-14 - Missing Indexes in Store Schema
**Learning:** The database schema is initialized directly in `backend/app/store.py` without an ORM, and it was lacking essential indexes on heavily queried columns like `created_at` and `owner_id`.
**Action:** Added `CREATE INDEX IF NOT EXISTS` statements to `_init_schema` to resolve potential N+1 or sorting performance issues, ensuring queries hit indexes instead of falling back to full table scans.
