# Charity Donation Portal - Verification Notes

This file is a checklist for completing validation. It intentionally avoids claiming any test is passed before the team runs it.

## Review points before demo

- [ ] Apply `database/schema.sql` to a clean PostgreSQL 15+ database.
- [ ] Apply `database/workflows.sql` after the base schema.
- [ ] Check that every relation and trigger exists.
- [ ] Demonstrate positive amount and date constraints.
- [ ] Demonstrate the campaign state guard for pledge and donation inserts.
- [ ] Demonstrate online-success transaction and receipt requirements.
- [ ] Demonstrate cleared donation posting into the ledger.
- [ ] Demonstrate verified-beneficiary payout rule.
- [ ] Demonstrate a payout larger than current ledger availability is rejected.
- [ ] Demonstrate a refund creates a compensating event and preserves the source donation.
- [ ] Attempt UPDATE and DELETE against audit/ledger rows and record the expected error.
- [ ] Update the test plan with actual evidence and outcomes.

## Known modeling choices to disclose

1. The supplied README described an eight-entity design. This implementation adds restriction/allocation/ledger relations because the supplied requirements explicitly distinguish restricted and allocated amounts and require restriction-specific balance checks.
2. The current one-to-one pledge-donation link supports at most one donation per pledge. Partial pledge fulfilment would need an associative relation.
3. The SQL schema uses PostgreSQL types and syntax; it is not directly portable to MySQL without changes.
4. Campaign/restriction balances are computed from signed ledger entries. A cached balance would need transactionally maintained updates and reconciliation.
5. Production use would require a role/privilege model, external-payment integration, stronger purpose codes, and a defined policy for refunds after the funds have already been spent.
