# Nextgen Solutions ERP

Internal EPR consultancy application for clients, compliance workflows, financial years, quotations, billing, payments, reporting, documents and controlled email delivery.

## Stack and prerequisites

Next.js 15 App Router, React 19, strict TypeScript, Tailwind 3, MongoDB/Mongoose, NextAuth 4 database sessions, SWR, Framer Motion, Tiptap, ExcelJS, Chromium/Puppeteer PDF printing, Gmail/Drive APIs and local screenshot OCR. Exact versions are in `package-lock.json`; use npm.

Validation uses Node 24.14.0/npm 11.9.0 on Windows. Match that environment for comparable checks. The host configures the deployment runtime separately. Actual application use requires MongoDB. Browser fixtures use Google Chrome. The quotation PDF route can use Chrome or Edge on Windows and falls back to the traced `@sparticuz/chromium` binary on deployment.

## Install and configure

From the directory containing this README:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Copy the example only for a new setup. Preserve existing environment files and encryption secrets. Configure the database, authentication and initial administrator before starting.

| Variables | Purpose |
|---|---|
| `MONGODB_URI` | Database connection; configure explicitly outside development. |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Canonical website origin and stable auth secret. |
| `AUTH_SESSION_MAX_AGE_SECONDS`, `AUTH_SESSION_UPDATE_AGE_SECONDS` | Optional positive session durations. Defaults are seven days and twelve hours respectively. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, optional `ADMIN_NAME` | Initial administrator bootstrap; existing account/security settings persist in MongoDB. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optional `ALLOWED_GOOGLE_EMAILS` | Website Google login. Allow-list bootstrap does not override pending/rejected accounts. |
| `GMAIL_USER`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN` | Actual runtime keys for Gmail delivery, drafts, notifications and signature integration. |
| `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Managed documents; client ID/secret may fall back to Gmail OAuth credentials. |
| `AUTH_SECURITY_EMAIL`, `AUTH_TRUST_PROXY` | Optional initial security mailbox and trusted-ingress handling. Leave proxy trust false locally. |
| `CLIENT_CREDENTIALS_SECRET` | Optional credential-encryption key; otherwise uses `NEXTAUTH_SECRET`. Preserve the existing key for stored credentials. |
| `EMAIL_DELIVERY_OTP_SECRET`, `EMAIL_SEND_PIN_PEPPER` | Protected email workflows require separate random secrets of at least 32 bytes each; there is no auth-secret fallback. |
| `GMAIL_APP_PASSWORD` | Optional legacy SMTP path; tracker delivery uses OAuth. |
| `CHROME_EXECUTABLE_PATH` | Optional local PDF browser override. |

`.env.example` lists general keys; `.env.account-security.example` and `.env.email-browser-delivery.example` explain optional settings. Real environments, browser profiles, tokens and client exports must stay out of Git/evidence archives.

Generate the administrator bcrypt hash with `node scripts/generate-hash.js "<password>"`. In a local dotenv file, use the script's escaped, quoted `ADMIN_PASSWORD_HASH` output so `$` survives expansion. In a hosting dashboard, enter only the raw bcrypt hash, without the assignment, quotes or escape backslashes. Plain `ADMIN_PASSWORD` is development-only.

Website Google OAuth redirects use `/api/auth/callback/google` on the local/deployed origin. Gmail/Drive setup has separate scopes and refresh tokens; website login alone does not authorize storage or email. See [authentication](docs/authentication.md) and [documents](docs/client-document-attachments.md).

## Development, build and tests

```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:browser
npm run templates:check
npm run build
npm run start
```

Development normally uses [localhost:3000](http://localhost:3000). Dev output is `.artifacts/development/.next`; production output is `.next`, keeping development refreshes separate. Lint uses ESLint CLI with zero warnings allowed; production build retains lint/type validation.

For the validated 4 GB Windows build allowance:

```powershell
$env:NODE_OPTIONS = '--max-old-space-size=4096'
npm run build
```

`npm test` uses synthetic records and fixture services without live storage/mail. Browser tests require Chrome and disposable OS profiles. Live read-only checks, migrations and maintenance tools are separate opt-in commands; read [development/verification](docs/development.md) first.

## Modules and structure

- Clients, company contacts, portal credentials, custom fields, notes and work items.
- EPR targets/generated credits, transactions, screenshot review and Annual Return readiness.
- Quotations, revisions/status workflow, HTML/PDF output and billing conversion.
- Annual Return/general bills, linked payments, advances, invoice metadata and reporting.
- Report Studio, saved reports, billing views, filters, drilldowns and Excel exports.
- Drive documents, uploads, invoice coverage and tracker attachment snapshots.
- Client trackers, email rules/scenarios, approvals, browser-coordinated delivery/history.
- Administrator/Google login, approvals, account-specific 2FA/recovery and session management.

```text
app/api/             HTTP endpoints and contracts
app/dashboard/       Business pages/local feature components
app/login/           Login and second-factor UI
components/          Shared layout, UI, client/FY/tracker controls
lib/                 Domain logic, caches, search and hooks
lib/server/          Shared server reads, security, delivery and exports
models/              Mongoose models/index declarations
scripts/             Isolated tests, benchmarks and explicit operational tools
templates/           Active quotation HTML and email source templates
types/               Shared declaration types
utils/               Active quotation HTML, email and sanitization helpers
vendor/uuid-safe/    Existing UUID compatibility package
docs/                Current guides and retained historical evidence
```

Start with [architecture](docs/architecture.md), [authentication](docs/authentication.md), [billing/reporting](docs/billing-reporting.md) and [development](docs/development.md). `AGENTS.md` names shared utilities and preservation rules. Dated reports retain historical observations; they are not current production guarantees.

## Deployment

Vercel runs `npm ci` and `npm run build` through `scripts/vercel-npm.cjs`, which removes the unsupported `npm_config_cache_dir` setting from those commands. Select the directory containing `package.json` as the project root (`.` for this repository or `align` when inside a parent repository). Set production environment variables and the canonical origin in Vercel. Preserve Chromium tracing and verify deployed function/runtime duration compatibility. `.gitignore` keeps local environment files, credentials, business exports, and generated output out of Git while allowing the root environment templates. `.vercelignore` excludes those local files and the environment templates from Vercel CLI source uploads.

For quotation PDFs, deploy a revision that uses `/api/quotation/pdf` and Chromium. A compile error in `utils/pdfGenerator.ts` means the deployment source still contains the retired jsPDF helper. Check the deployment's Git commit and project root against this checkout.

Verify billing indexes and complete the approved operator migration before enabling billing on a new database or rolling out the read-side change to an existing environment. [Billing schema maintenance](docs/billing-schema-maintenance.md)

Tracker email campaigns use MongoDB plus a dashboard browser coordinator. Keep the website open and explicitly resume after a hard refresh or closure. Legacy bulk billing reminders use a separate in-process SMTP job. The project has no configured production Inngest SDK/route, separate queue service or Vercel cron. A separately authorized internal-recipient smoke test is needed to verify live OAuth, mail and storage after deployment. [Delivery operations](docs/email-browser-delivery.md)

## Troubleshooting

- **Auth import fails:** set `NEXTAUTH_SECRET`, verify origin/cookies and restart.
- **Admin password rejected:** check local dotenv escaping versus raw hosting hash; do not enable plaintext production passwords.
- **Database unavailable:** check URI/network access/credentials. The shared connector retries after initial rejection; do not add another connector.
- **Gmail/Drive unavailable:** verify actual OAuth keys, scopes and refresh tokens. Never replace uncertain delivery with blind retry.
- **PDF browser missing:** install Chrome/Edge or set the executable override; deployments need the traced binary.
- **Report totals differ:** inspect allocation exceptions, FY/date filters and historical links. Never rewrite financial records to force reconciliation.
- **Build OOM/EPERM:** use the documented heap allowance and inspect process/file locks. Preserve evidence before regenerating caches.
- **Template drift:** edit email HTML, run `templates:build` then `templates:check` and relevant email tests. Quotation HTML is read separately from `templates/quotation.html`.
