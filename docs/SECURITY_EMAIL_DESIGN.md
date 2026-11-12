# Security notification email design

This change updates email presentation only. Authentication, OTP generation and verification, account approval, session management, recipients, notification triggers, throttling/deduplication, database schemas, website UI and mobile menus are unchanged.

## Shared design

- White, centered 540px content area, matching the approved delivery-verification email's brand color, Arial typography, heading scale, spacing, divider and company footer.
- A small event-specific shield, warning, user/shield, lock, email or recovery-key graphic.
- A pale blue-grey rounded details card with compact device, account, approximate location, IP address and IST time rows. OS and browser are combined as `Windows · Chrome`; mobile accounts receive a smartphone icon.
- Friendly headings/copy for administrator/user sign-ins, failed and suspicious sign-ins, Google authentication and access requests, pending/rejected users, password/email/recovery-Gmail changes, 2FA changes and recovery-code events.
- One blue review button using only the configured app origin and the existing authenticated `/dashboard/settings?tab=access` or `/dashboard/sessions` page. There are no direct approval/rejection API links, session tokens or signed-action links.
- Missing values display `Unavailable`; claimed identities remain explicitly unverified. Existing localhost/network notes remain available. Event details come from the existing notification input; sample preview data is fictional.

## Graphics and email compatibility

The email uses tiny raster PNGs generated from the existing Lucide icon style. The generated base64 constants are source assets, not HTML data-URI images: real emails reference them with `cid:` URLs and include their PNG bytes as inline MIME parts. Images do not require a public website, external CSS, an icon font, SVG support, a tracking endpoint or an external image CDN. Only the six needed icons are included in each message; fixture checks keep their combined PNG payload under 12KB and the HTML under 24KB.

The sender's optional `inlineImages` presentation field creates a `multipart/related; type="text/html"` section inside the existing HTML/plain-text alternatives. Normal file attachments remain separate. New notification bodies and inline PNG base64 are folded to 76-character lines, and each message has unique CID identifiers. Existing non-CID message encoding is unchanged. This follows the embedded-part approach in [RFC 2392](https://www.rfc-editor.org/rfc/rfc2392) and [RFC 2387](https://www.rfc-editor.org/rfc/rfc2387).

Layout uses presentation tables, width attributes, inline colors/spacing, optional mobile media rules and a fixed-width MSO wrapper. Icons are decorative; all values and actions remain readable when images are blocked. Plain-text alternatives include the same event details and review destination. Classic Outlook may display square corners; rounding is cosmetic and is not required to read the email. Local browser previews cannot certify every Gmail/Outlook version, dark-mode transformation or image-blocking policy. Native inbox rendering has not been directly tested; `.eml` samples are included for that check.

## OTP isolation and scope verification

`lib/email-verification-template.ts` was not changed. The existing delivery-verification template/transport test passes. Account OTP sends keep the same subject prefix, plaintext, original default HTML and absence of inline graphics; the optional presentation argument is used only by activity notifications.

The notification sender still captures the event time before deferral, schedules through `after()`, applies the same counters/limits before delivery, resolves the same security mailbox, loops over the same deduplicated recipient set, skips the Gmail signature, and uses the same timeout/error handling. A local before/after audit confirmed that 17 protected auth/OTP/schema/UI files are byte-identical.

No package dependencies, environment variables or migrations were added.

## Changed files

Production:

- `lib/security-notification-template.ts` — shared renderer, event copy, details card, review actions and plaintext.
- `lib/security-email-icons.ts` — generated tiny PNG assets.
- `lib/server/account-security-mail.ts` — uses the shared presentation for notifications; default OTP presentation stays unchanged.
- `lib/server/gmail-delivery.ts` — optional inline CID image packaging; existing non-image sends and attachments retain their behavior.

Tooling/documentation:

- `scripts/generate-security-email-icons.cjs` — repeatable icon source generation using installed tools.
- `scripts/fixtures/security-notifications.cjs` — 16 fictional event fixtures.
- `scripts/verify-security-notification-template.cjs` — renderer, MIME, action-link, fallback and responsive preview checks.
- `scripts/verify-account-security.cjs` — updates one presentation assertion from `Unknown` to `Unavailable`.
- `package.json` — adds `verify:security-notification-template`.
- `docs/SECURITY_EMAIL_DESIGN.md` — this report.

## Checks and previews

```text
npm run verify:security-notification-template
node scripts/verify-security-notification-template.cjs --render
npm run verify:email-verification-template
npm run verify:account-security
node scripts/verify-email-delivery-security.cjs
node scripts/verify-email-browser-delivery.cjs
npx tsc --noEmit
npx eslint lib/security-notification-template.ts lib/security-email-icons.ts lib/server/account-security-mail.ts lib/server/gmail-delivery.ts
npm run build
```

The template checks cover all 16 fixture designs, dynamic data/HTML escaping, explicit unverified identities, missing data, IST, authenticated-page destinations, PNG integrity, per-message CID references, MIME nesting, unchanged account-OTP HTML, and normal attachment compatibility. Browser checks cover 640px desktop and 390px/320px mobile widths, long values, blocked images and inline-only fallback. All tests use fixture transport and do not send live email or connect to the database.

Previews are saved to `outputs/security-email-previews/`:

- `index.html`, `overview.png` — three-email gallery.
- `successful-login-640.png`, `suspicious-login-640.png`, `google-access-request-640.png` — requested desktop examples.
- Corresponding `-390.png` / `-320.png` files — mobile examples.
- `.html` files — browser previews with embedded preview images; `.email.html` retains the actual email CID markup.
- `.txt` files — plain-text alternatives.
- `successful-login.eml`, `suspicious-login.eml`, `google-access-request.eml` — MIME examples for opening in a native email client.
- `images-blocked-mobile.png`, `missing-details-390.png` — fallback examples.

Actual inbox emails use the application-provided event data and configured application origin; none of the fictional fixture addresses or IPs enter runtime mail.
