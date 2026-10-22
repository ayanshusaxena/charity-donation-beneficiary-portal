# Manual Database Setup and Demonstration

## 1. Requirements

- PostgreSQL 15 or newer
- `psql` command-line client or pgAdmin
- Repository checked out at branch `pbl-mid-evaluation`

## 2. Create an empty development database

```sql
CREATE DATABASE charity_portal_dev;
```

## 3. Apply scripts in order

```bash
psql -v ON_ERROR_STOP=1 -d charity_portal_dev -f database/schema.sql
psql -v ON_ERROR_STOP=1 -d charity_portal_dev -f database/workflows.sql
```

Run each script against a disposable database first. Fix any error before demonstrating it.

## 4. Inspect the tables

```sql
\dt
\d+ campaign
\d+ donation
\d+ fund_ledger_entry
```

## 5. Required test sequence

1. Insert one organization.
2. Insert a campaign whose dates include today; first try PENDING/DRAFT and confirm a pledge is rejected.
3. Approve and activate it with `approval_status='APPROVED'`, `approved_at=CURRENT_TIMESTAMP`, and `campaign_status='ACTIVE'`.
4. Create a donor and a pledge.
5. Create a successful ONLINE donation with a unique transaction reference and receipt number and a non-null `cleared_at`.
6. Assign any restriction rows before posting the clearing event.
7. Call `SELECT post_donation_clearing(<donation_id>);` and inspect the ledger.
8. Create a verified beneficiary with `verified_at` set.
9. Create and approve a disbursement for the same campaign and test `SELECT pay_disbursement(<disbursement_id>, '<unique-payment-reference>');` once with a valid amount and once with an amount greater than funds available.
10. Verify the valid payment reduces ledger balance and the oversized payment is rejected.
11. Test a donation refund on a disposable fixture and confirm it adds a negative ledger entry without deleting the original donation.

## 6. Important assumptions and known limitations

- `post_donation_clearing` records donation allocation at clearing time. Allocate donation restrictions before calling it.
- In this implementation, refund rows reverse the specified donation's posted clearing entries and also require the campaign/restriction scope to have enough current balance. A refund after funds have already been disbursed may require a debt/negative-balance model or a separate exception workflow. That scenario should be discussed and explicitly tested before claiming full financial lifecycle support.
- `pay_disbursement` uses the campaign row as a serialization lock, reducing races between concurrent payouts for the same campaign. The database role used by the application should not be allowed to bypass the function path.
- The restriction purpose check is a conservative text-match demonstration, not a robust purpose taxonomy. Prefer a predefined purpose code or explicit authorization relation for a production design.
- The current model uses a single currency field per transaction and the payout function defaults ledger currency to INR. A production implementation should enforce currency consistency on campaign/fund accounts.
- A PostgreSQL function is not an external payment integration. Only call the pay function after a real external payment confirmation in a real system.
- Trigger/owner privileges need a deliberate role model; a table owner or superuser may bypass ordinary protections.
