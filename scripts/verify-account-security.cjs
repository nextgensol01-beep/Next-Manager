/* Executes production services, callbacks, adapters and HTTP handlers against isolated
 * atomic in-memory database fixtures. Never connects to MongoDB or sends real email. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { NextRequest } = require("next/server");
const bcrypt = require("bcryptjs");
const createLoader = require("./search-test-loader.cjs");
process.env.NEXTAUTH_SECRET = "isolated-account-security-test-secret";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.ADMIN_PASSWORD = "legacy-test-password";
process.env.AUTH_SECURITY_EMAIL = "security@gmail.com";
process.env.GMAIL_USER = "security@gmail.com";
process.env.AUTH_TRUST_PROXY = "true";
process.env.ALLOWED_GOOGLE_EMAILS = "allowlisted@example.com";
delete process.env.ADMIN_PASSWORD_HASH;
const clone = value => value == null ? value : structuredClone(value);
const valueAt = (doc, key) => key.split(".").reduce((value, part) => value?.[part], doc);
function matches(doc, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some(item => matches(doc, item));
    if (key === "$and") return expected.every(item => matches(doc, item));
    const value = valueAt(doc, key);
    if (expected && typeof expected === "object" && !(expected instanceof Date)) return Object.entries(expected).every(([op, target]) => {
      if (op === "$gt") return value > target;
      if (op === "$lt") return value < target;
      if (op === "$lte") return value <= target;
      if (op === "$ne") return String(value) !== String(target);
      if (op === "$exists") return (value !== undefined) === target;
      if (op === "$in") return target.some(entry => String(entry) === String(value));
      throw Error(`Unsupported fixture operator ${op}`);
    });
    return Array.isArray(value) ? value.includes(expected) : expected == null ? value == null : String(value) === String(expected);
  });
}
function change(doc, update, inserting = false) {
  Object.assign(doc, clone(update.$set || {}), inserting ? clone(update.$setOnInsert || {}) : {});
  for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
  for (const [key, value] of Object.entries(update.$addToSet || {})) { doc[key] ||= []; if (!doc[key].includes(value)) doc[key].push(value); }
  for (const [key, value] of Object.entries(update.$pull || {})) doc[key] = (doc[key] || []).filter(item => item !== value);
  for (const key of Object.keys(update.$unset || {})) delete doc[key];
  doc.updatedAt = new Date();
}
let sequence = 1;
function model(name) {
  const rows = new Map();
  const hydrate = doc => {
    if (!doc) return null;
    const copy = clone(doc), original = clone(doc);
    Object.defineProperties(copy, {
      save: { value: async () => { if (copy.password && copy.password !== original.password) copy.password = await bcrypt.hash(copy.password, 4); rows.set(String(copy._id), clone(copy)); return copy; } },
      comparePassword: { value: candidate => bcrypt.compare(candidate, copy.password || "") },
      isModified: { value: key => JSON.stringify(copy[key]) !== JSON.stringify(original[key]) },
      $inc: { value: (key, amount) => { copy[key] = (copy[key] || 0) + amount; } },
    });
    return copy;
  };
  const query = value => ({ select() { return this; }, sort() { return this; }, lean() { return Promise.resolve(clone(value)); }, then(resolve, reject) { return Promise.resolve(Array.isArray(value) ? value.map(hydrate) : hydrate(value)).then(resolve, reject); } });
  function Model(data) { Object.assign(this, { _id: (sequence++).toString(16).padStart(24, "0"), loginMethods: [], securityVersion: 0 }, data); Object.defineProperty(this, "save", { value: async () => { const saved = await Model.create(this); Object.assign(this, saved); return this; } }); }
  Object.assign(Model, {
    rows,
    async create(data) { const doc = { _id: (sequence++).toString(16).padStart(24, "0"), createdAt: new Date(), expires: new Date(Date.now() + 600_000), attempts: 0, consumed: false, status: "active", loginMethods: [], ...clone(data) }; if (name === "User" && doc.password && !doc.password.startsWith("$2")) doc.password = await bcrypt.hash(doc.password, 4); rows.set(String(doc._id), doc); return hydrate(doc); },
    findById(id) { return query(rows.get(String(id))); },
    findOne(filter) { return query([...rows.values()].find(doc => matches(doc, filter))); },
    find(filter) { return query([...rows.values()].filter(doc => matches(doc, filter))); },
    exists(filter) { return Promise.resolve([...rows.values()].some(doc => matches(doc, filter))); },
    findOneAndUpdate(filter, update, options = {}) {
      let doc = [...rows.values()].find(doc => matches(doc, filter));
      const before = clone(doc);
      if (!doc && options.upsert) {
        if (filter._id && rows.has(String(filter._id))) { const error = new Error("duplicate"); error.code = 11000; return Promise.reject(error); }
        doc = { _id: filter._id || (sequence++).toString(16).padStart(24, "0"), createdAt: new Date(), attempts: 0, consumed: false, ...Object.fromEntries(Object.entries(filter).filter(([key, value]) => !key.startsWith("$") && typeof value !== "object")) };
        change(doc, update, true); rows.set(String(doc._id), doc);
      } else if (doc) change(doc, update);
      return query(options.new ? doc : before);
    },
    findByIdAndUpdate(id, update, options) { return this.findOneAndUpdate({ _id: String(id) }, update, options); },
    updateOne(filter, update) { this.findOneAndUpdate(filter, update); return Promise.resolve({ modifiedCount: 1 }); },
    deleteOne(filter) { const row = [...rows.values()].find(doc => matches(doc, filter)); if (row) rows.delete(String(row._id)); return Promise.resolve({ deletedCount: row ? 1 : 0 }); },
    deleteMany(filter) { let count = 0; for (const [id, row] of rows) if (matches(row, filter)) { rows.delete(id); count++; } return Promise.resolve({ deletedCount: count }); },
    findByIdAndDelete(id) { const doc = rows.get(String(id)); rows.delete(String(id)); return query(doc); },
    findOneAndDelete(filter) { const row = [...rows.values()].find(doc => matches(doc, filter)); if (row) rows.delete(String(row._id)); return query(row); },
  });
  return Model;
}
const User = model("User"), AuthSession = model("Session"), AuthAccount = model("Account");
const collections = { SecurityChallenge: model("Challenge"), SecurityGate: model("Gate"), AccountSecurityConfig: model("Config"), KnownAuthDevice: model("Device") };
const jar = new Map(), emails = [], notices = [];
const store = { get: key => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key, value) => jar.set(key, value) };
const requestHeaders = new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0", "x-forwarded-for": "203.0.113.5", "x-vercel-ip-country": "IN", origin: "http://localhost:3000" });
let mailFails = false, currentSession = null;
const metadata = { ip: "203.0.113.5", location: "India", userAgent: requestHeaders.get("user-agent") };
const mailMock = {
  requestMetadata: () => metadata,
  securityEmail: async () => collections.AccountSecurityConfig.rows.get("primary")?.recoveryEmail || "security@gmail.com",
  sendAccountMail: async (to, email) => { if (mailFails) throw Error("Test delivery failure"); emails.push({ to, ...email }); },
  notifySecurity: (...args) => notices.push(args),
};
const load = createLoader({
  "server-only": {},
  "@/lib/mongoose": { connectDB: async () => {} },
  "@/models/User": User, "@/models/AuthSession": AuthSession, "@/models/AuthAccount": AuthAccount,
  "@/models/AccountSecurity": collections,
  "next/headers": { cookies: async () => store, headers: async () => requestHeaders },
  "next-auth": { getServerSession: async () => currentSession },
  "./account-security-mail": mailMock,
  "@/lib/server/account-security-mail": mailMock,
});
const security = load("lib/server/account-security.ts");
const crypto = load("lib/server/account-security-crypto.ts");
const auth = load("lib/auth.ts").authOptions;
const adapter = load("lib/mongooseAuthAdapter.ts").MongooseAuthAdapter();
const login = load("app/api/auth/admin-login/route.ts");
const factor = load("app/api/auth/second-factor/route.ts");
const settings = load("app/api/settings/account-security/route.ts");
const sessions = load("app/api/sessions/route.ts");
const users = load("app/api/users/route.ts");
const request = (path, body, method = "POST", origin = "http://localhost:3000") => new NextRequest(`http://localhost:3000${path}`, { method, headers: { ...Object.fromEntries(requestHeaders), origin, cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "), "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const clearCooldown = () => collections.SecurityGate.rows.clear();
const codeFor = to => emails.filter(email => email.to === to).at(-1)?.text.match(/\b\d{6}\b/)[0];
function assertOtpEmail(mail, to, headline) {
  assert.equal(mail.to, to);
  assert(mail.html.includes(`>${headline}</h1>`));
  const code = mail.text.match(/Your verification code is (\d{6})\./)?.[1];
  assert(code, "The plain-text alternative includes a six-digit code");
  assert(mail.html.includes(`><strong>${code}</strong>`));
  assert(mail.html.includes("data-verification-code"));
  assert(mail.text.includes("This code expires in 5 minutes."));
  assert(mail.subject.startsWith("NextGen security: "));
  assert(!mail.subject.includes(code));
}
const identity = (email, sub) => ({ account: { provider: "google", providerAccountId: sub }, profile: { email, sub, email_verified: true, name: "Google Person" } });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function main() {
  await test("cryptographic OTP and secret hygiene", async () => {
    for (let i = 0; i < 100; i++) assert.match(crypto.newOtp(), /^\d{6}$/);
    assert.equal(crypto.matchesSecret(crypto.securityDigest("value"), "value"), true);
    assert.equal(crypto.matchesSecret(crypto.securityDigest("value"), "wrong"), false);
    assert.equal(crypto.newRecoveryCodes().length, 10);
    assert.equal(load("lib/device.ts").parseDevice("unrecognized-client").type, "unknown");
    const SessionModel = createLoader()("models/AuthSession.ts").default;
    const legacySession = SessionModel.hydrate({ sessionToken: "legacy", userId: "legacy-user", expires: new Date(Date.now() + 60000) });
    assert.equal(legacySession.securityVersion, 0);
    assert.equal(legacySession.lastActivityAt, undefined, "Legacy activity must be captured on a real request, not invented on hydration");
  });
  let admin, account, sessionToken;
  await test("2FA enabled from a legacy session does not lock out the pinned administrator's environment password", async () => {
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash("legacy-test-password", 4);
    const legacy = await User.create({ name: "Legacy Admin", email: "admin@example.com", loginId: "admin@example.com", role: "admin", status: "active", password: null, credentialsManaged: false, twoFactorEnabled: true, securityVersion: 1, loginMethods: ["password"] });
    await collections.AccountSecurityConfig.create({ _id: "primary", adminUserId: String(legacy._id), recoveryEmail: "security@gmail.com" });
    assert.equal(await security.passwordAccount("admin@example.com", "wrong"), null);
    assert.equal((await User.findById(legacy._id)).password, null);
    const response = await login.POST(request("/api/auth/admin-login", { email: "admin@example.com", password: "legacy-test-password" }));
    assert.equal(response.status, 200); assert.equal((await response.json()).secondFactor, true);
    assert.equal(response.cookies.get("next-auth.session-token"), undefined, "Migration must not bypass 2FA");
    const migrated = await User.findById(legacy._id);
    assert.equal(migrated.credentialsManaged, true); assert.ok(await migrated.comparePassword("legacy-test-password"));
    assert.equal(migrated.twoFactorEnabled, true); assert.equal(migrated.securityVersion, 1);
    assert.deepEqual(emails.map(mail => mail.to), ["security@gmail.com"]);
    await User.updateOne({ _id: legacy._id }, { $set: { password: await bcrypt.hash("fresh-db-password", 4) } });
    assert.equal(await security.passwordAccount("admin@example.com", "legacy-test-password"), null);
    assert.ok(await security.passwordAccount("admin@example.com", "fresh-db-password"));
    await User.updateOne({ _id: legacy._id }, { $set: { status: "disabled", password: null, credentialsManaged: false } });
    assert.equal(await security.passwordAccount("admin@example.com", "legacy-test-password"), null);
    await User.updateOne({ _id: legacy._id }, { $set: { status: "active" } });
    await collections.AccountSecurityConfig.updateOne({ _id: "primary" }, { $set: { adminUserId: "different-account" } });
    assert.equal(await security.passwordAccount("admin@example.com", "legacy-test-password"), null);
    await collections.AccountSecurityConfig.updateOne({ _id: "primary" }, { $set: { adminUserId: String(legacy._id) } });
    const concurrentHash = await bcrypt.hash("concurrent-db-password", 4);
    const originalUpdate = User.findOneAndUpdate;
    User.findOneAndUpdate = function (filter, update, options) {
      if (filter.credentialsManaged && filter.password) {
        Object.assign(User.rows.get(String(legacy._id)), { password: concurrentHash, credentialsManaged: true });
      }
      return originalUpdate.call(this, filter, update, options);
    };
    try { assert.equal(await security.passwordAccount("admin@example.com", "legacy-test-password"), null); }
    finally { User.findOneAndUpdate = originalUpdate; }
    assert.ok(await (await User.findById(legacy._id)).comparePassword("concurrent-db-password"));
    User.rows.delete(String(legacy._id)); collections.AccountSecurityConfig.rows.clear(); collections.SecurityChallenge.rows.clear();
    clearCooldown(); emails.length = 0; notices.length = 0;
    delete process.env.ADMIN_PASSWORD_HASH;
  });
  await test("legacy administrator login migrates hash without exposing or reusing env credentials", async () => {
    const response = await login.POST(request("/api/auth/admin-login", { email: "admin@example.com", password: "legacy-test-password" }));
    assert.equal(response.status, 200); const body = await response.json();
    admin = await User.findById(body.user.id);
    assert.equal(admin.role, "admin"); assert.equal(admin.credentialsManaged, true); assert.notEqual(admin.password, "legacy-test-password");
    sessionToken = response.cookies.get("next-auth.session-token").value; jar.set("next-auth.session-token", sessionToken);
    currentSession = { user: { id: String(admin._id), email: admin.email, role: "admin" } };
    assert.ok(await adapter.getSessionAndUser(sessionToken));
    assert.equal(await security.passwordAccount("admin@example.com", "wrong"), null);
  });
  await test("CSRF and failed credentials are rejected and claimed identity is unverified", async () => {
    assert.equal((await login.POST(request("/api/auth/admin-login", { email: admin.email, password: "legacy-test-password" }, "POST", "https://evil.example"))).status, 403);
    assert.equal((await login.POST(request("/api/auth/admin-login", { email: "fake@example.com", password: "wrong" }))).status, 401);
    assert.ok(notices.some(([event]) => event.status === "Failed" && event.verified === false));
  });
  await test("administrator login alias uses only the security Gmail for enrollment, login, recovery codes and disabling 2FA", async () => {
    const alias = "admin@nextgensolutions.com";
    const owner = await User.create({ name: "Admin login alias", email: alias, loginId: alias, emailVerified: null, password: "alias-admin-password", role: "admin", status: "active", loginMethods: ["password"], securityVersion: 0 });
    const binding = "alias-admin-session";
    await AuthSession.create({ userId: String(owner._id), sessionToken: binding, securityVersion: 0 });
    clearCooldown(); let start = emails.length;
    let challenge = await security.issueChallenge({ userId: String(owner._id), binding, action: "twofactor_on", targetEmail: alias });
    assert.equal(challenge.dual, false);
    assert.deepEqual(emails.slice(start).map(mail => mail.to), ["security@gmail.com"]);
    assertOtpEmail(emails.at(-1), "security@gmail.com", "Enable two-factor authentication");
    const row = collections.SecurityChallenge.rows.get(challenge.challengeId);
    row.targetEmail = alias; // Reject an old pending request generated by the former two-mailbox policy.
    await assert.rejects(security.applySecurityChange({ id: challenge.challengeId, binding, code: codeFor("security@gmail.com") }, requestHeaders, binding), /request a new code/);
    clearCooldown(); challenge = await security.issueChallenge({ userId: String(owner._id), binding, action: "twofactor_on" });
    await security.applySecurityChange({ id: challenge.challengeId, binding, code: codeFor("security@gmail.com") }, requestHeaders, binding);
    let updated = await User.findById(owner._id);
    assert.equal(updated.email, alias); assert.equal(updated.loginId, alias); assert.equal(updated.emailVerified, null); assert.equal(updated.twoFactorEnabled, true);
    assert.deepEqual(notices.at(-1)[1], ["security@gmail.com"]);
    clearCooldown(); start = emails.length;
    const response = await login.POST(request("/api/auth/admin-login", { email: alias, password: "alias-admin-password" }));
    assert.equal(response.status, 200); assert.equal((await response.json()).secondFactor, true);
    assert.deepEqual(emails.slice(start).map(mail => mail.to), ["security@gmail.com"]);
    const cookie = response.cookies.get(security.PREAUTH_COOKIE).value;
    const [token, id] = cookie.split(".");
    await security.verifyChallenge({ id, binding: token, code: codeFor("security@gmail.com"), loginOnly: true });
    for (const [action, headline] of [["recovery_codes", "Replace your recovery codes"], ["twofactor_off", "Disable two-factor authentication"]]) {
      clearCooldown(); start = emails.length;
      challenge = await security.issueChallenge({ userId: String(owner._id), binding, action });
      assert.equal(challenge.dual, false); assert.deepEqual(emails.slice(start).map(mail => mail.to), ["security@gmail.com"]);
      assertOtpEmail(emails.at(-1), "security@gmail.com", headline);
      await security.applySecurityChange({ id: challenge.challengeId, binding, code: codeFor("security@gmail.com") }, requestHeaders, binding);
    }
    updated = await User.findById(owner._id);
    assert.equal(updated.twoFactorEnabled, false); assert.equal(updated.emailVerified, null);
    assert.equal(emails.some(mail => mail.to === alias), false);
    jar.set("next-auth.session-token", sessionToken);
  });
  await test("email change requires both codes, preserves recovery Gmail and rejects OTP reuse", async () => {
    clearCooldown();
    const challenge = await security.issueChallenge({ userId: String(admin._id), binding: sessionToken, action: "email", targetEmail: "new-admin@example.com" });
    assert.equal(challenge.dual, true);
    assertOtpEmail(emails.at(-2), "security@gmail.com", "Confirm your account email change");
    assertOtpEmail(emails.at(-1), "new-admin@example.com", "Verify your new email address");
    assert.equal((await User.findById(admin._id)).email, "admin@example.com");
    await assert.rejects(security.applySecurityChange({ id: challenge.challengeId, userId: String(admin._id), binding: "wrong-browser", code: codeFor("security@gmail.com"), newCode: codeFor("new-admin@example.com") }, requestHeaders, sessionToken));
    await assert.rejects(security.applySecurityChange({ id: challenge.challengeId, binding: sessionToken, code: codeFor("security@gmail.com"), newCode: "wrong" }, requestHeaders, sessionToken));
    const input = { id: challenge.challengeId, binding: sessionToken, code: codeFor("security@gmail.com"), newCode: codeFor("new-admin@example.com") };
    await security.applySecurityChange(input, requestHeaders, sessionToken);
    assert.equal((await User.findById(admin._id)).email, "new-admin@example.com");
    assert.equal(await mailMock.securityEmail(), "security@gmail.com");
    assert.equal(collections.AccountSecurityConfig.rows.get("primary").recoveryEmail, "security@gmail.com");
    await assert.rejects(security.applySecurityChange(input, requestHeaders, sessionToken));
    assert.equal(await security.passwordAccount("admin@example.com", "legacy-test-password"), null);
    assert.ok(await security.passwordAccount("new-admin@example.com", "legacy-test-password"));
    admin = await User.findById(admin._id);
  });
  await test("password change keeps current session and invalidates every other session", async () => {
    clearCooldown();
    await AuthSession.create({ userId: String(admin._id), sessionToken: "other-token", securityVersion: admin.securityVersion });
    const challenge = await security.issueChallenge({ userId: String(admin._id), binding: sessionToken, action: "password", password: "new-secure-password" });
    assertOtpEmail(emails.at(-1), "security@gmail.com", "Confirm your password change");
    const row = collections.SecurityChallenge.rows.get(challenge.challengeId);
    assert.notEqual(row.passwordHash, "new-secure-password"); assert.notEqual(row.codeHash, codeFor("security@gmail.com"));
    await security.applySecurityChange({ id: challenge.challengeId, binding: sessionToken, code: codeFor("security@gmail.com") }, requestHeaders, sessionToken);
    assert.equal(await adapter.getSessionAndUser("other-token"), null);
    assert.ok(await adapter.getSessionAndUser(sessionToken));
    assert.equal(await security.passwordAccount("new-admin@example.com", "legacy-test-password"), null);
    assert.ok(await security.passwordAccount("new-admin@example.com", "new-secure-password"));
  });
  await test("OTP expiry, five-attempt cap, resend cooldown and send quota", async () => {
    account = await User.create({ email: "member@example.com", emailVerified: new Date(), name: "Member", password: "member-password", role: "user", status: "active", loginMethods: ["password"], securityVersion: 0 });
    clearCooldown(); const input = { userId: String(account._id), binding: "member-session", action: "twofactor_on" };
    let challenge = await security.issueChallenge(input);
    await assert.rejects(security.issueChallenge(input), /60 seconds/);
    for (let i = 0; i < 5; i++) await assert.rejects(security.verifyChallenge({ id: challenge.challengeId, binding: input.binding, code: "wrong" }));
    await assert.rejects(security.verifyChallenge({ id: challenge.challengeId, binding: input.binding, code: codeFor(account.email) }), /too many attempts/);
    clearCooldown(); challenge = await security.issueChallenge(input);
    collections.SecurityChallenge.rows.get(challenge.challengeId).expires = new Date(Date.now() - 1);
    await assert.rejects(security.verifyChallenge({ id: challenge.challengeId, binding: input.binding, code: codeFor(account.email) }), /expired/);
    clearCooldown(); const a = await security.takeSecurityLimit("test-quota", 2, 60_000); const b = await security.takeSecurityLimit("test-quota", 2, 60_000); const c = await security.takeSecurityLimit("test-quota", 2, 60_000); assert.ok(a.allowed && b.allowed && !c.allowed);
    clearCooldown();
    for (let index = 0; index < 6; index++) { await security.issueChallenge(input); collections.SecurityGate.rows.delete(crypto.securityDigest(`otp-cooldown:${account._id}`)); }
    await assert.rejects(security.issueChallenge(input), /Too many attempts/);
  });
  let recoveryCodes;
  await test("account-specific 2FA enables only after verification and supplies hashed one-use recovery codes", async () => {
    clearCooldown();
    await AuthSession.create({ userId: String(account._id), sessionToken: "member-session", securityVersion: 0 });
    const challenge = await security.issueChallenge({ userId: String(account._id), binding: "member-session", action: "twofactor_on" });
    assert.equal((await User.findById(account._id)).twoFactorEnabled, undefined);
    const result = await security.applySecurityChange({ id: challenge.challengeId, binding: "member-session", code: codeFor(account.email) }, requestHeaders, "member-session");
    recoveryCodes = result.recoveryCodes; assert.equal(recoveryCodes.length, 10);
    account = await User.findById(account._id); assert.equal(account.twoFactorEnabled, true);
    assert.equal((await User.findById(admin._id)).twoFactorEnabled, undefined);
    assert.equal(account.recoveryCodeHashes.includes(recoveryCodes[0]), false);
  });
  await test("2FA password login cannot access protected APIs until OTP; concurrent replay succeeds once", async () => {
    clearCooldown();
    const response = await login.POST(request("/api/auth/admin-login", { email: account.email, password: "member-password" }));
    assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.secondFactor, true);
    assertOtpEmail(emails.at(-1), account.email, "Verify your sign-in");
    assert.equal(emails.at(-1).subject, "NextGen security: Sign-in verification code");
    assert.equal(response.cookies.get("next-auth.session-token"), undefined);
    jar.set(security.PREAUTH_COOKIE, response.cookies.get(security.PREAUTH_COOKIE).value);
    const [binding, id] = jar.get(security.PREAUTH_COOKIE).split(".");
    const results = await Promise.allSettled([1, 2].map(() => security.verifyChallenge({ id, binding, code: codeFor(account.email), loginOnly: true })));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  });
  await test("mail outage fails credential changes closed while recovery-code login remains usable", async () => {
    clearCooldown(); mailFails = true;
    await assert.rejects(security.issueChallenge({ userId: String(admin._id), binding: sessionToken, action: "password", password: "must-not-be-saved" }), /could not be delivered/);
    assert.ok(await security.passwordAccount("new-admin@example.com", "new-secure-password"));
    clearCooldown();
    const response = await login.POST(request("/api/auth/admin-login", { email: account.email, password: "member-password" }));
    assert.equal((await response.json()).deliveryUnavailable, true);
    jar.set(security.PREAUTH_COOKIE, response.cookies.get(security.PREAUTH_COOKIE).value);
    const verified = await factor.POST(request("/api/auth/second-factor", { recoveryCode: recoveryCodes[0] }));
    assert.equal(verified.status, 200);
    assert.ok(verified.cookies.get("next-auth.session-token"));
    const [binding, id] = jar.get(security.PREAUTH_COOKIE).split(".");
    await assert.rejects(security.verifyChallenge({ id, binding, recoveryCode: recoveryCodes[0], code: "", loginOnly: true }));
    mailFails = false;
  });
  await test("Google verified subject, pending, approved, rejected and disabled flows", async () => {
    clearCooldown();
    assert.equal(await auth.callbacks.signIn({ ...identity("unknown@example.com", "sub-new"), profile: { email: "unknown@example.com", email_verified: false, sub: "sub-new" } }), false);
    assert.match(await auth.callbacks.signIn(identity("unknown@example.com", "sub-new")), /GooglePending/);
    const pending = await User.findOne({ email: "unknown@example.com" }); const requestedAt = pending.googleRequestedAt;
    assert.match(await auth.callbacks.signIn(identity("unknown@example.com", "sub-new")), /GooglePending/);
    assert.equal(+requestedAt, +(await User.findById(pending._id)).googleRequestedAt);
    await User.updateOne({ _id: pending._id }, { $set: { status: "active", googleStatus: "approved" } });
    assert.equal(await auth.callbacks.signIn(identity("unknown@example.com", "sub-new")), true);
    assert.equal(await auth.callbacks.signIn(identity("unknown@example.com", "different-sub")), false);
    await User.updateOne({ _id: pending._id }, { $set: { status: "disabled" } });
    assert.match(await auth.callbacks.signIn(identity("unknown@example.com", "sub-new")), /GoogleRejected/);
    await User.updateOne({ _id: pending._id }, { $set: { status: "rejected", googleStatus: "rejected" } });
    assert.match(await auth.callbacks.signIn(identity("unknown@example.com", "sub-new")), /GoogleRejected/);
    assert.equal(await auth.callbacks.signIn(identity("allowlisted@example.com", "allowlisted-sub")), true);
    const allowed = await User.findOne({ email: "allowlisted@example.com" });
    await User.updateOne({ _id: allowed._id }, { $set: { status: "pending", googleStatus: "pending" } });
    assert.match(await auth.callbacks.signIn(identity("allowlisted@example.com", "allowlisted-sub")), /GooglePending/);
  });
  await test("Google website 2FA runs independently and cannot be bypassed through adapter", async () => {
    clearCooldown(); await User.updateOne({ _id: account._id }, { $set: { googleId: "member-sub", googleStatus: "approved", loginMethods: ["password", "google"] } });
    assert.match(await auth.callbacks.signIn(identity(account.email, "member-sub")), /secondFactor=1/);
    await assert.rejects(adapter.createSession({ userId: String(account._id), sessionToken: "unverified-google", expires: new Date(Date.now() + 60000) }));
    const response = await factor.POST(request("/api/auth/second-factor", { code: codeFor(account.email) }));
    assert.equal(response.status, 200);
    assert.equal((await AuthSession.findOne({ sessionToken: response.cookies.get("next-auth.session-token").value })).provider, "google");
  });
  await test("administrator cannot bypass verified credential or owner-only 2FA APIs", async () => {
    jar.set("next-auth.session-token", sessionToken);
    currentSession = { user: { id: String(admin._id), role: "admin", email: "new-admin@example.com" } };
    assert.equal((await users.PATCH(request(`/api/users?id=${admin._id}`, { password: "bypass-password" }, "PATCH"))).status, 400);
    assert.equal((await users.PATCH(request(`/api/users?id=${account._id}`, { twoFactorEnabled: false }, "PATCH"))).status, 403);
    assert.equal((await users.PATCH(request(`/api/users?id=${account._id}`, { email: "attacker@example.com" }, "PATCH"))).status, 403);
    assert.equal((await users.DELETE(request(`/api/users?id=${admin._id}`, undefined, "DELETE"))).status, 400);
    currentSession = { user: { id: String(account._id), role: "user", email: account.email } };
    assert.equal((await settings.POST(request("/api/settings/account-security", { action: "password", password: "no-admin-access" }))).status, 403);
    assert.equal((await users.GET()).status, 403);
  });
  await test("verified 2FA disable, last-code email recovery and stable Google subject after mailbox change", async () => {
    clearCooldown();
    let challenge = await security.issueChallenge({ userId: String(account._id), binding: "member-session", action: "twofactor_off" });
    assert.equal((await User.findById(account._id)).twoFactorEnabled, true);
    await assert.rejects(security.applySecurityChange({ id: challenge.challengeId, binding: "member-session", code: "wrong" }, requestHeaders, "member-session"));
    await security.applySecurityChange({ id: challenge.challengeId, binding: "member-session", code: codeFor(account.email) }, requestHeaders, "member-session");
    assert.equal((await User.findById(account._id)).twoFactorEnabled, false);
    clearCooldown();
    challenge = await security.issueChallenge({ userId: String(account._id), binding: "member-session", action: "twofactor_on" });
    const enrollment = await security.applySecurityChange({ id: challenge.challengeId, binding: "member-session", code: codeFor(account.email) }, requestHeaders, "member-session");
    await User.updateOne({ _id: account._id }, { $set: { recoveryCodeHashes: [crypto.recoveryDigest(enrollment.recoveryCodes[0])] } });
    clearCooldown();
    const response = await login.POST(request("/api/auth/admin-login", { email: account.email, password: "member-password" }));
    jar.set(security.PREAUTH_COOKIE, response.cookies.get(security.PREAUTH_COOKIE).value);
    const recovered = await factor.POST(request("/api/auth/second-factor", { recoveryCode: enrollment.recoveryCodes[0] }));
    const recoveredToken = recovered.cookies.get("next-auth.session-token").value;
    assert.equal((await User.findById(account._id)).recoveryCodeHashes.length, 0);
    clearCooldown();
    const beforeRecovery = emails.length;
    challenge = await security.issueChallenge({ userId: String(account._id), binding: recoveredToken, action: "factor_email", targetEmail: "recovered@example.com" });
    assert.equal(emails.length, beforeRecovery + 1);
    assertOtpEmail(emails.at(-1), "recovered@example.com", "Recover access to your account email");
    await security.applySecurityChange({ id: challenge.challengeId, binding: recoveredToken, code: "", newCode: codeFor("recovered@example.com") }, requestHeaders, recoveredToken);
    assert.equal((await User.findById(account._id)).email, "recovered@example.com");
    assert.equal((await User.findById(account._id)).googleId, "member-sub");
    clearCooldown(); assert.match(await auth.callbacks.signIn(identity("member@example.com", "member-sub")), /secondFactor=1/);
    assert.equal((await adapter.getUserByAccount({ provider: "google", providerAccountId: "member-sub" })).id, String(account._id));
    account = await User.findById(account._id);
  });
  await test("recovery Gmail replacement requires both addresses; admin approvals/rejections enforce authorization", async () => {
    clearCooldown();
    const challenge = await security.issueChallenge({ userId: String(admin._id), binding: sessionToken, action: "recovery_email", targetEmail: "replacement@gmail.com" });
    assertOtpEmail(emails.at(-2), "security@gmail.com", "Confirm your recovery Gmail change");
    assertOtpEmail(emails.at(-1), "replacement@gmail.com", "Verify your new recovery Gmail");
    await assert.rejects(security.applySecurityChange({ id: challenge.challengeId, binding: sessionToken, code: codeFor("security@gmail.com"), newCode: "wrong" }, requestHeaders, sessionToken));
    assert.equal(await mailMock.securityEmail(), "security@gmail.com");
    await security.applySecurityChange({ id: challenge.challengeId, binding: sessionToken, code: codeFor("security@gmail.com"), newCode: codeFor("replacement@gmail.com") }, requestHeaders, sessionToken);
    assert.equal(await mailMock.securityEmail(), "replacement@gmail.com");
    const pending = await User.create({ name: "Approval request", email: "approve@example.com", googleId: "approve-sub", status: "pending", googleStatus: "pending", loginMethods: ["google"] });
    currentSession = { user: { id: String(account._id) } };
    assert.equal((await users.PATCH(request(`/api/users?id=${pending._id}`, { googleStatus: "approved" }, "PATCH"))).status, 403);
    currentSession = { user: { id: String(admin._id) } };
    assert.equal((await users.PATCH(request(`/api/users?id=${pending._id}`, { googleStatus: "approved" }, "PATCH"))).status, 200);
    assert.equal(await auth.callbacks.signIn(identity(pending.email, "approve-sub")), true);
    assert.equal((await users.PATCH(request(`/api/users?id=${pending._id}`, { googleStatus: "rejected" }, "PATCH"))).status, 200);
    assert.match(await auth.callbacks.signIn(identity(pending.email, "approve-sub")), /GoogleRejected/);
  });
  await test("individual revocation, own-other-sessions scope and immediate disabled-user invalidation", async () => {
    currentSession = { user: { id: String(admin._id), role: "admin" } };
    await AuthSession.create({ userId: String(admin._id), sessionToken: "admin-other", securityVersion: (await User.findById(admin._id)).securityVersion });
    const memberSession = await AuthSession.create({ userId: String(account._id), sessionToken: "member-other", securityVersion: account.securityVersion });
    const response = await sessions.DELETE(request("/api/sessions?all=1", undefined, "DELETE")); assert.equal(response.status, 200);
    assert.equal(await AuthSession.findOne({ sessionToken: "admin-other" }), null); assert.ok(await AuthSession.findOne({ sessionToken: "member-other" }));
    assert.equal((await sessions.DELETE(request(`/api/sessions?id=${memberSession._id}`, undefined, "DELETE"))).status, 200);
    assert.equal(await adapter.getSessionAndUser("member-other"), null);
    await AuthSession.create({ userId: String(account._id), sessionToken: "disabled-token", securityVersion: account.securityVersion });
    assert.equal((await users.PATCH(request(`/api/users?id=${account._id}`, { status: "disabled" }, "PATCH"))).status, 200);
    assert.equal(await adapter.getSessionAndUser("disabled-token"), null);
    assert.equal(await security.passwordAccount(account.email, "member-password"), null);
  });
  await test("mobile dropdown and action-sheet opening, dismiss handlers, positioning and animation remain byte-identical", async () => {
    const after = fs.readFileSync("app/dashboard/settings/AccessPanel.tsx", "utf8");
    const menu = after.slice(after.indexOf("function useIsMobile"), after.indexOf("/** Format relative time */")).replaceAll("\r\n", "\n");
    // Captured from the untouched original, so this check needs no ignored local backup.
    assert.equal(createHash("sha256").update(menu).digest("hex"), "698e1c62945c3a406e9d179b6ca9b9e5bc123573455f644500e9530aeb74a09d");
  });
  await test("localhost network limits are explained; trusted IPv4/IPv6 and geo headers are captured while spoofed or invalid values are rejected", async () => {
    const deferred = [], rendered = [];
    const actualMail = createLoader({
      "server-only": {},
      "@/lib/mongoose": { connectDB: async () => {} }, "@/models/AccountSecurity": collections,
      "next/server": { after: work => deferred.push(work) },
      "./gmail-delivery": { deliverThroughGmail: async input => { rendered.push(input); } },
      "./account-security": { takeSecurityLimit: async () => ({ allowed: true }) },
    })("lib/server/account-security-mail.ts");
    const keys = ["VERCEL", "AUTH_TRUST_PROXY", "NEXTAUTH_URL"];
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    try {
      delete process.env.VERCEL; process.env.AUTH_TRUST_PROXY = "false"; process.env.NEXTAUTH_URL = "http://localhost:3000";
      const claimed = new Headers({ "user-agent": metadata.userAgent, "x-forwarded-for": "198.51.100.10", "x-vercel-forwarded-for": "203.0.113.9", "x-vercel-ip-city": "Mumbai", "x-vercel-ip-country": "IN" });
      const local = actualMail.requestMetadata(claimed);
      assert.equal(local.ip, ""); assert.equal(local.location, "Unknown"); assert.match(local.networkNote, /localhost/);
      actualMail.notifySecurity({ event: "Local fixture login", status: "Successful", verified: true, metadata: local });
      assert.equal(rendered.length, 0); await deferred.shift()();
      assert.match(rendered[0].text, /IP: Unavailable/); assert.match(rendered[0].text, /localhost/); assert.match(rendered[0].text, /OS: Windows/); assert.match(rendered[0].text, /Browser: Chrome/);
      process.env.AUTH_TRUST_PROXY = "true";
      let capture = actualMail.requestMetadata(claimed);
      assert.equal(capture.ip, "198.51.100.10", "Custom proxy must not prefer a client-supplied Vercel header"); assert.match(capture.location, /Mumbai/); assert.equal(capture.networkNote, undefined);
      claimed.set("x-forwarded-for", "::ffff:198.51.100.10, 10.0.0.1");
      assert.equal(actualMail.requestMetadata(claimed).ip, "198.51.100.10");
      claimed.set("x-forwarded-for", "not-an-ip"); assert.equal(actualMail.requestMetadata(claimed).ip, "");
      process.env.AUTH_TRUST_PROXY = "false"; process.env.VERCEL = "1";
      claimed.set("x-vercel-forwarded-for", "2001:db8::7"); claimed.set("x-vercel-ip-city", "New%20Delhi");
      capture = actualMail.requestMetadata(claimed); assert.equal(capture.ip, "2001:db8::7"); assert.match(capture.location, /New Delhi/); assert.match(capture.location, /India/);
      process.env.VERCEL = "0"; assert.equal(actualMail.requestMetadata(claimed).ip, ""); assert.equal(actualMail.requestMetadata(claimed).location, "Unknown");
      process.env.NEXTAUTH_URL = "https://erp.example.com";
      assert.match(actualMail.requestMetadata(claimed).networkNote, /trusted hosting platform or proxy/);
    } finally {
      for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  });
  await test("notification rendering is deferred, throttled, IST-formatted and delivery failures never escape", async () => {
    const deferred = [], rendered = [];
    const realMail = createLoader({
      "server-only": {},
      "@/lib/mongoose": { connectDB: async () => {} }, "@/models/AccountSecurity": collections,
      "next/server": { after: work => deferred.push(work) },
      "./gmail-delivery": { deliverThroughGmail: async input => { rendered.push(input); if (mailFails) throw Error("mail failure"); } },
      "./account-security": { takeSecurityLimit: security.takeSecurityLimit },
    })("lib/server/account-security-mail.ts");
    clearCooldown(); realMail.notifySecurity({ event: "Test failed login", status: "Failed", email: "claimed@example.com", verified: false, metadata });
    assert.equal(rendered.length, 0); await deferred.shift()(); assert.equal(rendered.length, 1);
    assert.match(rendered[0].text, /IST/); assert.match(rendered[0].text, /Claimed email/);
    realMail.notifySecurity({ event: "Test failed login", status: "Failed", email: "claimed@example.com", verified: false, metadata }); await deferred.shift()(); assert.equal(rendered.length, 1);
    mailFails = true; realMail.notifySecurity({ event: "Other test event", status: "Failed", verified: false, metadata }); await deferred.shift()(); mailFails = false;
  });
  console.log(`\n${passed} account security checks passed. No external services contacted.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
