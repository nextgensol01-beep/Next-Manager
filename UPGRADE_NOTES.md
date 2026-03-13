# Dependency Upgrade Analysis (August 2025)

## Upgrade Decisions

| Package | Old | New | Notes |
|---|---|---|---|
| next | 14.2.3 | 15.3.3 | Latest stable. App Router API unchanged. |
| react / react-dom | ^18 | ^19 | React 19 stable. No breaking changes for our usage. |
| next-auth | ^4.24.7 | ^4.24.11 | **Staying on v4** — v5 (Auth.js) has completely different API (`auth()` instead of `getServerSession(authOptions)`). Would require rewriting all 20+ API routes. v4 LTS is still maintained. |
| mongoose | ^8.3.2 | ^8.15.0 | Patch/minor updates, fully compatible. |
| @auth/mongodb-adapter | ^3.3.0 | removed | Not used anywhere in the codebase. |
| exceljs | ^4.4.0 | ^4.4.0 | No new major release — keeping at 4.4.x. |
| jspdf | ^2.5.1 | ^2.5.2 | Minor patch only. |
| jspdf-autotable | ^3.8.2 | ^3.8.5 | Minor patch. |
| nodemailer | ^7.0.7 | ^7.0.7 | No new version beyond 7.0.x. |
| googleapis | ^140.0.0 | ^148.0.0 | Minor API additions, no breaking changes to gmail.users.drafts we use. |
| date-fns | ^3.6.0 | ^4.1.0 | v4 is compatible with v3 for standard imports. Not directly imported in app code — only indirect. |
| recharts | ^2.12.5 | ^2.15.3 | Patch updates, no breaking changes. |
| react-hot-toast | ^2.4.1 | ^2.5.2 | Minor updates, stable API. |
| lucide-react | ^0.379.0 | ^0.511.0 | Breaking: some icon names changed. We audited all used icons — all exist in 0.511.0. |
| bcryptjs | ^2.4.3 | ^3.0.2 | v3 is ESM-first but still has CJS compat. |
| clsx | ^2.1.1 | ^2.1.1 | No new major version. |
| tailwind-merge | ^2.3.0 | ^3.3.0 | v3 API is fully backwards-compatible for `twMerge(clsx(...))` usage. |
| tailwindcss | ^3.4.1 | ^3.4.17 | Staying on v3 — Tailwind v4 has completely different config format (no tailwind.config.ts). Would break all custom token classes. |
| typescript | ^5 | ^5.8.3 | Patch update, backwards compatible. |
| @types/node | ^20 | ^22 | Node 22 is LTS. |
| @types/react | ^18 | ^19 | Matches React 19. |
| eslint | ^8 | ^9 | ESLint 9 has flat config. eslint-config-next 15 supports it. |
| eslint-config-next | 14.2.3 | 15.3.3 | Must match Next.js version. |
