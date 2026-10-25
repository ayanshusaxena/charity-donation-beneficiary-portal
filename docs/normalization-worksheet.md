# Normalization Worksheet

**Status:** Updated to the current relational model; design reasoning only, not formal database proof.

## 1. Unnormalized starting point

A combined spreadsheet row containing donor, campaign, organization, pledge, donation, refund, beneficiary, restriction, and payout fields would repeat facts and create independent repeating groups. A donor may make many donations; one pledge may be fulfilled by many donations; one donation may have several restriction allocations and refunds.

## 2. First Normal Form

Each relation has one row per entity/event/association and atomic scalar attributes. Repeating donation allocations are represented by DONATION_RESTRICTION rows; refund allocations are DONATION_REFUND_SCOPE rows; consent changes and financial history are event rows. No lists of IDs or multiple amounts are stored in one field.

## 3. Second Normal Form

For the composite-key relation DONATION_RESTRICTION(`donation_id`,`restriction_id`, `restricted_amount`), the amount depends on the complete pair. Donation amount depends only on `donation_id`; restriction code/name depend on `restriction_id`; those facts stay in DONATION and FUND_RESTRICTION.

For DONATION_REFUND_SCOPE, the amount depends on the refund plus its original allocation scope. Donation, campaign, refund, and restriction details stay in their respective relations; the scope relation stores only its allocation amount and foreign keys.

## 4. Third Normal Form

Examples of transitive dependencies avoided by decomposition:

- `campaign_id -> organization_id -> organization_name/contact`; organization facts live in ORGANIZATION.
- `campaign_id -> purpose_code -> purpose_name`; controlled labels live in PURPOSE_CATEGORY.
- `donor_id -> donor contact`; contact data is not copied into donation or pledge rows.
- `beneficiary_id -> verification facts`; those facts are not copied into every disbursement.
- `restriction_id -> allowed_purpose_code -> purpose_name`; controlled labels remain in PURPOSE_CATEGORY.

## 5. Relation and key summary

| Relation | Key / dependency | Normalization note |
|---|---|---|
| ORGANIZATION | organization_id identifies organization attributes | Organization facts stored once |
| DONOR | donor_id identifies donor attributes | Partial unique index permits one shared anonymous record |
| PURPOSE_CATEGORY | purpose_code identifies label and description | Controlled vocabulary separated from uses |
| CAMPAIGN | campaign_id identifies campaign facts and organization/category FKs | Target and purpose are campaign-specific |
| PLEDGE | pledge_id identifies promise amount and status | Promise distinct from cash; status is derived summary |
| DONATION | donation_id identifies original payment facts | Multiple donations may reference one pledge |
| DONATION_RESTRICTION | (donation_id, restriction_id) identifies allocation amount | Relationship attribute depends on both keys |
| DONATION_REFUND | refund_id identifies an immutable refund event | Repeated partial refunds are separate events |
| DONATION_REFUND_SCOPE | refund_scope_id identifies one refund-to-scope allocation | NULL restriction represents unrestricted allocation |
| FUND_RESTRICTION | restriction_id identifies campaign scope and allowed purpose code | Campaign-specific rule stored once |
| BENEFICIARY | beneficiary_id identifies beneficiary and verification facts | Verification not duplicated on payouts |
| DISBURSEMENT | disbursement_id identifies requested/approved/paid payout | Purpose code is a controlled classification |
| DONOR_CONSENT_EVENT | consent_event_id identifies one grant/revoke event | Consent history is append-only |
| FUND_LEDGER_ENTRY | ledger_entry_id identifies one signed movement | Current totals are derived from movements |
| AUDIT_LOG | audit_id identifies one action snapshot | Polymorphic entity reference is not a foreign key |

## 6. Deliberate summaries and event history

`donation.refunded_amount` and `pledge.pledge_status` are transactionally maintained summaries, not independent sources of truth. Reconcile them against donation/refund events. The immutable original donation amount, each refund event, scope allocation, and corresponding ledger reversal remain available for history.

Pledged totals come from PLEDGE. Cleared, restricted, unrestricted, refunded, disbursed, and available amounts are derived from the ledger and event relations. No mutable campaign balance is stored.

## 7. Limits

This worksheet explains the intended 3NF decomposition but does not prove runtime behavior. Purpose codes classify intended use; they cannot verify a real expense. Audit actor data relies on caller context. See [design decisions](design-decisions.md) for selected financial policies and unresolved operational boundaries.
