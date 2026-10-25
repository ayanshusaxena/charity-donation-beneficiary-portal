# DonateKaro Relational Schema — Source Extraction

> **Purpose and scope.** This standalone reference is extracted from the repository's `database/schema.sql` and `database/workflows.sql`. It describes the authored PostgreSQL design, not a live catalog inspection. The source declares 15 tables and 32 foreign-key constraints. PostgreSQL 15+ is required by the `UNIQUE NULLS NOT DISTINCT` constraints; the schema header recommends PostgreSQL 15+. Amounts and ledger currency are INR-only.
>
> **Evidence labels.** **Declarative** means enforced by column definitions, `CHECK`, `UNIQUE`, `PRIMARY KEY`, foreign key, or index in `schema.sql`. **Workflow** means enforced by triggers/functions in `workflows.sql`. **Documented/app assumption** means not independently guaranteed by these SQL files. The initializers are setup scripts, not migrations or reset scripts. This document does not claim live-database verification.

## Conventions and global observations

- Unless listed as nullable, columns below are `NOT NULL`. A primary key is non-null even where the column line omits an explicit `NOT NULL` token.
- `GENERATED ALWAYS AS IDENTITY` is the exact generation rule for numeric surrogate primary keys.
- No foreign key specifies `ON DELETE` or `ON UPDATE`; PostgreSQL's default `NO ACTION` applies. No cascade behavior is declared.
- No exclusion constraint is declared. Statuses are `VARCHAR` columns constrained by `CHECK`, not PostgreSQL enum types.
- Named and unnamed constraints are both included below. PostgreSQL may generate names for unnamed constraints.
- In the FK inventory, each FK column set references the parent column set in the same order. Across the 15 tables there are 32 declared FK constraints, including direct and composite constraints that reinforce the same logical relationship.

## Tables

### 1. `purpose_category`

Controlled classification lookup. The source seeds `GENERAL`, `FOOD`, `EDUCATION`, `HEALTH`, and `SHELTER`; the table itself does not restrict codes to only those values.

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `purpose_code` | `VARCHAR(40)` | NOT NULL | Primary key |
| `purpose_name` | `VARCHAR(120)` | NOT NULL | UNIQUE |
| `description` | `TEXT` | NOT NULL | — |

**Workflow/application rules:** Database FK references ensure a referenced code exists. The vocabulary is seeded by the initializer; additions/removals are not prevented by a code-list `CHECK`.

### 2. `organization`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `organization_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `organization_name` | `VARCHAR(160)` | NOT NULL | — |
| `registration_ref` | `VARCHAR(100)` | NULL | UNIQUE; PostgreSQL permits multiple NULLs |
| `email` | `VARCHAR(254)` | NULL | — |
| `phone` | `VARCHAR(30)` | NULL | — |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |

### 3. `donor`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `donor_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `display_name` | `VARCHAR(160)` | NULL | — |
| `email` | `VARCHAR(254)` | NULL | — |
| `phone` | `VARCHAR(30)` | NULL | — |
| `is_anonymous_record` | `BOOLEAN` | NOT NULL; `FALSE` | `donor_identity_check`: when true, `display_name`, `email`, and `phone` must all be NULL; when false, this check imposes no identity-field requirement |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |

**Index:** partial unique `donor_one_anonymous_record` on `is_anonymous_record` with predicate `WHERE is_anonymous_record`; this allows at most one anonymous-record row. It does not guarantee that such a row exists. The schema comment expects setup to create one and applications to refer anonymous gifts to it.

### 4. `campaign`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `campaign_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `organization_id` | `BIGINT` | NOT NULL | FK → `organization(organization_id)` |
| `campaign_name` | `VARCHAR(180)` | NOT NULL | — |
| `purpose` | `TEXT` | NOT NULL | — |
| `purpose_code` | `VARCHAR(40)` | NOT NULL | FK → `purpose_category(purpose_code)` |
| `target_amount` | `NUMERIC(14,2)` | NOT NULL | CHECK `target_amount > 0` |
| `start_date` | `DATE` | NOT NULL | — |
| `end_date` | `DATE` | NOT NULL | `campaign_dates_check`: `end_date >= start_date` |
| `approval_status` | `VARCHAR(20)` | NOT NULL; `'PENDING'` | CHECK in `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED` |
| `campaign_status` | `VARCHAR(20)` | NOT NULL; `'DRAFT'` | CHECK in `DRAFT`, `ACTIVE`, `PAUSED`, `CLOSED`, `CANCELLED` |
| `approved_by` | `VARCHAR(160)` | NULL | — |
| `approved_at` | `TIMESTAMPTZ` | NULL | `campaign_approval_metadata_check`: `APPROVED` requires non-NULL `approved_at`; other approval states have no constraint from this check |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |

**Indexes:** `idx_campaign_org_status(organization_id, approval_status, campaign_status)`.

**Workflow rules:** `guard_campaign_state` requires new rows to start `PENDING`/`DRAFT`, requires actor context for approval/status changes, stamps approver/time on approval, and permits `ACTIVE` only when approved and current date is within the inclusive campaign dates. `audit_campaign_change` records approval/status transitions. `assert_campaign_accepts_funds` is used by pledge/donation guards and locks the campaign row while validating approval, active status, and dates.

### 5. `pledge`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `pledge_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `donor_id` | `BIGINT` | NOT NULL | FK → `donor(donor_id)` |
| `campaign_id` | `BIGINT` | NOT NULL | FK → `campaign(campaign_id)` |
| `pledged_amount` | `NUMERIC(14,2)` | NOT NULL | CHECK `pledged_amount > 0` |
| `pledged_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |
| `pledge_status` | `VARCHAR(20)` | NOT NULL; `'OPEN'` | CHECK in `OPEN`, `PARTIALLY_FULFILLED`, `FULFILLED`, `CANCELLED` |
| `notes` | `TEXT` | NULL | — |

**Indexes:** `idx_pledge_donor(donor_id)`, `idx_pledge_campaign(campaign_id)`.

**Workflow rules:** `guard_pledge_campaign` requires eligible campaigns, keeps donor/campaign immutable once donations link, protects received net amount from pledge reduction, and blocks cancellation after cleared receipts. `refresh_pledge_status` derives status from net cleared donations less refunds; multiple donations may fulfill one pledge. Status changes are workflow-maintained. `cancel_pledge` is the cancellation operation.

### 6. `donation`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `donation_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `donor_id` | `BIGINT` | NOT NULL | FK → `donor(donor_id)` |
| `campaign_id` | `BIGINT` | NOT NULL | FK → `campaign(campaign_id)` |
| `pledge_id` | `BIGINT` | NULL | FK → `pledge(pledge_id)` |
| `donation_amount` | `NUMERIC(14,2)` | NOT NULL | CHECK `donation_amount > 0` |
| `currency` | `CHAR(3)` | NOT NULL; `'INR'` | CHECK `currency = 'INR'` |
| `payment_method` | `VARCHAR(20)` | NOT NULL | CHECK in `ONLINE`, `BANK_TRANSFER`, `CASH`, `CHEQUE`, `OTHER` |
| `payment_status` | `VARCHAR(20)` | NOT NULL; `'PENDING'` | CHECK in `PENDING`, `SUCCESSFUL`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED` |
| `transaction_reference` | `VARCHAR(160)` | NULL | UNIQUE |
| `receipt_number` | `VARCHAR(80)` | NULL | UNIQUE |
| `donated_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |
| `cleared_at` | `TIMESTAMPTZ` | NULL | — |
| `refunded_amount` | `NUMERIC(14,2)` | NOT NULL; `0` | CHECK between zero and `donation_amount` inclusive |

Additional declarative rules: UNIQUE `(donation_id, campaign_id)` is a composite FK target. `donation_online_success_ref_check` requires nonblank transaction and receipt references for successful, partially refunded, or refunded ONLINE donations. `donation_refund_status_check` ties refund amount to `PARTIALLY_REFUNDED`/`REFUNDED` states and requires zero refunded amount for other statuses. `donation_cleared_check` allows `cleared_at` only for successful/refund terminal states.

**Indexes:** `idx_donation_pledge_status(pledge_id, payment_status, cleared_at)`, `idx_donation_campaign_status(campaign_id, payment_status, cleared_at)`, `idx_donation_donor_date(donor_id, donated_at)`. The unique indexes backing the two references are implicit from UNIQUE constraints.

**Workflow rules:** `guard_donation_write` requires pending insertion, an eligible campaign, valid linked pledge donor/campaign, INR, permitted state transitions and pledge capacity. `clear_donation` drives successful clearing; `record_donation_clearing` posts ledger/audit events. Donations cannot be deleted by the workflow trigger. Refund metadata is workflow-maintained.

### 7. `beneficiary`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `beneficiary_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `beneficiary_name` | `VARCHAR(180)` | NOT NULL | — |
| `beneficiary_type` | `VARCHAR(20)` | NOT NULL | CHECK in `INDIVIDUAL`, `GROUP`, `ORGANIZATION` |
| `verification_status` | `VARCHAR(20)` | NOT NULL; `'PENDING'` | CHECK in `PENDING`, `VERIFIED`, `REJECTED`, `SUSPENDED` |
| `verification_reference` | `VARCHAR(160)` | NULL | — |
| `verified_by` | `VARCHAR(160)` | NULL | — |
| `verified_at` | `TIMESTAMPTZ` | NULL | — |
| `contact_details` | `JSONB` | NULL | — |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |

`beneficiary_verification_metadata_check` requires `verified_at` when status is `VERIFIED`; it does not require verified metadata in other states. Workflow triggers require initial `PENDING`, stamp actor/time on verification, and audit status changes.

### 8. `fund_restriction`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `restriction_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `campaign_id` | `BIGINT` | NOT NULL | FK → `campaign(campaign_id)` |
| `restriction_code` | `VARCHAR(60)` | NOT NULL | UNIQUE with `campaign_id` |
| `restriction_name` | `VARCHAR(160)` | NOT NULL | — |
| `allowed_purpose_code` | `VARCHAR(40)` | NOT NULL | FK → `purpose_category(purpose_code)` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |

Composite UNIQUE `(campaign_id, restriction_id)` is a target for scope-validating FKs. The purpose code is a controlled classification; it is not legal or operational proof of spending purpose.

### 9. `donation_restriction`

Associative allocation table between donations and restrictions.

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `donation_id` | `BIGINT` | NOT NULL | Direct FK → `donation(donation_id)`; part of PK |
| `campaign_id` | `BIGINT` | NOT NULL | Part of composite campaign-consistency FKs |
| `restriction_id` | `BIGINT` | NOT NULL | Direct FK → `fund_restriction(restriction_id)`; part of PK |
| `restricted_amount` | `NUMERIC(14,2)` | NOT NULL | CHECK `> 0` |

PK `(donation_id, restriction_id)`. Composite FKs `(donation_id, campaign_id)` → `donation(donation_id, campaign_id)` and `(campaign_id, restriction_id)` → `fund_restriction(campaign_id, restriction_id)` prevent cross-campaign allocations. The trigger locks the donation, limits total allocations to donation amount, and freezes allocations after clearing. The aggregate cap is workflow-enforced, not a row-local CHECK.

### 10. `donation_refund`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `refund_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `donation_id` | `BIGINT` | NOT NULL | Direct FK → `donation(donation_id)` |
| `campaign_id` | `BIGINT` | NOT NULL | Composite FK with donation |
| `refund_reference` | `VARCHAR(160)` | NOT NULL | UNIQUE |
| `refund_amount` | `NUMERIC(14,2)` | NOT NULL | CHECK `> 0` |
| `reason` | `TEXT` | NOT NULL | — |
| `recorded_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |

UNIQUE `(refund_id, campaign_id, donation_id)` supports the refund-scope FK. Composite FK `(donation_id, campaign_id)` → `donation(donation_id, campaign_id)` prevents campaign mismatch. Index `idx_refund_donation(donation_id, recorded_at)`. Workflow inserts are through `post_donation_refund`; refund rows are append-only.

### 11. `donation_refund_scope`

One refund can reverse multiple original ledger scopes. `restriction_id IS NULL` represents the donation's unrestricted portion.

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `refund_scope_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `refund_id` | `BIGINT` | NOT NULL | Direct FK → `donation_refund(refund_id)` |
| `campaign_id` | `BIGINT` | NOT NULL | Composite FKs below |
| `donation_id` | `BIGINT` | NOT NULL | Composite FKs below |
| `restriction_id` | `BIGINT` | NULL | Composite FK to same-campaign restriction when non-NULL |
| `amount` | `NUMERIC(14,2)` | NOT NULL | CHECK `> 0` |

UNIQUE NULLS NOT DISTINCT `(refund_id, restriction_id)`; UNIQUE NULLS NOT DISTINCT `(refund_scope_id, campaign_id, restriction_id, donation_id)`; UNIQUE `(refund_scope_id, campaign_id, donation_id)`. Composite FKs `(refund_id, campaign_id, donation_id)` → refund; and `(campaign_id, restriction_id)` → restriction. Index `idx_refund_scope_restriction(restriction_id, refund_id)`. Workflow allocates refunds in restriction-ID order, unrestricted last, without borrowing across scopes, and appends one matching negative ledger row per scope. Declarative constraints do not enforce the sum of scope amounts against the refund header; the function/transaction does.

### 12. `disbursement`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `disbursement_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `campaign_id` | `BIGINT` | NOT NULL | FK → campaign |
| `beneficiary_id` | `BIGINT` | NOT NULL | FK → beneficiary |
| `restriction_id` | `BIGINT` | NULL | Composite FK to campaign restriction |
| `disbursement_amount` | `NUMERIC(14,2)` | NOT NULL | CHECK `> 0` |
| `approved_purpose` | `TEXT` | NOT NULL | Free-text description |
| `purpose_code` | `VARCHAR(40)` | NOT NULL | FK → purpose category |
| `approval_status` | `VARCHAR(20)` | NOT NULL; `'PENDING'` | CHECK in `PENDING`, `APPROVED`, `REJECTED` |
| `disbursement_status` | `VARCHAR(20)` | NOT NULL; `'PENDING'` | CHECK in `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `CANCELLED` |
| `approved_by` | `VARCHAR(160)` | NULL | — |
| `approved_at` | `TIMESTAMPTZ` | NULL | — |
| `payment_reference` | `VARCHAR(160)` | NULL | UNIQUE |
| `requested_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |
| `paid_at` | `TIMESTAMPTZ` | NULL | — |

Named constraints: `disbursement_campaign_restriction_fk` `(campaign_id, restriction_id)` → `fund_restriction(campaign_id, restriction_id)`; `disbursement_id_campaign_unique` on `(disbursement_id, campaign_id)`; `disbursement_reference_nonblank` allows NULL or requires `BTRIM(payment_reference) <> ''`; `disbursement_approval_metadata_check` requires `approved_at` for APPROVED; `disbursement_paid_metadata_check` requires timestamp and nonblank reference for PAID. Index `idx_disbursement_campaign_status(campaign_id, disbursement_status)`.

Workflow guards require pending insert, constrain approval/payment transitions, require verified beneficiary, enforce purpose-code match for the selected restriction or campaign, and lock the campaign before checking scoped available funds. `pay_disbursement` records the payment; its trigger writes ledger and audit atomically with the state change.

### 13. `audit_log`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `audit_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `actor_id` | `VARCHAR(160)` | NOT NULL | — |
| `action_type` | `VARCHAR(80)` | NOT NULL | — |
| `entity_type` | `VARCHAR(80)` | NOT NULL | — |
| `entity_id` | `VARCHAR(100)` | NOT NULL | — |
| `occurred_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |
| `old_values` | `JSONB` | NULL | — |
| `new_values` | `JSONB` | NULL | — |
| `reason` | `TEXT` | NULL | — |
| `request_id` | `VARCHAR(120)` | NULL | — |

Index `idx_audit_entity_date(entity_type, entity_id, occurred_at)`. There is intentionally no FK from `(entity_type, entity_id)` to business tables: this is a polymorphic textual reference. Workflow stamps actor and prevents update/delete. Actor authentication is not established by the column or trigger.

### 14. `fund_ledger_entry`

Append-oriented signed financial events. Positive values are clearing inflows; refund and disbursement outflows are negative. Available balances are derived from signed entries by campaign and restriction scope; there is no mutable balance table.

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `ledger_entry_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `campaign_id` | `BIGINT` | NOT NULL | Direct FK → campaign |
| `restriction_id` | `BIGINT` | NULL | Composite FK → same-campaign restriction |
| `donation_id` | `BIGINT` | NULL | Direct FK → donation and composite campaign FK |
| `disbursement_id` | `BIGINT` | NULL | Direct FK → disbursement and composite campaign FK |
| `refund_scope_id` | `BIGINT` | NULL | UNIQUE direct FK → refund scope; two composite scope FKs |
| `entry_type` | `VARCHAR(30)` | NOT NULL | CHECK in `DONATION_CLEARING`, `DONATION_REFUND`, `DISBURSEMENT` |
| `amount_delta` | `NUMERIC(14,2)` | NOT NULL | CHECK `<> 0` |
| `currency` | `CHAR(3)` | NOT NULL; `'INR'` | CHECK `currency = 'INR'` |
| `occurred_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |
| `external_reference` | `VARCHAR(160)` | NULL | — |
| `notes` | `TEXT` | NULL | — |

`ledger_entry_source_check` makes source columns and signs consistent: clearing is positive and requires donation only; refund is negative and requires donation plus refund scope; payout is negative and requires disbursement only. Composite FKs enforce campaign/scope consistency. `ledger_one_disbursement_event` is a partial unique index on `disbursement_id` where type is DISBURSEMENT. `ledger_one_clearing_per_donation_scope` is UNIQUE NULLS NOT DISTINCT on `(donation_id, restriction_id)` where type is DONATION_CLEARING. `idx_ledger_campaign_restriction_date(campaign_id, restriction_id, occurred_at)` supports scope queries.

`validate_ledger_source` checks actor context, currency, cleared/paid source state, exact campaign/scope, amount and external reference. The append-only trigger rejects update/delete. These guards are atomic with the workflow statement, but do not defend against a privileged database owner or superuser.

### 15. `donor_consent_event`

| Column | Exact SQL type | Nullability / default | Keys and declarative rules |
|---|---|---|---|
| `consent_event_id` | `BIGINT` | NOT NULL; `GENERATED ALWAYS AS IDENTITY` | Primary key |
| `donor_id` | `BIGINT` | NOT NULL | FK → donor |
| `consent_purpose` | `VARCHAR(80)` | NOT NULL | — |
| `consent_action` | `VARCHAR(10)` | NOT NULL | CHECK in `GRANTED`, `REVOKED` |
| `occurred_at` | `TIMESTAMPTZ` | NOT NULL; `CURRENT_TIMESTAMP` | — |
| `actor_id` | `VARCHAR(160)` | NOT NULL | Workflow overwrites with required actor context |
| `details` | `JSONB` | NULL | — |

Consent is append-only through workflow triggers; inserting an event creates a corresponding donor consent audit event. No additional index is declared.

## Foreign-key inventory and cardinality

Every listed FK defaults to `NO ACTION` for delete/update because no alternate action is specified.

| Child table | FK column(s) → parent column(s) | Required on child? | Meaning / special integrity |
|---|---|---:|---|
| `campaign` | `organization_id` → `organization.organization_id` | Yes | Each campaign has one organization |
| `campaign` | `purpose_code` → `purpose_category.purpose_code` | Yes | Each campaign has one classification |
| `pledge` | `donor_id` → `donor.donor_id` | Yes | Each pledge has one donor |
| `pledge` | `campaign_id` → `campaign.campaign_id` | Yes | Each pledge belongs to one campaign |
| `donation` | `donor_id` → `donor.donor_id` | Yes | Each donation has one donor record |
| `donation` | `campaign_id` → `campaign.campaign_id` | Yes | Each donation belongs to one campaign |
| `donation` | `pledge_id` → `pledge.pledge_id` | No | A donation may be unpledged; a pledge may link to many donations |
| `fund_restriction` | `campaign_id` → `campaign.campaign_id` | Yes | Restriction belongs to one campaign |
| `fund_restriction` | `allowed_purpose_code` → `purpose_category.purpose_code` | Yes | Each restriction has one purpose classification |
| `donation_restriction` | `donation_id` → `donation.donation_id` | Yes | Allocation junction |
| `donation_restriction` | `restriction_id` → `fund_restriction.restriction_id` | Yes | Allocation junction |
| `donation_restriction` | `(donation_id,campaign_id)` → `donation(donation_id,campaign_id)` | Yes | Ensures stored campaign matches donation |
| `donation_restriction` | `(campaign_id,restriction_id)` → `fund_restriction(campaign_id,restriction_id)` | Yes | Ensures restriction is in same campaign |
| `donation_refund` | `donation_id` → `donation.donation_id` | Yes | Refund refers to original donation |
| `donation_refund` | `(donation_id,campaign_id)` → `donation(donation_id,campaign_id)` | Yes | Refund campaign matches donation |
| `donation_refund_scope` | `refund_id` → `donation_refund.refund_id` | Yes | Scope belongs to one refund |
| `donation_refund_scope` | `(refund_id,campaign_id,donation_id)` → `donation_refund(refund_id,campaign_id,donation_id)` | Yes | Scope campaign/donation match refund |
| `donation_refund_scope` | `(campaign_id,restriction_id)` → `fund_restriction(campaign_id,restriction_id)` | Nullable by restriction | If restricted, it matches the same campaign; NULL means unrestricted |
| `disbursement` | `campaign_id` → `campaign.campaign_id` | Yes | Payout belongs to one campaign |
| `disbursement` | `beneficiary_id` → `beneficiary.beneficiary_id` | Yes | Payout targets one beneficiary |
| `disbursement` | `purpose_code` → `purpose_category.purpose_code` | Yes | Payout has one purpose classification |
| `disbursement` | `(campaign_id,restriction_id)` → `fund_restriction(campaign_id,restriction_id)` | Nullable by restriction | Optional restriction must belong to same campaign |
| `fund_ledger_entry` | `campaign_id` → `campaign.campaign_id` | Yes | Every entry belongs to one campaign |
| `fund_ledger_entry` | `restriction_id` → `fund_restriction(campaign_id,restriction_id)` | Nullable | If non-NULL, scope restriction belongs to same campaign |
| `fund_ledger_entry` | `donation_id` → `donation.donation_id` | Nullable | Optional source donation |
| `fund_ledger_entry` | `disbursement_id` → `disbursement.disbursement_id` | Nullable | Optional source payout |
| `fund_ledger_entry` | `refund_scope_id` → `donation_refund_scope.refund_scope_id` | Nullable | UNIQUE; at most one event can reference a scope through this FK |
| `fund_ledger_entry` | `(donation_id,campaign_id)` → `donation(donation_id,campaign_id)` | Nullable by donation | Source donation must be in same campaign |
| `fund_ledger_entry` | `(disbursement_id,campaign_id)` → `disbursement(disbursement_id,campaign_id)` | Nullable by disbursement | Source payout must be in same campaign |
| `fund_ledger_entry` | `(refund_scope_id,campaign_id,restriction_id,donation_id)` → matching refund-scope tuple | Nullable by scope | Exact scope identity and allocation match |
| `fund_ledger_entry` | `(refund_scope_id,campaign_id,donation_id)` → matching refund-scope tuple | Nullable by scope | Refund scope, campaign, donation match |
| `donor_consent_event` | `donor_id` → `donor.donor_id` | Yes | Each consent event has one donor |

**Cardinality summary:** Standard required FKs mean one parent per child and zero or many children per parent unless uniqueness narrows that relation. Nullable FKs mean zero or one parent for that child. The pledge FK is nullable and not unique, so one pledge can have zero or many donations. `donation_restriction` realizes the donation↔restriction many-to-many relation. Audit's textual entity reference is not an FK and is not included in the 32 FK count.

## Workflow dependencies beyond declarative constraints

| Concern | Database workflow implementation | Boundary / residual limitation |
|---|---|---|
| Campaign approval, activation and audit | `guard_campaign_state`, `audit_campaign_change`, campaign triggers | Actor GUC must be set; role authentication/grants are external |
| Campaign eligible to receive funds | `assert_campaign_accepts_funds`, invoked by pledge/donation guards; locks campaign row | Current-date behavior depends on database date/session configuration |
| Pledge linkage, net fulfillment, status | `guard_pledge_campaign`, `refresh_pledge_status`, `guard_pledge_status_write`, `cancel_pledge` | Pledge is a promise, not cash; totals derive from cleared donation net of refunds |
| Donation states and clearing | `guard_donation_write`, `clear_donation` / `post_donation_clearing`, `record_donation_clearing` | Clearing ledger and audit are transactional with the state change |
| Allocation integrity | `guard_donation_allocation` | Locking and aggregate cap prevent allocation overflow; rows freeze after clearing |
| Refund integrity | `post_donation_refund`, `guard_refund_metadata`, `guard_refund_insert` | Atomic header, scope reversals, ledger, metadata and audit; restriction IDs ascending, unrestricted last, no cross-scope borrowing, only unspent balance reversed |
| Beneficiary verification | `guard_beneficiary_verification`, `audit_beneficiary_verification` | Verification identity/source is not validated by an external verification service here |
| Donor consent | `audit_consent_event` | Append-only event plus audit; actor comes from database session context |
| Disbursement approval/payment | `guard_disbursement_approval`, `audit_disbursement_approval`, `guard_disbursement_payment`, `record_disbursement_payment`, `guard_disbursement_terms`, `pay_disbursement` | Purpose code is a coarse classifier, not proof of actual expenditure; scope balance is derived from ledger |
| Ledger source and history | `validate_ledger_source`, `reject_history_mutation` triggers | Owner/superuser can alter schema/disable triggers; triggers are not a privilege boundary |

## Application assumptions, gaps, and unverified claims

- `app.actor_id` and `app.request_id` are custom settings. `require_actor()` only checks that actor context is nonblank; it does not authenticate the caller. A least-privilege application role and protected actor derivation are required.
- Triggers do not protect against privileged database owners or superusers. Direct DML privileges must be constrained separately.
- The anonymous record unique index enforces **at most one** anonymous donor row, not its existence or safe caller provisioning.
- `audit_log.entity_type/entity_id` are polymorphic text with no referential integrity to target rows.
- `purpose_code` classification does not establish legal, beneficiary, or receipt evidence of use.
- This extraction is from tracked SQL and workflow source. It did not connect to PostgreSQL or inspect `pg_catalog`; it is not a claim that the deployed/live catalog matches these files.
