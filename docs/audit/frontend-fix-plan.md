# DonateKaro Frontend Repair Plan & Implementation Roadmap

**Document status:** Proposed planning document (Inspection & Planning only; no code modified)
**Date:** 2026-10-23
**Target Repository:** `charity-donation-beneficiary-portal`
**Branch:** `pbl-mid-evaluation`
**Baseline Report:** Evaluates and builds upon `projstatus.md` (A1 audit)

---

## 1. Audit Verification & Baseline Assessment

### 1.1 Verification of A1 Findings from `projstatus.md`

| A1 Finding | Status | Verification Evidence & Analysis |
|---|---|---|
| **1. Public Campaign DTO Mismatch** | **CONFIRMED** | `backend/app/schemas.py:70-85` outputs `campaign_name`, `purpose`, and `eligibility`. `frontend/src/types/api.ts:7-24` defines `title`, `description`, and `status`. Backend also omits `organization_id`, `image_url`, `days_left`, and `mock_backers`. In live API mode (`isSandbox=false`), cards render `undefined` titles and descriptions. |
| **2. Donation Creation Schema & Guest Token Mismatch** | **CONFIRMED** | `backend/app/schemas.py:188-195` specifies `model_config = ConfigDict(extra="forbid")` and expects optional nested `donor: DonorInput {display_name, email, phone}`. Frontend sends flat fields (`donor_type`, `donor_name`, `donor_email`, `pan_number`, `address`) at top level (`DonationWizard.tsx:73-83`). Furthermore, `backend/app/api/donations.py:39` enforces `Guest-Access-Token` `min_length=43`, while `DonationWizard.tsx:70` generates a ~27-char string via `Math.random` and `Date.now()`. Live POST triggers HTTP 422 immediately. |
| **3. Idempotency Key Volatility** | **CONFIRMED** | `frontend/src/api/donations.ts:22,51` generates a new key inside every function call using `Date.now()` and `Math.random()`. Retries generate new keys, destroying replay idempotency. `mockStore` completely ignores idempotency keys. |
| **4. False Financial Success & Fallback Receipt** | **CONFIRMED** | `DonationWizard.tsx:115` advances to Stage 3 purely on the client button click `outcome === 'SUCCEEDED'` without verifying that `payment_status === 'SUCCESSFUL'` in the API response. Lines 430 and 437 substitute fallback strings `REC-2025-001` and `TXN-SIM-2025094` if receipt fields are absent. |
| **5. Mock Role Switcher vs. Real OIDC Auth** | **CONFIRMED** | `frontend/src/context/AuthContext.tsx:16-42` returns synthetic mock strings. `backend/app/auth.py:31-60` decodes RS256/ES256 JWTs using `PyJWKClient` and rejects missing or unsigned credentials with HTTP 401/503. Workspaces (`NgoWorkspace.tsx:45,71` and `ReviewerWorkspace.tsx:40`) do not even pass the context token. |
| **6. NGO & Reviewer DTO & Endpoint Mismatches** | **CONFIRMED** | `NgoWorkspace.tsx:26` fetches public `/campaigns` instead of private `/organizations/{id}/campaigns` (excluding drafts). `POST /organizations/{id}/campaigns` returns `WorkflowResult {resource_id, status}`, while `api/ngo.ts:19` expects `Campaign`. `ReviewerWorkspace.tsx:20` expects `ReviewCampaignItem[]`, while backend returns `ReviewQueuePage` envelope (`backend/app/schemas.py:317-323`). |
| **7. Error Handling & Silent Failures** | **CONFIRMED** | `App.tsx:56-61` turns all campaign fetch errors into an empty result. `NgoWorkspace.tsx:28-30,62-66,74-76` and `ReviewerWorkspace.tsx:25-27,64-66` contain empty `catch { // ignore }` blocks that swallow network, validation, and auth failures. |

---

### 1.2 Additional Critical Defects Uncovered (Missed by A1)

1. **Hero Carousel Synthetic Campaign Binding (Critical UX/Flow Defect)**:
   - *Evidence*: `frontend/src/features/home/HeroCarousel.tsx:48-60` maps carousel slides to synthetic static campaign IDs `'101'`, `'102'`, `'103'`.
   - *Consequence*: In live backend mode, clicking "Donate to Cause" on the carousel attempts to donate to campaign ID `'101'`. Real PostgreSQL sequence IDs will differ, resulting in HTTP 404 or foreign key constraint failure.
2. **Guest Token Dropped Before Payment Simulation (Critical Flow Defect)**:
   - *Evidence*: `DonationWizard.tsx:68-87` generates a local `guestToken` inside `handleProceedToPayment` and passes it to `createDonation`, but does **not** persist it in component state.
   - *Consequence*: When `handleTriggerSimulatedOutcome` is invoked (`DonationWizard.tsx:100-112`), it calls `simulateDonationPayment(donationId, outcome, isSandbox)` with no token. In live mode, `POST /api/v1/donations/{id}/simulated-payment` rejects the request with HTTP 401 UNAUTHENTICATED because neither bearer nor guest token is supplied.
3. **Retry Re-Creation Leak (Integrity Defect)**:
   - *Evidence*: When payment simulation fails, if the user clicks "Edit Information" (`DonationWizard.tsx:403`) and submits again, `createDonation` is called anew, abandoning the previous pending donation in PostgreSQL without cancellation and creating an orphan record.
4. **NGO Dashboard Endpoint Omission (Functional Gap)**:
   - *Evidence*: `backend/app/api/organizations.py:57-68` provides `GET /organizations/{organization_id}/dashboard` returning verified counts (`campaign_count`, `draft_campaign_count`, `submitted_campaign_count`, `active_campaign_count`). `NgoWorkspace.tsx:88-144` hardcodes or derives fake values instead of calling this available endpoint.
5. **CampaignDetailPage Never Fetches Authoritative Detail (Stale State Risk)**:
   - *Evidence*: `App.tsx:212-219` passes in-memory `selectedCampaign` from the discovery list. It never invokes `fetchCampaignById` (`frontend/src/api/campaigns.ts:34-48`). Deep navigation or refreshing on a campaign detail is impossible.
6. **Carousel Accessibility & Touch Trap (WCAG 2.2.2 Defect)**:
   - *Evidence*: `HeroCarousel.tsx:34-44` uses a 6-second `setInterval` with pause only on `onMouseEnter` / `onMouseLeave`. On touch devices (smartphones/tablets), hover events do not fire, trapping users with unpausable moving content. There is no visible pause/play toggle.
7. **FastAPI CORS Middleware Missing (Deployment Blocker)**:
   - *Evidence*: `backend/app/main.py:1-35` includes no `CORSMiddleware`. While Vite dev proxy masks this on `localhost:5173`, any direct frontend deployment, production build, or port difference will be blocked by browser CORS policy.

---

### 1.3 Verification Baseline Commands & Observed Results

All baseline checks were executed on 2026-10-23:

| Verification Target | Exact Command Executed | Exit Code | Observed Output / Diagnostics |
|---|---|---|---|
| **Frontend Typecheck** | `cd frontend; npm run typecheck` | **0** | `tsc --noEmit` completed with 0 errors. |
| **Frontend Tests** | `cd frontend; npm test` | **0** | `vitest run` executed 3 test files, **12 passed, 0 failed** in 18.5s. *(Note: all 12 tests currently pass `isSandbox=true`; they test mock contracts, not live backend).* |
| **Frontend Production Build** | `cd frontend; npm run build` | **0** | `tsc && vite build` built production bundle in 942ms (`dist/index.html` 1.00 kB, `dist/assets/*.js` 247.74 kB, `dist/assets/*.css` 30.51 kB). |
| **Backend Unit Tests** | `.\backend\.venv-cpython314\Scripts\python.exe -m pytest -k "not postgres" -q` | **0** | **42 passed, 2 deselected** in 1.20s. *(Resolves A1's environment issue; python binary is fully functional).* |
| **OpenAPI Contract Validation** | `.\backend\.venv-cpython314\Scripts\openapi-spec-validator.exe .\contracts\openapi.yaml` | **0** | Output: `.\contracts\openapi.yaml: OK`. Spec is strictly valid OpenAPI 3.1.0. |

---

## 2. Dependency Graph & Architecture Strategy

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Critical Correctness & Financial Safety           │
│  • Remove false-success receipt fallback                    │
│  • Enforce persistent, RFC4122/secure Idempotency-Keys      │
│  • Enforce 43+ char crypto-random Guest-Access-Tokens        │
│  • Retain guestToken across donation & payment lifecycles    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: API Contract & Wire DTO Alignment                 │
│  • CampaignOut DTO adapter (campaign_name -> title, etc.)   │
│  • CreateDonationRequest nested donor object + extra=forbid │
│  • DonationOut status enum alignment (payment_status)       │
│  • NGO Draft & Reviewer Queue page envelope alignment       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Functional Workflow & State Management            │
│  • Bind HeroCarousel to real loaded campaigns               │
│  • NGO Workspace: call /organizations/{id}/campaigns        │
│  • Error boundary & visible toast alerts (no silent catches)│
│  • Distinct Sandbox vs Live API indicators                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Visual, Interaction & Accessibility Repairs       │
│  • Accessible carousel pause/play control                   │
│  • Form label association & ARIA progressbar roles          │
│  • Mobile sticky bottom bar docking                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 5: Verification & Contract Test Coverage             │
│  • Wire-mock / live contract integration tests              │
│  • Replay idempotency & timeout recovery tests              │
│  • Clean production package hygiene (.gitignore)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Vertical Repair Plan (Execution Order)

### Phase 1: Critical Correctness and Financial Safety

#### Fix 1.1: Remove False-Success Fallback and Validate Authoritative Receipt
- **Defect & Evidence**: `DonationWizard.tsx:115` transitions to Stage 3 merely because `outcome === 'SUCCEEDED'` was requested. Lines 430 and 437 substitute hardcoded strings (`REC-2025-001`, `TXN-SIM-2025094`) if backend response omits receipt data.
- **Files Likely to Change**:
  - `frontend/src/features/donation/DonationWizard.tsx`
  - `frontend/src/api/mockService.ts`
- **Intended Behavior**: Stage 3 (Settlement Receipt) will render **only** when the API response contains `payment_status === 'SUCCESSFUL'` AND non-null `receipt_number` AND non-null `transaction_reference`. If `outcome === 'TIMEOUT'` or status is `UNKNOWN`, the UI displays a dedicated "Pending Reconciliation" screen. Fallback placeholders are permanently deleted.
- **Dependencies**: None.
- **Acceptance Test**: Simulate a payment where the backend returns `{ payment_status: "PENDING", receipt_number: null }`. Assert that the receipt screen does NOT render, no placeholder receipt is shown, and an alert explains the pending status.
- **Status**: Safe to implement now.

#### Fix 1.2: Cryptographic Guest Token Generation & Lifecycle Retention
- **Defect & Evidence**: `DonationWizard.tsx:70` generates guest tokens using `Math.random` (~27 chars), failing the backend's `min_length=43` constraint (`backend/app/api/donations.py:39`). Furthermore, the token is not stored in state, so subsequent payment calls omit it.
- **Files Likely to Change**:
  - `frontend/src/features/donation/DonationWizard.tsx`
  - `frontend/src/api/donations.ts`
- **Intended Behavior**: Use `window.crypto.getRandomValues()` (e.g. 32 bytes base64url-encoded -> 43+ characters). Store `guestToken` in `DonationWizard` state upon creation and pass it to both `createDonation` and `simulateDonationPayment`.
- **Dependencies**: None.
- **Acceptance Test**: Verify generated guest token length >= 43. Inspect network request headers for both donation creation and simulated payment to verify identical `Guest-Access-Token` presence.
- **Status**: Safe to implement now.

#### Fix 1.3: Stable, Operation-Scoped Idempotency Keys
- **Defect & Evidence**: `frontend/src/api/donations.ts:22,51` generates fresh idempotency keys on every call. Retrying after network timeout sends a different key, defeating backend deduplication.
- **Files Likely to Change**:
  - `frontend/src/features/donation/DonationWizard.tsx`
  - `frontend/src/api/donations.ts`
- **Intended Behavior**: `DonationWizard` generates one `creationIdempotencyKey` when the user enters the form and one `paymentIdempotencyKey` per payment attempt. Replaying or retrying passes the *same* key to the API client until that operation completes or is explicitly cancelled.
- **Dependencies**: Fix 1.2.
- **Acceptance Test**: Trigger a failed simulated payment followed by a retry. Assert that the request header `Idempotency-Key` sent on retry matches the initial payment attempt.
- **Status**: Safe to implement now.

---

### Phase 2: API Contract and Wire DTO Alignment

#### Fix 2.1: Public Campaign DTO Adapter & Translation Layer
- **Defect & Evidence**: Backend `CampaignOut` (`schemas.py:70-85`) provides `campaign_name`, `purpose`, and `eligibility`. Frontend expects `title`, `description`, `status`, `organization_id`.
- **Files Likely to Change**:
  - `frontend/src/types/api.ts`
  - `frontend/src/api/campaigns.ts`
  - `frontend/src/features/home/CampaignCard.tsx`
  - `frontend/src/features/home/CampaignDetailPage.tsx`
- **Intended Behavior**: Introduce an adapter function `mapBackendCampaignToFrontend(dto: BackendCampaignOut): Campaign` in `api/campaigns.ts`. Maps `campaign_name` -> `title`, `purpose` -> `description`, `eligibility` -> `status`. Provide safe UI fallbacks for optional visual properties (`image_url`, `days_left`, `mock_backers`) rather than assuming presence.
- **Dependencies**: None.
- **Acceptance Test**: Feed real JSON from `GET /api/v1/campaigns` into the adapter. Assert resulting object renders campaign card without `undefined` fields and preserves monetary formatting.
- **Status**: Safe to implement now.

#### Fix 2.2: Donation Creation Wire Body Alignment
- **Defect & Evidence**: Backend `CreateDonationRequest` (`schemas.py:188-195`) forbids extra fields and requires `{ campaign_id, amount, currency, donor: { display_name, email, phone } }`. Frontend sends flat `donor_name`, `donor_email`, `donor_type`, `pan_number`, `address`.
- **Files Likely to Change**:
  - `frontend/src/types/api.ts`
  - `frontend/src/api/donations.ts`
  - `frontend/src/features/donation/DonationWizard.tsx`
- **Intended Behavior**: Update payload structure in `createDonation` to nest donor fields under `donor`. Omit frontend-only demo fields (`pan_number`, `address`) from the live HTTP body when in live mode, or store them strictly in client state for receipt presentation.
- **Dependencies**: Fix 1.2.
- **Acceptance Test**: Validate wire payload against backend Pydantic model `CreateDonationRequest.model_validate(json_data)` with zero validation errors.
- **Status**: Safe to implement now.

#### Fix 2.3: Donation Response Status & Attempt Enum Alignment
- **Defect & Evidence**: Frontend uses `CLEARED`, `status`, `attempts`. Backend `DonationOut` (`schemas.py:236-245`) returns `payment_status: "SUCCESSFUL" | "PENDING" | "FAILED" | "CANCELLED" | ...` and `payment_attempts: PaymentAttemptOut[]`.
- **Files Likely to Change**:
  - `frontend/src/types/api.ts`
  - `frontend/src/api/donations.ts`
  - `frontend/src/features/donation/DonationWizard.tsx`
- **Intended Behavior**: Update `Donation` interface in `frontend/src/types/api.ts` to match `DonationOut`. Update all wizard checks to evaluate `donation.payment_status === 'SUCCESSFUL'`.
- **Dependencies**: Fix 1.1, Fix 2.2.
- **Acceptance Test**: Process simulated outcome responses for `SUCCESSFUL`, `FAILED`, and `UNKNOWN`. Assert correct state resolution in `DonationWizard`.
- **Status**: Safe to implement now.

#### Fix 2.4: NGO & Reviewer Endpoint & Envelope Realignment
- **Defect & Evidence**:
  - `api/ngo.ts:5` sends `title/description` without required `currency`, and expects `Campaign` instead of `WorkflowResult { resource_id, status }`.
  - `api/reviewer.ts:5` expects `ReviewCampaignItem[]` instead of `ReviewQueuePage { items, limit, offset, has_more, next_offset }`.
- **Files Likely to Change**:
  - `frontend/src/types/api.ts`
  - `frontend/src/api/ngo.ts`
  - `frontend/src/api/reviewer.ts`
  - `frontend/src/features/ngo/NgoWorkspace.tsx`
  - `frontend/src/features/reviewer/ReviewerWorkspace.tsx`
- **Intended Behavior**:
  - Update `createCampaignDraft` payload to send `campaign_name`, `purpose`, and `currency: "INR"`. Accept `WorkflowResult` response.
  - Update `fetchReviewQueue` to parse the `ReviewQueuePage` envelope and extract `items`.
- **Dependencies**: Fix 2.1.
- **Acceptance Test**: Verify draft creation sends valid `CampaignDraftInput` schema and reviewer queue parses `ReviewQueuePage` envelope correctly.
- **Status**: Safe to implement now.

---

### Phase 3: Functional Workflow & State Management Fixes

#### Fix 3.1: Dynamic Hero Carousel Campaign Binding
- **Defect & Evidence**: `HeroCarousel.tsx:48-60` hardcodes IDs `'101'`, `'102'`, `'103'`. Live donations fail with 404 because these IDs do not exist in the database.
- **Files Likely to Change**:
  - `frontend/src/features/home/HeroCarousel.tsx`
  - `frontend/src/App.tsx`
- **Intended Behavior**: Pass the live loaded campaigns array from `App.tsx` into `HeroCarousel`. If live campaigns are available, bind carousel slides to actual campaign entities (`campaign.campaign_id`). If fewer than 3 campaigns are available, use documentary photography as artwork while linking to real campaign IDs.
- **Dependencies**: Fix 2.1.
- **Acceptance Test**: In live mode, click "Donate to Cause" on the carousel. Verify the donation wizard opens with an authentic, existing campaign ID from PostgreSQL.
- **Status**: Safe to implement now.

#### Fix 3.2: NGO Workspace Private Campaign & Dashboard Queries
- **Defect & Evidence**: `NgoWorkspace.tsx:26` queries public `/campaigns`, omitting drafts. It never calls the dedicated dashboard endpoint.
- **Files Likely to Change**:
  - `frontend/src/api/ngo.ts`
  - `frontend/src/features/ngo/NgoWorkspace.tsx`
- **Intended Behavior**: In `NgoWorkspace.tsx`, call `GET /api/v1/organizations/{organization_id}/campaigns` to populate the lifecycle table (showing `DRAFT`, `SUBMITTED`, `ACTIVE`). Call `GET /api/v1/organizations/{organization_id}/dashboard` to populate the top bento metric cards.
- **Dependencies**: Fix 2.4; blocked in live mode until OIDC auth is available (see Section 3.6).
- **Acceptance Test**: In sandbox mode, verify drafts appear in the lifecycle table and dashboard metrics update dynamically. In live mode, verify appropriate auth gating.
- **Status**: Partially blocked by OIDC auth in live mode; safe to implement for sandbox mode and client contract.

#### Fix 3.3: Actionable Error Handling & No Silent Swallowing
- **Defect & Evidence**: Empty `catch` blocks in `NgoWorkspace.tsx` and `ReviewerWorkspace.tsx`. `App.tsx:56-61` turns all API errors into empty lists.
- **Files Likely to Change**:
  - `frontend/src/App.tsx`
  - `frontend/src/features/ngo/NgoWorkspace.tsx`
  - `frontend/src/features/reviewer/ReviewerWorkspace.tsx`
- **Intended Behavior**: Surface user-visible error alerts for network errors (HTTP 0), validation errors (HTTP 422), authorization errors (HTTP 401/403), and feature gate disabled errors (HTTP 503). Never display an empty list when an API request failed.
- **Dependencies**: None.
- **Acceptance Test**: Disconnect network or stop backend. Assert that discovery shows an explicit error banner ("Backend API unreachable - check connection or switch to Sandbox mode") with a retry button.
- **Status**: Safe to implement now.

#### Fix 3.4: Authoritative Campaign Detail Fetching
- **Defect & Evidence**: `App.tsx:212` passes in-memory `selectedCampaign`. `fetchCampaignById` is unused.
- **Files Likely to Change**:
  - `frontend/src/App.tsx`
  - `frontend/src/features/home/CampaignDetailPage.tsx`
- **Intended Behavior**: `CampaignDetailPage` receives `campaignId` and invokes `fetchCampaignById(campaignId)` on mount, rendering a loading spinner while fetching, and an error state if the campaign is not found or not public.
- **Dependencies**: Fix 2.1.
- **Acceptance Test**: Navigate to campaign details. Verify network request to `GET /api/v1/campaigns/{id}` is executed and response populates the screen.
- **Status**: Safe to implement now.

---

### Phase 4: Visual, Interaction and Accessibility Repairs

#### Fix 4.1: Accessible Carousel Controls (WCAG 2.2.2 Compliance)
- **Defect & Evidence**: `HeroCarousel.tsx` autoplays with no visible pause button and fails to pause on touch/mobile viewports.
- **Files Likely to Change**:
  - `frontend/src/features/home/HeroCarousel.tsx`
- **Intended Behavior**: Add a visible "Pause / Resume Autoplay" icon button next to the slide dots indicator. Ensure focus and touch pause state properly.
- **Dependencies**: None.
- **Acceptance Test**: Tab to carousel controls using keyboard; toggle pause button; assert autoplay timer is cleared.
- **Status**: Safe to implement now.

#### Fix 4.2: Form Labeling & ARIA Semantic Attributes
- **Defect & Evidence**: Form inputs lack `id` / `htmlFor` bindings. Progress bars lack `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`.
- **Files Likely to Change**:
  - `frontend/src/features/donation/DonationWizard.tsx`
  - `frontend/src/features/home/CampaignCard.tsx`
  - `frontend/src/features/home/HeroCarousel.tsx`
  - `frontend/src/features/home/CampaignDetailPage.tsx`
- **Intended Behavior**: Associate all `<label>` elements with input `id`s. Add full ARIA progressbar semantics to all progress indicators.
- **Dependencies**: None.
- **Acceptance Test**: Run axe-core / accessibility checker; verify zero missing form label or progressbar role violations.
- **Status**: Safe to implement now.

#### Fix 4.3: Mobile Sticky Bottom Bar Docking
- **Defect & Evidence**: Stitch design system specifies sticky bottom bar docking for donation actions on viewports < 768px (`editorial_philanthropy/DESIGN.md:188`). Current implementation stacks the sidebar below long text.
- **Files Likely to Change**:
  - `frontend/src/features/home/CampaignDetailPage.tsx`
- **Intended Behavior**: On mobile screens (< 768px), display a sticky bottom CTA bar with campaign progress and "Contribute" button.
- **Dependencies**: Fix 3.4.
- **Acceptance Test**: View `CampaignDetailPage` on 375px mobile viewport; verify bottom action bar remains docked to bottom on scroll.
- **Status**: Safe to implement now.

---

### Phase 5: Verification, Contract Tests & Repository Hygiene

#### Fix 5.1: Wire-Mock Contract Integration Tests
- **Defect & Evidence**: Existing 12 Vitest tests all pass `isSandbox=true`. Zero tests verify `client.ts` wire encoding against OpenAPI schemas.
- **Files Likely to Change**:
  - `frontend/src/test/contractIntegration.test.ts` (new test file)
- **Intended Behavior**: Add automated tests that invoke `fetchCampaigns(..., false)` and `createDonation(..., false)` against mocked HTTP wire responses conforming strictly to `contracts/openapi.yaml`, verifying query param serialization, header injection (`Idempotency-Key`, `Guest-Access-Token`), and DTO parsing.
- **Dependencies**: Fixes in Phase 1 & Phase 2.
- **Acceptance Test**: Run `npm test`; assert contract integration tests execute and pass without contacting live backend.
- **Status**: Safe to implement now.

#### Fix 5.2: Production & Repository Packaging Hygiene (.gitignore)
- **Defect & Evidence**: `frontend/node_modules/` (6,789 files) and `frontend/dist/` are untracked. No root `.gitignore` exists.
- **Files Likely to Change**:
  - `.gitignore` (at repository root, subject to owner authorization)
- **Intended Behavior**: Create a standardized root `.gitignore` covering `frontend/node_modules/`, `frontend/dist/`, `.vite/`, Python `__pycache__/`, `.pytest_cache/`, while preserving all presentation SVGs, docs, and contracts.
- **Dependencies**: Project owner authorization.
- **Acceptance Test**: Run `git status`; verify `node_modules` is excluded while all source files and documentation remain tracked/trackable.
- **Status**: Ready for approval.

---

### 3.6 Blocked vs. Safe Breakdown

| Item | Classification | Reason / Blocker | Resolution Path |
|---|---|---|---|
| **Phase 1 Fixes (Receipt, Guest Token, Idempotency)** | **SAFE NOW** | Frontend internal logic and client contract; does not require backend flags or live DB. | Implement immediately in Batch 1. |
| **Phase 2 Fixes (Campaign DTO, Donation Body, Review Envelope)** | **SAFE NOW** | Frontend DTO adapters and schema compliance; aligns client with committed `openapi.yaml`. | Implement in Batch 2. |
| **Phase 3.1, 3.3, 3.4 (Carousel binding, error alerts, detail fetch)** | **SAFE NOW** | Pure component and state orchestration improvements. | Implement in Batch 3. |
| **Phase 4 Fixes (A11y, mobile docking, ARIA roles)** | **SAFE NOW** | Accessibility and responsive UX refinements. | Implement in Batch 4. |
| **Live Protected Writes (NGO Drafts, Reviewer Decisions, Registered Donor)** | **BLOCKED** | Backend requires trusted OIDC issuer/JWKS (`auth.py:40-41`) and write flags (`config.py:38`). No local OIDC IdP is currently running. | Keep explicitly gated behind Sandbox mode until OIDC IdP is provisioned and owner enables write flags. |
| **Live Payout / Disbursement Workflows** | **OUT OF SCOPE** | Disbursement UI was excluded by owner from Phase 1 scope. | Defer to Phase 2 after core donation flow is certified. |

---

## 4. Recommended Implementation Batches

### **Batch 1: Financial Safety & Correctness Baseline (Priority: Highest)**
- **Scope**: Fix 1.1 (Receipt validity guard), Fix 1.2 (Cryptographic guest token & retention), Fix 1.3 (Stable idempotency keys).
- **Files**: `frontend/src/features/donation/DonationWizard.tsx`, `frontend/src/api/donations.ts`, `frontend/src/api/mockService.ts`.
- **Outcome**: Eliminates false receipt guarantees, guarantees 43+ char guest capabilities, ensures replay-safe idempotency headers.

### **Batch 2: Wire DTO & Schema Translation Layer (Priority: High)**
- **Scope**: Fix 2.1 (CampaignOut adapter), Fix 2.2 (Nested donor creation body), Fix 2.3 (Donation status enum), Fix 2.4 (NGO & Reviewer envelope parsing).
- **Files**: `frontend/src/types/api.ts`, `frontend/src/api/campaigns.ts`, `frontend/src/api/donations.ts`, `frontend/src/api/ngo.ts`, `frontend/src/api/reviewer.ts`.
- **Outcome**: Resolves all schema incompatibilities between frontend client and backend OpenAPI contract.

### **Batch 3: Workflow, Carousel & Error Handling Reliability (Priority: Medium)**
- **Scope**: Fix 3.1 (Hero carousel live campaign binding), Fix 3.3 (Visible error handling), Fix 3.4 (Authoritative detail fetch).
- **Files**: `frontend/src/App.tsx`, `frontend/src/features/home/HeroCarousel.tsx`, `frontend/src/features/home/CampaignDetailPage.tsx`, `frontend/src/features/ngo/NgoWorkspace.tsx`, `frontend/src/features/reviewer/ReviewerWorkspace.tsx`.
- **Outcome**: Eliminates broken mock carousel links, connects detail view, and replaces silent failure catches with clear alerts.

### **Batch 4: Accessibility & Responsive Polish (Priority: Polish)**
- **Scope**: Fix 4.1 (Carousel pause/play control), Fix 4.2 (ARIA attributes & form labels), Fix 4.3 (Mobile sticky bottom bar).
- **Files**: `frontend/src/features/home/HeroCarousel.tsx`, `frontend/src/features/donation/DonationWizard.tsx`, `frontend/src/features/home/CampaignDetailPage.tsx`.
- **Outcome**: Achieves WCAG 2.2.2 accessibility conformance and mobile ergonomic fidelity matching Stitch specs.

### **Batch 5: Verification & Packaging (Priority: Verification)**
- **Scope**: Fix 5.1 (Wire-mock contract tests), Fix 5.2 (Root .gitignore).
- **Files**: `frontend/src/test/contractIntegration.test.ts`, `.gitignore`.
- **Outcome**: Automated regression suite proving wire contract conformance.
