# Deployment readiness · NextGen Solutions

**Decision: NO-GO for production deployment.** Release verification is separate from approval to deploy. No staging environment or isolated restore of the target database is available, and there is no verified target backup or restore evidence. The workspace MongoDB metadata checks and local fixtures cannot establish those gates. No deployment, production migration, production record change, or customer notification was performed.

## Release candidate and scope

| Item | Verified state |
|---|---|
| Candidate | `c30d60f6fd64f8213934cccf4fae87517d8a3cff` on `security/final-follow-up` |
| Original comparison point | `pre-optimization-2026-11-02` at `4b76656` |
| Security ancestry | `b7744d5` SMTP/PDF isolation, `bebb809` maintenance authorization and billing read boundary, `c30d60f` Annual Return concurrency protection |
| Workspace | Clean at candidate selection. Git has no configured remote and the project has no local Vercel link. This verification adds only this report to the candidate source. |

Reviewed the optimization and security history from the original tag through the candidate. The changes match the recorded test repairs, dependency updates, cleanup, consolidation, connection retry, documentation, measured formatter change, and security work. The baseline-to-candidate Git whitespace check passed. No CSS, public asset or source template differs in that comparison. The previous local Git bundles verify as complete histories for their respective checkpoints. Those bundles cover source recovery and predate the three security commits. [Optimization and security review](FINAL_OPTIMIZATION_REVIEW.md)

## Database and recovery evidence

The workspace `.env` supplies an explicit non-loopback `MONGODB_URI`. Its `NEXTAUTH_URL` is loopback HTTP. The local project is not linked to a deployment, so the actual deployment database and hosted environment values cannot be identified from this configuration. The native driver connected to the configured endpoint for read-only checks. No URI, credentials, host names, database name or document contents were recorded. The endpoint reported MongoDB **8.0.36** and replica-set topology.

| Workspace database check | Result |
|---|---|
| Billing indexes | Required partial unique client/FY Annual Return index, billing lookup index and sparse unique quotation-source index present. Superseded full unique client/FY index absent. |
| Billing data preflight | 117 bills, zero missing `billType` values, and zero duplicate Annual Return groups in the read-only sample. |
| Related indexes | Unique Annual Return client/FY and tracker-entry tracker/client indexes present. Payment billing/client lookup indexes and a unique auth session-token index present. |
| Target binding and backup | **Unverified.** The deployment's database binding, available backup, recovery point and target restore test could not be established. |

The current workspace endpoint shows no missing billing type or legacy full unique index. If the operator confirms it is the intended target, repeat the documented read-only checks against that confirmed target and review the result before deciding whether any apply step is needed. [Billing migration procedure](docs/billing-schema-maintenance.md)

### Migration and restore rehearsal

**Synthetic rehearsal: passed.** Downloaded the official MongoDB server and Database Tools to a temporary directory and ran MongoDB 8.0.34 as a loopback-only standalone. Backed up a synthetic database with `mongodump`, restored the archive to a fresh namespace with `mongorestore`, and ran the repository's billing migration command against that restored namespace. The dry run changed no documents or indexes. Apply set only `billType` and `billTitle` on one legacy bill, installed the three required indexes and removed the superseded full unique index. Reapplying updated zero bills. The partial index rejected a duplicate Annual Return bill.

| Rehearsal check | Before | After |
|---|---:|---:|
| Bills, payments, clients | 3 / 4 / 3 | 3 / 4 / 3 |
| Quotations, Annual Return records, tracker entries | 1 / 1 / 1 | 1 / 1 / 1 |
| Billed, paid, outstanding | ₹2,600 / ₹600 / ₹2,000 | ₹2,600 / ₹600 / ₹2,000 |
| Unallocated advance | ₹50 | ₹50 |

Billing GET rows and all six Report Studio billing variants matched before and after, including payment allocations. Related records were identical. A second restore to a fresh rollback namespace reproduced the pre-change documents, billing indexes and report outputs. Initial harness attempts needed a longer startup probe and a corrected collection adapter. The successful run used a fresh synthetic namespace. The audit directory retains the aggregate receipt and the 1,253-byte synthetic archive, verified by SHA-256. No workspace records were copied. The standalone test differs from the configured 8.0.36 replica set and does not prove target backup or restore behavior.

**Target-data rehearsal: not performed.** No isolated restore of the target database was available. A synthetic backup or local Git bundle cannot establish the availability or recoverability of a target database backup. [MongoDB backup and restore tools](https://www.mongodb.com/docs/database-tools/)

## Local release verification

| Check | Result |
|---|---|
| Fresh `npm ci` and dependency tree | Pass, in a temporary directory with only the manifest, lockfile and vendor package copied. |
| TypeScript, strict lint, production build | Pass. Standalone typecheck ran with incremental caching disabled, followed by zero-warning lint and a fresh Next production build. |
| Core and browser | 37/37 core and 8/8 standard browser suites passed, including billing, FY UI, account security, tracker responsive/navigation, document attachments, email activity and PDF. |
| XLSX and financial reconciliation | Pass. Actual XLSX outputs reopened in fixtures for billing, legacy reports, custom clients, Report Studio, tracker current state and email history. The synthetic migration repeated reconciliation on real MongoDB. |
| Email compatibility | Pass in fixtures. Nodemailer 8.0.11 and 10.1.4 produced identical SMTP authentication outcome, two envelope recipients and MIME attachment bytes on loopback. Notification and OTP templates and template drift passed. No live TLS or provider credentials used. |
| Built route and file checks | Pass. Maintenance GET and HEAD returned 405. Anonymous maintenance POST and protected reads returned 401. Chromium is in the PDF trace. Inspection of 145 production trace manifests found no references to local temporary outputs or verification scripts. |

Synthetic core and browser fixtures cover administrator and Google approval/session logic, optional 2FA and OTP, notifications and attachments, clients, financial years and Annual Return status, EPR targets, tracker membership and workflows, billing and Report Studio reconciliation, and PDF and XLSX exports. The fixtures use mocked providers or isolated services. These results do not verify a live OAuth exchange, full provider delivery or authenticated staging workflows.

The original and final login screenshots matched pixel for pixel at 390 and 1440 px. The tracker menu matched at 390 and 600 px, with the same opening, closing, tap, Escape and modal observations and eight fixture requests. All three rendered quotation pages matched the saved pre-hardening baseline pixel for pixel. Browser fixtures exercised forms, dropdowns, loading, navigation, responsive layouts and reduced motion. These comparisons cover the captured screens and exercised flows. A hosted comparison across all application pages remains unperformed.

## Staging and external integrations

The operator confirmed that no separate staging URL or isolated MongoDB restore is available. The following are release gates rather than passed tests.

| Gate | Evidence and outstanding verification |
|---|---|
| Maintenance callers | Repository search found no first-party GET caller. The three routes are active-administrator, exact-origin POSTs. Check external bookmarks, runbooks, integrations, and the canonical deployed origin before use. Exercise authorized writes only on isolated data. |
| Auth and sessions | Local mocks cover account approval, OTP, 2FA and session revocation. Verify deployed HTTPS origin, Google callback registration, stable auth/encryption secrets, secure cookie behavior, and approved administrator/ordinary staging accounts. The local configuration lacks website Google OAuth credentials and cannot establish hosted values. |
| Email, notifications, OTP | Legacy SMTP and Gmail OAuth are separate. Verify the deployed Node runtime, TLS, sender and app password if SMTP is enabled, and scoped OAuth refresh credentials for Gmail/Drive. Verify the delivery secrets and run controlled internal-recipient smoke tests. No live provider login or send was attempted. |
| Quotation PDF | Local Chrome fixtures verify offline rendering and output. Confirm the hosted Chromium binary starts with the sandboxed print settings, fonts and tracing intact. Verify representative PDF output and attachment behavior on the intended runtime. |
| Client, EPR, Annual Return, tracker, billing, reports and exports | Staging walkthrough **not performed**. Use isolated records to exercise CRUD, transitions, reconciliation, authorization, exports and maintenance without touching production or customer accounts. |
| Environment and artifacts | The repository documents the main database, auth, mail/Drive, OTP/PIN, optional Chromium override and separate migration settings. Vercel uses `npm ci`. Its ignore rules exclude temporary outputs and the archived local experiment. Test scripts are outside the production route and dependency traces. The PDF route falls back to traced Chromium when system Chrome is absent. Hosted values, runtime, file tracing on the target and provider credentials remain unverified. |

## Dependency risk

The fresh production audit reports eight moderate package findings, zero high and zero critical. The eight entries arise from the ExcelJS archive dependency chain and one minimatch advisory. Application workbook exports use `xlsx.writeBuffer` with JSZip. The code review found no app input reaching Archiver as a user-controlled glob. The registry still lists the installed minimatch versions as affected, and its patched release is outside the current compatible ranges. Retain the lockfile and document the residual finding pending a compatible upstream change. No forced update or downgrade was applied. [Minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

## Approval and rollback gates

1. Confirm the release artifact and the intended deployment's database, origin, runtime and credentials through the operator's secure configuration. Verify `NEXTAUTH_URL` is the canonical HTTPS origin and preserve existing authentication and encryption secrets.
2. Obtain a current backup and successfully restore it to an isolated target. Rehearse the billing dry run and, if required, apply there. Compare counts, related records, allocations and totals. Review the MongoDB version, index compatibility, permissions and any duplicate records. Pause billing writers and older application instances before any separately approved production migration. [Operator procedure](docs/billing-schema-maintenance.md)
3. Complete the staging walkthrough, external maintenance caller review, and controlled live mail and Chromium checks. Record outcomes before requesting production approval.
4. Keep the last known working deployed artifact and its configuration available. For a code-only rollback, switch traffic to that verified artifact only after checking it can operate with the current schema and indexes. Earlier code can reintroduce read-triggered schema operations and previous authorization defects. Do not assume that reverting the Git branch restores database state.
5. For a data rollback, stop writers and use the verified pre-change recovery point and the approved recovery plan. Restore to a separate target first, reconcile billing, payments, indexes and post-backup activity, then obtain approval before changing traffic or replacing data. Restoring the old full unique client/FY index in place can fail after general and Annual Return bills coexist.

The candidate is suitable for local validation. Production approval remains blocked until target identity and recovery, target-data rehearsal, staging functionality and hosted integration checks are evidenced.
