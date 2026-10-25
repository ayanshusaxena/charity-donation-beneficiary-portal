# Financial Integrity and Auditability Design Decisions

**Status:** Chosen design for the mid-evaluation implementation. Schema/workflow setup and regression execution have been recorded on PostgreSQL 18.6; see `database-execution-report.md` and `../tests/test-plan.md` for the scope and limits of observed evidence.

## D1. Currency scope: INR only

All campaign targets, pledges, donations, refunds, restrictions, and ledger amounts are INR. Donation and ledger currency columns retain an explicit `INR` check for traceability. No exchange rate, conversion, or cross-currency addition is modeled. This is the smallest coherent choice for the current India-focused evaluation and the existing payout design; supporting multiple currencies would require separate currency-scoped balances and a separately specified conversion policy.

## D2. Refund representation and policy

The original `donation` row remains the source payment record. Each full or partial refund is a separate `donation_refund` event with a unique provider/reference key and reason. `donation_refund_scope` records how that refund reverses the source donation's unrestricted or restriction-specific clearing allocations. `donation.refunded_amount` and `payment_status` are a transactionally maintained summary; they do not replace the refund event history.

Refunds follow the original donation's remaining allocation scopes in deterministic order (restriction IDs ascending, unrestricted last). A scope can be reversed only up to the smaller of (a) the source donation's remaining amount in that scope and (b) the current unspent ledger balance in that same campaign/scope. Exhausted scopes are skipped. If the requested amount cannot be fully assigned, the function raises an error and PostgreSQL rolls back the refund header, scope rows, ledger entries, metadata, and audit event. No borrowing across restriction scopes and no negative-balance/debt model is included. Consequently, a refund after funds have been spent may be rejected even when the source donation has a remaining nominal refundable amount.

Call `post_donation_refund(donation_id, amount, refund_reference, reason)` as one SQL statement. It owns the update to refund metadata and appends the ledger and audit entries in that same transaction. Reusing a refund reference or exceeding the original amount is rejected.

## D3. Restrictions and purpose classification

`donation_restriction` classifies the restricted portions; its sum cannot exceed the donation amount. Clearing writes each restricted amount to its restriction scope and the remainder (if positive) to the unrestricted (`restriction_id IS NULL`) scope. Allocation rows are frozen after clearing. Composite foreign keys require a restriction and donation to belong to the same campaign. Allocation changes lock the donation row; clearing uses that same row lock, while refunds and payouts lock the campaign row, serializing movement checks for that campaign.

Purpose codes in `purpose_category` replace substring checks as the compatibility decision. Unrestricted disbursements must use the campaign's purpose code; restricted disbursements must use that restriction's allowed code. A code is a controlled database classification and cannot establish that a real-world expense actually complied. An authorized human/application workflow must select and review the code and retain suitable evidence in the disbursement record.

## D4. Audit actor and trust boundary

Controlled operations read `app.actor_id` from transaction-local PostgreSQL configuration and write the actor, action, entity, timestamp, and old/new JSON snapshots to `audit_log`. Consent is an append-only event relation. The application must set actor context from its authenticated session and restrict direct DML on financial/audit tables. A custom PostgreSQL setting is context supplied by the caller, not independent authentication. Table owners and superusers can change triggers, data, and permissions; these triggers are not tamper-proof against privileged administrators.

## D5. Partial pledge fulfillment

A pledge may be linked by many donations; an unpledged donation remains valid. Only successfully cleared, net-of-refund amounts count toward fulfillment. Clearing locks the pledge row and rejects a donation that would take net received amount over the pledge. The pledge status is maintained as OPEN, PARTIALLY_FULFILLED, or FULFILLED by the clearing/refund workflows; cancellation is a separate function and is blocked once any payment has cleared, even if later fully refunded. Failed or cancelled payments do not fulfill a pledge.

## D6. Payment, campaign, and ledger state

Online successful donations require nonblank unique transaction and receipt references. Donations are created pending; `clear_donation` changes the status and its trigger atomically writes the clearing ledger entries and audit record. Campaigns are created pending/draft; entering active requires approval and an inclusive date window. Disbursements are created pending, approval changes are audited, and `pay_disbursement` requires a verified beneficiary, allowed purpose code, nonblank unique payment reference, and sufficient scoped INR balance. The paid state, negative ledger entry, and audit record share one transaction.

Ledger source checks require clearing entries to match the original donation allocation, refund entries to match a refund scope, and disbursement entries to match a paid disbursement. Donation clearing, refund, and payout entries have explicit sign rules. Payout and refund operations serialize by campaign-row locks; allocation and pledge-fulfillment checks serialize by donation/pledge-row locks. The report records separate-session F22/F27 concurrency evidence; that evidence covers those tested cases, not every concurrent workload.

Only donation refunds have a reversal workflow in this evaluation. A paid disbursement reversal/chargeback process is out of scope and the schema does not expose a `REVERSED` state or reversal ledger type. Such a correction would need its own authorized compensating event and balance policy before being added.

## Evidence and sources consulted

- PostgreSQL 18 documents `NULLS NOT DISTINCT` for unique constraints/indexes; this is used so a refund has at most one unrestricted allocation scope as well as one per restriction: [CREATE TABLE](https://www.postgresql.org/docs/18/sql-createtable.html), [CREATE INDEX](https://www.postgresql.org/docs/18/sql-createindex.html).
- PostgreSQL 18 documents that `SELECT ... FOR UPDATE` blocks conflicting updates/locks of the selected row until transaction end; the design uses campaign, donation, and pledge rows as serialized scopes: [Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html). The report records observed F22/F27 runs using these scopes; this evidence does not prove every concurrent workload.

## Known boundary

These SQL files initialize a new isolated database; they are not a migration for an existing database. Execution evidence is recorded in `database-execution-report.md`. `charity_portal_test` is not an approved test target; use only a separately confirmed disposable database for any future execution.
