# Access & Users security

Implemented in the existing NextAuth v4 / Mongoose database-session architecture. No new runtime dependencies or replacement authentication framework were added. Client, EPR, invoice, report and other business modules were not changed.

## Configuration and rollout

1. Back up the database and deploy all changed files together. Restart the application so the extended Mongoose schemas load; restart an existing development server as well.
2. Retain `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `MONGODB_URI`, and the current `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`. The existing environment password remains the bootstrap credential until it is successfully proved. The app then saves a bcrypt hash and the administrator's stable database ID. Environment credentials cannot subsequently restore an old login email/password or reactivate a disabled account. `ADMIN_PASSWORD` is accepted only outside production, as before.
3. Reuse the existing `GMAIL_USER`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, and `GMAIL_OAUTH_REFRESH_TOKEN`. The refresh token needs Gmail send permission; the project's existing `gmail.compose` scope supports sending. Security messages skip signature lookup and do not pass through client email campaigns or client email history. No SMTP service or new dependency is required.
4. Optionally set **`AUTH_SECURITY_EMAIL`** to the initial administrator/security mailbox; otherwise the connected `GMAIL_USER` is used. This initial trusted deployment configuration must be a mailbox controlled by the administrator. The first successful admin security operation proves that mailbox by OTP and pins it in `AccountSecurityConfig`. Login email changes never change it. Replacement recovery Gmail requires codes sent to both old and replacement addresses. After it is pinned, changing sender/environment configuration does not change the recovery recipient.
5. **`AUTH_TRUST_PROXY=true`** is optional and must be set only when the ingress strips incoming forwarding and geographic headers and writes authoritative values. Vercel is detected automatically. Without that trust, IP/location are `Unknown`; user agent remains self-reported device information. The app never infers the browser's location from the server's public IP and makes no third-party geolocation request during authentication. Existing sessions retain their available metadata; missing fields remain unknown.
   On localhost, security emails explicitly explain that no trusted public client IP or geographic location is available; device/OS/browser are still captured from the request. Do not enable proxy trust merely to fill these fields in development. Trusted client addresses are validated and IPv4/IPv6 normalized; custom proxies use their forwarded IP instead of a client-supplied Vercel-specific header. Vercel trust requires its enabled platform flag (`1` or `true`).
6. Sign in once with the legacy administrator password to complete automatic credential migration. Existing administrator records already have their stored role preserved. A legacy Google-only session whose admin privilege previously came exclusively from an email comparison must first prove the configured admin password to establish the stored administrator role. Merely adopting `ADMIN_EMAIL` never grants a role.
   If an existing admin session enabled 2FA first, the already-pinned admin can still prove the legacy environment password to migrate it. This exception applies only to that active stored admin with no database password and unmanaged credentials; it never replaces an existing password, revives a disabled user, or bypasses 2FA. A conditional database update ensures a concurrent password/status change wins.
7. Exercise a test account and verify real Gmail delivery and the actual Google redirect/cookie flow in the deployment. The supplied automated tests deliberately do not use real accounts, send emails, or mutate production data.

See `../.env.account-security.example` for the exact environment names. Do not rotate `NEXTAUTH_SECRET` as a migration step: it protects existing cookies and keyed security hashes. Rotating it invalidates pending OTPs, recovery-code hashes and remembered-device identifiers; plan account recovery before a deliberate rotation.

## Database changes

No destructive or bulk data migration is required. New user fields default to 2FA off and security version zero; missing session versions are treated as zero. Legacy sessions continue until their existing expiration or an explicit revocation/security change. Password and email changes preserve the account ID and client data. Admin password bootstrap migration happens only after successful password verification; the raw password is never stored.

New collections: `securitychallenges`, `securitygates`, `accountsecurityconfigs`, `knownauthdevices`. Mongoose creates their indexes normally. If database auto-indexing is disabled, create these additive indexes during deployment:

```javascript
db.securitychallenges.createIndex({ userId: 1 });
db.securitychallenges.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
db.securitygates.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
db.knownauthdevices.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
```

MongoDB's `_id` uniqueness protects challenge claims, limit windows, cooldowns and device records. Expiration is checked by the application even before the TTL worker deletes a record. Existing user email/login-ID and Google provider/subject unique indexes remain required. Recovery addresses and stable administrator ID are kept in the `primary` config document.

## Verification and recovery behavior

- Admin email/password changes require the security Gmail OTP. Email activation also requires the proposed mailbox OTP. Prepared password changes contain a bcrypt hash, never a plaintext password. New passwords require 12 characters and at most 72 UTF-8 bytes, avoiding bcrypt truncation for newly set passwords.
- OTPs use Node cryptographic randomness and HMAC-SHA256 storage under the existing server secret. They are bound to the user, action, session/preauthentication cookie, prepared change, expiration and account security version. Five incorrect attempts exhaust a challenge; codes expire in five minutes. Correct verification atomically consumes the challenge before a version-checked mutation.
- OTP sends have an account-wide 60-second cooldown and six-request / 15-minute quota. Password login has account and IP limits; second-factor verification has a separate IP limit. Limit counters and cooldowns live in MongoDB and work across application instances. A trusted proxy is needed for useful per-IP limits; otherwise the conservative unknown-IP bucket is shared. Settings verification also has an account limit.
- Each owner enables/disables their own 2FA after email verification. An unverified non-admin local-account email is proved during enrollment. The administrator's email-shaped website login ID is not assumed to be a working mailbox. Administrator 2FA enrollment, login, disabling and recovery-code replacement use a single code sent to the separate configured security Gmail. Enrollment does not mark the website login ID as a verified email. Pending requests from the former two-mailbox admin 2FA policy must be canceled and requested again. State does not change while a code is pending. Admin user-management endpoints cannot toggle another account's 2FA or overwrite an enrolled factor email.
- Password and Google primary authentication both require the website email OTP when enabled. An HTTP-only short-lived preauthentication cookie grants no protected-page/API access. Google uses the provider's verified email and immutable subject, and a stored provider link survives changes to the factor mailbox.
- Enrollment/replacement issues ten random single-use recovery codes, shown once and stored only as hashes. A recovery code follows successful primary authentication; it is never a standalone login. It does not silently disable 2FA. During a Gmail outage a pending login remains available for recovery-code verification.
- Non-admin owners can recover their factor email with a saved recovery code plus proof of the new mailbox. A recovery-code login supplies a one-use five-minute recovery authorization, so the last saved code can still lead to mailbox recovery. Otherwise the recovery-email request consumes another saved code. Administrators use the normal Change Email flow, which verifies their separate security Gmail and proposed login email. No administrator override disables another user's second factor.
- If every recovery code and all verified mailboxes are lost, automatic recovery fails closed. Restore mailbox access or use a separately controlled operational recovery procedure; no insecure email-only or admin-toggle bypass is included. Recovery Gmail replacement always requires both addresses.

## Google approval and sessions

New verified Google identities retain one pending user record. Repeat requests preserve the original request time and are throttled. Pending rows show email/name, request time, device, IP and approximate location if available. Rejected/disabled accounts are denied and are never revived by an environment allow-list. `ALLOWED_GOOGLE_EMAILS` remains a first-time bootstrap allow-list; it cannot reapprove a pending/rejected account. Already approved users do not need repeated approval.

Approval/rejection and session management require current authenticated authorization. The user-management API cannot edit admin credentials through its older reset route; the existing admin Reset Password action opens the verified password control instead. Admin accounts cannot be deleted/disabled through generic user management. Non-admin password resets and authorization changes increment the security version and revoke sessions.

Every existing protected API's `getServerSession(authOptions)` now passes through the database adapter's expiry, current status, Google approval and security-version checks. Revoked or disabled sessions cannot use an old tab to keep accessing APIs. Security changes invalidate other sessions and all pending challenges, while retaining the verified current session. “Revoke all my other sessions” is scoped to the requesting account even when requested by an admin; admins retain individual revocation controls for visible sessions.

The existing signed-in-browser section shows device/OS/browser, owner, login IP/location, current-device label, and expandable login/activity/expiry times in IST. Login metadata is captured on the server and is not overwritten by later page visits. Activity is updated on authenticated requests at most once every five minutes. No polling, GPS, fingerprinting library or extra dropdown library is used. A random HTTP-only browser cookie and coarse location comparison provide advisory new-device/location alerts, without blocking login.

## Notifications

`next/server`'s `after()` defers security delivery until after the authentication response and keeps it alive on supported Next.js hosting. Failed delivery is caught and logs only a fixed message. Login notices, pending/rejected attempts, suspicious-device/location notices, recovery-code use and verified security changes include available identity/device/network data and IST time. Unauthenticated password attempts explicitly label the email/login ID as claimed and unverified. OTPs occur only in the purpose-specific verification email, never activity notices, API responses or logs.

Repeated failures are throttled to one message per event/account/IP per ten minutes; other ordinary events are deduplicated for a minute, with an aggregate 100/hour notification cap. Verified credential-change confirmations are not suppressed by that ordinary-event cap and are sent to the previous/current relevant mailboxes. This is lightweight best-effort notification delivery, not a durable retry queue: provider/hosting failures can lose an activity notice. OTP delivery failure leaves credentials unchanged. Security mail does not delay ordinary successful or failed login responses; requesting a necessary OTP waits for delivery to report whether a usable email was sent.

## Validation

```text
npm run verify:account-security
npm run verify:account-security-ui
npx tsc --noEmit
npx eslint lib/auth.ts lib/authUsers.ts lib/mongooseAuthAdapter.ts lib/server/account-security*.ts models/AccountSecurity.ts models/User.ts models/AuthSession.ts app/api/auth/admin-login/route.ts app/api/auth/second-factor/route.ts app/api/settings/account-security/route.ts app/api/users/route.ts app/api/sessions/route.ts app/login/page.tsx app/dashboard/settings/AccountSecurityControls.tsx app/dashboard/settings/AccessPanel.tsx
npm run build
```

The repository's existing `npm run lint` also passes. It emits a Next.js deprecation notice plus three existing warnings in untouched client-tracker/client-profile files. Direct ESLint on the modified production files passes without warnings.

The security suite executes actual services, HTTP handlers, the NextAuth callback and database adapter against isolated atomic fixtures. It covers bootstrap credentials, success/failure changes, dual-address proofs, OTP expiry/attempt/cooldown/replay, owner-only 2FA, password/Google challenges, delivery failure, recovery and mailbox replacement, Google statuses, approvals, rejection, session revocation and notification handling. No real MongoDB/Gmail/Google session is used. Browser tests mount the production Settings and Login components with fixture endpoints, check unsaved/pending/saved 2FA states, recovery-code display, dual email inputs, password-to-OTP login, rejected OTPs, recovery-code login, mobile menu open/Cancel/outside tap/actions and responsive widths. The preserved menu implementation is also checked against a SHA-256 hash captured from the original source (normalizing only line endings).

Completed validation: 20 security checks, including a non-mailbox administrator login ID, 2FA enrollment before legacy password migration, localhost network explanations, trusted IPv4/IPv6 and geographic headers, and rejection of spoofed/invalid metadata, plus browser interaction checks, TypeScript, targeted ESLint, project lint and the production build pass. The existing `verify:email-delivery-security` and `verify:report-security` regression suites also pass. Project lint/build retain the three existing warnings described above. Browser QA used 390px, 820px and 1280px viewports, with screenshots visually inspected.

Browser screenshots are written under `tmp/account-security-ui/`. Full deployment OAuth redirect behavior and live Gmail delivery require the configured external accounts and remain an operator smoke test.

The security design follows the OTP, factor-change and recovery principles in the [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html). Email OTP remains dependent on mailbox security, including for Google identities; a website OTP is an independent application check, but is not a phishing-resistant authenticator.

## Changed files

Modified:

- `lib/auth.ts`, `lib/authUsers.ts`, `lib/mongooseAuthAdapter.ts`, `lib/device.ts`
- `models/User.ts`, `models/AuthSession.ts`
- `app/api/auth/admin-login/route.ts`, `app/api/users/route.ts`, `app/api/sessions/route.ts`
- `app/login/page.tsx`, `app/dashboard/settings/AccessPanel.tsx`
- `package.json` (verification commands only)

Added:

- `models/AccountSecurity.ts`
- `lib/server/account-security.ts`, `lib/server/account-security-crypto.ts`, `lib/server/account-security-mail.ts`
- `app/api/auth/second-factor/route.ts`, `app/api/settings/account-security/route.ts`
- `app/dashboard/settings/AccountSecurityControls.tsx`
- `scripts/verify-account-security.cjs`, `scripts/verify-account-security-ui.cjs`
- `scripts/fixtures/account-security.tsx`, `scripts/fixtures/account-security-login.tsx`, `scripts/fixtures/account-security-session.cjs`, `scripts/fixtures/account-security-navigation.cjs`
- `.env.account-security.example`, `docs/ACCESS_USERS_SECURITY.md`

Local backups: `.artifacts/access-security-before/` (not runtime code). Generated build/type-cache artifacts may also be refreshed by validation.
