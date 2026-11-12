# Browser-coordinated email delivery

This replaces the earlier managed-queue design. Production uses Next.js, MongoDB and the existing Gmail/Drive integration. It does not install or initialize Inngest, require its keys, expose its route, run a scheduler, or require a separate worker/server account.

## Execution and persistence

The existing tracker prepares an exact immutable batch. OTP/PIN verification, normalized recipient restrictions and Hold to Send remain at the acceptance boundary. `POST /api/client-trackers/:id/email/deliver` binds the existing approval to the campaign and persists its messages, workflow/field snapshot and actor. It returns accepted/already_accepted with truthful zero/actual success counts, and sends no Gmail messages itself.

Only after that explicit interaction does the dashboard provider POST confirmed intent to `/api/email-delivery/jobs/:campaignId/resume`. The server validates the authenticated administrator, exact campaign owner and persisted authorization binding. It claims a coordinator lease and returns a random 32-byte capability. MongoDB stores only its SHA-256 hash; the browser keeps the capability in the mounted provider's memory. Tokens are not written to browser storage or returned by status/history reads.

The browser serially POSTs that token to `/api/email-delivery/jobs/:campaignId/batch`. The endpoint rejects recipient lists, HTML, attachment contents and other extra fields. It reads the existing approved snapshot and calls the shared server delivery engine. The default is one message per request, maximum five, with a 15-second soft work budget. Gmail calls and Drive downloads receive abort signals. Each endpoint declares a 60-second Vercel maximum, leaving time for state persistence and response. A stalled database/provider can still exceed the soft budget or hit the hosting timeout; the lease and uncertainty rules cover this case.

Gmail calls remain serial, with the existing 350 ms spacing and 350-send rolling 24-hour allowance. The engine retains eligibility checks, attachment authorization/limits, initial/reminder history, reply suppression, cooldowns, per-message pending-to-delivering CAS, fenced Gmail acknowledgments and history repair. New jobs use `jobVersion: 2`; existing version-1 snapshots can be adopted only through explicit authorized acceptance/resume. No campaign is automatically migrated, deleted or reset.

## Navigation, tabs and interruption

`EmailDeliveryActivityProvider` is mounted in `components/layout/DashboardShell.tsx`, beneath `app/dashboard/layout.tsx`. Normal Next.js client navigation among dashboard, clients, client profiles, trackers, reports and settings preserves this layout and controller. The original tracker page and modal do not coordinate subsequent messages. Hard links, reloads, auth redirects, leaving the dashboard layout, browser shutdown, network loss and device/tab suspension can interrupt coordination.

No new provider automatically starts work from restored status. An old request may still finish its bounded batch after its browser closes. A standard `beforeunload` leave guard exists only while this provider coordinates work; browsers control whether they display it. The expanded dock tells employees to keep the website open and permits them to work anywhere within the dashboard.

Each campaign has an expiring two-minute coordinator lease. The existing organization-wide MongoDB Gmail lease remains authoritative across all campaigns, users and tabs. An explicit takeover must acquire the global lease before rotating coordinator ownership. Competing claims receive a busy result; stale tokens cannot renew or claim new work. The server validates current ownership again before a pending item is claimed. Client tab coordination is not trusted as the duplicate-prevention boundary.

After refresh/reopen, the dashboard reads saved progress. While a coordinator or batch lease is live, it shows the saved state and explains that another browser/current batch may own the campaign. Once the coordinator expires, the campaign is shown as interrupted and offers **Resume remaining**. This action requires deliberate confirmation; pending direct sends use Hold to Send again. Resume reuses the existing approved record and exact owner. Existing policy already permits an unchanged, durably authorized campaign to continue without repeating OTP/PIN; expired, unconsumed challenges cannot authorize new work. Ownership, active admin access, tracker availability and delivery safety checks still apply. Changes to a prepared batch require a new approval.

Takeover reconciles abandoned delivering items as uncertain only after the global lease is free. Uncertain messages and confirmed sent/draft items never return to pending. Gmail acknowledgments are saved before optional bookkeeping. Missing history can be repaired without sending again. Unknown HTTP/Gmail responses do not imply that Gmail sent nothing: the browser stops that campaign loop, fetches persisted status and requires explicit safe resumption. There is no exactly-once transaction spanning Gmail and MongoDB.

Quota pauses stop the current browser loop. Employees may explicitly resume later; the server rechecks the actual rolling allowance. There is no hidden automatic daily-limit scheduler. Failed/uncertain items require review rather than an unconditional retry button.

## Activity UI

The same compact neutral-glass dock expands into real sent/draft/failed/uncertain/pending counts, per-message status, safe errors, addresses, subjects, timestamps and Gmail references. Processed is distinct from sent. Filtering and 25-row pagination do not change delivery. Minimize preserves filters. History persists in MongoDB and is reachable through the tracker Email history dialog's Delivery campaigns action. There is no permanent empty floating dock.

The authorization surface uses local OTP/PIN processing and pressure/perimeter Hold to Send. Accepted feedback gently condenses before the dock appears; it does not claim that acceptance means Gmail completion. Reduced motion retains the full hold duration, keyboard/touch support and all cancellation behavior. No workflow editor, Gmail signature template, global Liquid Glass tokens or main review Send-button material was redesigned.

Visible active status polls approximately every three seconds, hidden status every thirty seconds, idle discovery every sixty seconds, with focus/online refresh and in-flight deduplication. The coordinator uses authoritative batch responses, not simulated counters. Reads do not start work. Browser throttling can delay both polling and batches.

## Git, dependencies and Vercel

- `local-inngest/` is a local-only archive with its own standalone package manifest. The former SDK adapter, workflow wrapper, route and setup notes are preserved there as reference text. It contains no duplicate Gmail engine and is not connected to the application.
- Root `.gitignore` excludes this whole directory, local `.inngest` data, Inngest CLI configs/logs and `.env.inngest*`. Root `.vercelignore` excludes these on CLI uploads too. TypeScript excludes the experiment directory. It is not an npm workspace and has no import into production code.
- Main `package.json` and `package-lock.json` contain no Inngest SDK/CLI dependency. Removing only source files or putting a dependency into devDependencies would not be sufficient: Vercel commonly installs development dependencies while building. This implementation removes it from the main install graph entirely.
- `vercel.json` sets `installCommand: npm ci`, using the checked-in main lockfile. Deploy the directory containing the main package.json: choose `align` as Vercel Root Directory when the Git repository contains that subdirectory, or `.` when align's contents are already the repository root. Do not select `local-inngest` or add a custom command that installs it.
- Keep the existing MongoDB/auth/Gmail/Drive/OTP/PIN secrets. No Inngest variables are required. Optional server tuning is shown in `.env.email-browser-delivery.example`: batch size 1..5 (default 1), soft budget 5000..20000 ms (default 15000).
- Confirm the project's function duration supports the declared 60-second maximum; see [Vercel function limits](https://vercel.com/docs/functions/limitations). The 15-second work budget is deliberately smaller. No Vercel Cron configuration is needed.
- If an old deployment was connected to Inngest Cloud, disable/remove its old app, workflow/recovery schedule and Vercel integration during cutover. Old deployment-specific URLs can remain accessible independently of the new deployment. Remove unused Inngest environment keys from Vercel. This local change cannot unlink a remote account/integration automatically.
- Redeploy the changed manifest, lockfile, removed route and source changes together. No production sends, account changes or deployment were performed during implementation. Existing Vercel, MongoDB and Gmail usage/plan costs still apply; no new managed-queue subscription is required.

Git ignore rules do not remove already tracked files ([Git documentation](https://git-scm.com/docs/gitignore)). From the actual align repository root, if this folder had already been tracked, use:

```powershell
git rm -r --cached --ignore-unmatch local-inngest
git add .gitignore .vercelignore package.json package-lock.json vercel.json
# Also stage/review the application source additions and removal of /api/inngest.
```

The cached removal keeps local files. Review the diff before committing; already published secrets need separate rotation/history handling. Git metadata is unavailable in this workspace, so no real repository index or remote was changed. Ignore behavior is verified in a temporary isolated Git repository. `.vercelignore` covers CLI uploads; files absent from Git will not reach a fresh GitHub deployment ([Vercel documentation](https://vercel.com/docs/deployments/vercel-ignore)).

## Verification and deployment smoke test

Isolated tests use actual services/routes/React controls with fixture databases and mock Gmail only inside scripts. Production has no mock delivery adapter or test endpoint.

Validation on 15 October 2026: the browser-coordinator, original security, Settings/authorization, tracker-review and dashboard activity suites passed, including explicit resume after refresh and standard leave-confirmation handling. Workflow messages, workflow review/delivery and verification-email MIME/signature regressions passed. Lint passes with three existing warnings in the tracker page and client-profile image rendering. The production build passes with a 4 GB Node heap allowance; its route and dependency-trace checks exclude the experimental SDK and archive, and client import graphs exclude server delivery modules. A fresh live deployment/Gmail smoke test remains required below.

- `npm run verify:email-browser-delivery`: immutable/no-queue acceptance, strict batch body, cross-site/owner checks, bounded serial work, competing claims, stale-token fencing, explicit-only takeover, live-request protection, uncertain/sent preservation, stopped loops, no retry after an unknown response and expired approval rejection.
- `npm run verify:email-production-isolation`: main manifest/lockfile/source isolation, removed route, TypeScript/Vercel exclusions and actual Git-ignore behavior. Add `-- --built` after a production build to inspect route manifests and runtime dependency traces.
- `npm run verify:email-delivery-security`: original OTP/PIN, authorization, concurrency, ambiguous Gmail, history repair and daily-cap regression suite.
- `npm run verify:email-delivery-security-ui -- --fresh-artifacts`: protected Settings and authorization, keyboard/touch Hold, errors, reduced motion and leave/save guards.
- `npm run verify:email-delivery-review`: tracker review/recipient editing/signature, reason filtering, acceptance, drafts, resume and 500-client layouts.
- `npm run verify:email-delivery-activity-ui`: navigation among clients/settings/another tracker while actual browser coordination runs against isolated APIs, refresh interruption, explicit Hold-to-resume, leave-guard cleanup, history/search/filters/pagination, partial outcomes and responsive layouts.
- TypeScript, lint and production build are also required. Generated records, captures and temporary repositories remain under ignored `tmp/`.

After deployment, perform an explicitly authorized small internal-recipient campaign. Navigate across dashboard routes, verify one Gmail acknowledgment per item, refresh between batches, wait for any current lease to settle and resume only remaining work. Repeat with two tabs to verify exclusion. Check the production route list has no `/api/inngest`, and the install log has no Inngest dependency. Live MongoDB/Gmail and deployed Vercel behavior remain unverified until this smoke test; isolated passing checks are not a guarantee of all production conditions.

## Main changed paths

- Backend: `lib/server/email-delivery-controller.ts`, `tracker-email-worker.ts`, `email-delivery-jobs.ts`; campaign coordinator fields; batch/resume/status routes; abort-aware attachment/Drive reads. Managed queue/workflow modules and the public Inngest route were removed from production.
- Frontend: dashboard-level activity provider, pure browser coordinator, dock/resume confirmation, authorization handoff, tracker acceptance contract and shared dashboard styles. Existing campaign and EmailLog records remain the source of truth.
- Isolation/configuration: `.gitignore`, `.vercelignore`, `tsconfig.json`, `vercel.json`, main package manifest/lockfile, ignored `local-inngest/`, optional batch tuning example.
- Tests/docs: browser-coordinator and production-isolation suites; updated security/review/activity fixtures and assertions; this guide, README and linked delivery notes.
