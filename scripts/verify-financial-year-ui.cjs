/* Production Client Profile, FY page, shared modal, parser and OCR review UI; isolated HTTP data and OCR transport. */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const puppeteer = require("puppeteer-core"),
  compiledWebpack = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(__dirname, ".."),
  output = path.join(root, "tmp/financial-year-tests");
const clients = [
  {
    _id: "mongo-pibo",
    clientId: "PIBO",
    companyName: "Evergreen Packaging",
    category: "Producer",
    state: "Delhi",
    gstNumber: "TESTGST1",
    contactPerson: "Asha",
    email: "fixture@example.com",
    phone: "9000000000",
    customFields: {},
    createdAt: "2025-01-01",
  },
  {
    _id: "mongo-pwp",
    clientId: "PWP",
    companyName: "Circular Materials",
    category: "PWP",
    state: "Delhi",
    gstNumber: "TESTGST2",
    customFields: {},
    createdAt: "2025-01-01",
  },
];
let revision = 0,
  failWrite = false,
  failRead = false,
  readDelay = 90,
  writes = [],
  requests = [],
  records = [
    {
      _id: "pibo-fy",
      clientId: "PIBO",
      financialYear: "2025-26",
      targets: [
        { categoryId: "1", type: "RECYCLING", value: 100 },
        { categoryId: "1", type: "EOL", value: 25 },
      ],
      generated: [],
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
    {
      _id: "pwp-fy",
      clientId: "PWP",
      financialYear: "2025-26",
      targets: [],
      generated: [
        { categoryId: "1", type: "RECYCLING", value: 200 },
        { categoryId: "1", type: "EOL", value: 50 },
      ],
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
  ];
const documentFor = (clientId) => ({
  _id: "screenshot",
  clientId,
  documentKind: "target-screenshot",
  documentName: "Saved CPCB targets",
  category: "compliance",
  financialYear: "2025-26",
  mimeType: "image/png",
  driveLink: "https://example.com/screenshot",
  uploadedAt: "2026-10-08",
});
const enrich = (record) => {
  const result = {
    ...record,
    totalTarget: 0,
    totalGenerated: 0,
    totalAchieved: record.financialYear === "2025-26" ? 45 : 0,
    totalSold: record.financialYear === "2025-26" ? 45 : 0,
  };
  for (const categoryId of ["1", "2", "3", "4"]) {
    const target = record.targets
        .filter((entry) => entry.categoryId === categoryId)
        .reduce((sum, entry) => sum + entry.value, 0),
      generated = record.generated
        .filter((entry) => entry.categoryId === categoryId)
        .reduce((sum, entry) => sum + entry.value, 0);
    result[`cat${categoryId}Target`] = target;
    result[`cat${categoryId}Generated`] = generated;
    result.totalTarget += target;
    result.totalGenerated += generated;
    result[`achievedCat${categoryId}`] = result[`soldCat${categoryId}`] =
      categoryId === "1" ? result.totalAchieved : 0;
    result[`remainingTargetCat${categoryId}`] =
      target - result[`achievedCat${categoryId}`];
    result[`remainingCat${categoryId}`] =
      generated - result[`soldCat${categoryId}`];
  }
  result.achievedByType = result.soldByType = result.totalAchieved
    ? [
        { categoryId: "1", type: "RECYCLING", value: 30 },
        { categoryId: "1", type: "EOL", value: 15 },
      ]
    : [];
  result.totalRemainingTarget = result.totalTarget - result.totalAchieved;
  result.totalRemaining = result.totalGenerated - result.totalSold;
  return result;
};
async function main() {
  fs.mkdirSync(output, { recursive: true });
  if (fs.existsSync(path.join(output, "verification.json")))
    fs.unlinkSync(path.join(output, "verification.json"));
  compiledWebpack.init();
  await new Promise((resolve, reject) => {
    const compiler = compiledWebpack.webpack({
      mode: "development",
      devtool: false,
      context: root,
      entry: path.join(__dirname, "fixtures/financial-year.tsx"),
      output: { path: output, filename: "fixture.js" },
      resolve: {
        extensions: [".tsx", ".ts", ".js", ".cjs"],
        alias: {
          "@/app/providers$": path.join(
            __dirname,
            "fixtures/financial-year-providers.tsx",
          ),
          "@/lib/target-screenshot/localOcrAdapter$": path.join(
            __dirname,
            "fixtures/financial-year-ocr.cjs",
          ),
          "@": root,
          "next/link": path.join(__dirname, "fixtures/tracker-next-link.cjs"),
          "next/navigation": path.join(
            __dirname,
            "fixtures/financial-year-navigation.cjs",
          ),
          "next-auth/react": path.join(
            __dirname,
            "fixtures/tracker-session.cjs",
          ),
        },
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            exclude: /node_modules/,
            use: path.join(__dirname, "fixtures/workflow-editor-loader.cjs"),
          },
        ],
      },
    });
    compiler.run((error, stats) =>
      compiler.close(() =>
        error || stats.hasErrors()
          ? reject(error || Error(stats.toString({ all: false, errors: true })))
          : resolve(),
      ),
    );
  });
  const built = await require("postcss")([
    require("tailwindcss")(path.join(root, "tailwind.config.ts")),
  ]).process(
    fs
      .readFileSync(path.join(root, "app/globals.css"), "utf8")
      .replace(/^@import .+$/gm, ""),
    { from: path.join(root, "app/globals.css") },
  );
  const css =
    built.css +
    [
      "components/ui/liquid-glass/liquid-glass.css",
      "app/client-profile-premium.css",
      "app/financial-year-modal.css",
    ]
      .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
      .join("\n") +
    "body{font-family:Inter,Arial,sans-serif;margin:0;background:var(--color-surface);color:var(--color-text)}";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGNsAAAAASUVORK5CYII=",
    "base64",
  );
  for (const name of [
    "targets.png",
    "incomplete.png",
    "mismatch.png",
    "slow.png",
  ])
    fs.writeFileSync(path.join(output, name), png);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (
      url.pathname.endsWith(".js") &&
      fs.existsSync(path.join(output, path.basename(url.pathname)))
    ) {
      response.setHeader("Content-Type", "application/javascript");
      response.end(
        fs.readFileSync(path.join(output, path.basename(url.pathname))),
      );
    } else if (url.pathname === "/fixture.css") {
      response.setHeader("Content-Type", "text/css");
      response.end(css);
    } else if (url.pathname.endsWith("/preview")) {
      response.setHeader("Content-Type", "image/png");
      response.end(png);
    } else if (url.pathname.startsWith("/api/")) {
      requests.push({
        path: url.pathname,
        query: url.search,
        method: request.method,
      });
      response.setHeader("Content-Type", "application/json");
      if (
        ["POST", "PUT"].includes(request.method) &&
        url.pathname.startsWith("/api/financial-year")
      ) {
        let raw = "";
        request.on("data", (chunk) => (raw += chunk));
        request.on("end", () => {
          const body = JSON.parse(raw);
          writes.push({ method: request.method, path: url.pathname, body });
          const fail = failWrite;
          failWrite = false;
          setTimeout(() => {
            if (fail) {
              response.statusCode = 500;
              response.end(
                JSON.stringify({
                  error: "Fixture save failed; your draft is kept.",
                }),
              );
              return;
            }
            let existing = records.find(
              (record) =>
                record.clientId === body.clientId &&
                record.financialYear === body.financialYear,
            );
            if (
              (request.method === "POST" && existing) ||
              (request.method === "PUT" &&
                (!existing ||
                  existing._id !== url.pathname.split("/").at(-1) ||
                  existing.updatedAt !== body.expectedUpdatedAt))
            ) {
              response.statusCode = 409;
              response.end(
                JSON.stringify({
                  error:
                    "This FY record changed while you were editing. Reload the current record.",
                }),
              );
              return;
            }
            if (!existing) {
              existing = { _id: `${body.clientId}-${body.financialYear}` };
              records.push(existing);
            }
            Object.assign(existing, {
              clientId: body.clientId,
              financialYear: body.financialYear,
              targets: body.targets,
              generated: body.generated,
              updatedAt: new Date(
                Date.UTC(2026, 9, 8, 1, 0, ++revision),
              ).toISOString(),
            });
            response.end(JSON.stringify(existing));
          }, 250);
        });
      } else if (url.pathname === "/api/financial-year") {
        const result = records
          .filter(
            (record) =>
              (!url.searchParams.has("clientId") ||
                url.searchParams.get("clientId") === record.clientId) &&
              (!url.searchParams.has("fy") ||
                url.searchParams.get("fy") === record.financialYear),
          )
          .map(enrich);
        const fail = failRead;
        failRead = false;
        setTimeout(() => {
          if (fail) response.statusCode = 500;
          response.end(
            JSON.stringify(
              fail ? { error: "Fixture FY read failed. Retry." } : result,
            ),
          );
        }, readDelay);
      } else if (/\/clients\/(PIBO|PWP)\/workspace/.test(url.pathname)) {
        const clientId = url.pathname.split("/")[3];
        response.end(
          JSON.stringify({
            client: clients.find((client) => client.clientId === clientId),
            financialYears: records
              .filter((record) => record.clientId === clientId)
              .map(enrich),
            documents: [documentFor(clientId)],
            billings: [],
            payments: [],
            invoices: [],
            uploadRecords: [],
            annualReturns: [],
            failedSections: [],
            fetchedAt: new Date().toISOString(),
          }),
        );
      } else if (url.pathname === "/api/clients")
        response.end(JSON.stringify(clients));
      else if (url.pathname === "/api/documents")
        response.end(
          JSON.stringify([documentFor(url.searchParams.get("clientId"))]),
        );
      else
        response.end(
          JSON.stringify(
            url.pathname === "/api/activities" ? { events: [], total: 0 } : [],
          ),
        );
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser, page;
  try {
    browser = await puppeteer.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      userDataDir: fs.mkdtempSync(path.join(output, "profile-")),
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--no-first-run"],
    });
    page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error("Browser:", error.message);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const settle = () =>
      page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 420)));
    const clickText = async (label, scope = "button") => {
      await page.$$eval(
        scope,
        (nodes, label) => {
          const match = nodes.find(
            (node) =>
              node.textContent.trim() === label && node.getClientRects().length,
          );
          if (!match) throw Error(`Missing button: ${label}`);
          match.click();
        },
        label,
      );
      await settle();
    };
    const click = async (selector) => {
      await page.$eval(selector, (node) =>
        node.scrollIntoView({ block: "center" }),
      );
      await page.click(selector);
      await settle();
    };
    const write = async (selector, value) => {
      await click(selector);
      await page.keyboard.down("Control");
      await page.keyboard.press("A");
      await page.keyboard.up("Control");
      if (value) await page.keyboard.type(String(value));
      else await page.keyboard.press("Backspace");
      await settle();
    };
    const quantity = (row) =>
      `.fy-form:not([hidden]) input[aria-label="Row ${row} quantity"]`;
    const value = (row) => page.$eval(quantity(row), (node) => node.value);
    const profileAction = async () => {
      await page.$$eval(
        ".client-profile-action-card",
        (nodes, label) => {
          const button = nodes.find(
            (node) =>
              node.textContent.trim().startsWith(label) &&
              node.getClientRects().length,
          );
          if (!button) throw Error(`Missing profile action ${label}`);
          button.focus();
          button.click();
        },
        locationClient === "PWP" ? "Credit Data" : "FY Data",
      );
    };
    const openProfile = async () => {
      await profileAction();
      await page.waitForSelector(quantity(1));
      await settle();
    };
    let locationClient = "PIBO";
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${base}/dashboard/clients/PIBO`);
    await page.waitForFunction(() =>
      document.body.textContent.includes("Evergreen Packaging"),
    );
    readDelay = 850;
    const urlBefore = page.url();
    await profileAction();
    await page.waitForSelector(".fy-record-modal", { timeout: 650 });
    assert(await page.$(".fy-form-skeleton"));
    assert.equal(page.url(), urlBefore);
    assert.equal(
      requests.filter((request) => request.path === "/api/clients").length,
      0,
    );
    await page.waitForSelector(quantity(1));
    await settle();
    readDelay = 90;
    assert.equal(await value(1), "100");
    assert.equal(await value(2), "25");
    assert.equal(
      await page.$eval(".fy-primary-button", (node) => node.disabled),
      true,
    );
    assert.equal(
      await page.$eval(".fy-record-modal", (node) =>
        Math.round(node.getBoundingClientRect().width),
      ),
      800,
    );
    assert.equal(
      await page.$$eval(".fy-context .fy-readonly", (nodes) => nodes.length),
      2,
    );
    assert.equal(
      await page.$eval(".fy-summary-grid > div:nth-child(2) strong", (node) =>
        node.textContent.trim(),
      ),
      "45MT",
    );
    await page.screenshot({ path: path.join(output, "fy-desktop-light.png") });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await settle();
    await page.screenshot({ path: path.join(output, "fy-desktop-dark.png") });
    console.log(
      "PASS: real profile opens the modal before its fresh read finishes, URL unchanged, no client-master fetch, fixed context and ledger totals",
    );
    await write(quantity(1), "100.123456");
    assert.equal(await value(1), "100.123456");
    await clickText("Category & type breakdown");
    assert.equal(
      await page.$eval(".fy-summary-breakdown > button", (node) =>
        node.getAttribute("aria-expanded"),
      ),
      "true",
    );
    assert(
      (
        await page.$eval(".fy-breakdown-table", (node) => node.textContent)
      ).includes("Recycling"),
    );
    await clickText("Category & type breakdown");
    await write(quantity(1), "100");
    assert(await page.$eval(".fy-primary-button", (node) => node.disabled));
    await write(quantity(1), "-2");
    assert(await page.$('[aria-invalid="true"]'));
    assert(await page.$eval(".fy-primary-button", (node) => node.disabled));
    await write(quantity(1), "100.123456");
    await clickText("Add Target Row");
    assert.equal(
      await page.$$eval(".fy-target-row", (nodes) => nodes.length),
      3,
    );
    await click('[aria-label="Row 3 category"]');
    await page.$$eval('[role="option"]', (nodes) =>
      nodes.find((node) => node.textContent.trim() === "CAT-I").click(),
    );
    await settle();
    await write(quantity(3), "1");
    assert(await page.$(".fy-row-error"));
    assert(await page.$eval(".fy-primary-button", (node) => node.disabled));
    await click('[aria-label="Remove row 3"]');
    for (const action of [
      () => click(".fy-modal-header button"),
      () => clickText("Cancel", ".fy-modal-footer button"),
      async () => {
        await page.keyboard.press("Escape");
        await settle();
      },
      async () => {
        await page.$eval(".fy-record-modal", (node) =>
          node.parentElement.click(),
        );
        await settle();
      },
    ]) {
      await action();
      assert(await page.$(".fy-discard"));
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.hasAttribute("data-fy-keep"),
        ),
        true,
      );
      await clickText("Keep Editing");
      assert.equal(await value(1), "100.123456");
    }
    await clickText("Cancel", ".fy-modal-footer button");
    await clickText("Discard Changes");
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    assert(
      await page.evaluate(() =>
        document.activeElement.textContent.trim().startsWith("FY Data"),
      ),
    );
    console.log(
      "PASS: decimals, negative/duplicate row validation, revert-to-clean, row removal, all four guarded closure routes and focus restoration",
    );
    await openProfile();
    await write(quantity(1), "101.25");
    await clickText("Import from Screenshot");
    await page.waitForSelector(".fy-screenshot-import");
    await clickText("Cancel", ".fy-screenshot-import button");
    assert.equal(await value(1), "101.25");
    const importFile = async (name) => {
      await clickText("Import from Screenshot");
      await page.waitForSelector('.fy-screenshot-import input[type="file"]');
      await (
        await page.$('.fy-screenshot-import input[type="file"]')
      ).uploadFile(path.join(output, name));
      await page.waitForSelector(
        'input[aria-label="CAT 1 Recycling extracted target"]',
      );
      await settle();
    };
    await importFile("incomplete.png");
    assert.equal(
      await page.$eval(
        'input[aria-label="CAT 4 EOL extracted target"]',
        (node) => node.value,
      ),
      "",
    );
    assert(
      await page.$eval(
        ".fy-screenshot-import .btn-primary:last-child",
        (node) => node.disabled,
      ),
    );
    await write('input[aria-label="CAT 4 EOL extracted target"]', "0");
    await write(
      'input[aria-label="CAT 2 Recycling extracted target"]',
      "22.875",
    );
    await click('.fy-screenshot-import input[type="checkbox"]');
    assert.equal(writes.length, 0);
    await clickText("Confirm & Add to FY Targets");
    assert(await page.$(".fy-import-decision"));
    await clickText("Merge missing entries", ".fy-import-choices strong");
    assert.equal(await value(1), "101.25");
    assert.equal(
      await page.$$eval(".fy-target-row", (nodes) => nodes.length),
      4,
    );
    assert.equal(writes.length, 0);
    await importFile("mismatch.png");
    assert(
      (
        await page.$eval(".fy-screenshot-import", (node) => node.textContent)
      ).includes("2024-25"),
    );
    await click('.fy-screenshot-import input[type="checkbox"]');
    await clickText("Confirm & Add to FY Targets");
    await clickText("Replace editable quantities", ".fy-import-choices strong");
    assert.equal(await value(1), "300.25");
    assert.equal(await value(2), "40.125");
    assert.equal(writes.length, 0);
    await clickText("Import from Screenshot");
    await page.waitForSelector('.fy-screenshot-import input[type="file"]');
    await (
      await page.$('.fy-screenshot-import input[type="file"]')
    ).uploadFile(path.join(output, "slow.png"));
    await clickText("Back to form", ".fy-modal-footer button");
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 1200)),
    );
    assert.equal(await value(1), "300.25");
    console.log(
      "PASS: real screenshot parser/review UI, missing-value correction, year warning, manual verification, explicit merge/replace and cancelled late OCR; import never autosaves",
    );
    const workspaceReads = requests.filter((request) =>
      request.path.endsWith("/workspace"),
    ).length;
    failWrite = true;
    await clickText("Save Changes");
    assert(await page.$(".fy-error"));
    assert.equal(await value(1), "300.25");
    await clickText("Save Changes");
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    assert.equal(writes.length, 2);
    assert.equal(writes[1].method, "PUT");
    assert.equal(writes[1].path, "/api/financial-year/pibo-fy");
    assert.equal(writes[1].body.targetImportReviewConfirmed, true);
    assert.equal(
      records.filter(
        (record) =>
          record.clientId === "PIBO" && record.financialYear === "2025-26",
      ).length,
      1,
    );
    assert.equal(
      requests.filter((request) => request.path.endsWith("/workspace")).length,
      workspaceReads,
    );
    assert.equal(page.url(), urlBefore);
    await clickText("Compliance");
    await page.$$eval("button", (nodes) =>
      nodes
        .find(
          (node) =>
            node.textContent.trim().startsWith("FY Targets / Credits") &&
            node.getClientRects().length,
        )
        .click(),
    );
    await settle();
    assert.equal(
      await page.$eval(
        ".client-profile-fy-total strong",
        (node) => node.textContent,
      ),
      "370.875",
    );
    assert.equal(
      await page.$eval(
        '.client-profile-fy-total[data-tone="used"] strong',
        (node) => node.textContent,
      ),
      "45",
    );
    await openProfile();
    assert.equal(await value(1), "300.25");
    assert.equal(
      await page.$eval(".fy-summary-grid > div:nth-child(2) strong", (node) =>
        node.textContent.trim(),
      ),
      "45MT",
    );
    await write(quantity(1), "301");
    records[0].updatedAt = "2026-10-08T04:00:00.000Z";
    await clickText("Save Changes");
    assert(await page.$(".fy-error"));
    assert.equal(await value(1), "301");
    await clickText("Reload current record");
    await clickText("Discard Changes");
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="Row 1 quantity"]')?.value ===
        "300.25",
    );
    await settle();
    assert(await page.$eval(".fy-primary-button", (node) => node.disabled));
    await clickText("Cancel", ".fy-modal-footer button");
    console.log(
      "PASS: failed save keeps draft for retry; guarded PUT updates profile without workspace reload; concurrent edit conflict needs an explicit reload",
    );
    await openProfile();
    await write(quantity(1), "300.5");
    failRead = true;
    await clickText("Save Changes");
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    assert.equal(
      await page.$eval(
        ".client-profile-fy-total strong",
        (node) => node.textContent,
      ),
      "371.125",
    );
    assert.equal(
      await page.$eval(
        '.client-profile-fy-total[data-tone="used"] strong',
        (node) => node.textContent,
      ),
      "45",
    );
    await openProfile();
    await write(quantity(1), "300.25");
    await clickText("Save Changes");
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    console.log(
      "PASS: a successful save with a failed summary read updates the target total, keeps verified ledger usage and reports the refresh failure",
    );
    await page.evaluate(() => window.setFixtureFinancialYear("2026-27"));
    await settle();
    failRead = true;
    await profileAction();
    await page.waitForSelector(".fy-error");
    assert(await page.$eval(".fy-primary-button", (node) => node.disabled));
    await clickText("Retry loading");
    await page.waitForSelector(quantity(1));
    await settle();
    assert.equal(await value(1), "");
    await write(quantity(1), "12.123456");
    await clickText("Save Record");
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    assert.equal(writes.at(-1).method, "POST");
    assert.equal(writes.at(-1).body.clientId, "PIBO");
    assert.equal(writes.at(-1).body.createOnly, true);
    assert.equal(records.at(-1).targets[0].value, 12.123456);
    if (await page.$('[aria-label="Close Add target screenshot?"]'))
      await click('[aria-label="Close Add target screenshot?"]');
    console.log(
      "PASS: new PIBO record uses the business client ID and correct profile year with safe create-only POST",
    );
    locationClient = "PWP";
    await page.goto(`${base}/dashboard/clients/PWP`);
    await page.waitForFunction(() =>
      document.body.textContent.includes("Circular Materials"),
    );
    await openProfile();
    assert(
      (await page.$eval(".fy-targets", (node) => node.textContent)).includes(
        "Generated Credits",
      ),
    );
    assert.equal(
      await page.$$("[data-fy-import]").then((nodes) => nodes.length),
      0,
    );
    await write(quantity(1), "201.123");
    await clickText("Save Changes");
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    assert.equal(writes.at(-1).path, "/api/financial-year/pwp-fy");
    assert.equal(writes.at(-1).body.generated[0].value, 201.123);
    await page.evaluate(() => window.setFixtureFinancialYear("2026-27"));
    await settle();
    await openProfile();
    await write(quantity(1), "17.125");
    await clickText("Save Record");
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    assert.equal(writes.at(-1).body.generated[0].value, 17.125);
    console.log(
      "PASS: real PWP profile creates and edits generated credits with preserved sold quantities",
    );
    await page.goto(
      `${base}/dashboard/financial-year?open=targets&clientId=PIBO&fy=2025-26`,
    );
    await page.waitForSelector(quantity(1));
    await settle();
    assert.equal(await value(1), "300.25");
    await clickText("Cancel", ".fy-modal-footer button");
    await clickText("Add Record");
    await click('[aria-label="Client"]');
    await page.$$eval('[role="option"]', (nodes) =>
      nodes.find((node) => node.textContent.includes("Evergreen")).click(),
    );
    await settle();
    await page.waitForSelector(quantity(1));
    assert.equal(await value(1), "300.25");
    assert.equal(
      await page.$eval(".fy-modal-header h3", (node) => node.textContent),
      "Edit FY Record",
    );
    assert.equal(
      await page.$$eval(".fy-context .fy-readonly", (nodes) => nodes.length),
      2,
    );
    while ((await page.$$eval(".fy-target-row", (nodes) => nodes.length)) < 8)
      await clickText("Add Target Row");
    await page.$eval(
      ".fy-modal-content",
      (node) => (node.scrollTop = node.scrollHeight),
    );
    await settle();
    const scrollBefore = await page.$eval(
      ".fy-modal-content",
      (node) => node.scrollTop,
    );
    await page.$eval(quantity(8), (node) =>
      node.focus({ preventScroll: true }),
    );
    await page.$eval(quantity(8), (node) => node.blur());
    await settle();
    assert.equal(
      await page.$eval(".fy-modal-content", (node) => node.scrollTop),
      scrollBefore,
    );
    for (const [width, height, name] of [
      [1180, 720, "laptop"],
      [390, 844, "mobile"],
    ]) {
      await page.setViewport({ width, height });
      await settle();
      const fit = await page.evaluate(() => {
        const modal = document.querySelector(".fy-record-modal"),
          footer = document.querySelector(".fy-modal-footer"),
          bounds = modal.getBoundingClientRect(),
          foot = footer.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          footer: foot.bottom,
          overflow: modal.scrollWidth > modal.clientWidth + 1,
          scrollable:
            document.querySelector(".fy-modal-content").scrollHeight >
            document.querySelector(".fy-modal-content").clientHeight,
        };
      });
      assert(
        fit.left >= 0 &&
          fit.right <= width &&
          fit.top >= 0 &&
          fit.bottom <= height &&
          fit.footer <= height &&
          !fit.overflow &&
          fit.scrollable,
        JSON.stringify(fit),
      );
      await page.screenshot({
        path: path.join(output, `fy-${name}-light.png`),
      });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await settle();
      await page.screenshot({ path: path.join(output, `fy-${name}-dark.png`) });
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark"),
      );
    }
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await settle();
    await page.$eval(".fy-modal-header button", (node) => node.focus());
    await page.keyboard.down("Shift");
    await page.keyboard.press("Tab");
    await page.keyboard.up("Shift");
    assert(
      await page.evaluate(
        () => document.activeElement.closest(".fy-record-modal") !== null,
      ),
    );
    await clickText("Cancel", ".fy-modal-footer button");
    await clickText("Discard Changes");
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    await clickText("Add Record");
    await page.waitForSelector(".fy-record-modal");
    await settle();
    assert.equal(
      await page.$eval(
        ".fy-record-modal",
        (node) => getComputedStyle(node).opacity,
      ),
      "1",
    );
    await clickText("Cancel", ".fy-modal-footer button");
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    await write(
      'input[placeholder="Search by client name, ID or category..."]',
      "",
    );
    await clickText("Add Record");
    await click('[aria-label="Financial Year"]');
    await page.$$eval('[role="option"]', (nodes) =>
      nodes.find((node) => node.textContent.trim() === "2027-28").click(),
    );
    await settle();
    await click('[aria-label="Client"]');
    await page.$$eval('[role="option"]', (nodes) =>
      nodes
        .find((node) => node.textContent.includes("Circular Materials"))
        .click(),
    );
    await page.waitForSelector(quantity(1));
    await settle();
    await write(quantity(1), "8.125");
    const beforeDoubleSubmit = writes.length;
    await page.$eval(".fy-primary-button", (node) => {
      node.click();
      node.click();
    });
    await page.waitForSelector(".fy-record-modal", { hidden: true });
    assert.equal(writes.length, beforeDoubleSubmit + 1);
    assert.equal(writes.at(-1).body.financialYear, "2027-28");
    assert.equal(writes.at(-1).body.generated[0].value, 8.125);
    await page.waitForFunction(() =>
      document.body.textContent.includes("8.125"),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: original FY page/deep link and existing-record lookup, all eight rows, blur keeps scroll, sticky footer, laptop/mobile light/dark, keyboard focus and reduced motion",
    );
    fs.writeFileSync(
      path.join(output, "verification.json"),
      JSON.stringify(
        {
          passed: true,
          writes: writes.map((write) => ({
            method: write.method,
            path: write.path,
            clientId: write.body.clientId,
            financialYear: write.body.financialYear,
          })),
          requests,
          screenshots: fs
            .readdirSync(output)
            .filter((name) => name.startsWith("fy-") && name.endsWith(".png")),
          limitations: [
            "Isolated fixture data; no production writes.",
            "Deterministic OCR adapter; actual parser and screenshot review flow tested. Live Tesseract recognition accuracy is image-dependent and not exercised here.",
          ],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(output, "failure.png") });
      fs.writeFileSync(
        path.join(output, "failure.txt"),
        await page.evaluate(() => document.body.innerText),
      );
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
