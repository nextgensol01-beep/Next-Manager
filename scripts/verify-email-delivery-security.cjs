/* Actual security services and HTTP handlers with isolated atomic database fixtures.
 * No production database, Gmail account, or secrets are accessed. */
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { NextRequest } = require("next/server");
const createLoader = require("./search-test-loader.cjs");
const copy = (value) => (value == null ? value : structuredClone(value));
const at = (object, key) =>
  key.split(".").reduce((current, part) => current?.[part], object);
const valuesAt = (object, path) => {
  const [part, ...rest] = path.split(".");
  if (Array.isArray(object) && !/^\d+$/.test(part))
    return object.flatMap((item) => valuesAt(item, path));
  const value = object?.[part];
  return rest.length ? valuesAt(value, rest.join(".")) : [value];
};
function expression(value, object, variables = {}) {
  if (typeof value === "string" && value.startsWith("$$"))
    return variables[value.slice(2)];
  if (typeof value === "string" && value.startsWith("$"))
    return at(object, value.slice(1));
  if (Array.isArray(value))
    return value.map((item) => expression(item, object, variables));
  if (!value || value instanceof Date || typeof value !== "object")
    return value;
  if ("$filter" in value) {
    const filter = value.$filter;
    return expression(filter.input, object, variables).filter((item) =>
      expression(filter.cond, object, { ...variables, [filter.as]: item }),
    );
  }
  if ("$size" in value)
    return expression(value.$size, object, variables).length;
  if ("$concatArrays" in value)
    return expression(value.$concatArrays, object, variables).flat();
  if ("$lt" in value) {
    const [a, b] = expression(value.$lt, object, variables);
    return a < b;
  }
  if ("$gt" in value) {
    const [a, b] = expression(value.$gt, object, variables);
    return a > b;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      expression(item, object, variables),
    ]),
  );
}
function equals(a, b) {
  return b == null
    ? a == null
    : a instanceof Date && b instanceof Date
      ? +a === +b
      : a === b;
}
function matches(object, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return condition.some((item) => matches(object, item));
    if (key === "$and") return condition.every((item) => matches(object, item));
    if (key === "$expr") return expression(condition, object);
    const values = valuesAt(object, key);
    if (
      condition &&
      typeof condition === "object" &&
      !(condition instanceof Date)
    )
      return Object.entries(condition).every(([operator, expected]) => {
        switch (operator) {
          case "$ne":
            return !values.some((value) => equals(value, expected));
          case "$nin":
            return !values.some(value => expected.some(item => equals(value, item)));
          case "$in":
            return values.some((value) =>
              expected.some((item) => equals(value, item)),
            );
          case "$exists":
            return values.some((value) => value !== undefined) === expected;
          case "$lt":
            return values.some((value) => value < expected);
          case "$lte":
            return values.some((value) => value <= expected);
          case "$gt":
            return values.some((value) => value > expected);
          case "$gte":
            return values.some((value) => value >= expected);
          case "$elemMatch":
            return values.some(
              (value) =>
                Array.isArray(value) &&
                value.some((item) => matches(item, expected)),
            );
          default:
            throw Error(`Unsupported fixture operator: ${operator}`);
        }
      });
    return values.some((value) => equals(value, condition));
  });
}
function set(object, path, value, remove = false) {
  const parts = path.split(".");
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  if (remove) delete target[parts.at(-1)];
  else target[parts.at(-1)] = copy(value);
}
function update(object, change, inserted = false) {
  if (Array.isArray(change)) {
    for (const stage of change)
      for (const [key, value] of Object.entries(stage.$set))
        set(object, key, expression(value, object));
    return;
  }
  if (inserted)
    for (const [key, value] of Object.entries(change.$setOnInsert || {}))
      set(object, key, value);
  for (const [key, value] of Object.entries(change.$set || {}))
    set(object, key, value);
  for (const [key, value] of Object.entries(change.$inc || {}))
    set(object, key, (at(object, key) || 0) + value);
  for (const key of Object.keys(change.$unset || {}))
    set(object, key, undefined, true);
}
function project(value, fields) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(item => project(item, fields));
  if (typeof fields === 'object') {
    if (fields.items?.$slice) {
      const [start, count] = fields.items.$slice;
      return { _id: value._id, items: copy(value.items.slice(start, start + count)) };
    }
    throw Error('Unsupported test projection');
  }
  const tokens = fields.split(/\s+/).filter(Boolean);
  if (!tokens.some(token => !token.startsWith('+') && !token.startsWith('-'))) return copy(value);
  const tree = {};
  for (const token of ['_id', ...tokens]) {
    if (token.startsWith('-')) continue;
    const parts = token.replace(/^\+/, '').split('.');
    let branch = tree;
    for (const part of parts.slice(0, -1)) branch = branch[part] ??= {};
    branch[parts.at(-1)] = true;
  }
  function pick(object, branch) {
    if (object == null) return object;
    if (Array.isArray(object)) return object.map(item => pick(item, branch));
    return Object.fromEntries(Object.entries(branch).filter(([key]) => key in object).map(([key, child]) =>
      [key, child === true ? copy(object[key]) : pick(object[key], child)]));
  }
  return pick(value, tree);
}
function query(value) {
  let result = value, fields;
  const chain = {
    select(selection) {
      fields = selection;
      return chain;
    },
    lean() {
      return Promise.resolve(fields ? project(result, fields) : copy(result));
    },
    sort(order) {
      if (Array.isArray(result)) {
        const [key, direction] = Object.entries(order)[0];
        result = [...result].sort((a, b) => (at(a, key) > at(b, key) ? 1 : -1) * direction);
      }
      return chain;
    },
    limit(count) {
      if (Array.isArray(result)) result = result.slice(0, count);
      return chain;
    },
    then(resolve, reject) {
      return Promise.resolve(fields ? project(result, fields) : copy(result)).then(resolve, reject);
    },
  };
  return chain;
}
function databaseModel(defaults = {}, unique) {
  const rows = [];
  let rejectCreate = false;
  const model = {
    rows,
    init: async () => {},
    createIndexes: async () => {},
    failNextCreate() {
      rejectCreate = true;
    },
    async create(input) {
      if (rejectCreate) {
        rejectCreate = false;
        throw Error("Isolated persistence failure");
      }
      if (unique && rows.some((row) => row[unique] === input[unique]))
        throw Object.assign(Error("Duplicate"), { code: 11000 });
      const row = {
        _id: randomUUID().replaceAll("-", "").slice(0, 24),
        ...copy(defaults),
        ...copy(input),
        createdAt: new Date(),
      };
      rows.push(row);
      return { ...copy(row), toObject: () => copy(row) };
    },
    findOne: (filter) => query(rows.find((row) => matches(row, filter))),
    find: (filter) => query(rows.filter((row) => matches(row, filter))),
    findById: (id) => query(rows.find((row) => row._id === id)),
    exists: async (filter) => Boolean(rows.find((row) => matches(row, filter))),
    countDocuments: async (filter) =>
      rows.filter((row) => matches(row, filter)).length,
    updateOne(filter, change, options = {}) {
      let row = rows.find((row) => matches(row, filter)),
        inserted = false;
      if (!row && options.upsert) {
        row = { ...copy(defaults), ...copy(filter) };
        rows.push(row);
        inserted = true;
      }
      if (!row) return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
      const before = JSON.stringify(row);
      update(row, change, inserted);
      return Promise.resolve({
        matchedCount: 1,
        modifiedCount: Number(before !== JSON.stringify(row)),
      });
    },
    updateMany(filter, change) {
      rows
        .filter((row) => matches(row, filter))
        .forEach((row) => update(row, change));
      return Promise.resolve({});
    },
    findOneAndUpdate(filter, change) {
      const row = rows.find((row) => matches(row, filter));
      if (!row) return query(null);
      update(row, change);
      return query(row);
    },
    aggregate(stages) {
      // Aggregation executes in MongoDB; only its final result reaches the app.
      let result = rows;
      for (const stage of stages) {
        if (stage.$match)
          result = result.filter((row) => matches(row, stage.$match));
        else if (stage.$unwind) {
          const field = stage.$unwind.slice(1);
          result = result.flatMap((row) =>
            row[field].map((item) => ({ ...row, [field]: item })),
          );
        } else if (stage.$count)
          result = result.length ? [{ [stage.$count]: result.length }] : [];
        else throw Error("Unsupported aggregate stage");
      }
      return Promise.resolve(result);
    },
  };
  return model;
}
const defaults = {
  draftProtection: "confirmation",
  directSendProtection: "emailOtp",
  holdToSend: true,
  restrictDuplicateRecipients: true,
  otpExpiryMinutes: 5,
  otpResendCooldownSeconds: 45,
  otpMaxAttempts: 5,
  largeBatchThreshold: 50,
  requireEmailOtpForLargeBatch: true,
};
const Settings = databaseModel(
  { ...defaults, key: "global", version: 0 },
  "key",
);
const Approval = databaseModel(
  { otpAttempts: 0, pinAttempts: 0, otpResendCount: 0 },
  "approvalId",
);
const Gate = databaseModel({ events: [] }, "key"),
  Audit = databaseModel(),
  Campaign = databaseModel(
    { status: "processing", completed: 0, failed: 0 },
    "campaignId",
  );
const Tracker = databaseModel(),
  Entry = databaseModel(),
  EmailLog = databaseModel({ sentAt: new Date(), communicationStatus: "sent" }),
  WorkItem = databaseModel();
let session = { user: { id: "ADMIN1", email: "admin@example.com" } },
  admin = true,
  deliveryBehavior = null,
  linkedBehavior = null;
const otpMail = [],
  delivered = [];
class GmailDeliveryError extends Error {
  constructor(message, mayHaveDelivered) {
    super(message);
    this.mayHaveDelivered = mayHaveDelivered;
  }
}
const gmail = {
  GmailDeliveryError,
  async deliverThroughGmail(message) {
    if (message.subject.includes("verification code")) {
      assert.equal(message.appendDefaultSignature, false);
      const code = message.html.match(/<strong>(\d{6})<\/strong>/)?.[1];
      assert(code);
      assert(message.text.includes(code));
      otpMail.push({ to: message.to[0], code });
      return { draftId: randomUUID() };
    }
    delivered.push(copy(message));
    if (deliveryBehavior) return deliveryBehavior(message);
    return { draftId: randomUUID(), threadId: randomUUID() };
  },
};
const mocks = {
  "server-only": {},
  "next-auth": { getServerSession: async () => session },
  "@/lib/auth": { authOptions: {} },
  "@/lib/authUsers": {
    isAdminSession: async () => admin,
    getRequestIp: () => "127.0.0.1",
  },
  "@/lib/adminAuth": { getAdminEmail: () => "suggested@example.com" },
  "@/lib/mongoose": { connectDB: async () => {} },
  "@/models/EmailDeliverySecuritySettings": Settings,
  "@/models/EmailDeliveryApproval": Approval,
  "@/models/EmailDeliverySecurityGate": Gate,
  "@/models/EmailDeliverySecurityAudit": Audit,
  "@/models/TrackerEmailCampaign": Campaign,
  "@/models/ClientTracker": Tracker,
  "@/models/ClientTrackerEntry": Entry,
  "@/models/EmailLog": EmailLog,
  "@/models/Document": databaseModel(),
  "@/models/ClientWorkItem": WorkItem,
  "./gmail-delivery": gmail,
  "@/lib/server/gmail-delivery": gmail,
  "@/lib/server/tracker-linked-data": {
    resolveTrackerLinkedValues: async () =>
      linkedBehavior ? linkedBehavior() : new Map(),
  },
  "@/lib/server/tracker-computed-values": {
    resolveTrackerComputedValues: (_, values) => values,
  },
  "@/lib/server/tracker-email-attachments": {
    materializeTrackerEmailAttachments: async ({ attachments }) => {
      if (attachments.length) throw Error("Unauthorized attachment");
      return [];
    },
    resolveTrackerEmailAttachmentDocuments: () => [],
  },
  "@/lib/server/activity-events": {
    recordActivityEvent: async () => ({ _id: randomUUID() }),
  },
};
const load = createLoader(mocks),
  shared = load("lib/email-delivery-security.ts"),
  crypto = load("lib/server/email-delivery-crypto.ts");
const service = load("lib/server/email-delivery-approval.ts"),
  hash = load("lib/server/tracker-email-batch.ts").trackerEmailBatchHash;
const worker = load("lib/server/tracker-email-worker.ts");
const jobs = load("lib/server/email-delivery-jobs.ts");
const routes = {
  settings: load("app/api/settings/email-delivery-security/route.ts"),
  authorize: load(
    "app/api/settings/email-delivery-security/authorize/route.ts",
  ),
  email: load(
    "app/api/settings/email-delivery-security/approval-email/route.ts",
  ),
  pin: load("app/api/settings/email-delivery-security/send-pin/route.ts"),
  request: load("app/api/client-trackers/[id]/email/approval/request/route.ts"),
  verify: load("app/api/client-trackers/[id]/email/approval/verify/route.ts"),
  resend: load("app/api/client-trackers/[id]/email/approval/resend/route.ts"),
  deliver: load("app/api/client-trackers/[id]/email/deliver/route.ts"),
  activity: load("app/api/settings/email-delivery-security/activity/route.ts"),
};
const trackerId = "0123456789abcdef01234567";
function batch(mode = "send", client = randomUUID()) {
  return {
    campaignId: randomUUID(),
    workflowId: "WF1",
    kind: "initial",
    mode,
    messages: [
      {
        entryId: client,
        clientId: client,
        companyName: "Isolated client",
        to: [`${client}@example.com`],
        cc: [],
        subject: "Client update",
        html: "<p>Exact content</p>",
        attachments: [],
      },
    ],
  };
}
function eligible(input) {
  input.messages.forEach((item) =>
    Entry.rows.push({
      _id: item.entryId,
      trackerId,
      clientId: item.clientId,
      values: { ready: "Yes" },
    }),
  );
}
async function call(route, body, method = "POST", options = {}) {
  const url = `http://localhost/api/${route}${options.query || ""}`;
  const request = new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", ...options.headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const response = await routes[route][method](request, {
    params: Promise.resolve({ id: options.trackerId || trackerId }),
  });
  const result = { status: response.status, body: await response.json() };
  if (route !== "deliver" || !response.ok || options.acceptOnly) return result;
  // Existing business/security assertions now exercise acceptance followed by the
  // shared engine, isolated from live MongoDB/Gmail.
  const alreadyProcessed = ["completed", "completed_with_errors"].includes(result.body.job.status);
  try {
    for (let pass = 0; pass < 300; pass++) {
      const progress = await worker.processDeliveryJob(result.body.campaignId, { assertOwnership: async () => {} });
      if (progress.state === "busy") return { status: 409, body: { code: "DELIVERY_BUSY" } };
      if (progress.state !== "processing") break;
    }
    const record = Campaign.rows.find(row => row.campaignId === result.body.campaignId);
    const summary = jobs.publicDeliveryJob(record);
    return { status: 200, body: { campaignId: record.campaignId, status: summary.status,
      total: summary.total, completed: summary.sent + summary.drafts, failed: summary.failed + summary.uncertain,
      pending: summary.pending, uncertain: summary.uncertain, alreadyProcessed } };
  } catch (error) {
    return { status: error.status || 500, body: { error: error.message, code: error.code } };
  }
}
function advanceCooldown() {
  Gate.rows.forEach((row) => (row.events = []));
  Approval.rows.forEach((row) => {
    if (row.otpSentAt) row.otpSentAt = new Date(Date.now() - 60_000);
  });
}
async function approve(input, pin) {
  advanceCooldown();
  const response = await call("request", input);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  if (response.body.resumed) return response.body.approvalId;
  const values = {
    approvalId: response.body.approvalId,
    batch: input,
    ...(response.body.methodsRequired.includes("emailOtp")
      ? { otp: otpMail.at(-1).code }
      : {}),
    ...(response.body.methodsRequired.includes("sendPin") ? { pin } : {}),
  };
  const verified = await call("verify", values);
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.status, "verified");
  return values.approvalId;
}
async function main() {


  process.env.EMAIL_DELIVERY_OTP_SECRET = randomUUID() + randomUUID();
  process.env.EMAIL_SEND_PIN_PEPPER = randomUUID() + randomUUID();
  Tracker.rows.push({
    _id: trackerId,
    name: "Isolated tracker",
    status: "active",
    emailEnabled: true,
    financialYear: "2025-26",
    fields: [{ key: "ready", type: "select", options: ["Yes"] }],
    emailWorkflows: [
      {
        id: "WF1",
        name: "Workflow",
        mainFieldKey: "ready",
        mainValue: "Yes",
        signatureGap: 2,
      },
    ],
  });
  assert.deepEqual(shared.EMAIL_DELIVERY_SECURITY_DEFAULTS, defaults);
  session = null;
  assert.equal((await call("settings", undefined, "GET")).status, 401);
  session = { user: { id: "ADMIN1", email: "admin@example.com" } };
  admin = false;
  for (const route of [
    "settings",
    "request",
    "verify",
    "resend",
    "email",
    "pin",
    "authorize",
    "deliver",
    "activity",
  ])
    assert.equal(
      (
        await call(
          route,
          undefined,
          route === "settings" || route === "activity" ? "GET" : "POST",
        )
      ).status,
      403,
    );
  admin = true;
  assert.equal(
    (
      await call("request", batch(), "POST", {
        headers: { origin: "https://attacker.example" },
      })
    ).status,
    403,
  );
  let view = (await call("settings", undefined, "GET")).body;
  assert.equal(view.restrictDuplicateRecipients, true);
  delete Settings.rows[0].restrictDuplicateRecipients;
  assert.equal(
    (await call("settings", undefined, "GET")).body.restrictDuplicateRecipients,
    true,
    "Existing settings documents retain duplicate protection by default",
  );
  Settings.rows[0].restrictDuplicateRecipients = true;
  assert.equal(view.approvalEmailVerified, false);
  assert.equal(view.suggestedApprovalEmail, "suggested@example.com");
  assert.equal(
    (await call("request", batch())).body.code,
    "APPROVAL_EMAIL_REQUIRED",
  );
  const otpSecret = process.env.EMAIL_DELIVERY_OTP_SECRET;
  delete process.env.EMAIL_DELIVERY_OTP_SECRET;
  assert.equal(
    (await call("email", { action: "request", email: "trusted@example.com" }))
      .status,
    503,
  );
  process.env.EMAIL_DELIVERY_OTP_SECRET = otpSecret;
  let setup = await call("email", {
    action: "request",
    email: "TRUSTED@example.com",
  });
  assert.equal(setup.status, 200);
  assert.equal(otpMail.at(-1).to, "trusted@example.com");
  assert(!JSON.stringify(setup.body).includes(otpMail.at(-1).code));
  assert(!("otpHash" in setup.body));
  assert(!("pendingEmail" in setup.body));
  let verified = await call("email", {
    action: "verify",
    approvalId: setup.body.approvalId,
    otp: otpMail.at(-1).code,
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.settings.approvalEmailVerified, true);
  const input = batch();
  eligible(input);
  assert.equal(
    (await call("deliver", { ...input, confirmed: true })).status,
    403,
  );
  assert.equal(delivered.length, 0);
  advanceCooldown();
  let request = await call("request", input);
  const approvalId = request.body.approvalId,
    firstCode = otpMail.at(-1).code;
  assert.equal(
    Approval.rows.find((row) => row.approvalId === approvalId).otpHash.length,
    64,
  );
  assert.notEqual(Approval.rows.at(-1).otpHash, firstCode);
  assert.equal(
    (await call("resend", { approvalId, batch: input })).status,
    429,
  );
  const normalized = copy(input);
  normalized.messages[0].to = normalized.messages[0].to.map(
    (value) => ` ${value.toUpperCase()} `,
  );
  assert.equal(hash(trackerId, input), hash(trackerId, normalized));
  for (const mutation of [
    (value) => value.messages[0].to.push("other@example.com"),
    (value) => value.messages[0].cc.push("copy@example.com"),
    (value) => (value.messages[0].subject += "changed"),
    (value) => (value.messages[0].html += "changed"),
    (value) => value.messages[0].attachments.push({ documentId: "DOC1" }),
    (value) => (value.mode = "draft"),
    (value) => (value.kind = "reminder"),
    (value) => (value.workflowId = "OTHER"),
    (value) => (value.campaignId = randomUUID()),
  ]) {
    const changed = copy(input);
    mutation(changed);
    assert.equal(
      (await call("verify", { approvalId, batch: changed, otp: firstCode }))
        .status,
      409,
    );
    assert.equal(
      (await call("deliver", { ...changed, approvalId, confirmed: true }))
        .status < 300,
      false,
    );
  }
  session = { user: { id: "OTHER", email: "other@example.com" } };
  assert.equal(
    (await call("verify", { approvalId, batch: input, otp: firstCode })).status,
    403,
  );
  session = { user: { id: "ADMIN1", email: "admin@example.com" } };
  assert.equal(
    (
      await call(
        "verify",
        { approvalId, batch: input, otp: firstCode },
        "POST",
        { trackerId: "different" },
      )
    ).status,
    409,
  );
  advanceCooldown();
  assert.equal(
    (await call("resend", { approvalId, batch: input })).status,
    200,
  );
  const currentCode = otpMail.at(-1).code;
  assert.notEqual(firstCode, currentCode);
  assert.equal(
    (await call("verify", { approvalId, batch: input, otp: firstCode })).status,
    400,
  );
  verified = await call("verify", {
    approvalId,
    batch: input,
    otp: currentCode,
  });
  assert.equal(verified.body.status, "verified");
  assert.equal(
    (await call("deliver", { ...input, approvalId, confirmed: true })).status,
    200,
  );
  assert.equal(delivered.length, 1);
  assert.equal(Campaign.rows[0].items[0].status, "sent");
  assert.equal(EmailLog.rows[0].status, "sent");
  assert.equal(
    (await call("deliver", { ...input, confirmed: true })).body
      .alreadyProcessed,
    true,
  );
  assert.equal(delivered.length, 1);
  assert.equal(
    (await call("deliver", { ...batch(), approvalId, confirmed: true })).status,
    403,
  );
  assert.equal(
    (await call("request", { ...input, messages: batch().messages })).body.code,
    "CAMPAIGN_MISMATCH",
  );
  const locked = batch();
  advanceCooldown();
  request = await call("request", locked);
  const storedCode = otpMail.at(-1).code,
    wrong = storedCode === "000000" ? "999999" : "000000";
  for (let index = 0; index < 5; index++)
    assert.equal(
      (
        await call("verify", {
          approvalId: request.body.approvalId,
          batch: locked,
          otp: wrong,
        })
      ).status,
      index === 4 ? 423 : 400,
    );
  assert.equal(
    (
      await call("verify", {
        approvalId: request.body.approvalId,
        batch: locked,
        otp: storedCode,
      })
    ).status,
    423,
  );
  assert.equal(
    Approval.rows.find((row) => row.approvalId === request.body.approvalId)
      .otpHash,
    undefined,
  );
  const expired = batch();
  advanceCooldown();
  request = await call("request", expired);
  Approval.rows.at(-1).expiresAt = new Date(Date.now() - 1);
  assert.equal(
    (
      await call("verify", {
        approvalId: request.body.approvalId,
        batch: expired,
        otp: otpMail.at(-1).code,
      })
    ).status,
    410,
  );
  const policyChanged = batch();
  advanceCooldown();
  request = await call("request", policyChanged);
  Settings.rows[0].version++;
  assert.equal(
    (
      await call("verify", {
        approvalId: request.body.approvalId,
        batch: policyChanged,
        otp: otpMail.at(-1).code,
      })
    ).body.code,
    "POLICY_CHANGED",
  );
  assert.equal(
    (
      await call(
        "settings",
        {
          policy: { ...defaults, directSendProtection: "none" },
          version: Settings.rows[0].version,
        },
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "settings",
        {
          policy: defaults,
          version: Settings.rows[0].version,
          approvalEmail: "bypass@example.com",
        },
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "settings",
        {
          policy: { ...defaults, holdToSend: false },
          version: Settings.rows[0].version,
        },
        "PATCH",
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("pin", { action: "save", pin: "1234", confirmPin: "1234" }))
      .status,
    400,
  );
  assert.equal(
    (await call("pin", { action: "save", pin: "246810", confirmPin: "246810" }))
      .status,
    403,
  );
  advanceCooldown();
  let proof = await call("authorize", {
    action: "request",
    purpose: "send-pin-update",
  });
  await call("authorize", {
    action: "verify",
    purpose: "send-pin-update",
    approvalId: proof.body.approvalId,
    otp: otpMail.at(-1).code,
  });
  assert.equal(
    (
      await call("pin", {
        action: "save",
        pin: "246810",
        confirmPin: "135790",
        approvalId: proof.body.approvalId,
      })
    ).status,
    400,
  );
  const savedPin = await call("pin", {
    action: "save",
    pin: "246810",
    confirmPin: "246810",
    approvalId: proof.body.approvalId,
  });
  assert.equal(savedPin.status, 200);
  assert.equal(savedPin.body.sendPinConfigured, true);
  assert(!JSON.stringify(savedPin.body).includes("246810"));
  assert(!("sendPinHash" in savedPin.body));
  assert(Settings.rows[0].sendPinHash.startsWith("$2"));
  assert(await crypto.matchesSendPin("246810", Settings.rows[0].sendPinHash));
  Settings.rows[0].directSendProtection = "emailOtpAndPin";
  const both = batch();
  advanceCooldown();
  request = await call("request", both);
  verified = await call("verify", {
    approvalId: request.body.approvalId,
    batch: both,
    otp: otpMail.at(-1).code,
  });
  assert.equal(verified.body.status, "pending");
  assert.deepEqual(verified.body.methodsVerified, ["emailOtp"]);
  assert.equal(
    (
      await call("deliver", {
        ...both,
        approvalId: request.body.approvalId,
        confirmed: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("verify", {
        approvalId: request.body.approvalId,
        batch: both,
        pin: "135790",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("verify", {
        approvalId: request.body.approvalId,
        batch: both,
        pin: "246810",
      })
    ).body.status,
    "verified",
  );
  Settings.rows[0].directSendProtection = "sendPin";
  assert.deepEqual(
    shared.requiredDeliveryMethods(Settings.rows[0], "send", 49),
    ["sendPin"],
  );
  assert.deepEqual(
    shared.requiredDeliveryMethods(Settings.rows[0], "send", 50),
    ["emailOtp", "sendPin"],
  );
  const pepper = process.env.EMAIL_SEND_PIN_PEPPER;
  delete process.env.EMAIL_SEND_PIN_PEPPER;
  assert.equal((await call("request", batch())).status, 503);
  process.env.EMAIL_SEND_PIN_PEPPER = pepper;
  const sharedRecipients = batch();
  sharedRecipients.messages.push(batch().messages[0]);
  sharedRecipients.messages[0].cc = [" Shared@example.com "];
  sharedRecipients.messages[1].to = ["shared@example.com"];
  const sendsBeforeShared = delivered.length;
  const otpBeforeShared = otpMail.length;
  assert.equal((await call("request", sharedRecipients)).status, 400);
  assert.equal((await call("deliver", sharedRecipients)).status, 400);
  assert.equal(otpMail.length, otpBeforeShared);
  assert.equal(delivered.length, sendsBeforeShared);
  async function saveDuplicateRestriction(restrictDuplicateRecipients) {
    advanceCooldown();
    const requested = await call("authorize", {
      action: "request",
      purpose: "settings-update",
    });
    assert.equal(requested.status, 200);
    assert.equal(
      (await call("authorize", {
        action: "verify",
        purpose: "settings-update",
        approvalId: requested.body.approvalId,
        otp: otpMail.at(-1).code,
      })).status,
      200,
    );
    const policy = Object.fromEntries(
      Object.keys(defaults).map(key => [key, Settings.rows[0][key]]),
    );
    const saved = await call("settings", {
      policy: { ...policy, restrictDuplicateRecipients },
      version: Settings.rows[0].version,
      approvalId: requested.body.approvalId,
    }, "PATCH");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.restrictDuplicateRecipients, restrictDuplicateRecipients);
    assert.equal((await call("settings", undefined, "GET")).body.restrictDuplicateRecipients, restrictDuplicateRecipients);
  }
  await saveDuplicateRestriction(false);
  const repeatedClient = batch();
  repeatedClient.messages.push(copy(repeatedClient.messages[0]));
  assert.equal((await call("request", repeatedClient)).status, 400);
  const repeatedWithinMessage = batch();
  repeatedWithinMessage.messages[0].cc = [...repeatedWithinMessage.messages[0].to];
  assert.equal((await call("request", repeatedWithinMessage)).status, 400);
  eligible(sharedRecipients);
  const sharedId = await approve(sharedRecipients, "246810");
  const sharedResult = await call("deliver", { ...sharedRecipients, approvalId: sharedId });
  assert.equal(sharedResult.status, 200, JSON.stringify(sharedResult.body));
  assert.equal(sharedResult.body.completed, 2);
  assert.equal(delivered.length, sendsBeforeShared + 2);
  const pendingShared = copy(sharedRecipients);
  pendingShared.campaignId = randomUUID();
  await approve(pendingShared, "246810");
  await saveDuplicateRestriction(true);
  assert.equal((await call("request", pendingShared)).status, 400);
  assert.equal((await call("deliver", pendingShared)).status, 400);
  // Previously authorized campaigns keep their exact snapshot and safe retry behavior.
  assert.equal((await call("request", sharedRecipients)).body.resumed, true);
  assert.equal((await call("deliver", { ...sharedRecipients, approvalId: sharedId })).body.alreadyProcessed, true);
  assert.equal(delivered.length, sendsBeforeShared + 2);
  const concurrent = batch();
  eligible(concurrent);
  const concurrentId = await approve(concurrent, "246810");
  let unblock;
  deliveryBehavior = () =>
    new Promise((resolve) => {
      unblock = resolve;
    });
  const first = call("deliver", {
    ...concurrent,
    approvalId: concurrentId,
    confirmed: true,
  });
  while (!unblock) await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await call("deliver", {
    ...concurrent,
    approvalId: concurrentId,
    confirmed: true,
  });
  assert.equal(second.body.code, "DELIVERY_BUSY");
  unblock({ draftId: randomUUID() });
  assert.equal((await first).status, 200);
  deliveryBehavior = null;
  assert.equal(
    delivered.filter(
      (message) => message.to[0] === concurrent.messages[0].to[0],
    ).length,
    1,
  );
  const takeover = batch();
  eligible(takeover);
  const takeoverId = await approve(takeover, "246810");
  let rejectPreflight, finishTakeover;
  linkedBehavior = () =>
    new Promise((resolve, reject) => {
      rejectPreflight = reject;
    });
  const abandoned = call("deliver", {
    ...takeover,
    approvalId: takeoverId,
    confirmed: true,
  });
  while (!rejectPreflight)
    await new Promise((resolve) => setTimeout(resolve, 5));
  Gate.rows.find((row) => row.key === "client-delivery").leaseUntil = new Date(
    Date.now() - 1,
  );
  linkedBehavior = null;
  deliveryBehavior = () =>
    new Promise((resolve) => {
      finishTakeover = resolve;
    });
  const replacement = call("deliver", {
    ...takeover,
    approvalId: takeoverId,
    confirmed: true,
  });
  while (!finishTakeover)
    await new Promise((resolve) => setTimeout(resolve, 5));
  rejectPreflight(Error("Isolated slow preflight failed"));
  assert.equal((await abandoned).body.code, "DELIVERY_LEASE_ENDED");
  assert.equal(
    Campaign.rows.find((row) => row.campaignId === takeover.campaignId).items[0]
      .status,
    "delivering",
    "An expired worker cannot overwrite another worker's item claim",
  );
  finishTakeover({ draftId: randomUUID() });
  assert.equal((await replacement).status, 200);
  deliveryBehavior = null;
  assert.equal(
    delivered.filter((message) => message.to[0] === takeover.messages[0].to[0])
      .length,
    1,
  );
  const historyFailure = batch();
  eligible(historyFailure);
  const historyId = await approve(historyFailure, "246810");
  EmailLog.failNextCreate();
  assert.equal(
    (
      await call("deliver", {
        ...historyFailure,
        approvalId: historyId,
        confirmed: true,
      })
    ).status,
    503,
  );
  const beforeRecovery = delivered.length;
  assert.equal((await call("request", historyFailure)).body.resumed, true);
  assert.equal(
    (
      await call("deliver", {
        ...historyFailure,
        confirmed: true,
        resume: true,
      })
    ).status,
    200,
  );
  assert.equal(delivered.length, beforeRecovery);
  assert(
    EmailLog.rows.some((row) => row.campaignId === historyFailure.campaignId),
  );
  const duplicate = copy(historyFailure);
  duplicate.campaignId = randomUUID();
  const duplicateId = await approve(duplicate, "246810");
  assert.equal(
    (
      await call("deliver", {
        ...duplicate,
        approvalId: duplicateId,
        confirmed: true,
      })
    ).body.failed,
    1,
  );
  assert.equal(delivered.length, beforeRecovery);
  const uncertain = batch();
  eligible(uncertain);
  const uncertainId = await approve(uncertain, "246810");
  deliveryBehavior = () => {
    throw new GmailDeliveryError("Unknown Gmail outcome", true);
  };
  assert.equal(
    (
      await call("deliver", {
        ...uncertain,
        approvalId: uncertainId,
        confirmed: true,
      })
    ).body.uncertain,
    1,
  );
  deliveryBehavior = null;
  const uncertainRetry = copy(uncertain);
  uncertainRetry.campaignId = randomUUID();
  const uncertainRetryId = await approve(uncertainRetry, "246810"),
    beforeUncertainRetry = delivered.length;
  assert.equal(
    (
      await call("deliver", {
        ...uncertainRetry,
        approvalId: uncertainRetryId,
        confirmed: true,
      })
    ).body.failed,
    1,
  );
  assert.equal(delivered.length, beforeUncertainRetry);
  const draft = batch("draft");
  eligible(draft);
  assert.equal(
    (await call("deliver", draft)).body.code,
    "DRAFT_CONFIRMATION_REQUIRED",
  );
  assert.equal(
    (await call("deliver", { ...draft, confirmed: true })).body.completed,
    1,
  );
  assert.equal(delivered.at(-1).mode, "draft");
  for (const scenario of [
    "outside-tracker",
    "ineligible",
    "attachment",
    "initial-already-sent",
    "reminder-no-initial",
    "reminder-replied",
    "reminder-cooldown",
  ]) {
    const protectedBatch = batch();
    eligible(protectedBatch);
    const message = protectedBatch.messages[0];
    if (scenario.startsWith("reminder")) protectedBatch.kind = "reminder";
    if (scenario === "outside-tracker")
      Entry.rows.find((row) => row._id === message.entryId).inScope = false;
    if (scenario === "ineligible")
      Entry.rows.find((row) => row._id === message.entryId).values.ready = "No";
    if (scenario === "attachment")
      message.attachments = [{ documentId: "UNAUTHORIZED-DOC" }];
    if (
      [
        "initial-already-sent",
        "reminder-replied",
        "reminder-cooldown",
      ].includes(scenario)
    )
      await EmailLog.create({
        type: "tracker",
        trackerId,
        workflowId: "WF1",
        clientId: message.clientId,
        status: "sent",
        mailKind: "initial",
        sentAt: new Date(
          Date.now() - (scenario === "reminder-cooldown" ? 1 : 8) * 86_400_000,
        ),
        communicationStatus:
          scenario === "reminder-replied" ? "replied" : "sent",
      });
    if (scenario === "attachment") {
      const before = delivered.length;
      advanceCooldown();
      const rejected = await call("request", protectedBatch);
      assert.equal(rejected.status, 409, "Unapproved attachments are rejected before OTP authorization");
      assert.equal(rejected.body.code, "ATTACHMENT_REVIEW_INVALID");
      assert.equal(delivered.length, before);
      continue;
    }
    const protectedId = await approve(protectedBatch, "246810"),
      beforeBusinessRule = delivered.length;
    assert.equal(
      (
        await call("deliver", {
          ...protectedBatch,
          approvalId: protectedId,
          confirmed: true,
        })
      ).body.failed,
      1,
      scenario,
    );
    assert.equal(delivered.length, beforeBusinessRule, scenario);
  }
  const validReminder = batch();
  validReminder.kind = "reminder";
  eligible(validReminder);
  await EmailLog.create({
    type: "tracker",
    trackerId,
    workflowId: "WF1",
    clientId: validReminder.messages[0].clientId,
    status: "sent",
    mailKind: "initial",
    sentAt: new Date(Date.now() - 8 * 86_400_000),
  });
  const reminderId = await approve(validReminder, "246810");
  assert.equal(
    (
      await call("deliver", {
        ...validReminder,
        approvalId: reminderId,
        confirmed: true,
      })
    ).body.completed,
    1,
  );
  const legacy = batch();
  eligible(legacy);
  await Campaign.create({
    campaignId: legacy.campaignId,
    trackerId,
    workflowId: "WF1",
    mailKind: "initial",
    mode: "send",
    createdBy: "admin@example.com",
    total: 1,
    items: legacy.messages.map((message) => ({
      ...message,
      status: "pending",
    })),
  });
  const legacyId = await approve(legacy, "246810");
  assert.equal(
    (
      await call("deliver", {
        ...legacy,
        approvalId: legacyId,
        confirmed: true,
      })
    ).body.completed,
    1,
  );
  assert(
    Campaign.rows.find((row) => row.campaignId === legacy.campaignId)
      .authorizedAt,
  );
  session = { user: { id: "OTHER", email: "other@example.com" } };
  assert.equal((await call("request", legacy)).body.code, "CAMPAIGN_MISMATCH");
  session = { user: { id: "ADMIN1", email: "admin@example.com" } };
  const bulk = batch();
  bulk.messages = Array.from({ length: 50 }, () => batch().messages[0]);
  advanceCooldown();
  const bulkApproval = await call("request", bulk);
  assert.deepEqual(bulkApproval.body.methodsRequired, ["emailOtp", "sendPin"]);
  assert.equal(bulkApproval.body.largeBatchThreshold, 50);
  const daily = batch();
  eligible(daily);
  const dailyId = await approve(daily, "246810");
  const sentCount = EmailLog.rows.length;
  for (let index = 0; index < 350; index++)
    EmailLog.rows.push({
      type: "tracker",
      status: "sent",
      sentAt: new Date(),
      clientId: `quota-${index}`,
    });
  const beforeQuota = delivered.length;
  assert.equal(
    (await call("deliver", { ...daily, approvalId: dailyId, confirmed: true }))
      .body.status,
    "paused_daily_limit",
  );
  assert.equal(delivered.length, beforeQuota);
  EmailLog.rows.splice(sentCount);
  const otpCount = otpMail.length;
  assert.equal((await call("request", daily)).body.resumed, true);
  assert.equal(otpMail.length, otpCount);
  assert.equal(
    (await call("deliver", { ...daily, resume: true, confirmed: true })).body
      .completed,
    1,
  );
  const changeWithoutProof = await call("email", {
    action: "request",
    email: "new@example.com",
  });
  assert.equal(changeWithoutProof.status, 403);
  advanceCooldown();
  proof = await call("authorize", {
    action: "request",
    purpose: "approval-email-change",
  });
  assert.equal(otpMail.at(-1).to, "trusted@example.com");
  await call("authorize", {
    action: "verify",
    purpose: "approval-email-change",
    approvalId: proof.body.approvalId,
    otp: otpMail.at(-1).code,
  });
  setup = await call("email", {
    action: "request",
    email: "new@example.com",
    approvalId: proof.body.approvalId,
  });
  assert.equal(otpMail.at(-1).to, "new@example.com");
  assert.equal(Settings.rows[0].approvalEmail, "trusted@example.com");
  assert.equal(
    (
      await call("email", {
        action: "verify",
        approvalId: setup.body.approvalId,
        otp: otpMail.at(-1).code,
      })
    ).status,
    200,
  );
  assert.equal(Settings.rows[0].approvalEmail, "new@example.com");
  const rateContext = service.securityContext(session, new Headers());
  const slots = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      service.securityRateLimit("isolated-concurrent-limit", 5, 60),
    ),
  );
  assert.equal(
    slots.filter((result) => result.status === "fulfilled").length,
    5,
  );
  const pinOnlySettings = {
    ...Settings.rows[0],
    approvalEmail: undefined,
    approvalEmailVerifiedAt: undefined,
  };
  assert.deepEqual(service.managementMethods(pinOnlySettings), ["sendPin"]);
  advanceCooldown();
  proof = await call("authorize", {
    action: "request",
    purpose: "settings-update",
  });
  await call("authorize", {
    action: "verify",
    purpose: "settings-update",
    approvalId: proof.body.approvalId,
    otp: otpMail.at(-1).code,
  });
  assert.equal(
    (
      await call(
        "settings",
        {
          policy: {
            ...defaults,
            directSendProtection: "sendPin",
            holdToSend: false,
          },
          version: Settings.rows[0].version,
          approvalId: proof.body.approvalId,
        },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "settings",
        {
          policy: defaults,
          version: Settings.rows[0].version,
          approvalId: proof.body.approvalId,
        },
        "PATCH",
      )
    ).status,
    409,
    "Settings authorization is single-use",
  );
  advanceCooldown();
  proof = await call("authorize", {
    action: "request",
    purpose: "send-pin-update",
  });
  await call("authorize", {
    action: "verify",
    purpose: "send-pin-update",
    approvalId: proof.body.approvalId,
    otp: otpMail.at(-1).code,
  });
  assert.equal(
    (await call("pin", { action: "remove", approvalId: proof.body.approvalId }))
      .status,
    200,
  );
  assert.equal((await call("request", batch())).body.code, "SEND_PIN_REQUIRED");
  Settings.rows[0].sendPinHash = await crypto.hashSendPin("246810");
  delete Settings.rows[0].approvalEmail;
  delete Settings.rows[0].approvalEmailVerifiedAt;
  proof = await call("authorize", {
    action: "request",
    purpose: "send-pin-update",
  });
  assert.deepEqual(proof.body.methodsRequired, ["sendPin"]);
  assert.equal(
    (await call("authorize", {
      action: "verify",
      purpose: "send-pin-update",
      approvalId: proof.body.approvalId,
      pin: "024681",
    })).status,
    400,
  );
  assert.equal(
    (
      await call("authorize", {
        action: "verify",
        purpose: "send-pin-update",
        approvalId: proof.body.approvalId,
        pin: "246810",
      })
    ).body.status,
    "verified",
  );
  assert.equal(
    (await call("pin", {
      action: "save",
      pin: "001234",
      confirmPin: "001234",
      approvalId: proof.body.approvalId,
    })).status,
    200,
    "The current PIN can authorize changing to a PIN with leading zeroes",
  );
  assert(await crypto.matchesSendPin("001234", Settings.rows[0].sendPinHash));
  proof = await call("authorize", { action: "request", purpose: "send-pin-update" });
  assert.equal((await call("authorize", {
    action: "verify",
    purpose: "send-pin-update",
    approvalId: proof.body.approvalId,
    pin: "001234",
  })).body.status, "verified");
  assert.equal((await call("pin", {
    action: "remove",
    approvalId: proof.body.approvalId,
  })).body.sendPinConfigured, false, "A correct six-digit PIN authorizes removal");
  const activeLease = await service.acquireDeliveryLease();
  await activeLease.renew();
  Gate.rows.find((row) => row.key === "client-delivery").leaseUntil = new Date(
    Date.now() - 1,
  );
  const replacementLease = await service.acquireDeliveryLease();
  await assert.rejects(
    activeLease.renew,
    (error) => error.code === "DELIVERY_LEASE_ENDED",
  );
  await replacementLease.release();
  const realModels = createLoader({ "server-only": {} });
  const realSettings = realModels(
      "models/EmailDeliverySecuritySettings.ts",
    ).default,
    realApproval = realModels("models/EmailDeliveryApproval.ts").default;
  const modelDefaults = new realSettings().toObject();
  for (const [key, value] of Object.entries(defaults))
    assert.equal(modelDefaults[key], value);
  assert.equal(realSettings.schema.path("sendPinHash").options.select, false);
  assert.equal(realSettings.schema.path("approvalEmail").options.select, false);
  assert.equal(realApproval.schema.path("otpHash").options.select, false);
  assert(
    realApproval.schema
      .indexes()
      .some(
        ([keys, options]) =>
          keys.cleanupAt === 1 && options.expireAfterSeconds === 0,
      ),
  );
  assert(
    realApproval.schema
      .indexes()
      .some(([keys, options]) => keys.approvalId === 1 && options.unique),
  );
  assert.equal(
    (await call("activity", undefined, "GET", { query: "?limit=2" })).body
      .events.length,
    2,
  );
  const auditText = JSON.stringify(Audit.rows);
  for (const mail of otpMail)
    assert(
      !auditText.includes(mail.code),
      "OTP must never appear in audit records",
    );
  assert(!auditText.includes("246810"));
  assert(!auditText.includes(Settings.rows[0].sendPinHash));
  assert(Audit.rows.some((row) => row.event === "delivery_started"));
  assert(Audit.rows.some((row) => row.event === "approval_locked"));
  assert(Audit.rows.some((row) => row.event === "approval_email_changed"));
  assert(Audit.rows.some((row) => row.event === "send_pin_removed"));
  console.log(
    "PASS: admin HTTP boundaries, defaults/fail-closed secrets, trusted-email setup/change, hashed OTP/PIN, resend/expiry/lockout/rates, exact batch and owner binding, policy invalidation, replay/concurrent delivery, history recovery, ambiguous Gmail outcomes, draft confirmation, 350-send cap and safe resume, secret-free audit pagination.",
  );
}
module.exports = { Campaign, Tracker, Entry, EmailLog, Gate, Approval, Audit, Settings, WorkItem, worker, jobs, routes, mocks, load, service, batch, eligible, call, trackerId, delivered, otpMail, approve };
if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
