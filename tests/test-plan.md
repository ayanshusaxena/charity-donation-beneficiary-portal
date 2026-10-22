# Database Test Plan

**Status:** Test plan only. No case below should be labeled PASS until run against the target PostgreSQL database.

| ID | Setup / action | Expected result | Status |
|---|---|---|---|
| T01 | Insert campaign with target_amount = 0 | Rejected by CHECK | NOT RUN |
| T02 | Insert campaign with end_date earlier than start_date | Rejected by CHECK | NOT RUN |
| T03 | Insert donation with amount <= 0 | Rejected by CHECK | NOT RUN |
| T04 | Insert successful ONLINE donation without transaction_reference or receipt_number | Rejected by CHECK | NOT RUN |
| T05 | Insert duplicate transaction_reference | Rejected by UNIQUE | NOT RUN |
| T06 | Insert duplicate receipt_number | Rejected by UNIQUE | NOT RUN |
| T07 | Insert PLEDGE referencing missing donor/campaign | Rejected by FK | NOT RUN |
| T08 | Attempt donation while campaign is not APPROVED and ACTIVE | Workflow must reject; requires transactional guard not present in DDL alone | NOT RUN - GUARD NEEDED |
| T09 | Attempt disbursement to unverified beneficiary | Workflow must reject; requires transactional guard | NOT RUN - GUARD NEEDED |
| T10 | Attempt disbursement exceeding cleared available funds | Transaction must reject; requires locked aggregate-ledger validation | NOT RUN - GUARD NEEDED |
| T11 | Record a refund | Original donation row remains; refund/reversal event recorded | NOT RUN - WORKFLOW NEEDED |
| T12 | Allocate more than cleared/unrefunded donation amount to restrictions | Transaction must reject; requires aggregate validation | NOT RUN - GUARD NEEDED |
| T13 | Make multiple concurrent disbursement attempts whose combined amount exceeds available funds | At most valid payout(s) commit; requires lock/serialization strategy | NOT RUN - CONCURRENCY TEST NEEDED |
| T14 | Update/delete audit and ledger history | Denied after append-only trigger/privilege policy is configured | NOT RUN - POLICY NEEDED |

## Test evidence log

After executing a test, record:
- Date and PostgreSQL version
- Test ID
- Exact SQL or script used
- Observed result/error
- PASS/FAIL and evidence filename

Use only synthetic donor and beneficiary data in test fixtures.
