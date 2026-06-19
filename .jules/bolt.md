## 2025-06-19 - Added database indexes to SQLite tables
**Learning:** Found an opportunity to improve query execution time by identifying tables in `backend/app/store.py` that were frequently filtered using unindexed foreign keys (e.g. `owner_id`, `request_id`, `policy_id`, `kind`) during list operations.
**Action:** Always verify if `CREATE TABLE` statements in the database store initialization are accompanied by proper `CREATE INDEX` declarations on foreign keys to optimize query performance in an otherwise monolithic/synchronous store.
