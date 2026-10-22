# Normalization Worksheet

**Status:** Working worksheet for the proposed logical schema. Assumptions are stated explicitly for viva discussion.

## 1. Starting point: unnormalized combined transaction record

Imagine one spreadsheet row that repeats campaign, donor, pledge, donation, beneficiary, and disbursement details:

`(donor_id, donor_name, donor_email, campaign_id, campaign_name, organization_id, organization_name, pledge_id, pledged_amount, donation_id, donation_amount, transaction_reference, beneficiary_id, beneficiary_name, disbursement_id, disbursement_amount)`

This is not a suitable relational table: campaign and donor attributes repeat across donations, and a campaign may have multiple donations and multiple disbursements. Combining independent repeating groups causes duplication and update anomalies.

## 2. First Normal Form (1NF)

**Requirement:** each row-column intersection stores one atomic value; there are no repeating groups or multi-valued columns.

Actions:
- Give each donor, campaign, pledge, donation, beneficiary, and disbursement its own row and primary key.
- Store one amount per pledge/donation/disbursement row.
- Do not store comma-separated donation IDs or multiple beneficiaries in one field.
- Model donation-to-restriction assignments as separate rows in DONATION_RESTRICTION.

**Result:** attributes are atomic and repeating groups have been separated.

## 3. Second Normal Form (2NF)

**Requirement:** be in 1NF and have no non-key attribute depend on only part of a candidate key.

Example in a bad composite-key table `DONATION_RESTRICTION(donation_id, restriction_id, donation_amount, restriction_name, restricted_amount)`:
- Candidate key: `(donation_id, restriction_id)`
- `donation_amount` depends only on `donation_id`, not on the full pair.
- `restriction_name` depends only on `restriction_id`, not on the full pair.
These are partial dependencies, so the table would violate 2NF.

Decomposition:
- DONATION(`donation_id PK`, donation_amount, ...)
- FUND_RESTRICTION(`restriction_id PK`, restriction_name, ...)
- DONATION_RESTRICTION(`donation_id PK/FK`, `restriction_id PK/FK`, restricted_amount)

Now `restricted_amount` depends on the full pair, while donation and restriction attributes live with their own keys.

## 4. Third Normal Form (3NF)

**Requirement:** be in 2NF and avoid transitive dependencies of non-key attributes on a key.

Bad example:
`CAMPAIGN(campaign_id, campaign_name, organization_id, organization_name, organization_email)`

Functional dependencies:
- `campaign_id → campaign_name, organization_id`
- `organization_id → organization_name, organization_email`

Thus campaign_id indirectly determines organization_name and organization_email through organization_id. Keeping these organization attributes in CAMPAIGN would create a transitive dependency.

Decomposition:
- ORGANIZATION(`organization_id PK`, organization_name, organization_email, ...)
- CAMPAIGN(`campaign_id PK`, campaign_name, `organization_id FK`, ...)

Similarly, donor contact details are stored in DONOR, not repeated in DONATION; beneficiary verification data is stored in BENEFICIARY, not copied into every DISBURSEMENT.

## 5. Proposed 3NF relation checklist

| Relation | Key reasoning | Normalization note |
|---|---|---|
| ORGANIZATION | organization_id identifies organization attributes | Organization details stored once |
| DONOR | donor_id identifies donor attributes | Donor details not repeated in donations |
| CAMPAIGN | campaign_id identifies campaign details and its organization FK | Organization attributes separated |
| PLEDGE | pledge_id identifies pledge amount/status | Promise amount kept distinct from received cash |
| DONATION | donation_id identifies payment record | Transaction and refund history stays with donation |
| BENEFICIARY | beneficiary_id identifies beneficiary and verification state | Verification not copied into each payout |
| FUND_RESTRICTION | restriction_id identifies restriction and purpose | Restriction details stored once |
| DONATION_RESTRICTION | composite key (donation_id, restriction_id) identifies allocation | Relationship-specific restricted amount depends on both keys |
| DISBURSEMENT | disbursement_id identifies payout record | Beneficiary names are not repeated |
| AUDIT_LOG | audit_id identifies audit event | Each action stored as one event |
| FUND_LEDGER_ENTRY | ledger_entry_id identifies a single signed ledger event | History is append-oriented rather than overwritten totals |

## 6. Amount fields and deliberate derived values

Avoid storing multiple copies of the same calculated total as independently editable facts. Pledged totals can be queried from PLEDGE; cleared received funds and reversals are derived from successful cleared donation events and ledger rows; disbursed totals are derived from paid disbursement ledger entries. If a balance cache is later introduced for performance, it must be transactionally maintained and reconcilable to the ledger.

## 7. Limits of this worksheet

This is a normalization explanation of the proposed model, not evidence that a database engine has run formal dependency analysis. The final report should show the final ER diagram, relation keys, and the chosen assumptions consistently. If the team decides to allow partial pledge fulfilment, include a PLEDGE_DONATION associative table and normalize it using the same composite-key reasoning.
