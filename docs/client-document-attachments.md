# Client document attachments

Implemented in `C:\Users\User\Desktop\CodeX\align` for the client-document attachment workflow brief dated 17 October 2026.

## Result

Each attachment rule can be Required or Optional. Preparation excludes a client when any active required rule cannot be fulfilled. The existing Skipped interface receives a specific explanation, including the category and expected FY where applicable. Optional omissions remain eligible and appear in the existing preview. Workflows without a saved `required` flag remain optional.

Regular uploads and existing document metadata editing now support an optional financial year. FY is persisted on the existing Document record; Drive files remain in their existing client folders. Blank means Not applicable. Context can prefill the field, and employees can change it before uploading. Existing files without FY are retained and match Any FY, but cannot satisfy a specific year or the tracker's year. Years are normalized to `YYYY-YY`; no year is inferred from an upload date or today's date.

Client matching first checks the authoritative client association, category, document kind and FY. It then selects the newest document within the existing email size/count limits, using uploadedDate descending and document ID descending to break ties. An explicitly configured shared-document rule retains the existing shared behavior. Ordinary client rules cannot select another client's documents.

## Preparation, authorization and delivery

1. One bulk document query is indexed by client. Matching considers that client's documents and explicitly shared records.
2. Preparation checks selected files through the existing authorized Drive client. Metadata calls are deduplicated per request and limited to six concurrent requests, with a timeout. Preview never downloads attachment bytes.
3. Missing FY, missing matching records, inaccessible or deleted Drive files, temporary Drive failures, and size/count omissions produce actionable rule-specific issues. Temporary failures are not reported as missing documents.
4. Successful preparation returns real filename/category/FY/size/requirement information plus an HMAC-signed selection. The selection binds tracker, workflow policy, email kind, entry, client, active rules, exact document IDs, document metadata and remote revision/checksum. It exposes no Drive credentials or file contents.
5. The existing delivery batch hash includes the signed selection when present. Campaign items persist it alongside their document IDs and existing immutable workflow snapshot. Approval and acceptance independently check the selected records and availability. New required rules cannot bypass review by removing document IDs or the signed selection from the request.
6. The existing worker loads only the approved document IDs. Before Gmail it rechecks ownership/rules, metadata, accessibility, MIME, size, revision and downloaded checksum/byte count. A changed or unavailable approved file fails the affected item before Gmail; the worker never silently substitutes a newer file or drops a selected attachment.
7. Resume uses the persisted selection and existing claim/idempotency/uncertain-send protections. Successful items are not sent again. History records the actual filename, byte size, category, FY and requirement, including the existing acknowledged-delivery recovery path.

The existing server authentication secret signs selections; no additional secret, dependency or background service was introduced. Existing batches without a selection retain their prior canonical batch representation. Legacy optional campaigns continue using pinned document IDs with ownership/rule/availability/size validation.

## Limits and visible changes

Source inspection confirmed 25 MiB per uploaded file; email limits remain 8 MiB per attachment, four attachments and 18 MiB combined. Required rules get budget priority over optional rules. An oversized required attachment blocks eligibility; optional omissions are disclosed.

Only necessary functional UI additions were made: an FY selector in the current upload toolbar and metadata form, a Required/Optional setting and specific FY options in existing workflow controls, saved FY in document metadata/search, and real attachment details/optional warnings in the existing review area. Existing component classes and controls are reused. No CSS, design tokens, animations, modal dimensions, navigation, OTP/PIN, Hold to Send, Gmail engine or progress-dock code was changed for this task. Additional attachment information naturally increases the scrolling preview's content height.

## Verification

| Check | Result |
| --- | --- |
| `npm run verify:tracker-attachments` | Passed: category/type/FY/unknown-year/legacy matching; deterministic newest-valid selection; client isolation/shared rules; multiple required rules; size budgets; server workflow persistence; signature tampering, missing proof, altered selections and client/policy rejection; metadata deduplication/concurrency; inaccessible versus transient Drive errors; actual preparation/upload/edit routes; campaign resume with original files; no repeated successful items; safe deletion/revision failures; history metadata. |
| Gmail draft/send transport | The focused test exercises actual approval, worker and Gmail MIME construction with isolated DB, Drive and HTTP transport. Draft and send MIME contain the correct client's exact file bytes and filename. Actual PIN authorization is exercised; no live Gmail draft or email was created and no live Drive upload was performed. |
| `npm run verify:document-attachment-upload` | Passed in Chrome: blank/context/changed/reset FY; real multipart FormData with client/FY; upload response retention; target screenshot compatibility; light/dark/mobile rendering. |
| `npm run verify:workflow-delivery` | Passed: required and specific FY controls, save/reopen, attachment conditions, keyboard/dropdown behavior, existing limits, desktop/mobile/light/dark/reduced motion. |
| `npm run verify:email-delivery-review` | Passed: client-specific filenames/FY/required/optional disclosure, repeated client switching, audience search/filtering, zero/500 clients, signature preview, confirmation/resume, OTP/Hold to Send, responsive and reduced-motion checks. Existing protected material/control/modal geometry checks pass; only the content-driven preview height is excluded. |
| `npm run verify:email-delivery-security` | Passed: administrator boundaries, exact batch binding, OTP/PIN, replay/concurrency, approval lifetime, resume and uncertain-send/audit protections. Unauthorized attachment references are now rejected before approval. |
| `npm run verify:email-browser-delivery` | Passed: immutable acceptance, browser controller/claim fencing, bounded processing, resume and duplicate/uncertain-send protections. |
| `npm run verify:email-delivery-lifecycle` | Passed: startup/progress recovery, leases, browser exclusion, stale polling, uncertain/success preservation. |
| `npx tsc --noEmit` | Passed. |
| Focused ESLint over all 25 production files | Passed with zero errors; one pre-existing `next/no-img-element` warning in ClientProfilePremiumSections. |
| Production build | Pending final build result. |

Browser captures are saved in `tmp/document-attachment-upload-tests`, `tmp/workflow-delivery-tests` and `tmp/email-delivery-review-tests`. Test/build logs use the `tmp/tracker-attachments-` prefix.

Live Google account permissions, production MongoDB persistence and an external recipient inbox were not exercised. Drive folder routing and Gmail OAuth/MIME architecture are preserved; their integration points were tested with isolated transport. Restart a running application after deployment so the added campaign/history schema fields are loaded.

## Changed files

New helper files:

- [FY normalization](C:/Users/User/Desktop/CodeX/align/lib/document-financial-year.ts)
- [Matching and limits](C:/Users/User/Desktop/CodeX/align/lib/server/tracker-attachment-matching.ts)
- [Signed selections and validation](C:/Users/User/Desktop/CodeX/align/lib/server/tracker-attachment-snapshot.ts)

Updated server, shared contracts and models:

- [Attachment materialization](C:/Users/User/Desktop/CodeX/align/lib/server/tracker-email-attachments.ts)
- [Drive metadata access](C:/Users/User/Desktop/CodeX/align/lib/server/google-drive-documents.ts)
- [Email preparation API](C:/Users/User/Desktop/CodeX/align/app/api/client-trackers/[id]/email/route.ts)
- [Approval validation](C:/Users/User/Desktop/CodeX/align/lib/server/email-delivery-approval.ts)
- [Campaign worker](C:/Users/User/Desktop/CodeX/align/lib/server/tracker-email-worker.ts)
- [Workflow persistence](C:/Users/User/Desktop/CodeX/align/lib/server/tracker-email-workflows.ts)
- [Upload API](C:/Users/User/Desktop/CodeX/align/app/api/documents/upload/route.ts)
- [Document creation API](C:/Users/User/Desktop/CodeX/align/app/api/documents/route.ts)
- [Document metadata API](C:/Users/User/Desktop/CodeX/align/app/api/documents/[id]/route.ts)
- [Tracker workflow types](C:/Users/User/Desktop/CodeX/align/lib/clientTrackers.ts)
- [Batch validation and canonicalization](C:/Users/User/Desktop/CodeX/align/lib/email-delivery-security.ts)
- [Client batch construction](C:/Users/User/Desktop/CodeX/align/lib/email-delivery-security-client.ts)
- [Review types](C:/Users/User/Desktop/CodeX/align/lib/tracker-email-delivery-review.ts)
- [Skipped reason label](C:/Users/User/Desktop/CodeX/align/lib/email-skip-reasons.ts)
- [Campaign schema](C:/Users/User/Desktop/CodeX/align/models/TrackerEmailCampaign.ts)
- [History schema](C:/Users/User/Desktop/CodeX/align/models/EmailLog.ts)

Updated existing UI:

- [Upload modal](C:/Users/User/Desktop/CodeX/align/app/dashboard/clients/[clientId]/DocumentUploadModal.tsx)
- [Metadata form](C:/Users/User/Desktop/CodeX/align/app/dashboard/clients/[clientId]/ClientProfileModals.tsx)
- [Document metadata and search](C:/Users/User/Desktop/CodeX/align/app/dashboard/clients/[clientId]/ClientProfilePremiumSections.tsx)
- [Profile editing state](C:/Users/User/Desktop/CodeX/align/app/dashboard/clients/[clientId]/page.tsx)
- [Workflow delivery controls](C:/Users/User/Desktop/CodeX/align/components/client-trackers/WorkflowDeliveryWorkspace.tsx)
- [Attachment review details](C:/Users/User/Desktop/CodeX/align/components/client-trackers/EmailDeliveryReviewWorkspace.tsx)

Tests and documentation:

- [Focused attachment integration tests (new)](C:/Users/User/Desktop/CodeX/align/scripts/verify-tracker-attachments.cjs)
- [Upload browser test (new)](C:/Users/User/Desktop/CodeX/align/scripts/verify-document-attachment-upload.cjs)
- [Upload browser fixture (new)](C:/Users/User/Desktop/CodeX/align/scripts/fixtures/document-attachment-upload.tsx)
- [Security regression](C:/Users/User/Desktop/CodeX/align/scripts/verify-email-delivery-security.cjs)
- [Workflow regression](C:/Users/User/Desktop/CodeX/align/scripts/verify-workflow-delivery.cjs)
- [Review regression](C:/Users/User/Desktop/CodeX/align/scripts/verify-email-delivery-review.cjs)
- [Test commands](C:/Users/User/Desktop/CodeX/align/package.json)
- [This report (new)](C:/Users/User/Desktop/CodeX/align/docs/client-document-attachments.md)
