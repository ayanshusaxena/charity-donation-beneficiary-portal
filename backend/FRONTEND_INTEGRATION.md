# DonateKaro frontend integration guide

This guide describes the current backend contract and its authorization boundary. The repository includes a `frontend/` directory; its API client and rendered flows have not been verified against this backend. Use `../contracts/openapi.yaml` as the machine-readable contract and coordinate any contract changes with the frontend lead before integration.

## Local service

From `backend/`, activate the existing environment and start the API:

```powershell
.\.venv-cpython314\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

The backend needs `CHARITY_DATABASE_URL` and the database objects from `database/schema.sql`, `database/workflows.sql`, and `database/runtime-roles.sql`. These are initializers, not migrations. The API login must be a non-superuser member of `charity_portal_runtime`, must not be a member of `charity_portal_owner`, and must not receive direct table DML. Authenticated routes require a trusted OIDC issuer, audience, and JWKS URL. All write flags default to false. See [LOCAL_DEMO.md](LOCAL_DEMO.md) for the isolated development-only donation simulation configuration.

## Identity and common conventions

- Send a verified OIDC access token as `Authorization: Bearer <token>` for registered donor, organization, and platform operations. The API validates signature, issuer, audience, issue time, and expiry; it derives the actor key from the verified issuer and subject. A caller-supplied actor ID is never accepted as authentication.
- Named guest donations can use `Guest-Access-Token`, a high-entropy URL-safe capability. The database stores its SHA-256 digest. A guest capability reads only its own donation; it cannot list donation history.
- IDs are positive PostgreSQL `BIGINT` values represented as decimal strings in JSON. Money uses two-decimal strings and currency is `INR`; clients should preserve these strings and avoid binary floating point for arithmetic.
- List routes use `limit` (default 20, range 1–100) and `offset` (default 0, range 0–1,000,000). Responses contain `items`, `limit`, `offset`, `has_more`, and `next_offset`; there is no `total_count`.
- Errors use `{ "error": { "code": "...", "message": "..." } }`. Validation is `422`; missing authentication is `401`; authenticated but unauthorized access is `403`; an absent or non-public resource is `404`; persisted state/idempotency conflicts are `409`; unavailable DB/feature gate is `503`.
- Receipts and transaction references are returned only after the database commits clearing. A payment timeout returns `202`, leaves the donation pending with an `UNKNOWN` attempt, and issues no receipt. A failed simulated attempt is marked failed while the donation remains pending so a later attempt can be made under database rules.

## Route inventory

| Method and path | Purpose and response | Authentication / authorization | Gate and persistence |
|---|---|---|---|
| `GET /api/v1/campaigns` | Eligible public campaign page; supports `purpose_code`, literal case-insensitive `search`, and `sort=date\|target_asc\|target_desc`. | Public | Read-only `public_campaign_discovery`; filters and eligibility precede pagination. |
| `GET /api/v1/campaigns/{campaign_id}` | Eligible public campaign detail, including ledger-derived `amount_raised`. | Public | Same authoritative eligibility view. |
| `GET /api/v1/me/organizations` | Current actor's organization memberships and roles. | Verified OIDC actor | Read-only scoped SQL function. |
| `GET /api/v1/organizations/{organization_id}/dashboard` | Summary counts for campaigns, beneficiaries, and pending disbursement approvals. | Active organization member | Read-only scoped SQL function; no financial balances or contact details. |
| `GET /api/v1/organizations/{organization_id}/campaigns` | Page of owned campaign drafts and lifecycle state, with ledger-derived `amount_raised`. | Active `CAMPAIGN_EDITOR` membership in that organization | Read-only scoped SQL function. |
| `GET /api/v1/organizations/{organization_id}/campaigns/{campaign_id}` | Authorized private campaign detail, including unpublished drafts and review reason. | Active `CAMPAIGN_EDITOR` membership in that organization | Read-only scoped SQL function. |
| `POST /api/v1/organizations/{organization_id}/campaigns` | Create draft; returns `resource_id` and `DRAFT`. | `CAMPAIGN_EDITOR` membership | `CHARITY_WORKFLOWS_ENABLED`; database workflow and audit transaction. |
| `PATCH /api/v1/campaigns/{campaign_id}` | Update editable draft fields; returns `DRAFT_UPDATED`. | Owning organization's `CAMPAIGN_EDITOR` | `CHARITY_WORKFLOWS_ENABLED`; database owns lifecycle guard. |
| `POST /api/v1/campaigns/{campaign_id}/submission` | Submit or resubmit a draft; returns `SUBMITTED`. | Owning `CAMPAIGN_EDITOR` | `CHARITY_WORKFLOWS_ENABLED`; audited database workflow. |
| `GET /api/v1/review/campaigns` | Ordered pending-submission review queue. | Active `CAMPAIGN_REVIEWER` platform role | Read-only scoped SQL function. |
| `POST /api/v1/campaigns/{campaign_id}/review` | Review with `APPROVED` or `REJECTED` plus reason. | Active `CAMPAIGN_REVIEWER` | `CHARITY_WORKFLOWS_ENABLED`; database audit and state transition. `REJECTED` returns the campaign to an editable draft that can be resubmitted; there is no separate terminal reject or `REQUEST_CHANGES` state in the current schema. |
| `POST /api/v1/campaigns/{campaign_id}/activation` | Activate an approved in-date campaign. | Active `CAMPAIGN_REVIEWER` | `CHARITY_WORKFLOWS_ENABLED`; database guard. |
| `GET /api/v1/organizations/{organization_id}/beneficiaries` | Page of beneficiary name, type, verification state, and creation time; omits contact and identity data. | Active `BENEFICIARY_MANAGER` membership in that organization | Read-only scoped SQL function. |
| `POST /api/v1/organizations/{organization_id}/beneficiaries` | Create a pending beneficiary. | `BENEFICIARY_MANAGER` membership | `CHARITY_WORKFLOWS_ENABLED`; audited database workflow. |
| `POST /api/v1/beneficiaries/{beneficiary_id}/verification` | Verify, reject, suspend, or return to pending with reason. | Active `BENEFICIARY_VERIFIER` platform role | `CHARITY_WORKFLOWS_ENABLED`; database audit and state guard. |
| `POST /api/v1/donations` | Create named registered or named guest donation; body includes `campaign_id`, `amount`, `currency`, optional donor fields. Requires `Idempotency-Key`; guests also send `Guest-Access-Token`. | Verified OIDC donor or guest capability; registered donor is bound to issuer/subject. | `CHARITY_DONATION_WRITES_ENABLED`; separate persisted creation idempotency. Returns 201 for new, 200 for same-key replay. |
| `POST /api/v1/donations/{donation_id}/simulated-payment` | Request simulator outcome `SUCCEEDED`, `FAILED`, or `TIMEOUT`; requires a separate `Idempotency-Key`. | Donation owner or its guest capability | `CHARITY_DONATION_WRITES_ENABLED` and `CHARITY_SIMULATED_PAYMENTS_ENABLED`; development/test only. It does not use external payment rails. |
| `GET /api/v1/donations/{donation_id}` | Persisted status, attempts, and receipt/reference when issued. | Registered owner or matching guest capability | Read-only owner-guarded function; independent of financial write flags. |
| `GET /api/v1/donations/history` | Registered donor's paginated donation history and eligible receipts. | Verified registered donor; guest callers receive 401 | Read-only owner-scoped database function; no cross-donor query. |
| `POST /api/v1/donations/payment-attempts/{attempt_id}/reconciliation` | Resolve an unknown attempt as succeeded or failed. | Active `PAYMENT_RECONCILER` platform role | `CHARITY_WORKFLOWS_ENABLED`; reconciliation only through database workflow. |
| `POST /api/v1/donations/{donation_id}/refunds` | Post a full or partial INR refund with reason. | Active `REFUND_OPERATOR` platform role | `CHARITY_WORKFLOWS_ENABLED`; separate persisted idempotency and atomic scope/ledger/audit workflow. |
| `POST /api/v1/campaigns/{campaign_id}/disbursements` | Request a payout with beneficiary, purpose, amount, and optional restriction. | Owning organization's `DISBURSEMENT_REQUESTER` | `CHARITY_WORKFLOWS_ENABLED`; beneficiary ownership, verification, purpose, scope, and balance checks in database. |
| `POST /api/v1/disbursements/{disbursement_id}/approval` | Approve or reject requested payout. | Active `PAYOUT_APPROVER`; must differ from requester | `CHARITY_WORKFLOWS_ENABLED`; database enforces separation of duties. |
| `POST /api/v1/disbursements/{disbursement_id}/payment` | Record a simulated/manual payment reference; requires `Idempotency-Key`. | Active `PAYOUT_OPERATOR`; distinct from requester and approver | `CHARITY_WORKFLOWS_ENABLED`; database guard, ledger, audit, and idempotency transaction. No bank transfer is initiated. |

## Campaign and financial semantics

- A campaign is public only while approved, active, and within its date window according to the database. Public projections omit unpublished campaigns and organization contacts.
- `amount_raised` is computed from posted `DONATION_CLEARING` plus `DONATION_REFUND` ledger deltas. Disbursement deltas are intentionally excluded; the value is net cleared donations, not available-to-spend balance.
- A pledge is a promise, not a payment or raised funds. Donation clearing and pledge fulfillment happen through separate persisted workflows.
- Payment creation and donation creation use separate idempotency keys/operations. A client retry with the same key and same payload replays the persisted result; a conflicting payload is a 409.
- The local simulator is not a payment provider. No real card, UPI, bank, or settlement integration is implemented.

## Verification status and boundaries

The test suite includes database-independent API/repository tests and an opt-in PostgreSQL acceptance test that commits synthetic fixtures. Run that test only with the explicit acceptance flag and DSNs pointed at a newly created, confirmed disposable database; it must not target either protected database. See `../docs/database-execution-report.md` for actual run history, SQL regression scope, known partial cases, and cleanup evidence. `F21` is recorded as partial in `../tests/test-plan.md`; audit fault-injection and deployment authorization/grant verification remain limited as documented there. No database owner or superuser threat is mitigated by application triggers.

No `/health/ready` route is defined. The API has no external payment integration or production identity-provider configuration. Financial write flags remain false by default; this guide is not authorization to enable them in a shared environment.
