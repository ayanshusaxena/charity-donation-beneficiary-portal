# Mid-Evaluation Report

**Project:** Charity Donation & Beneficiary Portal  
**Course:** Database Management Systems (CSL0311)  
**Programme:** B.Tech CSE, Semester III  
**Evaluation stage:** Mid-term PbBL evaluation  
**Status:** Draft for team review. Schema/workflow setup and the rollback-based regression script have been executed on PostgreSQL 18.6; separate-session F22/F27 outcomes are recorded. See `database-execution-report.md` and `../tests/test-plan.md` for case-level evidence, earlier failures, and remaining gaps. Fill in team details before submission.

## 1. Abstract

The Charity Donation & Beneficiary Portal is a database-oriented project intended to record charitable organizations, fundraising campaigns, donor pledges, actual donations, beneficiary verification, and disbursements. Its proposed database design emphasizes traceability and integrity: pledges are distinct from cleared donations, original donation rows are retained when a refund occurs, campaign-specific fund restrictions are modeled explicitly, and material business events are audited by workflow triggers. The schema and workflow scripts and rollback regression have execution evidence; coverage is limited to the assertions and cases listed in the test plan.

## 2. Problem definition

A charity-funding workflow can become difficult to verify when donor commitments, payments, campaign restrictions, beneficiary eligibility, and payouts are recorded separately. A design that stores only a single campaign balance cannot explain whether money is pledged, received, restricted, allocated, disbursed, or reversed. The project therefore proposes a relational database with explicit business entities and an append-style fund ledger.

## 3. Objectives

1. Store donors, organizations, campaigns, pledges, donations, beneficiaries, and disbursements with unique identifiers.
2. Require approved and active campaign state before accepting a pledge or donation.
3. Represent campaign purpose, target, schedule, and responsible organization.
4. Record actual donation payments with positive amounts and unique online transaction/receipt references.
5. Distinguish pledges from cleared funds and capture fund restrictions and movements.
6. Ensure only verified beneficiaries can receive disbursements for an approved purpose.
7. Prevent a payout from exceeding available cleared funds in the applicable campaign/restriction scope.
8. Preserve original donation data while recording refunds and reversals.
9. Maintain an audit trail for consent, approvals, beneficiary verification, and financial events.

## 4. Scope and assumptions

The deliverable is a database design and demonstration foundation. It does not claim to provide a live payment gateway or production identity-verification service. A donation transaction reference represents recorded payment-provider metadata; funds should be counted as available only after successful clearing. Anonymous donations reference an explicit anonymous donor record rather than leaving donor_id null.

This evaluation model supports multiple donations per pledge. Only cleared donation amounts net of recorded refunds count toward fulfillment; clearing rejects over-fulfillment. Currency is INR-only with no conversion model.

## 5. Requirements analysis

### Functional requirements
- Maintain donor and organization records.
- Create campaigns with organization, purpose, target, dates, approval status, and operational status.
- Record pledges independently from payments.
- Record donations, payment status, unique transaction reference, receipt, clearing, cancellation, and refund metadata.
- Record beneficiary verification and disbursement approvals/payouts.
- Track restrictions and signed fund-ledger events.
- Record auditable events, including changes to consent, approval, verification, and fund flows.

### Integrity requirements
- Primary keys identify rows; foreign keys protect defined relationships.
- CHECK and UNIQUE constraints enforce row-level amount/status/identifier conditions where possible.
- Cross-row conditions, especially available-balance and restriction-allocation checks, require transaction-level enforcement and suitable locking.
- Refunds and reversals are compensating records; original transactions are not deleted.

## 6. Proposed database design

The original project README names Donor, Organization, Campaign, Pledge, Donation, Beneficiary, Disbursement, and Audit Log as the eight core entities. To express restriction-specific accounting and balance movements, the proposal additionally includes Fund Restriction, Donation Restriction, and Fund Ledger Entry.

Refer to `er-model.md` for the ER model and `relational-schema.md` for relation keys and selected data dictionary definitions.

### Relationship summary
- Organization 1:N Campaign
- Donor 1:N Pledge
- Campaign 1:N Pledge
- Donor 1:N Donation
- Campaign 1:N Donation
- Pledge 1:N Donation; each donation may optionally refer to one pledge
- Campaign 1:N Fund Restriction
- Donation M:N Fund Restriction through Donation Restriction
- Campaign 1:N Disbursement
- Beneficiary 1:N Disbursement
- Campaign 1:N Fund Ledger Entry

## 7. Normalization

The proposed relations are organized to reduce repeating groups and update anomalies. Donor details remain in DONOR rather than being repeated in each donation; organization details remain in ORGANIZATION rather than campaign rows; beneficiary verification details remain in BENEFICIARY instead of every payout. The many-to-many assignment of donations to restrictions is represented by DONATION_RESTRICTION. See `normalization-worksheet.md` for example functional dependencies and a 1NF/2NF/3NF explanation.

## 8. Physical design and constraints

The current SQL uses INR checks, refund and refund-scope event relations, purpose category codes, consent history, pledge fulfillment workflows, and audit triggers. It uses PostgreSQL 15+ features. Schema/workflow execution is recorded in the execution report; this does not establish coverage of every constraint or runtime path.

Campaign eligibility, pledge over-fulfillment, allocation totals, refund scopes, and payout balances are checked in trigger/function workflows with row locks. Refund events, scope reversals, metadata, and audit writes share a transaction. Audit actor identity comes from application-supplied transaction-local context. A controlled purpose code cannot prove real-world expense compliance. Direct DML must be restricted; triggers are not tamper-proof against table owners/superusers. See `design-decisions.md` for decisions and limitations.

## 9. Database DevOps / repository workflow

The proposed repository layout separates database scripts, design documentation, tests, and presentation assets. SQL should be version-controlled; changes should be made on a development branch, reviewed, and tested against a disposable database before being treated as complete. Setup instructions, assumptions, schema version, and test evidence should be recorded. This report describes a proposed workflow; do not claim an automated CI pipeline exists unless one is configured and has run successfully.

## 10. Testing plan and actual results

The test plan and rollback-based SQL regression file are under `../tests/`. As recorded in the execution report, the single-session regression script completed successfully on `charity_portal_financial_review` and separate-session F22/F27 concurrency runs completed with their final invariants and cleanup verified. F21 remains PARTIAL because some failure paths lack null-reference and paid-time assertions. The test plan is the current case-level status source; a successful aggregate script run does not independently establish unasserted behavior.

The cases include campaign eligibility, unique payment identifiers, allocation limits, partial/full/failed refunds, after-spend refunds, purpose compatibility, payout caps, audit generation, and separate-session concurrency. The regression SQL uses synthetic fixtures and ends with `ROLLBACK`. Earlier failed attempts and their later corrections remain in the execution report.

## 11. Current status and limitations

The working branch is `pbl-mid-evaluation`; existing changes were preserved. Runtime evidence and its boundaries are recorded in the execution report and test plan. `charity_portal_test` was not used for these executions and must not be treated as a disposable target. Remaining limitations include caller-supplied actor context, purpose codes not proving actual expenditure, owner/superuser bypass, no debt model for post-spend refunds, and F21's remaining assertion gap. The supplied presentation file was not used or edited.

## 12. Conclusion

The branch contains the chosen INR-only accounting model, explicit refund scopes, coded purposes, audit event generation, and partial pledge fulfillment. Schema/workflow setup, regression execution, and F22/F27 concurrency evidence are recorded. Reconcile the documented remaining gaps before further testing or application integration. Production readiness is not claimed.

## Appendix: team completion fields

- Team member names and roll numbers: **[Fill in]**
- Faculty / section: **[Fill in]**
- DBMS engine and version actually tested: PostgreSQL 18.6 (see execution report for individual database runs)
- Date schema was executed: 2026-10-22 (see execution report)
- Execution evidence: `database-execution-report.md` and `../tests/test-plan.md`; add presentation screenshots only if required by the evaluation.
- Individual contributions: **[Fill in truthfully]**
