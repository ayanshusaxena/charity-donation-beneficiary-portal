# Charity Donation & Beneficiary Portal

A DBMS Problem-Based Learning project for B.Tech CSE Semester III, DBMS (CSL0311).

## Project

The portal's database design covers organizations and campaigns, donor pledges and donations, beneficiary verification, disbursements, audit history, and campaign-specific fund restrictions. It is designed to keep pledged amounts separate from cleared donations and to preserve refund/reversal history.

## Design artifacts

- [Project brief](docs/project-brief.md)
- [ER model and relationship cardinalities](docs/er-model.md)
- [Relational schema and selected data dictionary](docs/relational-schema.md)
- [Normalization worksheet](docs/normalization-worksheet.md)
- [Mid-Evaluation Report draft](docs/mid-evaluation-report.md)
- [Database DevOps workflow](docs/database-devops.md)
- [Database test plan](tests/test-plan.md)
- [PostgreSQL physical schema](database/schema.sql)

## Repository status

The `pbl-mid-evaluation` branch contains a proposed database design and supporting documentation. The pre-existing `main` branch was left unchanged, and `presentation/DBMS.pptx` was not used as a source for these artifacts.

**Important:** the SQL schema and workflow are not yet represented as successfully executed or fully tested. The campaign-state gate, beneficiary-verification gate, aggregate fund-availability lock, refund ledger workflow, and append-only protections are called out as transactional follow-up work. See the SQL comments and test plan. Do not describe those rules as implemented until the guards have been added and tested.

## Database engine

The current DDL targets PostgreSQL 15+. Create a disposable database and execute:

```bash
psql -v ON_ERROR_STOP=1 -d charity_portal_dev -f database/schema.sql
```

Then run and document tests from `tests/test-plan.md`. Use synthetic data only; never commit passwords, live payment secrets, or real beneficiary identity records.

## Academic information

- Subject: Database Management Systems (DBMS)
- Subject code: CSL0311
- Programme: B.Tech CSE
- Semester: III
- Project type: PbBL

## Team details

Add team member names, roll numbers, and actual contributions before submission. Only report tests and features that have been verified.
