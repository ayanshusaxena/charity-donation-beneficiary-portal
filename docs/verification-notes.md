# Verification Notes

**Review date:** 2026-10-22
**Branch:** `pbl-mid-evaluation`
**Status:** Static review and PostgreSQL execution evidence are recorded. Schema/workflow setup and the rollback regression were executed on PostgreSQL 18.6; F22/F27 were run separately in two sessions. See the execution report and test plan for exact outcomes and coverage limits.

## Environment and baseline

- Branch at start of this pass: `pbl-mid-evaluation`.
- The five documentation files modified in the prior review were present and preserved.
- PostgreSQL 18.6 server version was observed in the execution report.
- `charity_portal_test` was not used for the recorded executions and must not be treated as a test target.
- SQL and relevant docs reviewed: `database/schema.sql`, `database/workflows.sql`, project brief, ER model, relational schema, normalization worksheet, setup guide, verification notes, mid-evaluation report, test plan, README, and DevOps notes.
- Official PostgreSQL 18 documentation was consulted for trigger event syntax, `NULLS NOT DISTINCT`, and row locking. URLs and rationale are in `docs/design-decisions.md`.

## Design decisions implemented in the draft

1. INR-only monetary model; campaign, donation, and ledger design treats all values as INR. Donation and ledger currency reject non-INR values. No conversion is modeled.
2. Refund event rows preserve original donation records. Refunds use unique references and per-scope reversal rows. They reverse only the source donation's remaining original allocation and current unspent funds in that scope; failed requests should roll back entirely.
3. Donation allocations are constrained to the donation's campaign and total amount; allocation edits lock the donation and are frozen after clearing. Restricted portions and unrestricted remainder are posted separately.
4. Purpose compatibility uses `purpose_category` codes: unrestricted payouts use the campaign code; restricted payouts use the restriction's allowed code.
5. Partial pledge fulfillment is supported; successful clearing locks the pledge and rejects aggregate net cleared amounts above the pledge. Refunds reduce net fulfillment.
6. Audit events are generated for campaign state/approval, consent, beneficiary verification, donation clearing/refunds, pledge cancellation, disbursement approval/payment. Actor context is supplied through `app.actor_id`.
7. Payment state, reference, ledger, and audit writes are checked in functions/triggers and share statement transactions. Same-campaign payout/refund checks serialize on the campaign row; allocation and fulfillment checks serialize on donation/pledge rows.

## Requirement coverage (static, not runtime proof)

| Requirement | Draft mechanism | Enforcement boundary / limitation | Evidence status |
|---|---|---|---|
| R1 Unique identifiers | Identity PKs; single anonymous donor partial unique index | Declarative | Case-level evidence is in `tests/test-plan.md`; not every key path is separately tested |
| R2 Eligible campaigns | Trigger checks approved/active/date window for pledge/donation/clearing; active status guard | Row-level trigger, caller grants still matter | F01-F03 recorded EXECUTED; see test plan |
| R3 Campaign facts | Required purpose/code/target/dates/organization FK and date/amount checks | Target is INR by design | Check coverage is limited to cases listed in test plan |
| R4 Positive donation and donor | Amount CHECK, donor FK; anonymous singleton index | No anonymous PII in synthetic tests | F04 recorded EXECUTED; see test plan |
| R5 Online transaction and receipt | Nonblank fields required for successful online states; unique constraints | Receipt supplied by caller, not generated | F05/F06 recorded EXECUTED; see test plan |
| R6 Separate balances | Pledge, donation, restriction allocation, refund scope, and signed ledger | `refunded_amount` and pledge status are workflow-maintained summaries | F07-F16/F25/F27 evidence is in test plan; F27 was concurrent |
| R7 Verified beneficiary and purpose | Payment trigger checks verification and purpose codes | Code is classification, not proof of actual use | F17-F19 recorded EXECUTED; see test plan |
| R8 No overspend | Campaign lock then scoped INR ledger balance check before payment | Direct table privilege boundary still matters | F20/F22 recorded EXECUTED; F22 used two sessions; see test plan |
| R9 Refund/cancel history | Refund event/scope rows, cumulative cap, per-scope available cap, source retained | Post-spend refund fails; no negative debt model; cancellation before funds received only | F13-F16 recorded EXECUTED; see test plan |
| R10 Auditability | Audit writes for required business events, actor/action/time/entity/snapshots | Caller-supplied actor; owners/superusers can bypass protections | F23/F24/F26 evidence is in test plan; see remaining gaps |

## Test status

- The rollback-based financial-integrity script has a successful execution recorded; earlier failed attempts and corrections remain in the execution report.
- F22 and F27 have separate two-session execution evidence recorded.
- F21 remains PARTIAL; see `tests/test-plan.md` for its specific assertion gap.
- This summary does not infer individual case success beyond the direct assertions and observed results documented in the report/test plan.

The automated regression script runs synthetic fixtures in one transaction and ends with ROLLBACK. It validates the assertions represented in the script. It does not provide concurrency evidence; F22/F27 are separate procedures.

## Risks and required next verification

- Execution evidence covers the cases and setup recorded in the report; untested branches, authorization/grant behavior, and production workload properties remain unverified.
- The custom `app.actor_id` context is not authentication. Use a restricted role and ensure application code cannot impersonate actors. Trigger-based audit/append-only protections do not protect from table owners or superusers.
- Purpose codes are a constrained classification, not an expense verification service.
- Refund-after-spend requires an exception/debt policy if real operations must still refund.
- Paid disbursement reversals/chargebacks are not modeled; only donation refunds have a compensating ledger path.
- The workflow scripts create triggers without idempotent drops; apply them once to a fresh isolated database. Do not use a populated or uninspected database.
- Remaining focused regression work should follow the gaps in `tests/test-plan.md`; do not treat prior execution as evidence for unasserted behavior.
