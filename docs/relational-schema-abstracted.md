# DonateKaro Abstracted Relational Schema

This presentation view uses the same eight concepts and identifiers as the companion [abstracted ER model](er-model-abstracted.md). It shows selected columns only; the full physical design remains in [relational-schema.md](relational-schema.md).

## Tables

```text
DONOR
donor_id BIGINT (PK)
display_name, is_anonymous_record

PLEDGE
pledge_id BIGINT (PK)
donor_id BIGINT (FK → DONOR.donor_id)
campaign_id BIGINT (FK → CAMPAIGN.campaign_id)
pledged_amount NUMERIC(14,2), pledge_status

CAMPAIGN
campaign_id BIGINT (PK)
campaign_name, purpose_code (FK), target_amount NUMERIC(14,2), campaign_status

DONATION
donation_id BIGINT (PK)
donor_id BIGINT (FK → DONOR.donor_id)
campaign_id BIGINT (FK → CAMPAIGN.campaign_id)
pledge_id BIGINT NULL (FK → PLEDGE.pledge_id)
donation_amount NUMERIC(14,2), payment_status, receipt_number

BENEFICIARY
beneficiary_id BIGINT (PK)
beneficiary_name, verification_status

DISBURSEMENT
disbursement_id BIGINT (PK)
campaign_id BIGINT (FK → CAMPAIGN.campaign_id)
beneficiary_id BIGINT (FK → BENEFICIARY.beneficiary_id)
disbursement_amount NUMERIC(14,2), approval_status, disbursement_status

FUND LEDGER
ledger_entry_id BIGINT (PK)
campaign_id BIGINT (FK → CAMPAIGN.campaign_id)
donation_id BIGINT NULL (FK → DONATION.donation_id)
disbursement_id BIGINT NULL (FK → DISBURSEMENT.disbursement_id)
amount_delta NUMERIC(14,2), currency

AUDIT RECORD
audit_id BIGINT (PK)
actor_id, action_type, entity_type, entity_id, occurred_at
```

## Reference map and cardinality

| Reference | Optionality and multiplicity | Source |
|---|---|---|
| PLEDGE.donor_id → DONOR.donor_id | Required donor; one donor can have 0..N pledges | FK |
| PLEDGE.campaign_id → CAMPAIGN.campaign_id | Required campaign; one campaign can have 0..N pledges | FK |
| DONATION.donor_id → DONOR.donor_id | Required donor; one donor can have 0..N donations | FK |
| DONATION.campaign_id → CAMPAIGN.campaign_id | Required campaign; one campaign can have 0..N donations | FK |
| DONATION.pledge_id → PLEDGE.pledge_id | Nullable, non-unique; a pledge can link to 0..N donations | FK |
| DISBURSEMENT.campaign_id → CAMPAIGN.campaign_id | Required campaign; one campaign can have 0..N disbursements | FK |
| DISBURSEMENT.beneficiary_id → BENEFICIARY.beneficiary_id | Required beneficiary; one beneficiary can have 0..N disbursements | FK |
| FUND_LEDGER.campaign_id → CAMPAIGN.campaign_id | Required campaign; one campaign can have 0..N entries | FK |
| FUND_LEDGER.donation_id → DONATION.donation_id | Nullable; one donation can have 0..N ledger events | FK |
| FUND_LEDGER.disbursement_id → DISBURSEMENT.disbursement_id | Nullable; unique index permits at most one payout entry per disbursement | FK + unique index |
| AUDIT_RECORD.entity_type + entity_id | Polymorphic text reference; no FK and no enforced cardinality | Conceptual only |

## Physical mapping and limits

| Presentation relation | Physical table | Abstraction |
|---|---|---|
| DONOR | `donor` | Selected donor fields only |
| CAMPAIGN | `campaign` | Also has required organization and purpose-category FKs, omitted here |
| DONATION | `donation` | Original gift remains; refund data lives in omitted refund tables and signed ledger events |
| PLEDGE | `pledge` | Promise, not received money |
| BENEFICIARY | `beneficiary` | Verification fields summarized |
| DISBURSEMENT | `disbursement` | Separate payment workflow; not an automatic donation transfer |
| FUND LEDGER | `fund_ledger_entry` | Signed financial events; restriction and refund-scope detail omitted |
| AUDIT RECORD | `audit_log` | Actor/action record; polymorphic entity identity is not a foreign key |

The eight names above match the abstracted ER entity set. Campaign → Fund Ledger is a direct FK relationship. Donation → Fund Ledger and Disbursement → Fund Ledger follow nullable source FKs. The ledger connects the campaign's accounting history with donations and paid disbursements; no direct donation-to-beneficiary relation exists.

For slide readability, this view omits organization, purpose_category, fund_restriction, donation_restriction, donation_refund, donation_refund_scope, donor_consent_event, and the remaining columns and constraints. It does not replace the full relational schema. All monetary examples reflect the INR-only schema; no currency conversion is implied.

**Evidence boundary:** derived from repository SQL and documentation only. No live database was inspected.
