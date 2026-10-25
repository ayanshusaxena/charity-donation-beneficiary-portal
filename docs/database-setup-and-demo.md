# Manual Database Setup and Demonstration

## 1. Requirements and safety

- PostgreSQL 15 or newer (`UNIQUE NULLS NOT DISTINCT` is used).
- These scripts are initializers, not migrations or reset scripts. Apply them only to a newly created isolated database whose exact name has been confirmed absent. Never reuse `charity_portal_test`, `charity_portal_financial_review`, or another pre-existing database for this setup.
- Use a separate non-login owner role and a non-superuser application login. Never expose credentials in commands or source control.
- Review `backend/DONATION_WRITE_DESIGN.md` before enabling any API workflow. All workflow and payment flags default to false.

## 2. Apply the current baseline

Replace `<NEW_DISPOSABLE_DATABASE>` only after an exact-name absence check. The commands below are examples; they have not been executed as part of this documentation update.

```powershell
psql -X -W -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d "<NEW_DISPOSABLE_DATABASE>" -f database/schema.sql
psql -X -W -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d "<NEW_DISPOSABLE_DATABASE>" -f database/workflows.sql
psql -X -W -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d "<NEW_DISPOSABLE_DATABASE>" -f database/runtime-roles.sql
```

The role initializer creates non-login `charity_portal_owner` and `charity_portal_runtime` roles if absent, removes public DML/function/schema-create access, transfers project function ownership to the owner role, and grants the runtime role only discovery-view SELECT and approved workflow function execution. It does not create a login or set a password. Administratively provision a dedicated non-superuser LOGIN role and grant membership in `charity_portal_runtime` only; never grant membership in the owner role. These scripts are not a database upgrade path.

Capture each exit code and full diagnostic output. A nonzero exit means setup is incomplete; stop and investigate the isolated database without dropping or resetting any existing database.

## 3. Actors and workflow use

The application must validate OIDC tokens and set transaction-local `app.actor_id` from the verified issuer and subject. The setting is context, not authentication. The app runtime login must not have direct table DML and must not be a database owner or superuser. Organization memberships and platform roles are provisioned only by a trusted administrator.

Campaign creation, submission, review, activation, beneficiary creation/verification, disbursement request/approval/payment, donations, simulated payments, and refunds must use the controlled SQL workflow functions through the backend. Do not directly update approval, verification, clearing, refund, or payout state. Named guest donations use a client-generated high-entropy capability; anonymous donations are not implemented. Beneficiary rows with unresolved organization ownership remain unpaid until an authoritative mapping is reviewed and recorded.

## 4. Regression tests

Read [test-plan.md](../tests/test-plan.md). Run the rollback-based financial script only in the newly created isolated database after applying all three initializer scripts:

```powershell
psql -X -W -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d "<NEW_DISPOSABLE_DATABASE>" -f tests/financial-integrity.sql
```

The script is intended to end with `ROLLBACK`, discarding all synthetic fixtures. Concurrency cases need separate sessions and separate disposable databases. Do not call an assertion successful until execution output and final-state checks are recorded in `docs/database-execution-report.md`.

## 5. Financial and operational limits

- Evaluation scope is INR only; no currency conversion is modeled.
- Refunds preserve the original donation and create refund events plus per-scope reversals. The transaction rolls back if any portion exceeds available funds in its original allocation scopes.
- Purpose codes enforce database classification compatibility; they do not prove that an actual expense met the classified purpose.
- Audit and ledger entries are written in the business transaction. Triggers do not protect against privileged table owners or superusers.
- Payment simulation is development/test only and is not evidence of settlement by a payment provider. A timeout is persisted as `UNKNOWN` and requires authorized reconciliation.
- Existing databases require an explicitly reviewed migration/backfill plan before this baseline can replace their schema. Do not infer beneficiary ownership from names or other non-authoritative matches.
