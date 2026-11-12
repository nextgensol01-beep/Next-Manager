# Verified cleanup manifest

Date: 2 November 2026. Recovery tag: `pre-optimization-2026-11-02`.

Each source removal was checked against static imports, literal dynamic imports/require, alias and relative paths, test-loader strings, package scripts, Next/Vercel configuration, templates/public assets, and filesystem conventions. These are internal modules, not route entries, public assets, migrations, data files or a published package API. The retained implementations remain active. The initial import graph and reference evidence are preserved in the external optimization audit.

| Removed file | Reason and retained implementation |
|---|---|
| components/clients/CustomFieldInputs.tsx | No callers; active client form/custom-field inputs remain in ClientFormModal and settings/profile components. |
| components/ui/CreditTypeToggle.tsx | No callers; active credit-type controls use their existing page-specific implementations. |
| components/ui/DashboardSkeleton.tsx | No callers; dashboard and shared Skeleton implementations remain. |
| components/ui/LiquidGlassLightSurface.tsx | No callers; active LiquidGlassButton/Dropdown/useLiquidGlassLight and the glass primitives remain. Correct the historical lab inventory accordingly. |
| components/ui/StatCard.tsx | No callers; current dashboard primitives remain. |
| lib/mongoClient.ts | No callers; obsolete native-client connector. Active application/auth use lib/mongoose.ts; read-only operational scripts create their own explicit native clients. |
| lib/mongodb.ts | No callers; obsolete alternative Mongoose connector. The active connector is retained and independently tested for retries/concurrency. |
| utils/excelExport.ts | No callers; current report/tracker Excel routes and shared style/writer services remain. |
| utils/helpers.ts | No callers; active helpers remain in lib/utils and domain modules. Differing old formatter/ID/payment semantics were not merged into active code. |
| utils/pdfGenerator.ts | No callers; old jsPDF implementation. Active quotation HTML/Chromium PDF route and print/export templates remain. |

Removed source total: **36,332 bytes** across ten files. No production data, financial records, migration routes, application features, public assets, historical fixtures or user baselines were removed. The obsolete jsPDF dependencies are removed only because their sole caller was the unused PDF module.

Historical implementation reports and business reconciliation evidence are retained. Uncertain old scripts, external callers of maintenance routes, and older user-owned artifact directories are retained. Generated-cache cleanup is recorded in generated-cleanup.json in the external audit.

Browser tests now use Puppeteer's disposable OS profiles rather than writing browser session data into repository output folders. Browser profiles are excluded from recovery/evidence archives. Existing ignored test-output paths remain excluded by .gitignore and .vercelignore.

## Generated cleanup on 3 November 2026

| Removed path | Files | Bytes | Evidence retained |
|---|---:|---:|---|
| .next/cache | 84 | 1,610,113,204 | Built output, build metrics, route table and runtime screenshots. |
| tmp/optimization-billing-render | 4 | 4,310,550 | Baseline/final screenshots and measured render/readiness results. |
| tmp/optimization-brace-expansion-old | 4 | 11,119 | Final lockfile and verified fresh install. |
| External audit runtime-browser-profile | 182 | 11,668,492 | Login screenshots and request/timing receipts only. |

These paths were checked for ownership, location and links. The generated build and runtime smoke checks passed before cleanup.

## Final repository housekeeping on 3 November 2026

Pre-cleanup revision `5c1c0656e641fae4ee521789fda1460765d439cc` on `security/final-follow-up`. The pre-deletion inventory and completion receipt are in the sibling audit directory at `../optimization-audit-2026-11-02/final-housekeeping-deletion-manifest.json`. The inventory lists each path, its size, the reason for removal and, for identical copies, the retained counterpart.

| Removed category | Paths | Reason |
|---|---:|---|
| Webpack cache directories | 2 | Next regenerates the cache. Deployable build output is retained. |
| Historical browser fixture profiles | 37 | Test runners create disposable sessions. Screenshots and fixtures are separate. |
| Compiled browser fixture bundles and chunks | 25 | Test runners compile them from the retained fixture sources. |
| Synthetic attachment benchmark payloads | 45 | The benchmark generates these deterministic files before measuring. |
| Test scratch repositories | 38 | Isolated ignore-rule checks left empty Git repositories with zero commits. |
| One-time working scripts | 3 | Historical edit and build helpers had no current callers. |
| Old local development logs | 2 | Stopped local server output had no workflow references or unique audit evidence. |
| Duplicate test transcripts, audit JSON files and synthetic PDF screenshots | 68 | SHA-256 comparison confirmed exact copies of retained evidence. |

The initial removal covered 220 paths and 2,395,655,787 bytes of file contents. It removed zero tracked files. The authoritative optimization and deployment-readiness reviews, source snapshot, Git recovery bundles, migration materials, original captures and business reconciliation evidence were retained. Prior build-memory evidence, older analysis notes and artifacts with uncertain ownership or continuing value were also retained. The ignore rules now include Windows shell files `Thumbs.db` and `Desktop.ini`.

TypeScript, strict ESLint, all 37 core suites, template drift, the production build and built route and trace isolation passed. Both retained Git recovery bundles verified. The build passed on retry outside the sandbox after an output directory write was denied. The verification run regenerated one Webpack cache and two empty Git sandboxes. The receipt records their separate removal. The built output and route manifest were checked after the cache removal. The separate browser suite and visual comparisons were outside this housekeeping verification.
