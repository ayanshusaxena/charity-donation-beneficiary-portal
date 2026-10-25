# DonateKaro backend

FastAPI provides public campaign discovery and authenticated NGO, reviewer, beneficiary, donor-history, donation, payment, refund, and disbursement operations backed by PostgreSQL. Financial mutations remain disabled by default. See [the frontend integration guide](FRONTEND_INTEGRATION.md) for routes, roles, payload conventions, and feature gates.

## Local development

Use Python 3.12 or newer. From `backend/`:

```powershell
python -m venv .venv
if (Test-Path .\.venv\Scripts\Activate.ps1) { . .\.venv\Scripts\Activate.ps1 } else { . .\.venv\bin\Activate.ps1 }
python -m pip install -e ".[test]"
python -m uvicorn app.main:app --reload
```

Provide `CHARITY_DATABASE_URL` through a local secret store or an ignored `backend/.env` file. Do not put a real connection string in source control or command history. The service checks that its login is a non-superuser member of `charity_portal_runtime` and not a member of `charity_portal_owner`, then runs each request in a transaction using `SET LOCAL ROLE charity_portal_runtime`. Public campaign reads use the eligibility-filtered `public_campaign_discovery` view; organization-, reviewer-, and registered-donor reads call scoped functions in read-only transactions. PostgreSQL owns campaign eligibility and tenant authorization.

Run tests from this directory with `python -m pytest`. Campaign and API unit tests are database independent. The opt-in PostgreSQL-backed acceptance case is `tests/test_postgres_acceptance.py`; it commits synthetic fixtures and may be run only against a newly confirmed disposable database. The rollback-based SQL workflow suite is `../tests/financial-integrity.sql`; check `../docs/database-execution-report.md` for dated evidence and its limits before relying on a recorded result.

## Configuration and current boundary

- `CHARITY_DATABASE_URL` is required for database-backed endpoints. Use PostgreSQL 15 or newer.
- `CHARITY_AUTH_ISSUER`, `CHARITY_AUTH_AUDIENCE`, and `CHARITY_AUTH_JWKS_URL` configure OIDC token verification for authenticated routes.
- `CHARITY_WORKFLOWS_ENABLED`, `CHARITY_DONATION_WRITES_ENABLED`, and `CHARITY_SIMULATED_PAYMENTS_ENABLED` default to `false`. Simulated payments are refused in staging and production.
- Apply `database/schema.sql`, `database/workflows.sql`, and then `database/runtime-roles.sql` only to a newly created isolated project database. These are initializers, not migrations. Create a separate LOGIN role operationally, grant it membership in `charity_portal_runtime`, and never grant membership in the owner role or direct DML.
- Registered donors are linked to a verified OIDC issuer/subject. Named guest donations require a high-entropy client capability token; only its SHA-256 digest is stored. Anonymous donations are not implemented.
- Donor history is available only to a verified registered donor. A guest capability is limited to one donation's status and receipt; guests cannot enumerate donation history.
- Beneficiary list reads omit contact details and identity data. Organization campaign reads require active `CAMPAIGN_EDITOR` membership; beneficiary listing requires `BENEFICIARY_MANAGER`. Dashboard and organization list reads require active membership.
- Beneficiary ownership is nullable only for unresolved historical records. No ownership is inferred; payout requests reject unresolved ownership or organization mismatch.
- Creation and simulated payment use separate PostgreSQL idempotency operations. Timeout is persisted as `UNKNOWN`; receipt and transaction reference are exposed only after clearing.
- The provisional contract is in `../contracts/openapi.yaml`.
