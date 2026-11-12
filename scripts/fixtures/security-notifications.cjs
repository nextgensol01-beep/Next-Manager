// Fictional preview data. These fixtures never trigger real security notifications.
const base = {
  status: "Successful", name: "Admin", email: "admin@nextgensolutions.com", verified: true,
  metadata: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36", ip: "203.0.113.24", location: "New Delhi, India" },
  occurredAt: "2026-10-31T07:47:00.000Z", appUrl: "https://nextgen.example.com",
};
module.exports = [
  { slug: "successful-login", ...base, event: "Successful administrator credentials login" },
  { slug: "suspicious-login", ...base, event: "Suspicious login: new device or location", reason: "New browser/device cookie" },
  { slug: "google-access-request", ...base, event: "New Google account requesting access", name: "Aarav Sharma", email: "aarav@example.com", status: "Pending Approval", metadata: { ...base.metadata, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" } },
  { slug: "approved-user-login", ...base, event: "Successful approved user google login", name: "Aarav Sharma", email: "aarav@example.com" },
  { slug: "failed-login", ...base, event: "Failed email/password login", status: "Failed", verified: false },
  { slug: "google-attempt", ...base, event: "Google authentication completed", reason: "Website second factor still required" },
  { slug: "google-pending", ...base, event: "Pending Google user attempted login again", status: "Pending Approval" },
  { slug: "google-rejected", ...base, event: "Rejected or disabled Google account attempted access", status: "Rejected" },
  { slug: "password-changed", ...base, event: "Account password changed" },
  { slug: "email-changed", ...base, event: "Account email changed" },
  { slug: "recovery-email-changed", ...base, event: "Account recovery email changed" },
  { slug: "twofactor-enabled", ...base, event: "Account twofactor on changed" },
  { slug: "twofactor-disabled", ...base, event: "Account twofactor off changed" },
  { slug: "recovery-codes-changed", ...base, event: "Account recovery codes changed" },
  { slug: "recovery-code-login", ...base, event: "Recovery code used for login" },
  { slug: "missing-details", ...base, event: "Successful administrator credentials login", name: "Unknown", metadata: { userAgent: "", ip: "", location: "Unknown", networkNote: "Locally hosted application (localhost): no trusted public client IP or geographic location is available." } },
];
