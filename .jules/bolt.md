## 2024-06-06 - Missing Database Indexes on Ordered Queries
**Learning:** SQLite backend frequently queried for collections ordered by `created_at` and `updated_at`, but the schema initialized tables without indexes for these fields. This would cause full table scans (`O(N)`) and expensive sorting (`O(N log N)`) for dashboard list views as the data grew.
**Action:** Always verify `CREATE TABLE` operations in SQLite initialize appropriate indexes (`CREATE INDEX IF NOT EXISTS`) for columns actively used in `WHERE` and `ORDER BY` query clauses to ensure `O(log N)` lookup performance.
