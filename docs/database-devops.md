# Database DevOps Workflow

## Repository status

This branch is the working branch for mid-evaluation artifacts. The existing `main` branch is left unchanged. The existing PPT is intentionally not used as a source for project content.

## Proposed directory structure

```text
.
├── README.md
├── database/
│   └── schema.sql
├── docs/
│   ├── project-brief.md
│   ├── er-model.md
│   ├── relational-schema.md
│   ├── normalization-worksheet.md
│   ├── mid-evaluation-report.md
│   └── database-devops.md
├── tests/
│   └── test-plan.md
└── presentation/              # existing PPT kept, not treated as deliverable source
```

## Local PostgreSQL workflow

1. Install PostgreSQL 15+ and ensure the `psql` client is available.
2. Create a disposable database, e.g. `charity_portal_dev`.
3. Run the schema: `psql -v ON_ERROR_STOP=1 -d charity_portal_dev -f database/schema.sql`.
4. Inspect object creation in `psql` using `\dt` and `\d+ campaign`.
5. Run positive and negative test cases from `tests/test-plan.md`.
6. Record actual outcomes and errors. Do not mark a test passed until it has been run.
7. Make schema changes in a feature branch, review the diff, test on a clean database, then merge deliberately.

## Safety practices

- Never commit database passwords, payment-provider secrets, real donor details, or beneficiary identity documents.
- Use synthetic sample data only.
- Keep DDL changes version-controlled and review destructive changes carefully.
- Preserve original donations; record refunds as compensating events.
- Make fund-ledger and audit history append-only using database permissions and/or triggers.
- Validate campaign status and available funds in one transaction with an appropriate locking strategy; simple row constraints cannot enforce aggregate balances.

## Current limitations

- No CI workflow is claimed to exist or to have run.
- Transactional functions/triggers for campaign eligibility, beneficiary verification, and fund balance locking are still required.
- The schema needs execution on PostgreSQL and verification of actual behavior.
- Database migrations, seed fixtures, and automated integration tests should be added after the first successful local schema run.
