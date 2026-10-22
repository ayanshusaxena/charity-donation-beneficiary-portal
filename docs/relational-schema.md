# Relational Schema and Data Dictionary

**Status:** Proposed logical/physical design for evaluation. SQL implementation is in `database/schema.sql`.

Notation: `PK` = primary key, `FK` = foreign key, `UQ` = unique, `NN` = not null.

## Relational schema

- **ORGANIZATION**(`organization_id PK`, organization_name NN, registration_ref UQ, email, phone, created_at)
- **DONOR**(`donor_id PK`, display_name, email, phone, is_anonymous_record NN, created_at)
- **CAMPAIGN**(`campaign_id PK`, `organization_id FK → ORGANIZATION`, campaign_name NN, purpose NN, target_amount NN, start_date NN, end_date NN, approval_status NN, campaign_status NN, approved_by, approved_at, created_at)
- **PLEDGE**(`pledge_id PK`, `donor_id FK → DONOR`, `campaign_id FK → CAMPAIGN`, pledged_amount NN, pledged_at, pledge_status NN, notes)
- **DONATION**(`donation_id PK`, `donor_id FK → DONOR`, `campaign_id FK → CAMPAIGN`, `pledge_id UQ/FK → PLEDGE`, donation_amount NN, currency NN, payment_method NN, payment_status NN, transaction_reference UQ, receipt_number UQ, donated_at, cleared_at, `refund_of_donation_id FK → DONATION`, refund_amount, refund_recorded_at)
- **BENEFICIARY**(`beneficiary_id PK`, beneficiary_name NN, beneficiary_type NN, verification_status NN, verification_reference, verified_by, verified_at, contact_details, created_at)
- **FUND_RESTRICTION**(`restriction_id PK`, `campaign_id FK → CAMPAIGN`, restriction_code NN, restriction_name NN, approved_purpose NN, is_restricted NN, created_at; UQ(campaign_id, restriction_code))
- **DONATION_RESTRICTION**(`donation_id PK/FK → DONATION`, `restriction_id PK/FK → FUND_RESTRICTION`, restricted_amount NN)
- **DISBURSEMENT**(`disbursement_id PK`, `campaign_id FK → CAMPAIGN`, `beneficiary_id FK → BENEFICIARY`, `restriction_id`, disbursement_amount NN, approved_purpose NN, approval_status NN, disbursement_status NN, approved_by, approved_at, payment_reference UQ, requested_at, paid_at; composite FK(campaign_id, restriction_id) → FUND_RESTRICTION(campaign_id, restriction_id))
- **AUDIT_LOG**(`audit_id PK`, actor_id NN, action_type NN, entity_type NN, entity_id NN, occurred_at NN, old_values, new_values, reason, request_id)
- **FUND_LEDGER_ENTRY**(`ledger_entry_id PK`, `campaign_id FK → CAMPAIGN`, `restriction_id`, `donation_id FK → DONATION`, `disbursement_id FK → DISBURSEMENT`, entry_type NN, amount_delta NN, currency NN, occurred_at NN, external_reference, notes; composite FK(campaign_id, restriction_id) → FUND_RESTRICTION(campaign_id, restriction_id))

## Core relationship cardinalities

- ORGANIZATION 1 : N CAMPAIGN
- DONOR 1 : N PLEDGE
- CAMPAIGN 1 : N PLEDGE
- DONOR 1 : N DONATION
- CAMPAIGN 1 : N DONATION
- PLEDGE 0..1 : 0..1 DONATION in the current simplified model (unique nullable pledge_id); if partial fulfilment is needed, replace this with a PLEDGE_DONATION associative table.
- CAMPAIGN 1 : N FUND_RESTRICTION
- DONATION M : N FUND_RESTRICTION through DONATION_RESTRICTION
- CAMPAIGN 1 : N DISBURSEMENT
- BENEFICIARY 1 : N DISBURSEMENT
- FUND_RESTRICTION 1 : N DISBURSEMENT (optional restriction on a disbursement)
- CAMPAIGN 1 : N FUND_LEDGER_ENTRY
- DISBURSEMENT 1 : N AUDIT_LOG events by entity_type/entity_id (polymorphic audit reference, intentionally not a direct FK)

## Data dictionary (selected columns)

| Table.Column | Type | Meaning / rule |
|---|---|---|
| organization.organization_id | BIGINT identity | Surrogate primary key |
| organization.registration_ref | VARCHAR(100) | Optional unique registration reference |
| campaign.target_amount | NUMERIC(14,2) | Positive campaign target in currency units |
| campaign.approval_status | VARCHAR(20) | PENDING / APPROVED / REJECTED / SUSPENDED |
| campaign.campaign_status | VARCHAR(20) | DRAFT / ACTIVE / PAUSED / CLOSED / CANCELLED |
| pledge.pledged_amount | NUMERIC(14,2) | Positive promise amount; not spendable cash |
| donation.donation_amount | NUMERIC(14,2) | Positive original donation amount |
| donation.transaction_reference | VARCHAR(160) | Unique online payment reference when successful |
| donation.receipt_number | VARCHAR(80) | Unique receipt for successful online donation |
| donation.cleared_at | TIMESTAMPTZ | Marks when successful funds clear; amount is not available before clearing |
| donation.refund_amount | NUMERIC(14,2) | Amount refunded; original donation row retained |
| beneficiary.verification_status | VARCHAR(20) | Must be VERIFIED before disbursement approval/payment |
| fund_restriction.approved_purpose | TEXT | Purpose to which restricted funds may be applied |
| disbursement.disbursement_amount | NUMERIC(14,2) | Positive request; payable only after transactional balance checks |
| fund_ledger_entry.amount_delta | NUMERIC(14,2) | Signed append-style ledger delta: inflow positive, outflow/reversal negative |
| audit_log.old_values / new_values | JSONB | Snapshot fields for auditable state changes |

## Implementation caveats

- Cross-row validation of cleared funds requires a transaction that locks the relevant campaign/restriction balance scope; a row-level CHECK constraint alone is insufficient.
- The schema separates source transactions from fund-ledger entries. Ledger entries should be appended in the same DB transaction as the corresponding business event.
- Donation restrictions are modeled as an allocation relationship. The sum of restriction allocations per donation must not exceed its cleared, unrefunded amount; enforce in transactional logic.
- For truly partial pledge fulfillment, model PLEDGE_DONATION as an associative table, rather than the unique nullable pledge_id in this initial simplified schema.
- The audit table is polymorphic. For stronger referential guarantees, use entity-specific audit foreign keys or audit triggers.
