/* Isolated production route and provider lifecycle regression tests. No live DB. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const CURRENT_FY = "2026-27";
const initial = { enabled: true, defaultFinancialYear: "2025-26", lastKnownCurrentFy: CURRENT_FY, pendingReminderCurrentFy: null };
let account = structuredClone(initial), writes = 0;
let session = { user: { id: "507f1f77bcf86cd799439011" } };
function load(file, stubs, suffix = "") {
  const filename = path.join(root, file);
  const mod = new Module(filename + suffix);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = name => name in stubs ? stubs[name] : original(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8") + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}
const utils = { CURRENT_FY, FINANCIAL_YEARS: ["2024-25", "2025-26", CURRENT_FY, "2027-28"] };
const route = load("app/api/financial-year-preference/route.ts", {
  "next-auth": { getServerSession: async () => session },
  "@/lib/auth": { authOptions: {} },
  "@/lib/mongoose": { connectDB: async () => {} },
  "@/lib/utils": utils,
  "@/models/User": { collection: {
    findOne: async () => ({ financialYearSettings: structuredClone(account) }),
    findOneAndUpdate: async (_filter, update) => {
      writes++;
      for (const [key, value] of Object.entries(update.$set)) account[key.split(".")[1]] = value;
      return { financialYearSettings: structuredClone(account) };
    },
  } },
});
const patch = body => route.PATCH({ json: async () => body });

// Small hook scheduler runs the actual provider's effects, including cleanup.
function mount({ cached = initial, get = async () => ({ settings: account }), storageFails = false, patchFails = false } = {}) {
  let slots = [], cursor = 0, effects = [], dirty = true, context, requests = [];
  const cache = new Map(cached ? [["financial-year-preference:account-a", JSON.stringify(cached)]] : []);
  let auth = { status: "authenticated", data: { user: { id: "account-a" } } };
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    createContext: () => ({ Provider: "provider" }), useContext: () => {},
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; dirty = true; }];
    },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const windowStub = { localStorage: Object.fromEntries(["getItem", "setItem", "removeItem"].map(method => [method, (key, value) => {
    if (storageFails) throw Error("Storage blocked");
    if (method === "getItem") return cache.get(key) || null;
    if (method === "setItem") cache.set(key, value); else cache.delete(key);
  }])), setTimeout() { throw Error("Unexpected background autosave timer"); } };
  global.window = windowStub;
  global.fetch = async (_url, options = {}) => {
    requests.push(options.method || "GET");
    if (options.method === "PATCH") {
      if (patchFails) return { ok: false, json: async () => ({ error: "Session expired" }) };
      const response = await patch(JSON.parse(options.body));
      return response;
    }
    const body = await get();
    return { ok: true, json: async () => structuredClone(body) };
  };
  const provider = load("app/providers.tsx", {
    react, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next-auth/react": { useSession: () => auth }, "react-hot-toast": { default: { error() {} }, Toaster() {} },
    "@/components/ui/Modal": () => {}, "@/lib/utils": utils,
    "@/lib/financialYearPreferenceCache": { getFinancialYearPreferenceCacheKey: key => `financial-year-preference:${key}` },
    "@/lib/cache": { setCacheScope() {} },
  }, "\nexport { AppClientProviders };\n").AppClientProviders;
  async function flush() {
    for (let i = 0; i < 12; i++) {
      if (dirty) { dirty = false; cursor = 0; context = provider({ children: null, dark: false }).props.value; const run = effects; effects = []; run.forEach(fn => fn()); }
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  return { flush, get value() { return context; }, requests, switchAccount(id) { auth = { status: "authenticated", data: { user: { id } } }; dirty = true; } };
}

async function main() {
  for (const malformed of [null, {}, { settings: {} }, { settings: { enabled: "false" } }, { settings: { defaultFinancialYear: "garbage" } }]) {
    assert.equal((await patch(malformed)).status, 400);
  }
  assert.equal(writes, 0, "Invalid requests must not reset saved settings");
  await route.GET(); await route.GET();
  assert.equal(writes, 0, "Reading/sign-in must never write settings");
  assert.equal((await patch({ settings: { enabled: false } })).status, 200);
  assert.equal(account.defaultFinancialYear, initial.defaultFinancialYear, "Toggling from a stale tab must preserve the saved FY");
  await patch({ settings: { enabled: true } });
  assert.equal(account.defaultFinancialYear, initial.defaultFinancialYear);
  const beforeAuth = writes;
  session = null;
  assert.equal((await patch({ settings: { enabled: false } })).status, 401);
  assert.equal(writes, beforeAuth);
  session = { user: { id: "507f1f77bcf86cd799439011" } };

  let app = mount(); await app.flush();
  assert.equal(app.value.settings.enabled, true);
  assert.deepEqual(app.requests, ["GET"], "Mount must not autosave");
  await app.value.saveSettings({ defaultFinancialYear: "2024-25" }); await app.flush();
  assert.equal(app.value.effectiveFinancialYear, "2024-25");
  assert.deepEqual(app.requests, ["GET", "PATCH"], "Explicit save sends exactly one write");
  app = mount({ cached: null }); await app.flush();
  assert.equal(app.value.effectiveFinancialYear, "2024-25", "Fresh sign-in restores DB preference");
  assert.deepEqual(app.requests, ["GET"]);

  let release;
  app = mount({ get: () => new Promise(resolve => { release = resolve; }) }); await app.flush();
  await app.value.saveSettings({ enabled: true, defaultFinancialYear: "2027-28" }); await app.flush();
  release({ settings: initial }); await app.flush();
  assert.equal(app.value.effectiveFinancialYear, "2027-28", "Slow initial read cannot undo an explicit save");
  assert.deepEqual(app.requests, ["GET", "PATCH"]);

  app = mount({ get: async () => { throw Error("Offline"); } }); await app.flush();
  assert.equal(app.value.effectiveFinancialYear, initial.defaultFinancialYear);
  assert.deepEqual(app.requests, ["GET"], "Offline fallback cannot write defaults");
  app = mount({ storageFails: true }); await app.flush();
  assert.equal(app.value.effectiveFinancialYear, "2027-28", "Storage restrictions cannot block DB preferences");
  assert.deepEqual(app.requests, ["GET"]);
  app = mount({ patchFails: true }); await app.flush();
  await assert.rejects(app.value.saveSettings({ enabled: false }), /Session expired/);
  await app.flush();
  assert.equal(app.value.settings.enabled, true, "Failed writes must leave confirmed preferences intact");

  app = mount({ get: () => new Promise(resolve => { release = resolve; }) }); await app.flush();
  const releaseOldAccount = release;
  app.switchAccount("account-b"); await app.flush();
  release({ settings: { ...initial, defaultFinancialYear: "2024-25" } }); await app.flush();
  releaseOldAccount({ settings: { ...initial, enabled: false } }); await app.flush();
  assert.equal(app.value.settings.enabled, true);
  assert.equal(app.value.effectiveFinancialYear, "2024-25", "Cancelled account reads cannot leak across login changes");

  const outdated = { ...initial, lastKnownCurrentFy: "2025-26" };
  app = mount({ cached: outdated, get: async () => ({ settings: outdated }) }); await app.flush();
  assert.equal(app.value.settings.enabled, true, "New FY must preserve override");
  assert.equal(app.value.effectiveFinancialYear, "2025-26");
  assert.deepEqual(app.requests, ["GET"], "FY reminder must not autosave");
  await app.value.applyCurrentFinancialYear(); await app.flush();
  assert.equal(app.value.effectiveFinancialYear, CURRENT_FY);
  assert.equal(account.defaultFinancialYear, CURRENT_FY, "Accepting the reminder explicitly saves the new FY");
  console.log("PASS: FY preference validation, partial updates, read-only login, explicit save, fresh login, delayed read, offline cache, blocked storage, failed save, account switch, and FY rollover");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
