/* Runs the production FY routes and draft helpers against an isolated ledger/model. */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
const root = path.resolve(__dirname, ".."),
  clone = (value) => structuredClone(value);
let records = [],
  session = { user: { email: "test@example.com" } },
  writes = 0,
  revision = 0,
  race = false,
  activities = [];
const ledger = [
  {
    _id: { fy: "2025-26", from: "PWP", to: "PIBO", type: "RECYCLING" },
    q1: 30.125,
    q2: 0,
    q3: 0,
    q4: 0,
  },
  {
    _id: { fy: "2025-26", from: "PWP", to: "PIBO", type: "EOL" },
    q1: 10.5,
    q2: 4.375,
    q3: 0,
    q4: 0,
  },
];
const ledgerBaseline = clone(ledger);
const matches = (record, query) =>
  Object.entries(query).every(([key, wanted]) =>
    wanted instanceof Date
      ? new Date(record[key]).getTime() === wanted.getTime()
      : wanted && typeof wanted === "object" && "$exists" in wanted
        ? (record[key] !== undefined) === wanted.$exists
        : record[key] === wanted,
  );
const chain = (value) => ({
  sort() {
    return this;
  },
  lean: async () => clone(value),
});
const timestamp = () =>
  new Date(Date.UTC(2026, 9, 8, 0, 0, ++revision)).toISOString();
const model = {
  find: (query) => chain(records.filter((record) => matches(record, query))),
  findOne: (query) =>
    chain(records.find((record) => matches(record, query)) || null),
  create: async (payload) => {
    if (
      race ||
      records.some(
        (record) =>
          record.clientId === payload.clientId &&
          record.financialYear === payload.financialYear,
      )
    )
      throw Object.assign(Error("Unique constraint"), { code: 11000 });
    const record = {
      ...clone(payload),
      _id: String(records.length + 1),
      updatedAt: timestamp(),
    };
    records.push(record);
    writes++;
    return clone(record);
  },
  findOneAndUpdate: async (query, update, options) => {
    let record = records.find((record) => matches(record, query));
    if (!record && options.upsert) return model.create(update);
    if (!record) return null;
    Object.assign(record, clone(update.$set || update), {
      updatedAt: timestamp(),
    });
    writes++;
    return clone(record);
  },
  findByIdAndUpdate: async (id, update) =>
    model.findOneAndUpdate({ _id: id }, update, {}),
};
const stubs = {
  "next-auth": { getServerSession: async () => session },
  "@/lib/auth": { authOptions: {} },
  "@/lib/mongoose": { connectDB: async () => {} },
  "@/models/FinancialYear": model,
  "@/models/CreditTransaction": { aggregate: async () => clone(ledger) },
  "@/models/DeletedRecord": {},
  "@/lib/server/activity-events": {
    recordActivityEvent: async (event) => activities.push(event),
  },
};
const loaded = new Map();
function load(relative) {
  const filename = path.join(root, relative);
  if (loaded.has(filename)) return loaded.get(filename).exports;
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.set(filename, module);
  const original = module.require.bind(module);
  module.require = (name) =>
    name in stubs
      ? stubs[name]
      : name.startsWith("@/")
        ? load(`${name.slice(2)}.ts`)
        : original(name);
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return module.exports;
}
async function main() {
  const form = load("lib/financial-year-form.ts"),
    routes = load("app/api/financial-year/route.ts"),
    individual = load("app/api/financial-year/[id]/route.ts");
  const entry = (categoryId, type, value) => ({ categoryId, type, value });
  const recycling = (value) => entry("1", "RECYCLING", value);
  const rows = [recycling(100.123456), entry("1", "EOL", 25.75)].map(
    form.financialYearDraftRow,
  );
  assert.equal(form.activeFinancialYearEntries(rows)[0].value, 100.123456);
  assert.equal(Object.keys(form.financialYearRowErrors(rows)).length, 0);
  assert.equal(
    Object.keys(
      form.financialYearRowErrors([
        ...rows,
        form.financialYearDraftRow(recycling(4)),
      ]),
    ).length,
    2,
  );
  assert.equal(
    Object.keys(
      form.financialYearRowErrors([form.financialYearDraftRow(recycling(-1))]),
    ).length,
    1,
  );
  assert.equal(
    Object.keys(
      form.financialYearRowErrors([{ ...rows[0], value: "Infinity" }]),
    ).length,
    1,
  );
  assert.equal(
    form.financialYearDraftSignature(rows),
    form.financialYearDraftSignature(
      rows.map((row) => ({ ...row, id: "different", value: `${row.value}0` })),
    ),
  );
  assert.deepEqual(
    form.financialYearEntries(
      { clientId: "X", financialYear: "2025-26", targetCat2: 2.123 },
      "targets",
    ),
    [entry("2", "RECYCLING", 2.123)],
  );
  const all = [];
  while (form.nextFinancialYearRow(all))
    all.push(form.nextFinancialYearRow(all));
  assert.equal(all.length, 8);
  assert.equal(
    new Set(all.map((row) => `${row.categoryId}|${row.type}`)).size,
    8,
  );
  assert.deepEqual(
    form.activeFinancialYearEntries(
      form.mergeFinancialYearImport(rows, [
        recycling(999),
        entry("2", "EOL", 13.123),
      ]),
    ),
    [
      recycling(100.123456),
      entry("1", "EOL", 25.75),
      entry("2", "EOL", 13.123),
    ],
  );
  console.log(
    "PASS: decimals, legacy migration, eight independent pairs, duplicates/invalid quantities, dirty-state reverts and non-destructive import merge",
  );
  const post = (body) =>
    routes.POST(
      new Request("http://localhost/api/financial-year", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  const put = (id, body) =>
    individual.PUT(
      new Request(`http://localhost/api/financial-year/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );
  const read = (clientId, fy = "2025-26") =>
    routes.GET(
      new Request(
        `http://localhost/api/financial-year?clientId=${clientId}&fy=${fy}`,
      ),
    );
  const base = (clientId) => ({
    clientId,
    financialYear: "2025-26",
    targets: [],
    generated: [],
  });
  let response = await post({
    ...base("PIBO"),
    targets: form.activeFinancialYearEntries(rows),
    createOnly: true,
  });
  assert.equal(response.status, 201);
  const pibo = await response.json();
  assert.equal(pibo.cat1Target, 125.873456);
  response = await post({
    ...base("PWP"),
    generated: [recycling(200.125), entry("1", "EOL", 50)],
    createOnly: true,
  });
  assert.equal(response.status, 201);
  let pwp = await response.json();
  assert.equal(pwp.cat1Generated, 250.125);
  response = await read("PIBO");
  assert.match(response.headers.get("cache-control"), /no-store/);
  let enriched = (await response.json())[0];
  assert.equal(enriched.totalAchieved, 45);
  assert.equal(enriched.remainingTargetCat1, 85.248456);
  assert.equal(enriched.achievedByType.length, 3);
  response = await read("PWP");
  enriched = (await response.json())[0];
  assert.equal(enriched.totalSold, 45);
  assert.equal(enriched.totalRemaining, 205.125);
  const guarded = (record) => ({
    ...base(record.clientId),
    expectedUpdatedAt: record.updatedAt,
  });
  response = await put(pibo._id, {
    ...guarded(pibo),
    targets: [entry("4", "EOL", 6.012345)],
  });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated._id, pibo._id);
  assert.equal(updated.cat1Target, 0);
  assert.equal(updated.cat4Target, 6.012345);
  assert.equal(records.length, 2);
  response = await read("PIBO");
  enriched = (await response.json())[0];
  assert.equal(enriched.totalAchieved, 45);
  assert.equal(enriched.totalRemainingTarget, 6.012345 - 45);
  response = await put(pwp._id, {
    ...guarded(pwp),
    generated: [recycling(12.125), entry("3", "EOL", 7.555)],
  });
  assert.equal(response.status, 200);
  pwp = await response.json();
  response = await put(pwp._id, { ...guarded(pwp), generated: [] });
  assert.equal(response.status, 200);
  response = await read("PWP");
  enriched = (await response.json())[0];
  assert.equal(enriched.totalGenerated, 0);
  assert.equal(enriched.totalSold, 45);
  assert.equal(enriched.totalRemaining, -45);
  assert.deepEqual(ledger, ledgerBaseline);
  assert(activities.some((event) => event.type === "fy_data_updated"));
  const fallback = form.financialYearSavedSnapshot(updated, {
    ...pibo,
    totalTarget: 125.873456,
    totalAchieved: 45,
    achievedCat1: 40.625,
    achievedCat2: 4.375,
  });
  assert.equal(fallback.totalTarget, 6.012345);
  assert.equal(fallback.totalAchieved, 45);
  assert.equal(fallback.totalRemainingTarget, 6.012345 - 45);
  console.log(
    "PASS: PIBO/PWP create and stable-ID edits, canonical fields, preserved Recycling/EOL ledger usage, signed remaining balances and clearing quantities without deleting transactions",
  );
  const count = writes;
  for (const body of [
    { ...guarded(pibo), targets: [recycling(999)] },
    { ...guarded(updated), clientId: "OTHER", targets: [recycling(999)] },
    {
      ...guarded(updated),
      financialYear: "2026-27",
      targets: [recycling(999)],
    },
  ]) {
    response = await put(pibo._id, body);
    assert.equal(response.status, 409);
  }
  response = await post({
    ...base("PIBO"),
    targets: [recycling(999)],
    createOnly: true,
  });
  assert.equal(response.status, 409);
  race = true;
  response = await post({
    ...base("RACE"),
    targets: [recycling(1)],
    createOnly: true,
  });
  assert.equal(response.status, 409);
  race = false;
  assert.equal(writes, count);
  for (const targets of [
    [recycling(-1)],
    [recycling(1), recycling(2)],
    [entry("5", "EOL", 2)],
    [entry("1", "UNKNOWN", 1)],
    [recycling("NaN")],
  ]) {
    response = await post({ ...base("INVALID"), targets, createOnly: true });
    assert.equal(response.status, 400);
    response = await put(updated._id, { ...guarded(updated), targets });
    assert.equal(response.status, 400);
  }
  response = await put(updated._id, {
    ...guarded(updated),
    expectedUpdatedAt: "invalid",
    targets: [],
  });
  assert.equal(response.status, 400);
  assert.equal(writes, count);
  console.log(
    "PASS: stale revisions, client/year mismatch, concurrent create and unique-index races cannot overwrite data; strict API validation",
  );
  records.push({ ...base("LEGACY"), _id: "legacy", cat2Target: 4.125 });
  response = await put("legacy", {
    ...base("LEGACY"),
    expectedUpdatedAt: null,
    targets: [entry("2", "EOL", 4.125)],
  });
  assert.equal(response.status, 200);
  response = await post({
    ...base("PIBO"),
    targets: [recycling(2), recycling(3)],
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).cat1Target, 5);
  session = null;
  assert.equal((await read("PIBO")).status, 401);
  assert.equal((await post(base("PIBO"))).status, 401);
  assert.equal((await put(updated._id, base("PIBO"))).status, 401);
  assert.deepEqual(ledger, ledgerBaseline);
  console.log(
    "PASS: timestamp-less legacy edits, unchanged legacy upsert normalization and authentication; no transaction writes",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
