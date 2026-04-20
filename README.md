# Nextgen Solutions ERP

Internal ERP system for Nextgen Solutions — EPR Consultancy.

## Tech Stack

- **Next.js 14** (App Router)
- **MongoDB + Mongoose**
- **NextAuth v4** (Google OAuth)
- **Tailwind CSS**
- **ExcelJS** (Excel export)
- **jsPDF + jspdf-autotable** (PDF generation)
- **Gmail API** (Email sending)
- **Recharts** (Dashboard charts)

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# MongoDB Atlas or local
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/nextgen-erp

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>

# Google OAuth (Google Cloud Console → APIs & Services → Credentials)
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Gmail API (optional — for email features)
GMAIL_CLIENT_ID=<gmail-oauth-client-id>
GMAIL_CLIENT_SECRET=<gmail-oauth-client-secret>
GMAIL_REFRESH_TOKEN=<refresh-token-from-oauth-playground>
GMAIL_USER_EMAIL=youremail@gmail.com
```

### 3. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Setting Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Google+ API** and **Gmail API**
4. Go to **Credentials → Create OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)
7. Copy **Client ID** and **Client Secret** to `.env.local`

## Setting Up Gmail API (for email features)

1. Use the same or a separate OAuth client with **Gmail API** scope
2. Go to [OAuth Playground](https://developers.google.com/oauthplayground)
3. Select `https://mail.google.com/` scope
4. Exchange authorization code for refresh token
5. Copy **Refresh Token** to `.env.local`

---

## Features

| Feature | Status |
|---------|--------|
| Google OAuth Login | ✅ |
| Client Management (CRUD) | ✅ |
| Financial Year Targets/Credits | ✅ |
| Credit Transactions | ✅ |
| Billing & Payment Tracking | ✅ |
| Document Links (Drive) | ✅ |
| Excel Export (4 report types) | ✅ |
| PDF Quotation Generator | ✅ |
| Payment Reminder Email | ✅ (mock until credentials added) |
| Dashboard Charts | ✅ |
| Client Profile Page | ✅ |

---

## Project Structure

```
/app
  /api              ← API routes
    /auth           ← NextAuth
    /clients        ← Client CRUD
    /financial-year ← FY records
    /credit-transactions
    /billing
    /payments
    /documents
    /dashboard      ← Dashboard stats
    /reports/export ← Excel exports
    /quotation/generate
    /email/send     ← Gmail API
  /dashboard        ← Protected dashboard pages
    /clients
    /financial-year
    /credit-transactions
    /billing
    /reports
    /quotation
  /login            ← Login page

/components
  /layout           ← Sidebar, TopBar
  /ui               ← Modal, StatCard, Badges, etc.

/models             ← Mongoose schemas
/lib                ← mongoose.ts, auth.ts, utils.ts
```

---

## Mock Mode

The app works **without any external services** configured:
- MongoDB: App runs but data won't persist (add URI to enable)
- Google OAuth: Login won't work (add credentials to enable)
- Gmail API: Email shows mock success message (add credentials to send real emails)

This allows you to inspect the UI structure before adding real credentials.
