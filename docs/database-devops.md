# Database DevOps Workflow

## Repository status

This branch is the working branch for mid-evaluation artifacts. The existing `main` branch is unchanged. The existing PPT is not used as a source for project content.

## Proposed directory structure

```text
.
├── README.md
├── database/
│   ├── schema.sql
│   └── workflows.sql
├── docs/
│   ├── project-brief.md
│   ├── er-model.md
│   ├── relational-schema.md
│   ├── normalization-worksheet.md
│   ├── mid-evaluation-report.md
│   ├── database-devops.md
│   ├── database-setup-and-demo.md
│   └── verification-notes.md
├── tests/
│   └── test-plan.md
└── presentation/  # existing PPT retained, not treated as source
```

## Local PostgreSQL workflow

1. Install PostgreSQL 15+ and ensure `psql` is available.
2. Create a disposable database, e.g. `charity_portal_dev`.
3. Apply scripts in order: `psql -v ON_ERROR_STOP=1 -d charity_portal_dev -f database/schema.sql`, then `psql -v ON_ERROR_STOP=1 -d charity_portal_dev -f database/workflows.sql`.
4. Inspect object creation using `\dt`, `\d+ campaign`, and `\df`.
5. Execute test cases from `tests/test-plan.md` and record real outcomes.
6. Make schema changes in a feature branch, review the diff, test against a clean DB, then merge deliberately.

## Safety practices

- Never commit database passwords, payment-provider secrets, real donor details, or beneficiary identity documents.
- Use synthetic sample data only.
- Keep DDL changes version-controlled and review destructive changes carefully.
- Preserve original donations; record refunds as compensating events.
- Keep fund-ledger and audit history append-only using triggers and database role privileges.
- Validate campaign status and available funds transactionally with a consistent locking strategy.

## Current limitations

- This branch contains a proposed schema and workflow helpers, but they have not been executed or tested in this conversation.
- No CI workflow is claimed to exist or to have run.
- Test results remain NOT RUN until executed against PostgreSQL.
- Production deployment would require a carefully limited database role, verified payment integration, stronger purpose-code enforcement, currency consistency checks, and explicit handling for refunds after funds have already been spent.
