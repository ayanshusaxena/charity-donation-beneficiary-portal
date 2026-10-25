# DonateKaro Project Status Audit

Audit date: 2026-10-23

Repository: `C:\Users\ayans\OneDrive\Desktop\charity-donation-beneficiary-portal`

Branch: `pbl-mid-evaluation`

HEAD: `7fb3b4da8b2043a3732c368f3aabf31b9bc6cae9` (`feat: add PostgreSQL-backed charity portal API and workflows`)

This is a source and repository audit, not a live integration certification. No SQL was executed and no database was accessed. The only intended repository file change in this audit is this report.

## 1. Executive verdict

**Verdict: the frontend is a useful visual and interaction prototype, but it is not integration-ready with the committed backend. Preserve its visual layout and component structure; selectively revise the API types, clients, identity flow, and write-result handling before connecting it to the backend.** A broad visual rebuild is not supported by the evidence. The backend and SQL contain substantial persisted workflow and authorization logic, but financial writes are disabled by default and latest-source PostgreSQL acceptance could not be rerun in this environment.

Three highest-priority integration blockers:

1. **Public campaign payload mismatch.** The backend returns `campaign_name`, `purpose`, and `eligibility`; the frontend requires `title`, `description`, and `status` (`backend/app/schemas.py:70-90`, `frontend/src/types/api.ts:7-24`). Live campaign cards/details therefore read absent properties.
2. **Write flows cannot authenticate or satisfy backend schemas.** Frontend role switching supplies mock tokens (`frontend/src/context/AuthContext.tsx:16-42`), but workspaces do not pass tokens; backend requires verified OIDC for protected actions (`backend/app/auth.py:31-65`). Donation payload shape also differs, and generated guest capabilities are shorter than the backend's 43-character minimum (`frontend/src/features/donation/DonationWizard.tsx:67-88`, `backend/app/api/donations.py:38-39,42-56`).
3. **False financial success and unsafe retry semantics.** UI completes on the requested `SUCCEEDED` outcome and renders a hard-coded fallback receipt (`frontend/src/features/donation/DonationWizard.tsx:108-117,600-606`). Each retry creates a new idempotency key (`frontend/src/api/donations.ts:20-23,49-52`), preventing dependable same-operation replay after a timeout.

The current Git index is empty. The tracked database/backend implementation is committed at HEAD. The frontend source is currently untracked, as are several presentation artifacts; `presentation/DBMS.pptx` is an unstaged tracked deletion and `structure.md` remains untracked.

## 2. Current architecture and project state

### Repository state

**Verified by Git:** branch `pbl-mid-evaluation`; HEAD is the commit above and `origin/pbl-mid-evaluation` points at the same commit. The remote URL is the project GitHub repository. `git status --short --branch` showed:

```text
## pbl-mid-evaluation...origin/pbl-mid-evaluation
 D presentation/DBMS.pptx
?? docs/er-model-abstracted.md
?? docs/er-model-abstracted.svg
?? docs/relational-schema-abstracted.md
?? docs/relational-schema-abstracted.svg
?? frontend/
?? presentation/er-model-extracted.md
?? presentation/er-model-visual.svg
?? presentation/relational-schema-extracted.md
?? presentation/relational-schema-visual.svg
?? structure.md
```

`git diff --cached --quiet` returned exit 0 (`INDEX_EMPTY`). There are no staged files. Do not conflate the previous 15-file staged database milestone with this checkout: HEAD now contains the backend/database implementation, and the staged milestone is no longer staged. No changes were made to Git state during this audit.

Untracked frontend source includes `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/**`, and Vite/Tailwind/TypeScript configuration. The directory also contains `frontend/node_modules/` (6,789 untracked files) and `frontend/dist/` build output. No root `.gitignore` exists. `backend/.gitignore` covers its Python environment/cache artifacts, but does not cover the frontend dependency tree/build output. Treat `node_modules` as reproducible local dependencies and `dist` as generated build output; do not delete or ignore them without confirming whether the owner wants a repository rule and whether deployment expects committed build output.

Other untracked presentation/source artifacts are listed in section 9. They are not assumed disposable.

### Architecture

- **Frontend:** React 18 + TypeScript + Vite, with one local-state SPA in `frontend/src/App.tsx`; components for campaign discovery/detail, donation wizard, NGO workspace, reviewer workspace, header/footer, trust and how-it-works content. No router dependency is declared. API adapters are in `frontend/src/api/`; mock data/service in `frontend/src/api/mockService.ts`; client-side role and sandbox contexts in `frontend/src/context/`.
- **Backend:** FastAPI app in `backend/app/main.py`; campaign reads in `api/campaigns.py` / `campaign_repository.py`; donor/payment/refund routes in `api/donations.py`; organization and beneficiary reads in `api/organizations.py`; campaign, beneficiary and disbursement writes in `api/management.py`; reviewer queue in `api/review.py`. Pydantic models are in `backend/app/schemas.py`; JWT verification in `auth.py`; transaction/runtime-role handling in `database.py`; SQL workflow calls in `workflow_repository.py`.
- **Database:** `database/schema.sql`, `database/workflows.sql`, and `database/runtime-roles.sql`. Repository setup docs call the schema/workflow scripts initializers, not migrations. SQL regression is `tests/financial-integrity.sql`; opt-in committed-fixture API acceptance is `backend/tests/test_postgres_acceptance.py`.
- **Contract:** `contracts/openapi.yaml`. Its prior validator evidence is historical for the revision executed, not a current validation in this audit.

### Database model and safeguards (source review only)

`schema.sql` defines `purpose_category`, `organization`, `donor`, `campaign`, `organization_membership`, `platform_role`, `pledge`, `donation`, `donation_guest_access`, `payment_attempt`, `beneficiary`, `fund_restriction`, `donation_restriction`, `donation_refund`, `donation_refund_scope`, `api_idempotency_request`, `disbursement`, `audit_log`, `fund_ledger_entry`, and `donor_consent_event` (table declarations at `database/schema.sql:8-412`). It includes INR-only money/currency checks, keys and campaign/scope composite FKs, partial uniqueness for the anonymous donor record, unique payment/receipt/refund references, idempotency uniqueness, and indexes. The public campaign view is eligibility-filtered; campaign raised funds are ledger-derived (`database/schema.sql:436-469`).

`workflows.sql` provides actor and organization/platform-role checks; campaign state guards/audit; pledge and donation guards; clearing ledger/audit; idempotent donation creation and simulated payment; unknown-attempt reconciliation; refund allocation/reversal; beneficiary verification/audit; consent audit; disbursement approval/payment and scoped-balance validation; immutable ledger/refund/audit/consent history; and scoped read functions (`database/workflows.sql:9-71,129-146,149-250,271-520,525-714,782-989,1008-1089,1100-1218,1227-1374`).

Runtime grants are restricted to the public discovery view and approved function execution; source revokes public table/sequence/function privileges (`database/runtime-roles.sql:22-60`). The API checks that its login is a non-superuser runtime-role member and not an owner-role member, then sets `SET LOCAL ROLE charity_portal_runtime` within transactions (`backend/app/database.py:13-31`). These are source-level safeguards, not a fresh privilege audit. Trigger protections do not protect against database owners or superusers.

The app uses separate read-only and workflow transaction contexts (`backend/app/database.py:34-99`). Donation creation, simulated attempt, reconciliation, refund, campaign review, beneficiary verification, and payout calls use database functions through transaction contexts (`backend/app/workflow_repository.py`). This source review does not establish live database object availability, grant correctness, or current transaction behavior.

## 3. Frontend quality and functional completeness

### UI structure and experience

**Partially verified from source:** the SPA has a coherent component split, consistent Tailwind theme tokens, responsive utility classes, discovery filters/sort/pagination, detail and donation steps, and separate NGO/reviewer workspaces. `App.tsx` provides loading and empty states for campaign discovery (`frontend/src/App.tsx:31-63,128-177`). No browser was opened in this audit, so visual rendering, keyboard/accessibility behavior, responsive breakpoints, and browser console behavior were not independently verified.

Navigation uses string state rather than URL routes (`frontend/src/App.tsx:20,120-240`): browser back/deep linking and refresh restoration are not implemented. The API client supports JSON and structured errors (`frontend/src/api/client.ts:17-51`), but error handling is inconsistent: discovery converts errors to an empty result (`App.tsx:56-61`), while NGO/reviewer catches often do nothing (`NgoWorkspace.tsx:28-30,62-76`; `ReviewerWorkspace.tsx:25-27,64-66`). This can make service failure appear as an empty queue or silent no-op.

### Mock/sandbox behavior

**Verified:** sandbox starts enabled (`frontend/src/context/SandboxContext.tsx:13`); API adapters default their `isSandbox` argument to true (`frontend/src/api/campaigns.ts:15,36`; `donations.ts:12,41,71`; `ngo.ts:8,28`; `reviewer.ts:6,25`). The role switcher generates literal mock OIDC strings rather than authenticating users (`AuthContext.tsx:16-42`). The in-memory mock service synthesizes donation statuses, receipt numbers and transaction references (`mockService.ts:228-276`) and hardcodes campaign metrics (`mockService.ts:12-111`). Hero slides and backer counts are also local fixtures (`HeroCarousel.tsx:23-108`, `CampaignCard.tsx:107`). These are demo mocks, not persistence or backend evidence.

`SandboxContext` checks campaign-list HTTP success to label the API online (`frontend/src/context/SandboxContext.tsx:17-31`); a successful public read does not verify write flags, authentication, role grants, database state, or payment configuration.

## 4. Backend and database readiness

### Verified source features

- Campaign discovery reads only from `public_campaign_discovery`; query parameters include `purpose_code`, trimmed literal case-insensitive search across campaign/organization/purpose, and fixed sort allowlist with deterministic `campaign_id ASC` tie-breaker (`backend/app/campaign_repository.py:8-12,20-58`). Filters precede ordering/limit/offset. Eligibility is authoritative in SQL, not duplicated in API logic (`database/schema.sql:436-469`).
- Backend wire money uses decimal strings and `Decimal`, IDs are positive BIGINT-compatible strings, and campaign pagination bounds are validated (`backend/app/schemas.py:29-67,70-98`).
- Authenticated routes verify a signed OIDC JWT against configured issuer, audience and JWKS, then derive actor ID from issuer+subject (`backend/app/auth.py:31-65`). A guest capability is separately accepted for owned donation operations and hashed before persistence (`backend/app/auth.py:68-81`).
- Financial flags default false and configuration blocks write-enabling outside development/test, without explicit loopback DB config, or for protected database names (`backend/app/config.py:14-57`; `backend/app/auth.py:84-100`). This is a deliberate safety gate, not a missing implementation to bypass.
- Donation creation and payment attempts use distinct database idempotency operations, payment timeouts are represented as unknown, and receipt fields are in persisted owned-donation reads (`backend/app/api/donations.py:42-96`; SQL functions in `workflows.sql:525-689`). Refund, audit and ledger workflows are also represented in SQL.

### Readiness limitations

- No PostgreSQL connection or SQL execution was performed. Latest-source SQL regression, role/grant verification, and committed-fixture API acceptance remain unverified in this session.
- Existing docs record latest acceptance as **LOCK PENDING** because the venv base interpreter was inaccessible and PostgreSQL identity authentication was unavailable (`docs/database-execution-report.md:764-823`; `tests/test-plan.md:3-8`).
- The opt-in test commits synthetic data and is only safe against a freshly confirmed disposable DB. It requires `CHARITY_DATABASE_URL`, `CHARITY_TEST_ADMIN_DATABASE_URL`, and `CHARITY_RUN_POSTGRES_ACCEPTANCE=1` and has no fixture deletion routine (`backend/tests/test_postgres_acceptance.py:1-6,24-30`). It must not be run against protected/shared databases.
- API flags are false by default. Source presence does not establish that runtime roles, schema objects, OIDC configuration, a separate runtime login, or grants are provisioned in a database.
- There is no external payment provider in the backend. Simulated payment is a persisted local workflow only (`backend/README.md`, `backend/FRONTEND_INTEGRATION.md`).
- No audit-history API/UI is present; the database stores events, but current public/backend route inventory has no audit retrieval endpoint.
- Backend `main.py` has no CORS middleware (`backend/app/main.py:1-35`). Vite development proxy maps `/api` to `http://localhost:8000` (`frontend/vite.config.ts:7-14`), so same-origin dev proxy use is plausible. Production cross-origin deployment policy is not documented/configured here.

## 5. Frontend-to-backend integration matrix

| Feature/flow | Frontend implementation | Backend contract | Integration status | Evidence | Required action |
|---|---|---|---|---|---|
| Campaign discovery | `fetchCampaigns`; filters, sort, offset pagination in `App.tsx` | `GET /api/v1/campaigns`, envelope `items, limit, offset, has_more, next_offset` | **Partially verified; payload incompatible** | Query/envelope align (`api/campaigns.ts:13-32`, `CampaignPage` type). Campaign property names do not: front expects `title, description, status, organization_id`; backend returns `campaign_name, purpose, eligibility` (`types/api.ts:7-24`, `schemas.py:70-90`). | Agree one field mapping and update API DTO/view model. Add live-client contract tests. Do not fabricate public status or organization ID. |
| Campaign detail | UI uses selected in-memory campaign; adapter has `fetchCampaignById` | `GET /api/v1/campaigns/{campaign_id}` returns same `CampaignOut` | **Partially verified; not used by detail screen and same payload mismatch** | `CampaignDetailPage` receives selected object (`App.tsx:212-219`); API helper exists (`api/campaigns.ts:34-48`). | Fetch authoritative detail on navigation and handle loading/404; align response model. |
| Donation creation | `createDonation`, guest/registered switch, wizard | `POST /api/v1/donations`; body `{campaign_id, donor?, amount, currency}`, guest capability and `Idempotency-Key` required (`schemas.py:195-214`, `donations.py:38-69`) | **Not integrated** | Front sends flat `donor_type, donor_name, donor_email, pan_number, address`; backend forbids extras and expects optional nested `{display_name,email,phone}`. Wizard-generated guest token is not retained and is below backend min length 43. No OIDC token is passed. | Adapt payload; generate cryptographically secure 43+ char guest token and persist it for owned reads/retries; implement real auth before registered path. |
| Donation status | `fetchDonationById` adapter exists | `GET /api/v1/donations/{id}` returns `payment_status`, `payment_attempts`, no donor identity fields (`schemas.py:236-249`) | **Incompatible/unverified; helper not used** | Front type expects `status`, `attempts`, `donor_name`, `donor_email` (`types/api.ts:42-57`), helper route exists (`donations.ts:69-92`). | Align field names/statuses and use the persisted read after ambiguous outcomes. |
| Simulated payment | Three UI buttons call outcome endpoint | `POST /api/v1/donations/{id}/simulated-payment`; 200 success/failure, 202 unknown; separate idempotency key (`donations.py:74-96`) | **Blocked by flags; response mismatch and retry risk** | Flags are false by default. UI creates a fresh key each call (`api/donations.ts:49-52`), so network retries are not replay-safe. Front status enum uses `CLEARED/UNKNOWN`; backend returns `payment_status` enum including `SUCCESSFUL` and attempts as `payment_attempts`. | Gate visible controls by actual demo capability; retain idempotency operation key/token; use response state or refetch, never requested outcome as truth. |
| Receipt issuance | Completed view displays receipt | Backend returns nullable persisted receipt only after clearing; timeout `202` is unknown and has no receipt | **Critical false-success risk** | Wizard advances solely on requested `outcome === 'SUCCEEDED'` (`DonationWizard.tsx:108-117`) and substitutes `REC-2025-001` when receipt is absent (`:600-606`). Mock service always synthesizes receipt on mock success (`mockService.ts:262-263`). | Show success only after persisted `payment_status === SUCCESSFUL` and non-null receipt; remove fallback and distinguish unknown/reconciliation state. |
| NGO campaigns | Workspace lists via public campaigns; creates/submits | Backend private reads `/organizations/{id}/campaigns`, create returns `WorkflowResult {resource_id,status}`, submission same (`management.py:43-82`, `schemas.py:282-285`) | **Incompatible and unauthorized** | Front calls public list (excludes drafts/private) and expects Campaign response from write calls (`NgoWorkspace.tsx:26,45-57,71-74`; `api/ngo.ts:19,39`). It omits auth token. Request uses `title/description` and omits required currency; backend expects `campaign_name/purpose/currency`. | Use owned list route, pass verified org-member token and selected organization, align draft fields and consume WorkflowResult. |
| Reviewer queue | `fetchReviewQueue()` expects array | Backend returns paginated `ReviewQueuePage` with `items` and envelope | **Incompatible and unauthorized** | Client expects `ReviewCampaignItem[]` (`api/reviewer.ts:5-18`); backend response model is `ReviewQueuePage` (`review.py:15-32`). No token passed by workspace. | Consume page envelope, add pagination and authenticated reviewer session. |
| Reviewer decision | Client expects `{campaign_id,status,reason}` | Backend returns `{resource_id,status}`; rejection status remains `REJECTED` | **Incompatible** | `api/reviewer.ts:22-43`, `management.py:84-94`, `schemas.py:282-285`; mock test expects rejected campaign to become `DRAFT` (`frontend/src/test/reviewerDecision.test.ts`). | Align result semantics with persisted state; remove mock-only assumptions and pass authenticated reviewer token. |
| Authentication/authorization | Client-side role chooser and local identities | Verified OIDC JWT; DB organization/platform-role checks | **Not production authentication** | `AuthContext.tsx:16-42` uses mock strings; protected client functions only send a token if caller supplies one; workspaces call without one. Backend rejects untrusted/missing credentials. | Implement real OIDC login/session and role-aware route gating; never treat the role switcher as access control. |
| NGO beneficiary/disbursement workflows | No clear beneficiary, payout request/approval/payment UI or API client | Backend routes exist for beneficiary creation/verification and payout request/approval/payment (`management.py:110-186`) | **Not implemented in frontend** | Frontend route inventory/screens contain no corresponding forms or API adapters. | Add only after identity, authorization and DB acceptance are ready; include separation-of-duties UX. |
| Donor history/refunds/reconciliation | No donor history, refund, or unknown-attempt reconciliation screen/API adapter | Backend routes exist (`donations.py:98-173`) | **Not implemented in frontend** | No matching client calls/screens in `frontend/src/api` or features. | Decide whether these are in demo scope; if included, design authenticated owner/operator UI and idempotent operations. |
| Audit history | No audit API/UI | SQL writes audit records; no read route found | **Missing end-user surface** | `database/workflows.sql` contains audit triggers/functions; backend route inventory has no audit read route. | Product/authorization decision, then add a narrowly scoped audit read API only if required. |
| Errors/loading | Shared client decodes `{error:{code,message}}`; loading states exist | Backend uses structured error envelope and 401/403/404/409/422/503 | **Partially implemented** | Client parsing aligns (`api/client.ts:17-51`), but app converts campaign errors to empty state and NGO/reviewer swallow exceptions. | Show actionable error/retry states distinct from empty results and disabled workflows. |
| Pagination | Front sends `limit, offset`; list page expects envelope | Backend bounds 1–100 and 0–1,000,000, same envelope for lists | **Partially aligned** | Discovery params and envelope align; NGO/reviewer client assumptions do not consume backend pages. | Keep envelope contract; add tests for `next_offset` and bounded pagination in each client. |

## 6. Verified test results and commands

### Commands actually attempted in this audit

| Command | Outcome | Meaning |
|---|---|---|
| `git status --short --branch` | Exit 0; output recorded in section 2 | Working tree has unstaged PPTX deletion and untracked visuals/frontend/structure. |
| `git diff --cached --quiet` | Exit 0 | Index empty. |
| `git diff --check` | Exit 0 | No whitespace errors reported for current tracked diff. |
| From `frontend/`: `npm.cmd run typecheck -- --pretty false` | Exit 0 | Frontend TypeScript typecheck completed. This does not validate API behavior. |
| From repository root: `npm.cmd run typecheck -- --pretty false` and `npm.cmd test -- --help` | Exit 1 | Initial invocation was from wrong directory; npm could not find root `package.json`. Not a test result. |
| From `frontend/`: `node .\node_modules\vitest\vitest.mjs run --no-cache` | Exit 1 before test collection | Vite/esbuild failed with `Cannot read directory "../../../..": Access is denied` while resolving `vite.config.ts`. Frontend test cases did not run. |
| From repository root: `& '.\backend\.venv-cpython314\Scripts\python.exe' -B -m pytest -p no:cacheprovider -q` | Exit 1 before collection | Launcher reported its base interpreter `C:\Users\ayans\AppData\Local\Programs\Python\Python314\python.exe` as `Access is denied`. No backend tests ran. |
| From repository root: `& '.\backend\.venv-cpython314\Scripts\openapi-spec-validator.exe' '.\contracts\openapi.yaml'` | Exit 103 before validation | Validator launcher could not access the same CPython base interpreter. Current formal OpenAPI validation did not run. |

No SQL, DB probe, API server, build, frontend browser flow, or PostgreSQL acceptance test was run in this audit. No SQL tests are claimed as passed against the current revision.

### Historical evidence (not rerun here)

`docs/database-execution-report.md` records earlier test executions, including a prior backend suite with `43 passed, 1 skipped` and a formal OpenAPI validator exit 0. Those results apply to the source revision executed then. The report's later entries (`Final acceptance rerun` and `A1 acceptance ownership retry`, especially lines 764-823) record **LOCK PENDING** and failures to start current-source pytest/OpenAPI validation or establish PostgreSQL identity. `tests/test-plan.md:3-8` makes the same distinction; F21 remains **PARTIAL**. Do not present historical passes as current HEAD verification.

The frontend's Vitest source tests primarily call mock mode explicitly (`frontend/src/test/campaigns.test.ts`, `donationSimulation.test.ts`, `reviewerDecision.test.ts`). They therefore do not prove backend integration even when they can run. In this audit, Vitest could not collect/run them.

## 7. Critical defects and blockers

1. **Campaign DTO incompatibility (Verified).** Public backend `CampaignOut` does not provide frontend's `title`, `description`, `status`, or `organization_id`. A live mode switch can render undefined content or use invalid status assumptions. Fix with an agreed public view model mapping and API tests.
2. **Guest request is rejected (Verified by source constraints).** Frontend guest token uses `Math.random` and a timestamp and is not retained; backend requires 43–128 URL-safe characters and stores its digest. Current generated token is shorter than minimum, so request validation/actor resolution rejects it. Use cryptographic random bytes and keep the capability through retries and reads.
3. **Donation request schema mismatch (Verified).** Frontend sends flat donor fields plus `donor_type`; backend's `extra="forbid"` request accepts `donor` nested object and no donor_type. Front also sends unsupported PAN/address fields. Live POST will fail Pydantic validation before workflow execution.
4. **No valid frontend identity (Verified).** The role switcher is simulated, its token is not a signed OIDC token, and NGO/reviewer workspaces do not pass any token. Protected routes cannot succeed; frontend role selection is not authorization.
5. **Idempotency keys are not retry-stable (Verified).** Keys are generated inside every API invocation using timestamp and `Math.random`; a retry produces a new operation. Donation and payment need distinct durable keys, but each key must be reused for retries of that same user action and payload. Timeout reconciliation requires retaining donation/attempt identity and resolving persisted state.
6. **Receipt false success (Verified).** UI advances on requested success rather than persisted response and uses a hard-coded receipt fallback. It can show a success receipt without a database-issued receipt. This must be fixed before any live simulated payment.
7. **NGO/reviewer response and list mismatches (Verified).** NGO write adapter expects a full `Campaign` while backend returns `WorkflowResult`; reviewer queue expects array while backend returns page; reviewer decision assumes old result shape and mock rejection state. These actions also omit authenticated token.
8. **Default financial writes disabled (Verified, intentional safety control).** Live donation/payment actions return unavailable unless authorized development/test flags are explicitly configured with runtime role and isolated local DB. Do not enable before acceptance gates.
9. **Current backend/PostgreSQL acceptance unverified (Blocked).** Current test launcher and OpenAPI validator cannot start due inaccessible Python base executable; no PostgreSQL credentials/identity evidence were established. Do not use a protected or shared database as a workaround.
10. **Untracked artifacts and no root ignore policy (Verified).** Frontend files, `node_modules`, `dist`, and visual deliverables are all untracked. No root `.gitignore` means a future broad add could capture thousands of dependencies and build artifacts.

## 8. Important unknowns that could not be verified

- Actual runtime frontend-to-backend HTTP behavior, browser rendering, CORS in deployed topology, and environment-specific API base URL.
- Whether current local PostgreSQL contains the expected schema/runtime roles and whether grants match `runtime-roles.sql`; no database was accessed.
- Current-source financial regression and PostgreSQL-backed acceptance behavior, including concurrency, runtime permission negatives, rollback/cleanup.
- Availability/configuration of a real OIDC issuer/JWKS, actual user login/session lifecycle, token refresh, logout, and platform role assignment.
- Whether S1 intends the frontend as mock-only coursework UI or as a working integration client, and whether `frontend/dist` is a deployable artifact to retain.
- Product scope for audit history, donor history/refunds/reconciliation, beneficiary ownership UX, and payout screens.
- Production payment gateway/settlement is not present in source; actual external payment integration remains out of scope/unimplemented unless separately decided.

## 9. Preserve versus revise recommendation for S1's frontend

**Recommendation: preserve the visual structure and selectively revise integration layers and state handling.** The project has reusable presentation components and useful discovery/detail and workflow prototypes. A rewrite is unnecessary for the identified mismatches. Preserve the original frontend source and use focused changes with contract-driven tests.

Recommended preservation/inventory treatment:

- Preserve `frontend/src/features/**`, `frontend/src/components/**`, `frontend/src/index.css`, and `frontend/src/App.tsx` as the UI baseline; revise data adapters, DTO mapping, auth plumbing, and error/result states selectively.
- Preserve `frontend/src/api/mockService.ts` only as an explicitly labeled demo adapter; prevent it from masquerading as API persistence or financial truth.
- Preserve the untracked `frontend/package.json`, `package-lock.json`, `frontend/src/**`, and frontend configs as candidate source files pending owner review; they are not currently committed.
- Treat `frontend/node_modules/**` (6,789 files) as local dependency installation, not source. Recommend an ignore rule; do not delete it without approval.
- Treat `frontend/dist/**` as generated build output; confirm deployment/presentation need before excluding or deleting it.
- Preserve `docs/er-model-abstracted.md`, `docs/er-model-abstracted.svg`, `docs/relational-schema-abstracted.md`, `docs/relational-schema-abstracted.svg`, `presentation/er-model-extracted.md`, `presentation/er-model-visual.svg`, `presentation/relational-schema-extracted.md`, and `presentation/relational-schema-visual.svg` as presentation deliverables until the owner decides otherwise.
- Leave `structure.md` untracked and untouched as prior instructions require.
- Keep the intentional tracked deletion of `presentation/DBMS.pptx` separate from any frontend integration commit unless explicitly approved.

## 10. Prioritized implementation plan, dependencies and acceptance criteria

1. **Lock an integration DTO contract (dependency: backend + frontend owners).** Map campaign names/purpose/status and donation/payment statuses/attempts. Acceptance: OpenAPI and frontend types agree; contract tests validate exact payloads and no fabricated fields.
2. **Complete trustworthy identity and guest capability handling (dependency: OIDC/provider decision).** Replace role chooser as an auth mechanism; implement verified login or explicitly limit demo to guest. Acceptance: protected routes include valid verified identity; guest tokens meet backend length/entropy, survive retry and status lookup, and only authorize their own donation.
3. **Make donation creation/payment recoverable (dependency: step 1 and isolated DB acceptance).** Body matches backend; persist/reuse separate idempotency keys per operation; refresh persisted donation status after timeout; no result inferred from requested outcome. Acceptance: repeated same key/body returns same persisted result; timeout remains unknown; changed payload conflict and retry/reconciliation tests pass against disposable PostgreSQL.
4. **Remove false success surfaces (dependency: step 3).** Require persisted successful status and non-null receipt; remove placeholder receipt, mock backer/metric claims in live mode. Acceptance: no success page or receipt unless backend response proves it.
5. **Integrate NGO and reviewer workspaces (dependency: real auth/role grants).** Use private paginated endpoints, correct request/response DTOs, selected org context, and meaningful error states. Acceptance: organization isolation and reviewer queue/decision behavior pass API contract and auth tests.
6. **Decide and scope beneficiary, payout, donor history/refund, audit UI (dependency: product decision).** Build only approved screens and least-privilege endpoints. Acceptance: ownership, verification, separation-of-duties, audit read access and state transitions have explicit tests.
7. **Restore current-source verification environment (dependency: local Python executable and approved DB credentials).** Re-run backend tests and formal OpenAPI validation; then use only a fresh confirmed disposable PostgreSQL DB for schema/workflow/runtime-role/regression/API acceptance and cleanup verification. Acceptance: exact target identity and role/grant positive/negative tests recorded; all tests run current source; feature flags remain off outside isolated local test.
8. **Repository hygiene after review (dependency: owner scope decision).** Add a root `.gitignore` for `frontend/node_modules/` and likely `frontend/dist/` if generated output is not a deployment artifact. Acceptance: ignore rules preserve package lock, source, docs and SVG deliverables; do not broadly add untracked files.

No implementation should begin until the owner reviews this report and chooses whether the frontend is intended to move from mock prototype to real API integration.
