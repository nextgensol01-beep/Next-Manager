# Billing schema maintenance

Billing reads present the legacy Annual Return type and title for documents that lack `billType`. They do not persist those defaults. The Billing model leaves collection and index provisioning to the operator. Run this procedure before deploying the change to an existing environment or before enabling billing on a new database.

1. Confirm the target database, privileges and MongoDB version. Rehearse against an isolated copy. Use a database backup and a maintenance window with billing writers and older application instances stopped. Coordinate one operator. If the replacement index cannot be created alongside the legacy index on that deployment, stop and review the index plan separately.
2. Supply a dedicated `BILLING_MIGRATION_MONGODB_URI` through the operator's secret environment. The URI must select the intended database. The script does not load application dotenv files. Start with a read-only account for the preview.

   ```powershell
   node scripts/migrate-billing-schema.cjs --database <confirmed-database-name>
   ```

3. Review the count of bills missing `billType`, duplicate Annual Return groups and index names. Resolve duplicate groups and unexpected indexes separately. A dry run performs only count, aggregation and index metadata reads.
4. After approval, use migration credentials and rerun with `--apply`. The script checks the database name and duplicate groups again. It ensures the partial unique Annual Return index, billing lookup index and sparse unique quotation-source index before updating legacy rows. It then removes the superseded full unique client/FY index if present. This order preserves a uniqueness constraint while replacing the old index. [MongoDB partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/)

   ```powershell
   node scripts/migrate-billing-schema.cjs --database <confirmed-database-name> --apply
   ```

5. Repeat the preview and verify that the three desired indexes exist, no legacy index remains and the legacy count is zero. Compare billing and Report Studio totals before resuming traffic. If interrupted, keep writers paused, review the index and record state, and rerun after correcting the cause. Matching indexes are reused and already-backfilled bills are skipped. A rollback to the former full unique index requires a separate plan once general bills coexist in the same client/FY.

The migration changes only missing type/title defaults and billing indexes. It does not change bills' amounts, payments, allocations or quotations. It is never invoked by a web route or automatically during deployment.

## Contact maintenance endpoints

`/api/fix-indexes`, `/api/migrate-contacts` and `/api/migrate-client-contact-selections` accept POST from a current active administrator with the configured application origin. Use the administrator's authenticated same-origin browser session after operational approval. Old GET links return 405. No first-party runtime caller was found. Check external runbooks or tooling before relying on the new method. Run these manually and serially against the intended environment. Review the result and record any partial failure before retrying a contact migration.
