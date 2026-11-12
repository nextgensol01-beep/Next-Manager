# Dependency And Build Notes

Last reviewed: April 22, 2026.

These notes describe the dependency state currently installed in this workspace. `package.json` uses ranges for many dependencies, so the installed version can be newer than the package spec after `npm install`.

## Current Installed Versions

| Package | Installed | Package spec | Notes |
| --- | ---: | ---: | --- |
| next | 15.5.15 | ^15.5.12 | App Router. Build includes lint and type checks. |
| react / react-dom | 19.2.5 | ^19.0.0 | React 19 runtime. |
| next-auth | 4.24.14 | ^4.24.13 | Staying on v4. The app uses the v4 API shape. |
| mongoose | 8.23.0 | ^8.9.0 | Used by server routes and models. |
| googleapis | 144.0.0 | ^144.0.0 | Used for Gmail workflows. |
| nodemailer | 7.0.13 | ^7.0.13 | Used for email sending. |
| exceljs | 4.4.0 | ^4.4.0 | Used for Excel exports. |
| jspdf | 4.2.1 | ^4.2.0 | Used for PDF generation. |
| jspdf-autotable | 5.0.7 | ^5.0.7 | Used with jsPDF tables. |
| recharts | 2.15.4 | ^2.13.0 | Dashboard charts. |
| lucide-react | 0.469.0 | ^0.469.0 | UI icons. |
| swr | 2.4.1 | ^2.3.0 | Client data fetching/caching. |
| tailwindcss | 3.4.19 | ^3.4.17 | Staying on Tailwind 3 config format. |
| tailwind-merge | 3.5.0 | ^3.3.0 | Utility class merging. |
| eslint | 9.39.4 | ^9.0.0 | Flat config via `eslint.config.mjs`. |
| eslint-config-next | 15.5.15 | ^15.5.12 | Should stay aligned with Next 15. |
| typescript | 5.9.3 | ^5.7.0 | Type checking with `npx tsc --noEmit`. |

## Build Policy

Production builds are expected to fail on lint or TypeScript errors.

`next.config.mjs` intentionally does not set:

```js
eslint: { ignoreDuringBuilds: true }
typescript: { ignoreBuildErrors: true }
```

Keep those suppression flags out unless there is a temporary emergency release process documented separately.

## Verification Commands

Run these before shipping non-trivial changes:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

On Windows sandboxed environments, `npm run build` may fail with `spawn EPERM` if the sandbox blocks Next.js worker processes. Re-run the same command with normal local permissions; that is an environment issue, not necessarily a code failure.

## Upgrade Decisions

| Area | Decision |
| --- | --- |
| Next.js | Use Next 15.5.x with the App Router. |
| React | Use React 19. |
| NextAuth | Keep v4 until the project intentionally migrates to Auth.js/v5. That migration changes server auth helpers and route usage. |
| Tailwind CSS | Keep Tailwind 3 for now because the project uses `tailwind.config.ts` and established design tokens. |
| ESLint | Use ESLint 9 with the current Next config. |
| TypeScript | Keep strict production type checking enabled. |

## Recent Maintenance Notes

- The client profile page was split into smaller files under `app/dashboard/clients/[clientId]/`.
- User-visible mojibake text was cleaned from the client profile area and report export route.
- Production builds now surface lint and TypeScript failures instead of hiding them.
