# Charity Donation & Beneficiary Portal

## Project brief (design baseline)

**Course:** DBMS (CSL0311), B.Tech CSE, Semester III  
**Project type:** Problem-Based Learning (PbBL)

### Problem statement
Charity campaigns need a consistent way to trace donor commitments, actual donations, restrictions on funds, beneficiary verification, and disbursements. The database should support traceability and auditable fund movements rather than relying on a single mutable campaign balance.

### Objectives
- Record donors, organizations, campaigns, pledges, donations, beneficiaries, disbursements, and audit events.
- Prevent pledges and donations to campaigns that are not both approved and active.
- Preserve payment and refund history.
- Separate pledged, received, restricted, allocated, and disbursed amounts.
- Prevent disbursement to unverified beneficiaries or beyond available cleared funds for a campaign and restriction.
- Retain an audit trail for consent, approvals, verification, and fund movements.

### Supplied business rules
1. Donors, campaigns, and beneficiaries have unique identifiers.
2. Only approved and active campaigns accept pledges or donations.
3. Every campaign defines purpose, target amount, start/end date, and responsible organization.
4. Donation amount is positive and linked to a donor or an explicitly anonymous donor record.
5. Successful online donations have unique transaction references and receipt numbers.
6. Pledged, received, restricted, allocated, and disbursed amounts are recorded separately.
7. Disbursements require verified beneficiaries and an approved campaign purpose.
8. Disbursement cannot exceed available cleared funds for the campaign and restriction.
9. Cancelled/refunded donations reverse available balances without deleting original transactions.
10. Donor consent, campaign approvals, fund movements, beneficiary verification, and disbursements are auditable.

### Proposed design baseline
The README describes eight core entities: Donor, Organization, Campaign, Pledge, Donation, Beneficiary, Disbursement, and Audit Log. This implementation will add an explicit `fund_restriction` concept and an append-only `fund_ledger_entry` table because a single balance column cannot reliably represent the required states and reversals. These are design choices, not claims that the old repository already implemented them.

### Financial-integrity decisions for this evaluation
- Currency scope is INR-only; all campaign targets and financial movements use INR and no conversion is implied.
- A pledge can be fulfilled by multiple donations. Only successfully cleared, net-of-refund amounts count; a row lock prevents concurrent over-fulfillment.
- Each refund is an append-only event tied to its original donation and allocated back to original restricted/unrestricted scopes. If scope funds have already been spent, the refund fails atomically; there is no debt/negative-balance exception model.
- Purpose compatibility uses controlled purpose codes. The database validates code compatibility but does not prove an actual expense matched the selected classification.
- Sensitive workflow audit records use a transaction-local actor context supplied by the calling application. It is not independently authenticated and is not protected against table owners/superusers.

See [design decisions](design-decisions.md) for detailed policy and concurrency rationale.

### Scope for mid-evaluation
- Conceptual ER model and relationship cardinalities
- Logical relational schema and normalization worksheet
- SQL physical schema with constraints and indexes
- Data dictionary and reproducible sample data / demonstration queries
- Repository documentation and database development workflow
- Report and presentation materials derived from these artifacts

### Out of scope for this design-stage deliverable
A production payment gateway, real money movement, legal identity verification service, and deployment of a public web application. Online payment references are modeled as records; no live payment integration is claimed.

### Important implementation note
Cross-row monetary rules (such as checking available funds before a disbursement) must be enforced transactionally, not merely by a `CHECK` constraint on one row. The final SQL will document which rules are enforced by constraints and which require stored procedure / transaction logic for the chosen DBMS.
