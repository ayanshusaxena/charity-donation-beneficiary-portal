# Mid-Evaluation Report

**Project:** Charity Donation & Beneficiary Portal  
**Course:** Database Management Systems (CSL0311)  
**Programme:** B.Tech CSE, Semester III  
**Evaluation stage:** Mid-term PbBL evaluation  
**Status:** Draft report for team review. Fill in all team-member names, roll numbers, faculty details, and only claim implementation/testing that the team has actually completed.

## 1. Abstract

The Charity Donation & Beneficiary Portal is a database-oriented project intended to record charitable organizations, fundraising campaigns, donor pledges, actual donations, beneficiary verification, and disbursements. Its database design emphasizes traceability and integrity: pledges are distinct from cleared donations, original donation rows are retained when a refund occurs, campaign-specific fund restrictions are modeled explicitly, and material business events are auditable.

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

The current simplified relational model permits at most one donation per pledge. If the team requires partial fulfilment or multiple donations per pledge, a PLEDGE_DONATION associative table should replace this simplified relationship.

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
- Pledge 0..1:0..1 Donation in the current simplified model
- Campaign 1:N Fund Restriction
- Donation M:N Fund Restriction through Donation Restriction
- Campaign 1:N Disbursement
- Beneficiary 1:N Disbursement
- Campaign 1:N Fund Ledger Entry

## 7. Normalization

The proposed relations are organized to reduce repeating groups and update anomalies. Donor details remain in DONOR rather than being repeated in each donation; organization details remain in ORGANIZATION rather than campaign rows; beneficiary verification details remain in BENEFICIARY instead of every payout. The many-to-many assignment of donations to restrictions is represented by DONATION_RESTRICTION. See `normalization-worksheet.md` for example functional dependencies and a 1NF/2NF/3NF explanation.

## 8. Physical design and constraints

The initial SQL uses PostgreSQL syntax, identity primary keys, `NUMERIC(14,2)` for monetary values, `TIMESTAMPTZ` for event times, foreign keys, uniqueness conditions, status domains, positive-amount checks, and indexes for commonly queried relationships. JSONB is used only for optional snapshots/contact data, not to replace core relational entities.

The schema alone does not fully enforce all business rules. The team must explain that cross-row balance checks and state transitions belong in atomic transactions or stored procedures. Ledger/audit append-only behavior also needs database privileges or triggers. See `../database/schema.sql` and its implementation notes.

## 9. Database DevOps / repository workflow

The proposed repository layout separates database scripts, design documentation, tests, and presentation assets. SQL should be version-controlled; changes should be made on a development branch, reviewed, and tested against a disposable database before being treated as complete. Setup instructions, assumptions, schema version, and test evidence should be recorded. This report describes a proposed workflow; do not claim an automated CI pipeline exists unless one is configured and has run successfully.

## 10. Testing plan

The following test scenarios should be run and results added before final submission:

| Test | Expected result |
|---|---|
| Insert donation with amount 0 or negative | Rejected by CHECK constraint |
| Duplicate online transaction reference | Rejected by UNIQUE constraint |
| Successful online donation missing receipt/reference | Rejected by CHECK constraint |
| Insert campaign with end date before start date | Rejected by CHECK constraint |
| Donation to unapproved/inactive campaign | Rejected by transaction-level workflow guard (to be implemented/tested) |
| Disbursement to unverified beneficiary | Rejected by transaction-level workflow guard (to be implemented/tested) |
| Disbursement greater than cleared available funds | Rejected by locked balance check (to be implemented/tested) |
| Refund donation | Original donation remains; compensating ledger event is added |
| Review audit/ledger history | Prior events remain traceable; deletion/update prevention must be configured and tested |

**Do not mark a test as passed until the team has actually run it.**

## 11. Current status and limitations

Repository review found a README describing the project and an existing presentation file. The database scripts and design artifacts in the `pbl-mid-evaluation` branch are being introduced as a proposed design baseline. They should be reviewed by the team, executed on PostgreSQL, and updated based on actual test results before being described as a validated implementation.

## 12. Conclusion

The proposed model provides a normalized foundation for tracking charity campaigns, donor commitments, actual received funds, restrictions, disbursements, reversals, and audit events. The key next milestone is to execute and test the schema, implement transactional guards for campaign status and fund availability, produce diagram exports, and prepare a presentation consistent with verified progress.

## Appendix: team completion fields

- Team member names and roll numbers: **[Fill in]**
- Faculty / section: **[Fill in]**
- DBMS engine and version actually tested: **[Fill in]**
- Date schema was executed: **[Fill in]**
- Test evidence / screenshots: **[Add after testing]**
- Individual contributions: **[Fill in truthfully]**
