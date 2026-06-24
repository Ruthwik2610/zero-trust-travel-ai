1. **Identify Performance Bottleneck**: The backend SQLite database queries in `backend/app/store.py` for `list_trips_for_owner`, `list_trips`, `list_corporate_requests_for_owner`, and `list_corporate_requests` use `ORDER BY created_at DESC` and filter by `owner_id`. Without indexes, these queries require a full table scan.
2. **Implement Optimization**: Add `CREATE INDEX IF NOT EXISTS` statements for `owner_id` and `created_at` fields in the `_init_schema` method of `backend/app/store.py` for both `trips` and `corporate_requests` tables.
3. **Pre-commit**: Complete pre-commit steps to make sure proper testing, verifications, reviews and reflections are done.
4. **Submit**: Submit the code changes with a descriptive PR message matching the Bolt persona.
