# Database DevOps Workflow

## Repository and branch

Work remains on `pbl-mid-evaluation`. Preserve local changes, review the diff, and do not commit, push, merge, or alter `main` without authorization. The existing `presentation/DBMS.pptx` is not a source for the new design.

## Project structure

```text
database/schema.sql
database/workflows.sql
docs/design-decisions.md
docs/er-model.md
docs/relational-schema.md
docs/normalization-worksheet.md
docs/database-setup-and-demo.md
docs/verification-notes.md
tests/test-plan.md
tests/financial-integrity.sql
presentation/mid-evaluation-outline.md
```

## Safe database workflow

1. Inspect the target database and its objects/data before use. The SQL files are initializers, not migrations or reset scripts.
2. Use a new isolated database name confirmed not to exist. Do not use `charity_portal_test` until inspected and explicitly confirmed appropriate.
3. Apply `schema.sql`, then `workflows.sql`, with interactive authentication (`psql -X -W -v ON_ERROR_STOP=1`) and capture exit codes/output.
4. Inspect the created catalog, then run `tests/financial-integrity.sql`, which uses synthetic data inside a transaction and rolls it all back.
5. Execute the separate-session payout concurrency test and record its observed outcome. The single-session SQL regression script cannot establish concurrency correctness.
6. Update the test plan and verification notes only with actual outputs. Do not mark unexecuted behavior PASS.

## Data and security controls

- Evaluation scope is INR only; no conversion is modeled.
- Preserve donation source records; refunds use separate events and per-scope reversal rows.
- Restrictions and purposes use campaign-linked rows and controlled purpose codes.
- Use synthetic data only. Never commit credentials, real donor details, or beneficiary identity records.
- Set `app.actor_id` from authenticated application context. This GUC is caller-provided context, not authentication. Restrict direct DML on financial/event tables.
- Append-only triggers and workflow checks do not protect against table owners or superusers. Production needs role/ownership separation and external controls.
- No CI pipeline or production readiness is claimed.
