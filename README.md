# Charity Donation & Beneficiary Portal

A DBMS Problem-Based Learning project for B.Tech CSE Semester III, DBMS (CSL0311).

## Project

The portal's database design covers organizations and campaigns, donor pledges and donations, beneficiary verification, disbursements, audit history, and campaign-specific fund restrictions. It keeps pledged amounts distinct from cleared donations and preserves refund/reversal history.

## Design artifacts

- [Project brief](docs/project-brief.md)
- [ER model and relationship cardinalities](docs/er-model.md)
- [Relational schema and selected data dictionary](docs/relational-schema.md)
- [Normalization worksheet](docs/normalization-worksheet.md)
- [Mid-evaluation report draft](docs/mid-evaluation-report.md)
- [Database DevOps workflow](docs/database-devops.md)
- [Database setup and demo instructions](docs/database-setup-and-demo.md)
- [Implementation verification checklist](docs/verification-notes.md)
- [Database test plan](tests/test-plan.md)
- [Financial-integrity design decisions](docs/design-decisions.md)
- [Rollback-based regression SQL](tests/financial-integrity.sql)
- [PostgreSQL physical schema](database/schema.sql)
- [Transactional workflow helpers](database/workflows.sql)

## Repository status

The `pbl-mid-evaluation` branch contains a proposed database design and supporting documentation. The pre-existing `main` branch is unchanged, and `presentation/DBMS.pptx` was not used as a source for these artifacts.

**Execution status:** The current schema and workflows, and the rollback-based financial-integrity regression script, have been executed on PostgreSQL 18.6. The test plan records the single-session cases and the separately executed F22/F27 concurrency tests. Earlier failed attempts and subsequent successful runs are preserved in `docs/database-execution-report.md`; not every behavior or requirement is fully covered. See `docs/design-decisions.md`, `docs/verification-notes.md`, and `tests/test-plan.md` for decisions, limits, and remaining gaps.

## Database engine

The current DDL targets PostgreSQL 15+. First inspect the target database and use a new isolated database name confirmed not to exist; neither script is a safe reset for a populated database. Then run with interactive password entry if authentication prompts:

```bash
psql -X -W -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_portal_dev -f database/schema.sql
psql -X -W -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_portal_dev -f database/workflows.sql
```

Complete the tests from `tests/test-plan.md` and record actual outcomes. Use synthetic data only; never commit passwords, live payment secrets, real donor details, or beneficiary identity records.

## Academic information

- Subject: Database Management Systems (DBMS)
- Subject code: CSL0311
- Programme: B.Tech CSE
- Semester: III
- Project type: PbBL

## Team details

Add team member names, roll numbers, and real individual contributions before submission. Only report tests and features that have been verified.
