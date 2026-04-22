# Nextgen Solutions ERP

Internal ERP system for Nextgen Solutions - EPR Consultancy.

## Tech Stack

- Next.js 15 App Router
- React 19
- TypeScript 5
- MongoDB + Mongoose
- NextAuth v4 with Google OAuth
- Tailwind CSS 3
- ExcelJS for Excel exports
- jsPDF + jspdf-autotable for PDF generation
- Gmail API + Nodemailer for email workflows
- Recharts for dashboard charts

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` for local development, or update `.env` in this workspace if that is how you run the project locally. Keep real secrets out of source control.

```env
# MongoDB Atlas or local MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/nextgen-erp

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Gmail API / Nodemailer email sender
GMAIL_CLIENT_ID=<gmail-oauth-client-id>
GMAIL_CLIENT_SECRET=<gmail-oauth-client-secret>
GMAIL_REFRESH_TOKEN=<refresh-token>
GMAIL_USER_EMAIL=youremail@gmail.com
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful Scripts

```bash
npm run dev       # Start the Next.js dev server
npm run lint      # Run Next.js ESLint checks
npx tsc --noEmit  # Run TypeScript without emitting build files
npm run build     # Production build with lint and type checks enabled
npm run start     # Start the production server after a build
```

`next.config.mjs` does not suppress ESLint or TypeScript errors during production builds. A broken lint/type check should fail `npm run build`.

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project or select an existing project.
3. Enable the Gmail API.
4. Go to Credentials, then create an OAuth 2.0 Client ID.
5. Application type: Web application.
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://yourdomain.com/api/auth/callback/google`
7. Copy the Client ID and Client Secret into the environment file.

## Gmail Setup

1. Use an OAuth client with Gmail API access.
2. Generate a refresh token with the Gmail scope used by the app.
3. Add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_USER_EMAIL` to the environment file.
4. Use `/dashboard/gmail-setup` and email-related dashboard pages to verify the connection.

## Main Features

| Feature | Status |
| --- | --- |
| Google OAuth login | Available |
| Client and contact management | Available |
| Financial year targets and credits | Available |
| Credit transactions | Available |
| Billing and payment tracking | Available |
| Document links | Available |
| Annual return workflow | Available |
| CPCB upload and invoice tracking | Available |
| Excel and custom report exports | Available |
| PDF quotation generation | Available |
| Payment reminder email workflow | Available |
| Dashboard charts | Available |
| Trash and restore workflow | Available |

## Project Structure

```text
app/
  api/
    activities/
    annual-return/
    auth/
    billing/
    client-contacts/
    clients/
    contacts/
    credit-transactions/
    dashboard/
    documents/
    email/
    email-log/
    financial-year/
    gmail-oauth/
    invoices/
    payments/
    persons/
    quotation/
    reports/
    trash/
    upload-records/
  dashboard/
    annual-return/
    billing/
    clients/
      [clientId]/
        page.tsx
        ClientProfileActivityTimeline.tsx
        ClientProfileFinancialSummary.tsx
        ClientProfileModals.tsx
        ClientProfileSupport.tsx
    contacts/
    cpcb-uploads/
    credit-transactions/
    email-history/
    financial-year/
    gmail-setup/
    quotation/
    reports/
    settings/
    trash/
  login/

components/
  layout/
  ui/

lib/
models/
public/
scripts/
templates/
utils/
```

## Notes For Maintenance

- The client profile page is split into smaller local components under `app/dashboard/clients/[clientId]/`.
- Shared client profile types, helpers, and small UI primitives live in `ClientProfileSupport.tsx`.
- Modal-heavy JSX lives in `ClientProfileModals.tsx`.
- Keep user-visible text ASCII-safe unless there is a clear reason to use special characters.
- Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` before shipping meaningful changes.
