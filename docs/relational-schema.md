# Relational Schema and Data Dictionary

**Status:** Logical/physical design aligned to the current SQL. Schema/workflow setup and regression execution are recorded in `database-execution-report.md`; individual coverage and remaining gaps are in `../tests/test-plan.md`.

Notation: `PK` primary key; `FK` foreign key; `UQ` unique; `NN` not null.

## Relations

- **PURPOSE_CATEGORY**(`purpose_code PK`, purpose_name UQ/NN, description NN): controlled classification vocabulary; seed values are GENERAL, FOOD, EDUCATION, HEALTH, SHELTER.
- **ORGANIZATION**(`organization_id PK`, organization_name NN, registration_ref UQ, email, phone, created_at).
- **DONOR**(`donor_id PK`, display_name, email, phone, is_anonymous_record NN, created_at); partial unique index permits at most one anonymous record; its check requires empty identity fields.
- **CAMPAIGN**(`campaign_id PK`, `organization_id FK`, campaign_name NN, purpose NN, `purpose_code FK`, target_amount NN, start_date NN, end_date NN, approval_status NN, campaign_status NN, approved_by, approved_at, created_at). All monetary values are INR.
- **PLEDGE**(`pledge_id PK`, `donor_id FK`, `campaign_id FK`, pledged_amount NN, pledged_at, pledge_status NN, notes). Status is workflow-derived.
- **DONATION**(`donation_id PK`, `donor_id FK`, `campaign_id FK`, `pledge_id FK NULL`, donation_amount NN, currency NN = INR, payment_method NN, payment_status NN, transaction_reference UQ, receipt_number UQ, donated_at, cleared_at, refunded_amount NN). `UNIQUE(donation_id,campaign_id)` supports scoped composite references. A pledge can have many donations.
- **BENEFICIARY**(`beneficiary_id PK`, beneficiary_name NN, beneficiary_type NN, verification_status NN, verification_reference, verified_by, verified_at, contact_details, created_at).
- **FUND_RESTRICTION**(`restriction_id PK`, `campaign_id FK`, restriction_code NN, restriction_name NN, `allowed_purpose_code FK`, created_at; UQ(campaign_id, restriction_code), UQ(campaign_id, restriction_id)).
- **DONATION_RESTRICTION**(`donation_id`, `campaign_id`, `restriction_id`, restricted_amount NN; PK(donation_id,restriction_id); composite FKs enforce the donation and restriction campaign match).
- **DONATION_REFUND**(`refund_id PK`, `donation_id FK`, `campaign_id`, `refund_reference UQ/NN`, refund_amount NN, reason NN, recorded_at; composite FK to donation).
- **DONATION_REFUND_SCOPE**(`refund_scope_id PK`, `refund_id`, `campaign_id`, `donation_id`, `restriction_id NULL`, amount NN; composite FKs retain original donation/campaign/restriction scope; unique nulls not distinct per refund/scope).
- **DISBURSEMENT**(`disbursement_id PK`, `campaign_id FK`, `beneficiary_id FK`, `restriction_id NULL`, disbursement_amount NN, approved_purpose NN, `purpose_code FK`, approval_status NN, disbursement_status NN, approved_by, approved_at, payment_reference UQ, requested_at, paid_at; composite FK for campaign/restriction).
- **DONOR_CONSENT_EVENT**(`consent_event_id PK`, `donor_id FK`, consent_purpose NN, consent_action NN, occurred_at NN, actor_id NN, details).
- **FUND_LEDGER_ENTRY**(`ledger_entry_id PK`, `campaign_id FK`, `restriction_id NULL`, `donation_id NULL`, `disbursement_id NULL`, `refund_scope_id NULL UQ`, entry_type NN, amount_delta NN, currency NN = INR, occurred_at NN, external_reference, notes; source and scope composite FKs).
- **AUDIT_LOG**(`audit_id PK`, actor_id NN, action_type NN, entity_type NN, entity_id NN, occurred_at NN, old_values, new_values, reason, request_id). Entity reference is polymorphic.

## Selected data dictionary

| Column | Type | Meaning and enforcement |
|---|---|---|
| campaign.target_amount | NUMERIC(14,2) | Positive INR fundraising target |
| campaign.purpose_code | VARCHAR(40) | Controlled campaign purpose category |
| pledge.pledged_amount | NUMERIC(14,2) | Promise only; not cleared cash |
| pledge.pledge_status | VARCHAR(20) | OPEN / PARTIALLY_FULFILLED / FULFILLED / CANCELLED; maintained by workflows |
| donation.donation_amount | NUMERIC(14,2) | Immutable source amount; positive INR |
| donation.currency | CHAR(3) | Checked to INR; no conversion is performed |
| donation.payment_status | VARCHAR(20) | Pending, successful, failed, cancelled, partially refunded, or refunded |
| donation.transaction_reference | VARCHAR(160) | Optional except on successful online payment; unique |
| donation.receipt_number | VARCHAR(80) | Required and unique for successful online payment; supplied by caller |
| donation.refunded_amount | NUMERIC(14,2) | Cumulative summary maintained by refund operation; bounded by original amount |
| donation_restriction.restricted_amount | NUMERIC(14,2) | Original allocation to one campaign restriction; aggregate may not exceed donation amount |
| donation_refund.refund_amount | NUMERIC(14,2) | Immutable refund event amount; all refund events must sum to at most original donation |
| donation_refund_scope.restriction_id | BIGINT NULL | NULL denotes unrestricted remainder; otherwise the original restricted pool |
| disbursement.purpose_code | VARCHAR(40) | Must match campaign purpose for unrestricted funds or restriction allowed code |
| fund_ledger_entry.amount_delta | NUMERIC(14,2) | Positive clearing; negative refund/disbursement; INR only |
| audit_log.actor_id | VARCHAR(160) | Supplied through transaction-local application actor context; not independently authenticated by PostgreSQL |

## Accounting and normalization rules

- **Pledged:** sum of pledge promises; never entered as ledger cash.
- **Cleared received:** positive donation-clearing ledger entries only.
- **Restricted:** clearing entries keyed to a restriction.
- **Unrestricted:** clearing remainder with `restriction_id IS NULL`.
- **Refunded:** negative ledger entries tied to refund scopes, plus immutable refund event rows.
- **Disbursed:** negative ledger entries tied to a paid disbursement.
- **Available:** signed ledger sum within one campaign and one scope. All entries are INR.

The current relations are intended to be in 3NF: entity attributes depend on their keys; purpose names are separated into PURPOSE_CATEGORY; donor, organization, and beneficiary facts are not copied into payment rows; associative relations hold relationship-specific amounts. `pledge_status` and `donation.refunded_amount` are deliberate workflow-maintained summaries for usability and must reconcile to donation/refund events.

See [design decisions](design-decisions.md) for refund scope policy, purpose-code limits, actor assumptions, and locking rationale. The SQL is an initializer, not a migration. Runtime evidence covers the executions listed in the report and test plan; behavior outside those assertions is not thereby verified.
