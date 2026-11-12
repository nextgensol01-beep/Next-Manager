# Authentication and security boundaries

Website authentication uses NextAuth v4 with a Mongoose adapter and database sessions, plus custom administrator/password and second-factor routes. The main code is `lib/auth.ts`, `authUsers.ts`, `mongooseAuthAdapter.ts`, `authSessionConfig.ts`, and `lib/server/account-security*`.

## Login, approval and verification

- Initial administrator bootstrap verifies the configured bcrypt hash; plain administrator passwords are development-only. Subsequent account/security settings persist in MongoDB.
- Google login verifies the provider's email verification and immutable subject, resolves approved/active identities, and preserves pending/rejected/disabled state. An environment allow-list only bootstraps eligible first-time identities; it does not bypass later decisions.
- Optional per-account 2FA interrupts verified password/Google login with a bound short-lived challenge. OTP limits, resend cooldowns, recovery codes, email changes and password changes retain their existing verification rules.
- After verifying 2FA enrollment or replacing recovery codes, save the codes shown in Access & Users before leaving the page. The automatic session refresh keeps the list visible so you can copy it and confirm you have saved it.
- Sign-in, Access & Users, and Email Delivery verification emails share the layout in `lib/email-verification-template.ts`. Email changes that require two codes use separate wording for the current and replacement inboxes. Add future OTP email copy to that template and map new account actions in `lib/server/account-security.ts`.
- The adapter checks account status and security versions when resolving database sessions. Disabling/rejecting an account, credential/security changes and explicit session revocation must retain their existing effects. Server-side activity is throttled; client polling is not an authorization boundary.
- Security notifications are deferred through the existing server lifecycle and use existing Gmail integration. Never log tokens, provider payloads or verification secrets.

The server dashboard layout and protected APIs retain public session checks. Administrative routes use their existing role/status gates. Client credentials are encrypted and filtered separately; a session alone does not imply permission to read portal secrets. `NEXTAUTH_SECRET` and any existing `CLIENT_CREDENTIALS_SECRET` must stay stable for persisted data compatibility.

## Email delivery protection

Tracker acceptance binds exact approved recipients/content/attachments and owner to a persistent campaign. OTP/PIN, hold confirmation, explicit resume, coordinator/global leases, uncertainty handling, quota/cooldown and durable acknowledgment rules are preserved. `EMAIL_DELIVERY_OTP_SECRET` and `EMAIL_SEND_PIN_PEPPER` require independent random values of at least 32 bytes; unlike the client credential key, they do not fall back to the auth secret.

Gmail/Drive authorization is distinct from website Google login. Configure the runtime `GMAIL_OAUTH_*`, `GMAIL_USER` and Drive variables, scopes and refresh tokens. A deployment smoke test involving actual mail/storage requires deliberate authorization and controlled internal recipients.

## Contact maintenance routes

`/api/fix-indexes`, `/api/migrate-contacts`, and `/api/migrate-client-contact-selections` accept POST from a signed-in active administrator. The request origin must match `NEXTAUTH_URL` when configured. The old GET methods return 405. No in-app caller was found. Review external callers and verify access controls on the intended deployment before invoking maintenance. [Operator procedure](billing-schema-maintenance.md)

## Verification limits

`verify:account-security`, `verify:account-security-ui`, delivery-security/browser-coordinator suites, and email-template/PDF tests use real application code with synthetic sessions and mocked storage/providers. They verify application contracts, not a successful live OAuth exchange or real provider delivery. Keep those distinctions explicit when reporting results.
