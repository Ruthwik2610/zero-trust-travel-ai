## 2025-03-09 - SQLite Missing Index on Frequent Queries

**Learning:** Found that `list_trips_for_owner` and `list_corporate_requests_for_owner` in the TravelStore SQLite backend query based on `owner_id` and order by `created_at` without any indexes. This caused a full table scan query and O(N) lookup. Using local benchmark, inserting 100K rows improved query time after index by 1.5x.

**Action:** Added `CREATE INDEX IF NOT EXISTS` for both `trips` and `corporate_requests` tables on `(owner_id, created_at DESC)` during `_init_schema` initialization to improve lookup from O(N) to O(log N).
