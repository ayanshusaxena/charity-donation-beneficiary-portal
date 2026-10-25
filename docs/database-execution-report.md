# Disposable Database Execution Report

**Date:** 2026-10-22

**Branch:** `pbl-mid-evaluation`

**Database:** `charity_portal_financial_review`

**Execution scope:** Database creation, current schema/workflow setup, and the rollback-based financial-integrity regression script. No concurrency tests were run.

## Repository and preflight

- Repository root: `.` (repository root).
- Branch: `pbl-mid-evaluation`.
- Existing uncommitted changes were present before execution and were preserved. The working tree already included edits to the README, SQL, project documentation, and test plan, plus new `docs/design-decisions.md` and `tests/financial-integrity.sql`.
- Setup instructions name `charity_portal_financial_review` for the schema, workflow, and regression commands, while requiring a new isolated database name confirmed absent. The intended server parameters are `localhost:5432`, user `postgres`.
- A first existence-check connection failed authentication before reaching PostgreSQL because the local credential handoff was malformed. It made no database change. After correcting the handoff, the read-only preflight succeeded and confirmed PostgreSQL 18.6; the target count in `pg_database` was 0.
- The preflight catalog query connected to the maintenance database `postgres` in a `READ ONLY` transaction. No project schema or scripts were run there. The only database created or initialized was the explicitly authorized target below.

## Commands and observed results

The supplied credential was passed transiently through the process environment. Its value is omitted from this report and was not printed by the commands.

### Read-only existence check

```powershell
psql -X -w -v ON_ERROR_STOP=1 -A -t -h localhost -p 5432 -U postgres -d postgres -c "BEGIN READ ONLY; SELECT current_setting('server_version') || '|' || current_database() || '|' || current_user; SELECT COUNT(*) FROM pg_database WHERE datname='charity_portal_financial_review'; ROLLBACK;"
```

Observed output: `18.6|postgres|postgres`, then `0`; exit code 0. The target did not exist at the time of the check.

### Database creation

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE charity_portal_financial_review;"
```

Observed output: `CREATE DATABASE`; exit code 0.

### Schema setup

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_portal_financial_review -f database/schema.sql
```

Observed result: exit code 0. The script created its tables, indexes, seeded five purpose categories, and committed. No errors were emitted.

### Workflow setup

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_portal_financial_review -f database/workflows.sql
```

Observed result: exit code 0. The script created its functions and triggers and committed. No errors were emitted.

### Financial-integrity regression

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_portal_financial_review -f tests/financial-integrity.sql
```

Observed output ended with `DO` and `ROLLBACK`; exit code 0. No assertion failed and no SQLSTATE error was reported. This is an observed successful execution of the current regression script. The script's synthetic test transaction was rolled back as written.

## Post-test read-only verification

Connected to `charity_portal_financial_review` and queried identity, schemas, public relations, exact counts for all 15 project tables, extension inventory, function count, and trigger count within `BEGIN READ ONLY` / `ROLLBACK`.

Observed identity: PostgreSQL 18.6; database `charity_portal_financial_review`; user `postgres`; current schema `public`; search path `"$user", public`.

The full schema inventory returned `information_schema`, `pg_catalog`, `pg_toast`, and `public`. The public schema still contains all 15 project tables, 13 identity sequences, 29 workflow functions, and 26 non-internal triggers. No project views were present. The `plpgsql` extension (1.0) is installed in `pg_catalog`.

The post-test inventory used these read-only queries (executed together in one read-only transaction):

```sql
BEGIN READ ONLY;
SELECT current_setting('server_version') AS server_version,
       current_database() AS database_name, current_user AS current_user,
       current_schema() AS current_schema, current_setting('search_path') AS search_path;
SELECT nspname AS schema_name
FROM pg_namespace WHERE nspname NOT LIKE 'pg_toast%' ORDER BY 1;
SELECT c.relname AS object_name,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view'
            WHEN 'm' THEN 'materialized view' WHEN 'S' THEN 'sequence'
            ELSE c.relkind::text END AS object_type
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')
ORDER BY 2,1;
SELECT 'purpose_category' AS table_name, COUNT(*) AS exact_rows FROM purpose_category
UNION ALL SELECT 'organization', COUNT(*) FROM organization
UNION ALL SELECT 'donor', COUNT(*) FROM donor
UNION ALL SELECT 'campaign', COUNT(*) FROM campaign
UNION ALL SELECT 'pledge', COUNT(*) FROM pledge
UNION ALL SELECT 'donation', COUNT(*) FROM donation
UNION ALL SELECT 'beneficiary', COUNT(*) FROM beneficiary
UNION ALL SELECT 'fund_restriction', COUNT(*) FROM fund_restriction
UNION ALL SELECT 'donation_restriction', COUNT(*) FROM donation_restriction
UNION ALL SELECT 'donation_refund', COUNT(*) FROM donation_refund
UNION ALL SELECT 'donation_refund_scope', COUNT(*) FROM donation_refund_scope
UNION ALL SELECT 'disbursement', COUNT(*) FROM disbursement
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log
UNION ALL SELECT 'fund_ledger_entry', COUNT(*) FROM fund_ledger_entry
UNION ALL SELECT 'donor_consent_event', COUNT(*) FROM donor_consent_event
ORDER BY 1;
SELECT e.extname AS extension_name, e.extversion AS version
FROM pg_extension e ORDER BY 1;
SELECT COUNT(*) AS workflow_functions
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
SELECT COUNT(*) AS public_triggers
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal;
ROLLBACK;
```

A follow-up read-only query confirmed all schema names and the extension schema:

```sql
BEGIN READ ONLY;
SELECT nspname AS schema_name FROM pg_namespace ORDER BY 1;
SELECT e.extname AS extension_name, e.extversion AS version, n.nspname AS schema_name
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1;
ROLLBACK;
```

It returned the four schemas above and `plpgsql | 1.0 | pg_catalog`; exit code 0.

Exact post-test table counts:

| Table | Rows |
|---|---:|
| `purpose_category` | 5 seeded rows |
| `organization` | 0 |
| `donor` | 0 |
| `campaign` | 0 |
| `pledge` | 0 |
| `donation` | 0 |
| `beneficiary` | 0 |
| `fund_restriction` | 0 |
| `donation_restriction` | 0 |
| `donation_refund` | 0 |
| `donation_refund_scope` | 0 |
| `disbursement` | 0 |
| `audit_log` | 0 |
| `fund_ledger_entry` | 0 |
| `donor_consent_event` | 0 |

The synthetic rows were absent after the test. PostgreSQL sequences are not transactional; identity sequence values may have advanced during the rolled-back test and were not reset.

## Conclusion and remaining work

- Database creation: **successful**, exit code 0.
- `database/schema.sql`: **successful**, exit code 0.
- `database/workflows.sql`: **successful**, exit code 0.
- `tests/financial-integrity.sql`: **successful**, exit code 0; its transaction ended with `ROLLBACK`.
- No concurrency tests were run. Run the separately documented two-session pledge-clear and disbursement cases only when authorized.
- `charity_portal_test` and all other project databases were left untouched.
- During the initial setup execution documented above, no files other than this report were edited. No commit or push was made in that setup pass.
## Two-session concurrency attempt — 2026-10-22

### Preflight

The required report, test plan, schema, and workflow files were reviewed. The repository root (`.`) and branch remained `pbl-mid-evaluation`; the existing uncommitted changes were preserved.

The target identity was rechecked directly on the authorized database in a read-only transaction:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_portal_financial_review -c "BEGIN READ ONLY; SELECT current_setting('server_version') AS server_version, current_database() AS database_name, current_user AS current_user, current_schema() AS current_schema, current_setting('search_path') AS search_path; SELECT 'organization' AS table_name, COUNT(*) AS rows FROM organization UNION ALL SELECT 'donor',COUNT(*) FROM donor UNION ALL SELECT 'campaign',COUNT(*) FROM campaign UNION ALL SELECT 'pledge',COUNT(*) FROM pledge UNION ALL SELECT 'donation',COUNT(*) FROM donation UNION ALL SELECT 'beneficiary',COUNT(*) FROM beneficiary UNION ALL SELECT 'fund_restriction',COUNT(*) FROM fund_restriction UNION ALL SELECT 'donation_restriction',COUNT(*) FROM donation_restriction UNION ALL SELECT 'disbursement',COUNT(*) FROM disbursement UNION ALL SELECT 'fund_ledger_entry',COUNT(*) FROM fund_ledger_entry UNION ALL SELECT 'audit_log',COUNT(*) FROM audit_log ORDER BY 1; SELECT tgname AS immutable_trigger FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND tgname IN ('trg_donation_no_delete','trg_ledger_no_update_delete','trg_audit_no_update_delete','trg_refund_no_update_delete','trg_refund_scope_no_update_delete','trg_consent_no_update_delete') ORDER BY 1; ROLLBACK;"
```

Observed identity: PostgreSQL 18.6, database `charity_portal_financial_review`, user `postgres`, current schema `public`, search path `"$user", public`; exit code 0. All queried project tables were empty. The six listed append-only triggers were present.

### Cleanup feasibility and decision

No synthetic fixture rows were created and neither concurrency test was started. A cleanup plan cannot be guaranteed under the current schema and the instruction not to reset/drop the database:

- Test A requires committed setup visible to both sessions. A committed successful clearing adds immutable ledger and audit rows; `trg_donation_no_delete` also rejects deleting its donation. Foreign keys retain the related campaign, donor, pledge, and organization fixture graph.
- Test B requires committed setup visible to both sessions. A committed payout adds immutable ledger and audit rows; foreign keys prevent removing the disbursement and its supporting fixture graph.
- The ledger and audit append-only triggers reject cleanup deletes/updates. Disabling triggers/constraints is prohibited. A compensating event would preserve the history and still leave synthetic records, so it would not satisfy cleanup.

Because the required cleanup could not be safely guaranteed, execution stopped before fixture creation. There were no concurrent sessions, commit/rollback outcomes, lock waits, or SQLSTATEs to report. Neither concurrency invariant was tested. No cleanup was necessary because no fixtures were created.

### Next safe step

Run these tests only after authorizing a per-test disposable database lifecycle that permits removing the entire isolated database after verification, or explicitly authorizing retention of the synthetic append-only history in `charity_portal_financial_review`. Until then F22 and F27 remain blocked. This attempt made no database changes; no other database was accessed. The test plan was updated to record the blocker and correct the expected first lock for competing pledge clears (the campaign row is locked before the pledge row).

## Authorized isolated per-test concurrency runs — 2026-10-22

The following supersedes the prior concurrency-attempt section for the authorized isolated runs. All schema, workflow, fixture, and concurrency operations described below ran only in newly created test databases. The maintenance database `postgres` was used only for exact-name database catalog checks and CREATE/DROP statements. No pre-existing project database was used. PostgreSQL was 18.6; the repository remained on `pbl-mid-evaluation`, with prior uncommitted changes preserved. No commit or push was made.

Credentials were supplied through process configuration during execution and are omitted. An initial F22 cleanup preflight attempt failed authentication before SQL ran; after restoring the authorized credential handoff, the exact-name pre-drop check, drop, and post-drop verification all succeeded.

### F27 — competing pledge clears

New database: `charity_f27_ct_20261022_7c4e91`.

The exact-name catalog check on `postgres` returned absent immediately before creation; `CREATE DATABASE` exited 0. `database/schema.sql` and `database/workflows.sql` were each applied to this database with `psql -X -w -v ON_ERROR_STOP=1`; both exited 0. A committed synthetic fixture used pledge 100 INR and two pending linked donations of 60 INR each.

Two independent `psql` sessions were used (`f27_session_a`, backend PID 22216; `f27_session_b`, PID 30940). A ran `BEGIN`, set its local actor, and called `clear_donation(1)`, which succeeded; A held the transaction open. B ran the equivalent sequence for `clear_donation(2)` and waited. A read-only `pg_stat_activity` observation showed B waiting on a `transactionid` lock, blocked by PID 22216. A committed. B then received SQLSTATE `P0001`, `Cleared donations would exceed pledged amount`, and rolled back. Both sessions closed.

Final read-only assertions in the test database showed pledge 1 at `PARTIALLY_FULFILLED`, net cleared 60 INR; donation 1 `SUCCESSFUL`; donation 2 still `PENDING`; one +60 INR donation-clearing ledger row; one `DONATION_CLEARED` audit event. Thus committed clearing did not exceed the 100 INR pledge. No client sessions remained. Before cleanup, the exact database name and owner `postgres` were confirmed and the active-session count was 0. `DROP DATABASE charity_f27_ct_20261022_7c4e91` exited 0; a subsequent exact-name catalog query returned 0 rows. Cleanup is verified.

### F22 — competing disbursements

New database: `charity_f22_ct_20261022_a4912d`.

The exact-name catalog check on `postgres` returned absent immediately before creation; `CREATE DATABASE` exited 0. `database/schema.sql` and `database/workflows.sql` were each applied to this database with `psql -X -w -v ON_ERROR_STOP=1`; both exited 0. A committed synthetic fixture provided 100 INR in one restricted scope and two approved disbursements of 60 INR each.

Two independent `psql` sessions were used (`f22_session_a`, backend PID 38968; `f22_session_b`, PID 3860). A began a transaction, set its local actor, and paid disbursement 1 with the unique synthetic reference; the state became `PAID` while A held the transaction open. B attempted to pay disbursement 2 and waited. A read-only `pg_stat_activity` observation showed B waiting on a `transactionid` lock, blocked by PID 38968. A committed. B then received SQLSTATE `P0001`, `Insufficient cleared available funds`, and rolled back. Both worker sessions closed.

Final read-only assertions showed disbursement 1 paid for 60 INR and disbursement 2 pending with no payment reference; ledger contained the +100 INR clearing and only one -60 INR disbursement entry; remaining scoped balance was 40 INR; exactly one `DISBURSEMENT_PAID` audit event existed; no worker or other client sessions remained. The invariant held: both 60 INR payouts did not commit against the 100 INR scope.

The first pre-drop check attempt failed before SQL execution because the process had no password handoff. After the authorized credential handoff was restored, the required read-only pre-drop check used this exact command (no password or secret included):

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT d.datname || '|' || pg_get_userbyid(d.datdba) || '|' || count(a.pid) FROM pg_database d LEFT JOIN pg_stat_activity a ON a.datname=d.datname WHERE d.datname='charity_f22_ct_20261022_a4912d' GROUP BY d.datname,d.datdba; ROLLBACK;"
```

It returned `charity_f22_ct_20261022_a4912d|postgres|0`, followed by `ROLLBACK`; exit code 0. The exact database name and owner were confirmed and no client sessions remained. The exact command `psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -c "DROP DATABASE charity_f22_ct_20261022_a4912d;"` returned `DROP DATABASE`; exit code 0. A post-drop read-only exact-name query returned `0`; exit code 0. Cleanup is verified. The earlier authentication failure and a subsequent read-only query typo did not execute database-changing statements.

### Execution status

- F27 concurrent behavior and final-state invariant: observed; exact-name cleanup and post-drop absence both verified.
- F22 concurrent behavior and final-state invariant: observed; exact-name owner/session check, drop, and post-drop absence all verified.
- No single-session SQL regression script or concurrency test was rerun in this follow-up. No database other than the two newly created test databases and the `postgres` maintenance connection was accessed. `charity_portal_test` and `charity_portal_financial_review` were untouched.

## Static test-plan reconciliation — 2026-10-22

### Scope and method

Static inspection only. Read `docs/database-execution-report.md` first, then `tests/test-plan.md` and `tests/financial-integrity.sql`. No SQL was executed, no database was connected to, and no schema/workflow file was changed. `tests/test-plan.md` was updated to distinguish direct assertions, partial coverage, and missing cases. This section records source-code mappings separately from actual execution evidence.

The report's single-session evidence is the recorded invocation of `tests/financial-integrity.sql` on `charity_portal_financial_review`, with exit code 0, output ending in `DO` and `ROLLBACK`, and no assertion/SQLSTATE failure reported. That supports the assertions present in the executed script; it does not make an unasserted expectation a tested case. The report separately records actual two-session execution and final-state checks for F22 and F27 in the isolated databases. No per-assertion output transcript is recorded.

One source/evidence inconsistency remains: `tests/financial-integrity.sql:3` says “It is NOT EXECUTED yet,” while the report records a successful invocation of that script. The instruction prohibited SQL-file changes, so this audit records the stale header without editing it.

### F01–F27 source mapping and evidence

| Case | SQL source mapping | Static coverage finding | Actual execution evidence in this report |
|---|---|---|---|
| F01 | `tests/financial-integrity.sql:44-45` | Pending-campaign pledge insertion expected to raise `P0001`; helper verifies SQLSTATE. | Included in recorded single-session script run; assertion block completed without reported failure. |
| F02 | `:40-59`, `:78-80`, `:87-96`; approval audit assertion `:251-253` | Approved/active campaign and valid pledge/donation setup are exercised, but no explicit acceptance/date-window or inactive-to-active boundary assertion. Partial. | Fixture path ran as part of the script; no distinct F02 boundary assertion. |
| F03 | No matching case block. | No inactive/suspended campaign write attempt or corresponding transition audit assertion. | Not evidenced/run. |
| F04 | `:36-38` | Duplicate anonymous donor expected `23505`. | Included in recorded single-session run; assertion completed without reported failure. |
| F05 | `:66-69` | An ONLINE donation without transaction/receipt references is allowed pending; transition to SUCCESSFUL is expected to fail with `23514`. This tests the transition guard, not an insert-time rejection. | Included in recorded single-session run; that SQLSTATE assertion completed without reported failure. |
| F06 | `:60-65` | Duplicate transaction reference and duplicate receipt each expected `23505`. | Both assertions are in the recorded script run; no failure reported. |
| F07 | `:50-59`, `:78-96` | Partial pledge status, exact `FULFILLED` status asserted. | Both assertions are in the recorded script run; no failure reported. |
| F08 | `:82-85` | Sequential over-fulfillment expected `P0001`; donation remains pending. Concurrent form is F27. | Sequential assertions in recorded script run; concurrent evidence is separately recorded for F27. |
| F09 | No matching case block. | No mismatched donation/restriction campaign allocation is attempted. | Not evidenced/run. |
| F10 | `:70-74` | Allocation of 61 against donation amount 50 expected `P0001`. | Included in recorded script run; assertion completed without reported failure. |
| F11 | No matching case block. | No update/delete of a cleared donation's allocation is attempted. | Not evidenced/run. |
| F12 | Setup `:52-55`, `:70-71`; clearing `:78`; later ledger net check `:267-269` | A 60 donation with a 40 restriction is cleared, but no assertion checks clearing entries' restricted 40 / unrestricted 20 scope split. Later net-zero check follows full refunds and does not establish this split. Partial only. | Fixture and later net assertion ran; exact F12 allocation-split outcome was not asserted. |
| F13 | `:98-102`, `:176-218` | Repeated partial refunds; duplicate-reference error; multi-scope refund asserts three amounts and restriction-ID/unrestricted ordering. | Assertions are in the recorded single-session run; no failure reported. |
| F14 | `:98-105`, `:267-269`, `:271` | Full refund after partials; REFUNDED and refunded amount 60 asserted; ledger sum for original donation asserted zero. The later expected `P0001` on deleting the original also checks retention (a zero-row DELETE would succeed and fail the helper). | Assertions are in the recorded single-session run; no failure reported. |
| F15 | `:100-108` | Duplicate refund reference expects `23505`; excessive refund expects `P0001`. No dedicated residue assertion follows these two failures, so the test-plan no-extra-row claim is stronger than its assertions. | Error assertions are in the recorded run; residue aspect is unverified. |
| F16 | `:112-118`, `:123-128`, `:166-174`; no-borrow case `:220-245` | Refund after spending and cross-scope borrowing each expect `P0001`; both assert no refund header/scope/ledger/audit/metadata residue. | Assertions are in the recorded script run; no failure reported. |
| F17 | `:134-141` | Paying an unverified beneficiary expects `P0001`, but no post-error status/ledger/audit residue check follows that attempt. Partial. | Rejection assertion is in the recorded script run; residue claim is not evidenced. |
| F18 | No matching case block. | No restricted-fund purpose mismatch payment attempt. | Not evidenced/run. |
| F19 | No matching case block. | No unrestricted-fund purpose mismatch payment attempt. | Not evidenced/run. |
| F20 | `:120-131`; audit assertion `:257-263` | Successful payout and -40 ledger delta are checked; `DISBURSEMENT_PAID` event is checked later. No direct assertion checks paid status or transaction-level atomicity. Partial. | Those present assertions are in the recorded script run; atomicity is not established by an induced failure. |
| F21 | `:142-164`, blank reference `:246-247` | Over-balance failure asserts pending/no ledger; duplicate ref asserts pending/no ledger/no audit; blank-reference failure expects `P0001` but has no residue assertion. Partial. | Present assertions are in the recorded script run; blank-reference residue is unverified. |
| F22 | Not in single-session SQL file; two-session procedure in `tests/test-plan.md:21-27` | Requires concurrent sessions, not the rollback fixture. | Executed evidence in report section “Authorized isolated per-test concurrency runs”: two sessions, `P0001`, lock wait, final 40 INR balance, one paid payout, and verified exact-name database cleanup. |
| F23 | Action checks `:249-265` | Expected action types/entities for approval, consent, verification, clear/refund, disbursement approval/payment asserted. Does not assert each event's actor/time/change fields or force mid-workflow rollback; atomicity clause is untested. Partial. | Action-name/entity assertions are in recorded script run; stronger metadata/atomicity requirements not evidenced. |
| F24 | `:271-278` | Asserts donation delete; ledger/audit update+delete; refund update; refund-scope delete; consent delete. No refund delete or consent update assertion. Partial. | Present append-only assertions are in recorded script run; missing operations unverified. |
| F25 | `:75-76` | Donation currency update to USD expected `P0001`; no non-INR ledger insert is tested. Partial. | Currency assertion is in recorded script run; ledger-currency path unverified. |
| F26 | No dedicated forced mid-workflow rollback block. The file-level `ROLLBACK` at `:282-283` rolls back the whole synthetic fixture. | Fixture rollback is cleanup, not a test that a failure midway through clear/refund/payout atomically rolls back all related writes. | Script's final rollback is observed; F26's induced atomicity scenario was not run. |
| F27 | Not in single-session SQL file; two-session procedure in `tests/test-plan.md:13-19` | Requires genuinely concurrent sessions. | Executed evidence in report section “Authorized isolated per-test concurrency runs”: A committed 60 INR; B waited then got `P0001` and rolled back; final pledge/donation/ledger/audit invariant and exact-name cleanup verified. |

### Reconciliation findings and remaining gaps

- Direct single-session assertions with recorded aggregate execution evidence: F01, F04, F05's successful-state transition guard, F06, F07, F08, F10, F13, F14, F15's rejection outcomes, F16, and the assertion portions of F17, F20, F21, F23, F24, and F25. These do not imply the unasserted portions listed above.
- Actual concurrent execution evidence exists only for F22 and F27; both are documented independently from the rollback-based script.
- No direct case exists for F03, F09, F11, F18, F19, or F26. F02, F12, F15 residue, F17 residue, F20 paid-state/atomicity, F21 blank-reference residue, F23 metadata/atomicity, F24 refund-delete/consent-update, and F25 ledger-currency are only partial or unverified.
- The dated report's early statements that no concurrency tests ran and the later blocked attempt predate the authorized isolated runs; the later section supersedes those statements for F22/F27. The regression script exit code is aggregate evidence only; case-level confidence is bounded by the explicit assertions mapped above.
- The SQL file's line 3 execution-status comment conflicts with the later observed execution entry in this report; the comment should be reconciled in a future authorized code edit.

### Files inspected and changed

Inspected: `docs/database-execution-report.md`, `tests/test-plan.md`, `tests/financial-integrity.sql`. Changed: `tests/test-plan.md` statuses/descriptions for evidence-supported direct, partial, and absent coverage; this dated audit section was appended to this report. No SQL or schema/workflow files changed. Static audit only; no test was executed during this reconciliation.

## Focused financial-integrity assertion hardening — 2026-10-22

### Static changes

Pre-edit inspection covered this report, `tests/test-plan.md`, `tests/financial-integrity.sql`, `database/schema.sql`, and `database/workflows.sql`. The active fixture is one `BEGIN` / one `DO` block / final `ROLLBACK` (`tests/financial-integrity.sql:4-6, 27-344, 347`). The relevant identifiers are obtained with `INSERT ... RETURNING` into `v_donation_a`, `v_restriction_id`, `v_donation_b`, `v_unverified_id`, and the disbursement variables; the tests do not rely on sequence IDs. `post_donation_refund` duplicate reference expects `23505`; excessive refund expects `P0001`; disbursement payment rejections expect `P0001`. Schema relations link refund scope and ledger entries to the source donation/disbursement; `payment_reference` and `paid_at` are nullable until payment. The payment workflow validates nonblank reference before its update, while payment ledger/audit are generated only by a successful transition to PAID.

Added assertions in `tests/financial-integrity.sql`:

- F12 checks exactly two clearing ledger entries for the 60 INR source donation: +40 INR in the matching restriction and +20 INR with `restriction_id IS NULL`, both in INR and the donation's campaign.
- F15 snapshots the source donation's refund header, scope, refund-ledger, and refund-audit counts before the duplicate-reference and excessive-refund attempts, and checks all four counts unchanged after each expected SQLSTATE.
- F17 checks the rejected unverified-beneficiary disbursement remains PENDING with null payment reference and `paid_at`, with no disbursement ledger row or `DISBURSEMENT_PAID` audit row.
- F21 uses a new approved pending disbursement for the blank-reference attempt, then checks the pending state, null payment fields, and absence of payment ledger/audit residue.

The test plan now reflects these assertions and their observed run. Other cases were not expanded. Existing transaction boundaries and assertions were retained.

The stale line 3 comment identified in the preceding static audit was corrected to point to this execution report. That final edit changed only a SQL comment; the executable SQL body run below is unchanged.

### Execution preflight and setup

Branch check: `pbl-mid-evaluation`; repository root remained `.`. Existing uncommitted changes were preserved. On PostgreSQL 18.6, the exact-name preflight was run read-only against the `postgres` maintenance database before creation:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user; SELECT COUNT(*) FROM pg_database WHERE datname='charity_fi_hardening_20261022_6d3c9b'; ROLLBACK;"
```

Observed: `18.6|postgres|postgres`, target count `0`; exit code 0. Only then was the uniquely named disposable database created:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE charity_fi_hardening_20261022_6d3c9b;"
```

Observed `CREATE DATABASE`; exit code 0. The schema, workflows, and regression script were applied only to this new database:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_fi_hardening_20261022_6d3c9b -f database/schema.sql
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_fi_hardening_20261022_6d3c9b -f database/workflows.sql
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_fi_hardening_20261022_6d3c9b -f tests/financial-integrity.sql
```

Schema setup exited 0 and emitted `COMMIT`. Workflow setup exited 0 and emitted `COMMIT`. The regression invocation exited 0 with output ending `DO` then `ROLLBACK`; no assertion failed and no SQLSTATE escaped the test helper. The new expected-error assertions exercised `23505` for the duplicate refund reference and `P0001` for excessive refund, unverified-beneficiary payment, and blank-reference payment. The F12 exact-split assertion also completed. No first failure occurred.

### Rollback and cleanup verification

After the regression command closed, the following read-only command was run against the new database:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_fi_hardening_20261022_6d3c9b -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user||'|'||current_schema(); SELECT 'organization',COUNT(*) FROM organization UNION ALL SELECT 'donor',COUNT(*) FROM donor UNION ALL SELECT 'campaign',COUNT(*) FROM campaign UNION ALL SELECT 'pledge',COUNT(*) FROM pledge UNION ALL SELECT 'donation',COUNT(*) FROM donation UNION ALL SELECT 'beneficiary',COUNT(*) FROM beneficiary UNION ALL SELECT 'fund_restriction',COUNT(*) FROM fund_restriction UNION ALL SELECT 'donation_restriction',COUNT(*) FROM donation_restriction UNION ALL SELECT 'donation_refund',COUNT(*) FROM donation_refund UNION ALL SELECT 'donation_refund_scope',COUNT(*) FROM donation_refund_scope UNION ALL SELECT 'disbursement',COUNT(*) FROM disbursement UNION ALL SELECT 'audit_log',COUNT(*) FROM audit_log UNION ALL SELECT 'fund_ledger_entry',COUNT(*) FROM fund_ledger_entry UNION ALL SELECT 'donor_consent_event',COUNT(*) FROM donor_consent_event ORDER BY 1; SELECT 'purpose_category',COUNT(*) FROM purpose_category; ROLLBACK;"
```

It returned identity `18.6|charity_fi_hardening_20261022_6d3c9b|postgres|public`; all 14 project data tables, including donation, refund, refund-scope, disbursement, audit, and ledger, had 0 rows. The five seeded `purpose_category` rows remained; exit code 0. Thus the synthetic fixture transaction rolled back; sequences were not reset.

Immediately before cleanup, this read-only exact-name catalog query was run on `postgres`:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT d.datname||'|'||pg_get_userbyid(d.datdba)||'|'||COUNT(a.pid) FROM pg_database d LEFT JOIN pg_stat_activity a ON a.datname=d.datname WHERE d.datname='charity_fi_hardening_20261022_6d3c9b' GROUP BY d.datname,d.datdba; ROLLBACK;"
```

It returned `charity_fi_hardening_20261022_6d3c9b|postgres|0` (database, owner, active session count); exit code 0. The test session was closed. The exact disposable database was dropped:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -c "DROP DATABASE charity_fi_hardening_20261022_6d3c9b;"
```

Observed `DROP DATABASE`; exit code 0. A subsequent read-only exact-name existence query was run:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT COUNT(*) FROM pg_database WHERE datname='charity_fi_hardening_20261022_6d3c9b'; ROLLBACK;"
```

It returned `0`; exit code 0. Cleanup is verified. `charity_portal_test` and `charity_portal_financial_review` were not connected to or modified. Credentials are omitted. No commit or push was made.

### Outcome and remaining gaps

- Executed: schema setup, workflow setup, and `tests/financial-integrity.sql` on the disposable database; all exited 0.
- The strengthened F12, F15, F17, and F21 assertions all ran in the successful regression execution.
- The final test transaction rolled back its synthetic rows; exact database owner/session check, drop, and post-drop absence were verified.
- Static changes: `tests/financial-integrity.sql` (four assertions plus the corrected execution-status comment) and `tests/test-plan.md`; execution evidence appended here. No schema/workflow changes.
- This batch did not add F03, F09, F11, F18, F19, F20, F23, F24, F25, or F26 coverage. Prior remaining gaps recorded above are unchanged.

## Focused allocation integrity tests F09/F11 — 2026-10-22

### Static inspection and implementation

Read this report first, then `tests/test-plan.md`, `tests/financial-integrity.sql`, `database/schema.sql`, and `database/workflows.sql`. Confirmed branch `pbl-mid-evaluation`; the pre-existing uncommitted work was preserved. No schema or workflow edits were made.

For F09, `database/schema.sql` defines both `FOREIGN KEY (donation_id, campaign_id) REFERENCES donation(donation_id, campaign_id)` and `FOREIGN KEY (campaign_id, restriction_id) REFERENCES fund_restriction(campaign_id, restriction_id)` on `donation_restriction`. The test uses a valid donation in campaign A and an existing restriction in campaign B, while supplying campaign A as the allocation campaign. The allocation trigger's campaign match and amount checks therefore pass; the donation/campaign composite FK also passes; the campaign/restriction composite FK rejects the mismatched pair with SQLSTATE `23503`. The test then asserts no allocation row exists for that donation. This exercises the relevant composite rule, not an unrelated missing-key case.

For F11, `guard_donation_allocation()` in `database/workflows.sql` raises an exception with default SQLSTATE `P0001` when a donation already has a `DONATION_CLEARING` ledger entry. The existing allocation is a valid 40 INR on a 60 INR donation. The test clears through `clear_donation()`, attempts both an update and a delete, expects `P0001` for each, and after each failure checks the original allocation is unchanged and the two original clearing entries remain (+40 INR in that restriction, +20 INR unrestricted).

The rollback fixture IDs are generated via `INSERT ... RETURNING`, and all tests run in the existing one-transaction `BEGIN` / `DO` / final `ROLLBACK` style. No design gap was found for these two rules; the composite FK and workflow guard enforce them.

### Execution preflight and commands

An earlier setup attempt in this turn used `charity_fi_hardening_20261022_6d3c9b` before the F09/F11 edits were added. That run covered the previously recorded F12/F15/F17/F21 script version only; it is not counted as evidence for F09/F11. It was a new database at the time, and its fixture rollback, owner/session check, drop, and post-drop absence were verified. The final F09/F11 run used a different fresh database name below.

The F09/F11 database name was `charity_f09_f11_20261022_1a7e4d`. A read-only exact-name check on PostgreSQL 18.6 returned server/database/user `18.6|postgres|postgres` and count `0`; exit code 0:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user; SELECT COUNT(*) FROM pg_database WHERE datname='charity_f09_f11_20261022_1a7e4d'; ROLLBACK;"
```

Only after that absence result, the exact database was created and initialized:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE charity_f09_f11_20261022_1a7e4d;"
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_f09_f11_20261022_1a7e4d -f database/schema.sql
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_f09_f11_20261022_1a7e4d -f database/workflows.sql
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_f09_f11_20261022_1a7e4d -f tests/financial-integrity.sql
```

Observed results: create returned `CREATE DATABASE`, exit 0; schema and workflow scripts each exited 0 and committed; regression script output was `BEGIN`, `SET`, `SET`, `CREATE TABLE`, `CREATE FUNCTION`, `DO`, `ROLLBACK`, exit 0. No assertion failure was reported. F09's invalid allocation returned expected/actual SQLSTATE `23503`, then its no-row assertion held. F11's update and delete each returned expected/actual SQLSTATE `P0001`; the post-failure allocation and ledger assertions held after both operations. The helper catches and compares `RETURNED_SQLSTATE`, so expected SQLSTATEs are validated within the DO block and do not print as top-level psql errors. No unexpected SQLSTATE or first failure occurred.

### Rollback and cleanup verification

After the psql test process closed, this read-only inventory was run against the test database:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d charity_f09_f11_20261022_1a7e4d -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user||'|'||current_schema(); SELECT 'organization',COUNT(*) FROM organization UNION ALL SELECT 'donor',COUNT(*) FROM donor UNION ALL SELECT 'campaign',COUNT(*) FROM campaign UNION ALL SELECT 'pledge',COUNT(*) FROM pledge UNION ALL SELECT 'donation',COUNT(*) FROM donation UNION ALL SELECT 'beneficiary',COUNT(*) FROM beneficiary UNION ALL SELECT 'fund_restriction',COUNT(*) FROM fund_restriction UNION ALL SELECT 'donation_restriction',COUNT(*) FROM donation_restriction UNION ALL SELECT 'donation_refund',COUNT(*) FROM donation_refund UNION ALL SELECT 'donation_refund_scope',COUNT(*) FROM donation_refund_scope UNION ALL SELECT 'disbursement',COUNT(*) FROM disbursement UNION ALL SELECT 'audit_log',COUNT(*) FROM audit_log UNION ALL SELECT 'fund_ledger_entry',COUNT(*) FROM fund_ledger_entry UNION ALL SELECT 'donor_consent_event',COUNT(*) FROM donor_consent_event ORDER BY 1; SELECT 'purpose_category',COUNT(*) FROM purpose_category; ROLLBACK;"
```

It returned `18.6|charity_f09_f11_20261022_1a7e4d|postgres|public`; all 14 project data tables were empty, while the five seeded purpose categories remained. Exit code 0. This confirms the synthetic fixture rollback; sequences were not reset.

Before dropping, this read-only exact-name check against `postgres` returned database, owner, and active-session count `charity_f09_f11_20261022_1a7e4d|postgres|0`; exit code 0:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT d.datname||'|'||pg_get_userbyid(d.datdba)||'|'||COUNT(a.pid) FROM pg_database d LEFT JOIN pg_stat_activity a ON a.datname=d.datname WHERE d.datname='charity_f09_f11_20261022_1a7e4d' GROUP BY d.datname,d.datdba; ROLLBACK;"
```

The exact disposable database was dropped, exit 0:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -c "DROP DATABASE charity_f09_f11_20261022_1a7e4d;"
```

A final read-only exact-name count returned `0`, exit code 0:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT COUNT(*) FROM pg_database WHERE datname='charity_f09_f11_20261022_1a7e4d'; ROLLBACK;"
```

Cleanup is verified. Neither `charity_portal_test` nor `charity_portal_financial_review` was accessed or modified. Credentials are omitted. No commit or push was made.

### Outcome and remaining gaps

- F09 passed its direct composite-FK rejection (`23503`) and no-allocation-row assertion.
- F11 passed both immutability rejections (`P0001`) and verified the original allocation and 40/20 INR clearing entries remained intact after each.
- Current regression execution passed: schema, workflows, and test script all exited 0; synthetic data rolled back; owner/session checks and exact database cleanup verified.
- Changed files in this batch: `tests/financial-integrity.sql`, `tests/test-plan.md`, and this report. No schema/workflow changes.
- Remaining cases are unchanged; the next focused work should target other unimplemented integrity tests rather than expand this batch retroactively.

## F03 campaign-state and audit regression - 2026-10-22

### Static inspection and assertions added

Read this report first, then `tests/test-plan.md`, `tests/financial-integrity.sql`, `database/schema.sql`, and `database/workflows.sql`. Confirmed branch `pbl-mid-evaluation`; all pre-existing working-tree changes were preserved. The relevant campaign guard is `guard_campaign_state()` in `database/workflows.sql`: campaigns start `PENDING`/`DRAFT`; changing to `ACTIVE` requires approval and an inclusive current-date window. The guard does not define a general transition graph for all enum values. Thus this test treats activation before approval as the prohibited transition actually enforced by the implementation, rather than assuming all status changes are prohibited. `PAUSED` is the implemented inactive state; no `SUSPENDED` campaign status exists (suspension is an approval status).

The new F03 block in `tests/financial-integrity.sql` uses its own synthetic campaign. It attempts `PENDING`/`DRAFT` to `ACTIVE` and expects `P0001`; it then verifies the campaign remains pending/draft and its campaign audit count is unchanged. It approves and activates the campaign, then pauses it. It verifies exactly one `CAMPAIGN_STATUS_ACTIVE` event and one `CAMPAIGN_STATUS_PAUSED` event for that campaign, including entity type/ID, actor `synthetic-test-operator`, non-null timestamp, and old/new status snapshots. Finally, a pledge insert against the paused campaign expects `P0001` from the shared approved/active/date gate and verifies no pledge, campaign state change, or additional campaign audit event remains. The design contract stores actor, time, and JSON old/new snapshots, so these metadata are asserted. No workflow/schema change was needed.

### Execution and observed results

PostgreSQL server version was 18.6. The exact disposable name was `charity_f03_stateaudit_20261022_b71c`. A first read-only preflight attempt had a local pager configuration issue (`cat` was not recognized) and did not produce usable query output; it made no database change. The corrected exact-name preflight below returned server/database/user `18.6|postgres|postgres` and database count `0`, exit code 0. The database was created only after that clean absence result.

Exact commands (PowerShell, password requested interactively with `-W`; no credential is recorded):

```powershell
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user; SELECT COUNT(*) FROM pg_database WHERE datname='charity_f03_stateaudit_20261022_b71c'; ROLLBACK;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE charity_f03_stateaudit_20261022_b71c;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_f03_stateaudit_20261022_b71c -f database/schema.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_f03_stateaudit_20261022_b71c -f database/workflows.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_f03_stateaudit_20261022_b71c -f tests/financial-integrity.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_f03_stateaudit_20261022_b71c -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user||'|'||current_schema(); SELECT 'organization',COUNT(*) FROM organization UNION ALL SELECT 'donor',COUNT(*) FROM donor UNION ALL SELECT 'campaign',COUNT(*) FROM campaign UNION ALL SELECT 'pledge',COUNT(*) FROM pledge UNION ALL SELECT 'donation',COUNT(*) FROM donation UNION ALL SELECT 'beneficiary',COUNT(*) FROM beneficiary UNION ALL SELECT 'fund_restriction',COUNT(*) FROM fund_restriction UNION ALL SELECT 'donation_restriction',COUNT(*) FROM donation_restriction UNION ALL SELECT 'donation_refund',COUNT(*) FROM donation_refund UNION ALL SELECT 'donation_refund_scope',COUNT(*) FROM donation_refund_scope UNION ALL SELECT 'disbursement',COUNT(*) FROM disbursement UNION ALL SELECT 'audit_log',COUNT(*) FROM audit_log UNION ALL SELECT 'fund_ledger_entry',COUNT(*) FROM fund_ledger_entry UNION ALL SELECT 'donor_consent_event',COUNT(*) FROM donor_consent_event ORDER BY 1; SELECT 'purpose_category',COUNT(*) FROM purpose_category; ROLLBACK;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT d.datname||'|'||pg_get_userbyid(d.datdba)||'|'||COUNT(a.pid) FROM pg_database d LEFT JOIN pg_stat_activity a ON a.datname=d.datname WHERE d.datname='charity_f03_stateaudit_20261022_b71c' GROUP BY d.datname,d.datdba; ROLLBACK;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -c "DROP DATABASE charity_f03_stateaudit_20261022_b71c;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT COUNT(*) FROM pg_database WHERE datname='charity_f03_stateaudit_20261022_b71c'; ROLLBACK;"
```

Observed exit codes: preflight 0; create 0; schema 0; workflows 0; regression script 0; post-test inventory 0; owner/session check 0; drop 0; post-drop exact-name count 0. The regression output ended with `ROLLBACK`. The F03 exception helper caught and compared both expected SQLSTATEs: activation before approval expected/observed `P0001`, and pledge against `PAUSED` campaign expected/observed `P0001`. The valid status-audit assertions completed for both activation and pause with matching action/entity/actor/time/snapshot checks. All other existing script assertions also completed without an uncaught failure. This is actual execution evidence, not static-only review.

### Rollback, cleanup, and outcome

The read-only post-test inventory identified `18.6|charity_f03_stateaudit_20261022_b71c|postgres|public`; each project data table (`organization`, `donor`, `campaign`, `pledge`, `donation`, `beneficiary`, `fund_restriction`, `donation_restriction`, `donation_refund`, `donation_refund_scope`, `disbursement`, `audit_log`, `fund_ledger_entry`, and `donor_consent_event`) had zero rows. The five static `purpose_category` seed rows remained. This confirms the regression fixture transaction rolled back.

Before cleanup, the exact database identity and owner/session query returned `charity_f03_stateaudit_20261022_b71c|postgres|0`; the test client had closed and no sessions were active. The exact newly created database was dropped (exit 0), and a read-only exact-name catalog check returned `0` (exit 0). Cleanup is verified. No other database was accessed; in particular `charity_portal_test` and `charity_portal_financial_review` were untouched.

Changed files for this batch: `tests/financial-integrity.sql`, `tests/test-plan.md`, and this report. `git diff --check` returned exit 0; only line-ending conversion warnings on existing working-tree files were reported. No commit or push was made.

Remaining coverage gaps include F18/F19 purpose-code rejection, full F20 payout assertions, F23 audit atomicity/metadata across all required business events, F24 missing immutable-history operations, F25 direct non-INR ledger insertion, and F26 induced rollback atomicity. The campaign guard also does not implement a complete transition graph; this test covers the concrete enforced rejection (activation before approval) and valid active/pause transitions only.

## F18/F19 purpose-code enforcement regression - 2026-10-22

### Static inspection and test setup

Read this report first, then `tests/test-plan.md`, `tests/financial-integrity.sql`, `database/schema.sql`, and `database/workflows.sql`. Confirmed branch `pbl-mid-evaluation`; all pre-existing changes were preserved.

`guard_disbursement_payment()` in `database/workflows.sql` checks the required actor, payment reference, payable state, approval metadata, campaign lock, and verified beneficiary before evaluating purpose. For restricted payouts, it requires a `fund_restriction` row matching both campaign and restriction ID with `allowed_purpose_code = disbursement.purpose_code`. Failure raises `P0001` (`Purpose code is not allowed by this restriction`). For unrestricted payouts, it requires `disbursement.purpose_code = campaign.purpose_code`; failure raises `P0001` (`Purpose code must match campaign purpose`). Both checks precede the available-balance check, so the tests also set verified beneficiaries, approved payouts, and sufficient funds in the exact relevant scopes. Payment references are unique and nonblank. The subsequent paid ledger/audit trigger runs only after the BEFORE guard permits the state change.

F18 adds an approved/active campaign, a FOOD-only restriction, a verified beneficiary, and a cleared 10 INR donation allocated entirely to that restriction. It approves a 5 INR payout using purpose `GENERAL`, intentionally mismatching the restriction's `FOOD`. A fixture precondition confirms verified beneficiary and at least 5 INR restricted balance. The test calls `pay_disbursement` with a unique reference, expects `P0001`, then checks the payout remains `PENDING`, payment reference and paid timestamp are null, and no payout ledger or `DISBURSEMENT_PAID` audit row exists for that disbursement.

F19 adds a separate approved/active GENERAL campaign, verified beneficiary, and cleared 10 INR unallocated donation, producing sufficient unrestricted balance. It approves a 5 INR unrestricted payout with purpose `FOOD`, intentionally mismatching the campaign's `GENERAL`. The fixture precondition confirms verified beneficiary and at least 5 INR unrestricted balance. It then expects `P0001` and checks the same unchanged pending/payment metadata and absence of payout ledger and paid audit rows. The test transaction and final `ROLLBACK` remain intact. No schema or workflow edits were made.

### Execution and observed results

PostgreSQL server version was 18.6. The exact new disposable database name was `charity_f18_f19_purpose_20261022_d84c2a`. The exact-name read-only preflight returned `18.6|postgres|postgres` and count `0`, exit code 0. Database creation happened only after that absence result.

Exact commands (PowerShell; `-W` prompted for authentication interactively; credentials are omitted):

```powershell
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user; SELECT COUNT(*) FROM pg_database WHERE datname='charity_f18_f19_purpose_20261022_d84c2a'; ROLLBACK;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE charity_f18_f19_purpose_20261022_d84c2a;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_f18_f19_purpose_20261022_d84c2a -f database/schema.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_f18_f19_purpose_20261022_d84c2a -f database/workflows.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_f18_f19_purpose_20261022_d84c2a -f tests/financial-integrity.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_f18_f19_purpose_20261022_d84c2a -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user||'|'||current_schema(); SELECT 'organization',COUNT(*) FROM organization UNION ALL SELECT 'donor',COUNT(*) FROM donor UNION ALL SELECT 'campaign',COUNT(*) FROM campaign UNION ALL SELECT 'pledge',COUNT(*) FROM pledge UNION ALL SELECT 'donation',COUNT(*) FROM donation UNION ALL SELECT 'beneficiary',COUNT(*) FROM beneficiary UNION ALL SELECT 'fund_restriction',COUNT(*) FROM fund_restriction UNION ALL SELECT 'donation_restriction',COUNT(*) FROM donation_restriction UNION ALL SELECT 'donation_refund',COUNT(*) FROM donation_refund UNION ALL SELECT 'donation_refund_scope',COUNT(*) FROM donation_refund_scope UNION ALL SELECT 'disbursement',COUNT(*) FROM disbursement UNION ALL SELECT 'audit_log',COUNT(*) FROM audit_log UNION ALL SELECT 'fund_ledger_entry',COUNT(*) FROM fund_ledger_entry UNION ALL SELECT 'donor_consent_event',COUNT(*) FROM donor_consent_event ORDER BY 1; SELECT 'purpose_category',COUNT(*) FROM purpose_category; ROLLBACK;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT d.datname||'|'||pg_get_userbyid(d.datdba)||'|'||COUNT(a.pid) FROM pg_database d LEFT JOIN pg_stat_activity a ON a.datname=d.datname WHERE d.datname='charity_f18_f19_purpose_20261022_d84c2a' GROUP BY d.datname,d.datdba; ROLLBACK;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -c "DROP DATABASE charity_f18_f19_purpose_20261022_d84c2a;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT COUNT(*) FROM pg_database WHERE datname='charity_f18_f19_purpose_20261022_d84c2a'; ROLLBACK;"
```

Observed exit codes: preflight 0; create 0; schema 0; workflows 0; regression script 0; post-test inventory 0; owner/session check 0; drop 0; post-drop exact-name count 0. The regression output ended in `ROLLBACK`. The assertion helper captured and matched expected/observed SQLSTATE `P0001` for F18 and F19. F18 reached the restriction purpose guard with a verified beneficiary, approved payout, and sufficient FOOD-scope balance; F19 reached the campaign purpose guard with a verified beneficiary, approved payout, and sufficient unrestricted balance. Each direct post-failure state/ledger/audit assertion completed. The full script also completed with no uncaught assertion failure; that aggregate result is supplementary to the two direct case assertions.

### Rollback, cleanup, and outcome

The post-test read-only inventory returned `18.6|charity_f18_f19_purpose_20261022_d84c2a|postgres|public`. All project data tables had zero rows; the five `purpose_category` seed rows remained. The rollback-based regression's synthetic records were therefore absent.

Before dropping, the exact database/owner/session query returned `charity_f18_f19_purpose_20261022_d84c2a|postgres|0`. The exact database created for this run was dropped (exit 0), and a subsequent exact-name catalog query returned `0` (exit 0). Cleanup is verified. Neither `charity_portal_test` nor `charity_portal_financial_review` was accessed or modified.


F18 and F19 are now directly asserted and executed with expected/observed SQLSTATE `P0001` and no-partial-payment invariants. This supersedes the earlier F03 report's remaining-gap mention for F18/F19. Other noted gaps remain, including full F20 payout assertions, F23 audit atomicity/metadata coverage, F24 missing append-only operations, F25 direct non-INR ledger insertion, and F26 induced rollback atomicity. Changed files for this batch: `tests/financial-integrity.sql`, `tests/test-plan.md`, and this appended report section. `git diff --check` exited 0 with only existing line-ending conversion warnings. No commit or push was made.

## A1 consolidated integrity hardening and development-readiness run - 2026-10-22

### Preflight and static review

Read this execution report first, then `tests/test-plan.md`, `tests/financial-integrity.sql`, `database/schema.sql`, `database/workflows.sql`, `docs/design-decisions.md`, `docs/project-brief.md`, `docs/mid-evaluation-report.md`, and `docs/database-setup-and-demo.md`. Confirmed repository branch `pbl-mid-evaluation`; existing uncommitted changes were preserved. Work was limited to the requested SQL tests, test plan, and this report. No schema/workflow redesign was made.

This dated entry supersedes the earlier static-only F02/F05/F20/F21/F23-F26 mappings in this report, and the earlier F18/F19 gap statements. Those earlier entries remain intact as historical snapshots of evidence available at their dates; the results below reflect the later assertions and execution.

Static review confirmed:

- F20's successful payout trigger writes a single negative ledger row and a `DISBURSEMENT_PAID` audit record after payment state changes. F20 now checks `PAID`, supplied reference, non-null paid time, one exact negative INR ledger row with campaign/restriction/reference, one audit action with entity/actor/time/old/new payment metadata, and the exact scoped balance decrease.
- F23 audit storage requires actor and timestamp. Workflow audit snapshots are populated for campaign approval, beneficiary verification, donation clearing/refund, and disbursement approval/payment. Consent audit stores a new-value snapshot of the appended consent event; no old-value snapshot is required for that insert event. Tests now check action/entity, actor, timestamp, and the relevant snapshots/fields.
- F24's `reject_history_mutation()` trigger raises default PL/pgSQL SQLSTATE `P0001` on refund deletion and consent update, consistent with existing append-only operations. The new assertions verify the selected refund and consent event remain unchanged.
- F25's `validate_ledger_source()` checks the actor, then rejects `currency <> 'INR'` with `P0001` before source and index checks. The direct attempted ledger row supplies a valid paid-disbursement ID, campaign/restriction, amount sign/value, and external reference, with only the currency deliberately set to USD. The existing paid source already has its unique ledger event; the test asserts the currency trigger's earlier `P0001` rather than relying on the later unique index or table check. No invalid row is retained.
- F26 uses a transaction-local test setting and a test-only `BEFORE INSERT ON audit_log` trigger. It raises `P0001` only for the selected audit action. For clearing, refund, and payout, the targeted audit insert occurs after the related ledger/business writes have begun, so the assertion checks statement rollback. The test explicitly drops the trigger and function, resets the local setting, and asserts those objects/configuration are absent before the script's final rollback.
- F02's campaign guard requires approval and `CURRENT_DATE` within the inclusive start/end dates for activation; the fund-acceptance guard applies the same inclusive date test. Tests cover before-start and after-end rejection and a same-day inclusive boundary that successfully activates and accepts a pledge.
- F05 follows the written project rule that *successful* online donations require nonblank unique transaction and receipt references. A pending online donation may be recorded before those provider values are available; moving it to successful without them fails the table check with `23514`. No spec text requires rejection at pending insertion.
- Static review of existing F15/F17/F21 found no need to duplicate their existing attempts. F15 checks refund header/scope/ledger/audit counts after duplicate and excessive failures; F17 checks pending state, null payment metadata, and no payment ledger/paid audit. F21's blank-reference case checks null payment metadata and no ledger/audit, but its over-balance and duplicate-reference cases do not assert null `payment_reference` and `paid_at`; F21 is recorded PARTIAL in the test plan. That is a test-coverage gap, not an observed workflow defect.

The older `docs/mid-evaluation-report.md`, `docs/database-setup-and-demo.md`, and `docs/verification-notes.md` contain statements that SQL/tests have not been executed. Those are stale relative to this and prior execution-report entries. They were not edited in this task; synchronize those narrative status statements in a separate documentation pass.

### Assertions and execution outcomes

Added or strengthened direct coverage:

- F02: pre-start and post-end activation expected/observed `P0001`; same-day inclusive-boundary activation and pledge insertion succeeded.
- F05: pending online insert without references succeeded; the missing-metadata successful-state transition matched `23514`; pending state and absence of `cleared_at`, clearing ledger, and clearing audit were asserted.
- F20: complete successful payout state, scoped ledger, audit metadata, and balance-delta assertions passed.
- F23: campaign approval, consent, beneficiary verification, donation clearing/refund, and disbursement approval/payment action/entity/actor/time/change metadata assertions passed.
- F24: refund deletion and consent update each matched `P0001`, and original refund/consent rows were asserted unchanged. Existing append-only assertions remain.
- F25: direct USD ledger insertion matched `P0001` from the currency trigger; the valid payout ledger remained the only ledger row for that disbursement.
- F26: audit-insert fault injection for clear, refund, and payout each matched `P0001`; state, ledger, refund/scope, payment, and audit rollback assertions passed. Test-only trigger/function/configuration absence was checked inside the test and again after it.

The first full regression invocation stopped at the combined F23 metadata assertion with this diagnostic: `psql:tests/financial-integrity.sql:755: ERROR: F23 required audit action/entity/actor/time/change metadata is missing or incorrect` (context: inline code block line 598). The CLI output did not print the SQLSTATE; because this was the test's default `RAISE EXCEPTION`, its code is `P0001` by PL/pgSQL default. No business rule was weakened. The audit checks were separated by event and refunded amounts in JSON snapshots were compared numerically rather than as text. The subsequent full invocation completed; this identifies the mismatch as the JSON numeric representation comparison, though the first combined diagnostic did not name the specific subcondition.

The new database name was `charity_a1_integrity_20261022_73fdc1`. PostgreSQL was 18.6. It was absent immediately before creation. Exact commands (PowerShell; `-W` prompted interactively; credentials are omitted):

```powershell
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user; SELECT COUNT(*) FROM pg_database WHERE datname='charity_a1_integrity_20261022_73fdc1'; ROLLBACK;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE charity_a1_integrity_20261022_73fdc1;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_a1_integrity_20261022_73fdc1 -f database/schema.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_a1_integrity_20261022_73fdc1 -f database/workflows.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_a1_integrity_20261022_73fdc1 -f tests/financial-integrity.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_a1_integrity_20261022_73fdc1 -f tests/financial-integrity.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_a1_integrity_20261022_73fdc1 -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user||'|'||current_schema(); SELECT 'organization',COUNT(*) FROM organization UNION ALL SELECT 'donor',COUNT(*) FROM donor UNION ALL SELECT 'campaign',COUNT(*) FROM campaign UNION ALL SELECT 'pledge',COUNT(*) FROM pledge UNION ALL SELECT 'donation',COUNT(*) FROM donation UNION ALL SELECT 'beneficiary',COUNT(*) FROM beneficiary UNION ALL SELECT 'fund_restriction',COUNT(*) FROM fund_restriction UNION ALL SELECT 'donation_restriction',COUNT(*) FROM donation_restriction UNION ALL SELECT 'donation_refund',COUNT(*) FROM donation_refund UNION ALL SELECT 'donation_refund_scope',COUNT(*) FROM donation_refund_scope UNION ALL SELECT 'disbursement',COUNT(*) FROM disbursement UNION ALL SELECT 'audit_log',COUNT(*) FROM audit_log UNION ALL SELECT 'fund_ledger_entry',COUNT(*) FROM fund_ledger_entry UNION ALL SELECT 'donor_consent_event',COUNT(*) FROM donor_consent_event ORDER BY 1; SELECT 'purpose_category',COUNT(*) FROM purpose_category; SELECT 'test_trigger',COUNT(*) FROM pg_trigger WHERE tgname='trg_fi_test_audit_fault'; SELECT 'test_function',COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fi_test_audit_fault'; SELECT 'persistent_fault_setting',COUNT(*) FROM pg_db_role_setting WHERE array_to_string(setconfig, ',') LIKE '%app.financial_integrity_fault_action=%'; SELECT 'workflow_function_count',COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'; ROLLBACK;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT d.datname||'|'||pg_get_userbyid(d.datdba)||'|'||COUNT(a.pid) FROM pg_database d LEFT JOIN pg_stat_activity a ON a.datname=d.datname WHERE d.datname='charity_a1_integrity_20261022_73fdc1' GROUP BY d.datname,d.datdba; ROLLBACK;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -c "DROP DATABASE charity_a1_integrity_20261022_73fdc1;"
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT COUNT(*) FROM pg_database WHERE datname='charity_a1_integrity_20261022_73fdc1'; ROLLBACK;"
```

The preflight returned `18.6|postgres|postgres` and `0`, exit 0. `CREATE DATABASE`, schema, and workflows each exited 0. The first regression run exited 1 at F23 as described; the corrective rerun exited 0 and output ended with `ROLLBACK`. The post-test inventory exited 0 and returned `18.6|charity_a1_integrity_20261022_73fdc1|postgres|public`; all 14 project data tables had zero rows and the five purpose categories remained. The same read-only check returned zero test triggers, zero test functions, zero persistent fault settings, and 29 workflow functions. The owner/session check returned `charity_a1_integrity_20261022_73fdc1|postgres|0`, exit 0. Exact-name drop exited 0 and exact-name post-drop count returned 0, exit 0. Cleanup is verified.

Neither `charity_portal_test` nor `charity_portal_financial_review` was accessed or modified. `git diff --check` exited 0 (Git emitted only existing LF-to-CRLF conversion warnings). No commit or push was made.

### Readiness assessment and remaining gaps

No critical database integrity defect was observed in this batch. Recommendation: **READY WITH DOCUMENTED GAPS** as a database development baseline for portal integration; this is not production readiness. Application development can proceed against the documented actor/workflow contract, but authorization and restricted database grants must be implemented before deployment because `app.actor_id` is caller-supplied context and owner/superuser trigger protections are not tamper-proof.

Remaining test gaps: F21 over-balance/duplicate-reference cases lack direct null-reference/paid-time assertions; F23/F26 do not inject faults into campaign approval or consent insertion (the single-row event writes are covered for metadata, while clear/refund/payout multi-write atomicity is fault-tested); broader authorization/grant enforcement is not verified. F02 and F05 requirements are not ambiguous in the supplied brief: dates gate active/fund acceptance inclusively, and online metadata is required on successful status rather than pending insert. The historical execution-status statements in the three documentation files above should be reconciled, but do not block starting portal development.

## Documentation reconciliation — 2026-10-22

This entry records a documentation-only cleanup authorized after pre-commit review. It preserves the preceding execution history and does not add execution evidence.

- Corrected `docs/relational-schema.md` to remove the nonexistent `fund_restriction.is_restricted` field and to describe the current physical schema accurately.
- Updated stale current-status claims in `README.md`, `docs/design-decisions.md`, `docs/database-setup-and-demo.md`, `docs/mid-evaluation-report.md`, `docs/relational-schema.md`, and `docs/verification-notes.md` using the observed PostgreSQL 18.6 execution results and current test plan. These updates state coverage limits and preserve prior failed-run details in this report.
- Replaced workstation-specific repository paths in this report with the repository-relative root marker `.`. No credentials were added.
- The earlier note above that a separate documentation pass remained necessary was accurate when written; this section records that it has now been completed.
- `tests/test-plan.md` was not changed: its current single-session, F21 partial, and F22/F27 concurrency statuses remain consistent with the execution history. SQL and regression files were not changed. No SQL was run and no database was accessed for this cleanup.

## DonateKaro target-blueprint implementation source update - 2026-10-23

This records static source work only. The approved target-state architecture was read from `DonateKaro_Target_Database_Architecture_and_Workflow.pdf`; the accompanying A1 task brief supplies the implementation authorization and its approved registered/guest, campaign-review, simulated-payment, and beneficiary-ownership decisions. No production or existing project database was accessed or modified in this pass.

- `database/schema.sql` adds identity/membership/role records, campaign review metadata, beneficiary organization ownership, guest capability digests, payment attempts, separate operation-scoped idempotency results, and a public eligible-campaign view. `verified_by` now accommodates the same 512-character server-derived principal used by audit and workflow metadata.
- `database/workflows.sql` adds role-checked campaign, beneficiary, donation creation, simulated payment, unknown-outcome reconciliation, refund, and disbursement workflows. The existing financial ledger, restriction, refund, pledge, and audit mechanisms remain in the baseline. The new API wrappers and related finance events are designed to share one transaction.
- `database/runtime-roles.sql` is a separate initializer for a non-login owner and restricted runtime role. It revokes public table, sequence, function and schema CREATE privileges, then grants only discovery-view SELECT and approved workflow execution. It does not create the application LOGIN. This script has not been run; role changes are cluster-wide and require separate review before execution.
- `backend/**` now includes OIDC principal validation, role-checked transaction helpers, workflow repositories/routes, money/identity schemas, default-off feature flags, and failure/unknown payment response handling. Donation, simulation, and general workflow flags remain false by default.
- `contracts/openapi.yaml` describes management and donation workflows. Static YAML parsing succeeded; the `Error.code` enum nesting was corrected. Formal OpenAPI validation and generated FastAPI schema comparison remain unperformed.
- `tests/financial-integrity.sql` fixtures now use workflow-based campaign review, beneficiary verification, and payout approval. New F28/F29 assertions cover creation idempotency, successful payment replay, payload conflicts, failed-attempt retry, timeout persistence, reconciliation, and receipt availability after clearing. These new assertions have not been executed.
- `tests/test-plan.md`, backend README/design notes, and database setup instructions were updated to distinguish current source from historical execution evidence and describe safe initialization, roles, and ownership handling.

No SQL was executed; no database was created or connected to. Python test execution was blocked: `python -m pytest -q` used `C:\msys64\ucrt64\bin\python.exe` 3.14.7 and returned `No module named pytest` (exit 1). `backend/.venv-cpython314\Scripts\python.exe -m pytest -q` could not start because its base interpreter at `C:\Users\ayans\AppData\Local\Programs\Python\Python314\python.exe` returned `Access is denied`. Current-source test results are therefore unverified. PostgreSQL integration, runtime login grants, legacy beneficiary mapping, and provider-independent payment simulation remain unverified. No staging, commit, or push occurred.

## A1 target-blueprint implementation verification update - 2026-10-23

### Backend checks actually executed

- In `backend/`, `& .\.venv-cpython314\Scripts\python.exe -m pip install -e ".[test]"` completed successfully. The existing declared dependency `PyJWT[crypto]` was missing from the venv and was installed as PyJWT 2.15.1 with its declared cryptography extra. No manifest or lockfile was changed.
- The initial test collection failed on a stale `activate_campaign` import. After removing the unused import, the suite exposed six existing campaign test expectation/fixture mismatches caused by selecting the eligibility view; tests were aligned to the actual query and response. The final command `& .\.venv-cpython314\Scripts\python.exe -m pytest -q` exited 0: 22 passed, one Starlette deprecation warning.
- Current `contracts/openapi.yaml` parsed with the venv's PyYAML. A read-only comparison against `app.openapi()` found 17/17 matching path/method operations, identical response status sets, matching JSON response schemas after resolving references, and 184 local component references with zero unresolved refs. No dedicated `openapi-spec-validator` is installed, so formal specification validation remains outstanding.

### Database execution blocker and actual state

The only PostgreSQL command attempted was a read-only exact-name preflight against the `postgres` catalog, using the local server and no password prompt:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user||'|'||current_schema(); SELECT COUNT(*) FROM pg_database WHERE datname='charity_a1_blueprint_20261023_9f0a2c'; ROLLBACK;"
```

It exited 2 with `fe_sendauth: no password supplied`. Connection was not established, the exact-name absence check did not run, and no database was accessed or modified. Therefore `schema.sql`, `workflows.sql`, `runtime-roles.sql`, and `tests/financial-integrity.sql` were not executed. The current F28/F29 SQL assertions and the full financial workflow revision remain unverified. `runtime-roles.sql` was not run because it creates cluster-wide roles and requires separate operational review.

No protected/existing database was connected to. `charity_portal_test` and `charity_portal_financial_review` were not accessed. No commit or push occurred.

## PostgreSQL integration verification follow-up - 2026-10-23

This was an environment/authentication diagnosis only. No database connection was established and no project database or server configuration was changed.

- psql --version reported PostgreSQL client 18.6.
- pg_isready -h localhost -p 5432 reported that localhost:5432 is accepting connections. The Windows service postgresql-x64-18 was reported running.
- Credential metadata inspection found no PGPASSWORD, PGPASSFILE, PGSERVICE, or PGSERVICEFILE environment setting; the default %APPDATA%\postgresql\pgpass.conf and pg_service.conf files were absent. No credential values were read or printed.
- Exact safe authentication probe:

~~~powershell
psql -X -w -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user||'|'||current_schema(); ROLLBACK;"
~~~

The probe exited 1 before connecting: fe_sendauth: no password supplied. The maintenance database identity was not obtained. No protected database was contacted, and no disposable database was created.
- Consequently, no current schema.sql, workflows.sql, runtime-roles.sql, or tests/financial-integrity.sql command was run. PostgreSQL-backed API integration, runtime-role grant checks, and F28/F29 remain unverified.

Minimum next step: configure an approved local authentication path for the intended administrative account, preferably a user-owned pgpass.conf with restrictive Windows ACLs or a DBA-provisioned equivalent. Do not place credentials in command text, repository files, or report output. After authentication is available, repeat the read-only server/database identity and exact-name absence preflight; proceed only if the disposable target name is confirmed absent.

### Independent backend/OpenAPI verification - 2026-10-23

After the PostgreSQL preflight blocker, the database-independent checks were completed:

- Installed openapi-spec-validator 0.9.0 into backend/.venv-cpython314 only. No pyproject, lockfile, or contract file was changed by installation.
- From backend/, command & '.\.venv-cpython314\Scripts\openapi-spec-validator.exe' '..\contracts\openapi.yaml' exited 0 and reported OK.
- From backend/, command & '.\.venv-cpython314\Scripts\python.exe' -m pytest -q exited 0: 22 passed, one Starlette deprecation warning.
- These checks do not establish PostgreSQL schema/workflow validity, database-backed API integration, runtime-role grants, or F28/F29 execution.

## A1 independent acceptance verification - 2026-10-23

### Authority and scope distinction

The user's current request authorized local PostgreSQL verification and API integration testing, specified the protected databases, and requested the root-level `currRport.mc` deliverable. The attached A1 task brief supplied the acceptance procedure and required evidence. `DonateKaro_Target_Database_Architecture_and_Workflow.pdf` is the target-design reference, not an independent grant of authority. Its contents could not be extracted in this environment: `pypdf` was unavailable in the installed backend venv, Poppler utilities were not installed, and the in-app browser rejected the `file:` URL under its security policy. No alternate browser or bypass was attempted. Accordingly, the acceptance matrix uses the A1 task brief and repository design/test evidence; a line-by-line PDF comparison remains unverified.

### Repository and database identity

- Repository branch: `pbl-mid-evaluation`. Existing 15-file staged milestone remained staged. No staging, commit, push, reset, or clean operation was performed. `presentation/DBMS.pptx` remained deleted and unstaged; `structure.md` remained untracked and untouched.
- The local PostgreSQL service was PostgreSQL 18.6 at `localhost:5432`. A read-only exact-name preflight had confirmed the newly selected disposable database name absent before its creation. The created database was `charity_a1_acceptance_20261023_9c4f2a`, owned by `postgres`; no connection was made to `charity_portal_test`, `charity_portal_financial_review`, or any other pre-existing project database.
- A supplied local password was entered through a hidden prompt and held transiently in process environment variables. No password value is recorded here or in repository source.
- Applied only to the disposable database, in order:

```powershell
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_a1_acceptance_20261023_9c4f2a -f database/schema.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_a1_acceptance_20261023_9c4f2a -f database/workflows.sql
psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_a1_acceptance_20261023_9c4f2a -f database/runtime-roles.sql
```

Each setup command exited 0. Before role setup, exact-name checks established that `charity_portal_owner` and `charity_portal_runtime` did not exist on the local PostgreSQL instance. A unique test LOGIN role, `charity_a1_runtime_login_20261023_9c4f2a`, was also created for this acceptance run, with membership only in `charity_portal_runtime`; it had no superuser, database-creation, or role-creation attributes. Its credential is intentionally omitted.

### Defects found and focused corrections

1. `database/workflows.sql`: `create_donation_idempotent` returned a `donation_id` OUT column and also used an unqualified `donation_id` in a subsequent query. PostgreSQL raised `42702` (ambiguous column) on the first current-source regression run. The function now copies the returned identifier into local variable `v_created_donation_id` and uses that variable for guest access, idempotency result, and audit lookup.
2. `tests/financial-integrity.sql`: F28 originally reused a unique guest-token digest across separate guest donations, causing `23505` on `donation_guest_access_token_sha256_key`. The timeout and failed-attempt cases now use distinct digests. A later F03 assertion expected `P1004` but observed `P1002` because F28 left the actor as a guest; the test now restores the reviewer actor before F03.
3. `tests/financial-integrity.sql`: payout test setup used one synthetic actor for request, approval, and payment, conflicting with the workflow's separation-of-duties guard. The fixture now uses distinct approver/operator roles and a temporary helper that sets the payout-operator actor around payment calls. Existing business rules were not weakened.
4. `database/schema.sql`: runtime access to the public discovery view initially failed because `campaign_accepts_donations` queried protected campaign rows as invoker. The helper is now `SECURITY DEFINER` with a fixed `pg_catalog, public` search path; runtime access was then tested through the granted view.
5. `backend/tests/test_postgres_acceptance.py`: the first complete API run reached its final invariant but the test expected 4 donation rows and observed 6 because the assertion had not included the two committed F27 donations. The expected total was corrected to 6 and clearing count to 4; the financial rule and test setup were unchanged.

An earlier API harness attempt also failed before feature assertions because fixture setup called `executemany` on the connection rather than its cursor. The test harness was corrected to use a cursor; that attempt did not leave committed fixtures. An initial launch under the restricted sandbox could not start CPython (`Access is denied`); retrying in the authorized local execution context ran the test. These environmental/harness failures are preserved as failures, not counted as successful test runs.

### Actual regression and API execution

The final rollback-based financial regression command was run from the repository root:

```powershell
psql -X -w -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d charity_a1_acceptance_20261023_9c4f2a -f tests/financial-integrity.sql
```

Exit code: `0`. Observed output ended with `DO` and `ROLLBACK`. This run executed the current SQL assertions F01-F21, F23-F26, F28 and F29. No assertion raised an unexpected error. F28/F29 were executed on this blueprint revision; this supersedes earlier report entries saying they had not yet run. F21 remains partial for the assertion gaps listed in `tests/test-plan.md`.

The opt-in database-backed API acceptance command was run from `backend/` with a transient runtime-role DSN and separate admin fixture DSN pointed only at the disposable database; `CHARITY_RUN_POSTGRES_ACCEPTANCE=1` was set only for that process:

```powershell
& '.\.venv-cpython314\Scripts\python.exe' -m pytest -q -s tests/test_postgres_acceptance.py
```

Final exit code: `0`, `1 passed`, one Starlette `TestClient` deprecation warning. One prior run exited 1 on the stale aggregate count assertion (`expected 4`, actual `6`); the corrected run passed. Assertions in the passing execution established:

- Authenticated campaign draft creation, cross-organization edit denial (403), submission, pending public-detail denial (404), reviewer approval, public detail and list success.
- Local test-JWKS RS256 authentication; unauthenticated protected write denial (401).
- Concurrent same-key guest donation requests synchronized by a two-party barrier returned 200/201 with one donation ID. Reusing the key with a changed payload returned 409. Guest access token ownership was required to read status.
- Simulated payment timeout stayed pending/unknown with no receipt; same-key timeout replay was marked replayed; changed outcome and a new payment attempt while unresolved were rejected; authorized reconciliation succeeded and only then exposed receipt/reference. Failed attempt had no receipt and a later success retry issued one.
- Refund idempotency replay returned the same refund ID. Registered donor creation succeeded. A verified beneficiary could be used; cross-organization beneficiary/campaign pairing was rejected. Payment to an unverified beneficiary was rejected. Same-actor disbursement approval was denied.
- Two payout HTTP requests were synchronized at a barrier and used independent `TestClient` database connections. Results were one HTTP 200 and one HTTP 409. Final assertions found one 70 INR paid disbursement and a matching -70 INR payout-ledger total, within the 80 INR available.
- F27 used two independent psycopg connections/transactions. Session A cleared 40 INR and committed. Session B began while A held the campaign-row lock; an observer saw B's PostgreSQL wait event type `Lock`. A committed, B received SQLSTATE `P0001`. Final assertions found pledge `PARTIALLY_FULFILLED`, donation A `SUCCESSFUL`, donation B `PENDING`, and exactly one +40 INR clearing row for that pair.

### Runtime-role and post-test observations

`database/runtime-roles.sql` exited 0 on the disposable database. Under `SET ROLE charity_portal_runtime`, read-only privilege checks showed: schema USAGE true; schema CREATE false; discovery-view SELECT true; direct campaign, donation and fund-ledger INSERT false; `create_campaign_draft` EXECUTE true; `clear_donation` EXECUTE false. The dedicated LOGIN was not a member of `charity_portal_owner`; runtime and owner roles were both NOLOGIN, NOSUPERUSER, NOCREATEDB and NOCREATEROLE.

After the passing run, a read-only inventory reported PostgreSQL 18.6; database `charity_a1_acceptance_20261023_9c4f2a`; user `postgres`; schema `public`; search path `"$user", public`. Purpose vocabulary had 5 rows. The database contained committed synthetic API fixtures from the acceptance runs (including 8 named acceptance campaigns and 3 paid synthetic payouts); this is expected for the opt-in API test and is not represented as a rolled-back fixture set. The SQL regression script itself ended with `ROLLBACK`, so its transaction-scoped fixtures were not persisted. Exact-name owner/session pre-drop verification returned `charity_a1_acceptance_20261023_9c4f2a|postgres|0`, exit 0.

### Database-independent checks

- From `backend/`, `& '.\.venv-cpython314\Scripts\python.exe' -m pytest -q`: exit 0; 22 passed, 1 opt-in database acceptance test skipped, 1 Starlette deprecation warning.
- From `backend/`, `& '.\.venv-cpython314\Scripts\openapi-spec-validator.exe' '..\contracts\openapi.yaml'`: exit 0; validator reported `OK`.
- From repository root, `git diff --check`: exit 0. `git diff --cached --check`: exit 0. Git emitted only the existing LF-to-CRLF working-copy warnings.

### Acceptance verdict and remaining gaps

- Campaign workflow: backend submission/review/public-list/detail path was exercised against PostgreSQL; full campaign states, frontend-to-live API integration, and production reviewer provisioning remain unverified.
- Financial workflow: relevant current SQL cases and simulated API write paths passed on the isolated test database, including idempotency, payment recovery, refunds, ledgers, and a concurrent pledge-clear/payout scenario. This does not authorize enabling financial write flags. No real payment provider was integrated; the test process enabled development/test simulation flags only. Source defaults remain disabled.
- Operations/security: not production-ready. The local test JWKS is not the production identity provider; grant deployment, production identity/role provisioning, guest-token expiry/revocation, backup/restore, and legacy-data migration/backfill were not verified. Audit fault injection covers clearing, refund and payout atomicity, but not campaign approval or consent insertion. F21 remains PARTIAL. Triggers do not protect against database owners/superusers.
- PDF-specific acceptance remains unverified because the local PDF could not be read under available tooling/security policy. No live/non-disposable project database was inspected.

### Cleanup status

Before removal, the exact database created for this run had owner `postgres` and zero active sessions. The role dependency check found the run-created owner/runtime role dependencies only in this disposable database, and the test login's only membership was in the run-created runtime role.

The exact command `psql -X -w -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -c "DROP DATABASE charity_a1_acceptance_20261023_9c4f2a;"` exited 0 and returned `DROP DATABASE`.

After the database was absent, the exact command `psql -X -w -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -c "REVOKE charity_portal_runtime FROM charity_a1_runtime_login_20261023_9c4f2a; DROP ROLE charity_a1_runtime_login_20261023_9c4f2a; DROP ROLE charity_portal_runtime; DROP ROLE charity_portal_owner;"` exited 0 and returned `REVOKE ROLE`, then three `DROP ROLE` results. These were only roles confirmed absent before this run and created for this run; their dependency count was zero after database removal.

A final read-only exact-name check ran in `BEGIN READ ONLY` / `ROLLBACK` and returned `0|0` (no matching disposable database and no matching run-created roles), exit 0. Cleanup is verified. No other database, role, or sequence was dropped/reset. The committed synthetic API fixtures were removed with the exact disposable database.

## Backend frontend-integration hardening - 2026-10-23

### Scope and static findings

- The repository snapshot had no `frontend/` directory. No live frontend API client or rendered browser flow was available to reconcile. The API contract is therefore based on the backend routes and the frontend-facing surfaces named in the A1 task, not on a current client implementation.
- Existing campaign submission, reviewer approval/rejection, public eligibility, named guest and registered donation, separate durable idempotency operations, simulated-payment outcomes, owned status/receipt, refunds, beneficiary verification/ownership, payout separation, and concurrent pledge/payout workflows were already present in source and prior dated PostgreSQL acceptance evidence.
- Missing backend reads needed for private UI surfaces were added as actor-scoped database functions and API routes: current organizations, organization dashboard counts, owned campaign list/detail, review queue, organization beneficiaries, and registered donor history. The API login remains without direct base-table SELECT/DML; `runtime-roles.sql` grants only the necessary function executions and the public discovery view.
- `amount_raised` is derived from posted donation-clearing and refund ledger deltas. Disbursement entries are excluded. Public progress is projected only through the eligibility-filtered view. The internal progress helper is not granted directly to the runtime role, avoiding arbitrary queries for unpublished campaigns.
- Donation status/receipt reads are owner-guarded and no longer depend on the financial-write feature flag. Protected organization, reviewer, refund, reconciliation, and payout routes now check authentication before returning a disabled-workflow response. Write defaults remain false.
- The current campaign review workflow supports `APPROVED` and `REJECTED`. Rejected campaigns remain editable/resubmittable; there is no distinct terminal-rejection versus request-changes state. No third decision was invented. O1 must clarify whether the current resubmittable `REJECTED` behavior is sufficient or whether separate persisted states are required.
- `F21` remains `PARTIAL`; audit fault-injection coverage and deployment authorization/grant checks remain limited as recorded above and in `tests/test-plan.md`. Triggers do not protect against database owners or superusers.

### Files changed

- `backend/app/api/donations.py`, `backend/app/api/management.py`, `backend/app/api/organizations.py`, `backend/app/api/review.py`, `backend/app/main.py`
- `backend/app/campaign_repository.py`, `backend/app/organization_repository.py`, `backend/app/schemas.py`
- `backend/tests/test_campaigns.py`, `backend/tests/test_frontend_reads.py`, `backend/tests/test_postgres_acceptance.py`
- `backend/README.md`, `backend/LOCAL_DEMO.md`, `backend/FRONTEND_INTEGRATION.md`
- `contracts/openapi.yaml`
- `database/schema.sql`, `database/workflows.sql`, `database/runtime-roles.sql`
- `coordination/TEAM_BOARD.md`

No file was staged, unstaged, committed, pushed, reset, cleaned, or reverted by this work. The 15-file staged database milestone, `structure.md`, and the intentional unstaged `presentation/DBMS.pptx` deletion were preserved.

### Executed database-independent checks

From `backend/`, the command `& '.\.venv-cpython314\Scripts\python.exe' -m pytest -q` exited `0`: `43 passed, 1 skipped, 1 warning`. The one skip is the opt-in PostgreSQL acceptance test; the warning is the existing Starlette `TestClient` deprecation notice. These results do not test the new SQL projections or their grants.

From `backend/`, the command `& '.\.venv-cpython314\Scripts\openapi-spec-validator.exe' '..\contracts\openapi.yaml'` exited `0` and reported `OK`. The current contract contains 24 operations. A generated FastAPI comparison found all 24 operations, response status sets, and generated component schemas aligned. Success and error response schemas also matched after resolving local references. Error codes are now a finite Pydantic/OpenAPI enum matching the codes emitted by the backend. The campaign list/detail responses both reference the campaign schema that includes `amount_raised`.

### PostgreSQL verification blocked before connection

Read-only environment probes showed `pg_isready -h localhost -p 5432` reported `localhost:5432 - accepting connections` (exit `0`) and `psql --version` reported client `18.6` (exit `0`). No PostgreSQL password environment variable or default pgpass/service file was present. A no-password read-only identity probe to the maintenance database `postgres` exited `1` before connecting with `fe_sendauth: no password supplied`. A masked credential prompt was started and cancelled before any credential was entered or any query ran.

No database identity was obtained; exact-name absence of the selected disposable target and cluster role absence were therefore not established. No database was created, initialized, queried, or dropped. `schema.sql`, `workflows.sql`, `runtime-roles.sql`, `tests/financial-integrity.sql`, and `tests/test_postgres_acceptance.py` were not executed in this checkpoint. The protected databases were not targeted. No claim is made about their present contents or the current target database's existence.

Minimum safe next step: make an approved noninteractive authentication path available to the local PostgreSQL administrator (for example, a user-owned pgpass file protected by Windows ACLs) or complete an interactive masked prompt, then perform a read-only exact-name and role preflight. Only if the chosen disposable database and required run-created roles are confirmed absent should a fresh isolated database be initialized. After setup, run the rollback financial regression and opt-in PostgreSQL acceptance test, inspect the exact database and fixture state, then clean up only resources created by that run.

## Final acceptance rerun - 2026-10-23 (LOCK PENDING)

This checkpoint reconciles the latest backend/frontend-integration source with earlier acceptance evidence. It did not access or modify a database. The earlier successful SQL/API run above remains historical evidence for the revision actually executed; it does not verify the later read projections, scoped SQL functions, runtime grants, or current PostgreSQL acceptance harness.

### Repository and scope

- Repository root: `.`; branch `pbl-mid-evaluation`; HEAD `389a8494e0ddfb286fffe875832277a698f932af`.
- The 15-file database milestone remains staged. The intentional `presentation/DBMS.pptx` deletion remains unstaged, and `structure.md` remains untracked and untouched. No Git mutation was performed.
- Current source still sets `workflows_enabled`, `donation_writes_enabled`, and `simulated_payments_enabled` to `false` by default (`backend/app/config.py`). Configuration blocks enabled writes outside development/test, without a loopback database target, and for the two protected database names.
- Current route inventory is implemented in `backend/app/api/`: public campaign list/detail; donation create, simulated payment, history, status, refund, and reconciliation; organization membership/dashboard/campaign/beneficiary reads; campaign/beneficiary/disbursement management; and reviewer queue. The contract describes 24 operations. No `frontend/` directory is present, so browser-to-API compatibility is not verified.

### Checks executed in this checkpoint

| Check | Exact command | Result |
|---|---|---|
| Project backend suite | From `backend/`: `& '.\\.venv-cpython314\\Scripts\\python.exe' -m pytest -q` | Exit 1 before test collection: `did not find executable at 'C:\\Users\\ayans\\AppData\\Local\\Programs\\Python\\Python314\\python.exe': Access is denied`. No tests ran. |
| System Python test probe | From `backend/`: `python -c "import sys,platform; print(sys.executable); print(platform.platform()); import pytest; print('pytest',pytest.__version__)"` | Python is `C:\\msys64\\ucrt64\\bin\\python.exe`, version 3.14.7, Windows 11; exit 1, `ModuleNotFoundError: No module named 'pytest'`. No packages were installed. |
| OpenAPI formal validator | From `backend/`: `& '.\\.venv-cpython314\\Scripts\\openapi-spec-validator.exe' '..\\contracts\\openapi.yaml'` | Exit 103 before validation: the venv launcher could not access the same CPython 3.14 base executable. Current formal validation was not completed. |
| YAML parser probe | From `backend/`: `python -c "import yaml; print('yaml',yaml.__version__)"` | Exit 1, `ModuleNotFoundError: No module named 'yaml'`. No other YAML/OpenAPI parser was found in the checked local Node environment. |
| Python syntax-only check | From `backend/`: `python -c "import ast,pathlib; files=list(pathlib.Path('app').rglob('*.py'))+list(pathlib.Path('tests').rglob('*.py')); [ast.parse(p.read_text(encoding='utf-8'), filename=str(p)) for p in files]; print(f'Parsed {len(files)} project Python files with ast.parse; syntax only')"` | Exit 0; 23 project Python files parsed. This is not a test-suite result. |
| PostgreSQL availability | `pg_isready -h localhost -p 5432`; `psql --version` | Server accepted connections; client is PostgreSQL 18.6. These probes do not establish authenticated server identity. |
| Read-only identity probe | `psql -X -w -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user||'|'||current_schema(); ROLLBACK;"` | Exit 1 before connection: `fe_sendauth: no password supplied`. No SQL statement reached PostgreSQL. |
| Masked authentication attempt | `psql -X -W -v ON_ERROR_STOP=1 -P pager=off -h localhost -p 5432 -U postgres -d postgres -At -c "BEGIN READ ONLY; SELECT current_setting('server_version')||'|'||current_database()||'|'||current_user||'|'||current_schema(); ROLLBACK;"` | Prompt appeared, but no credential was entered; process ended with `fe_sendauth: no password supplied`. No connection or query occurred. No credential was printed, hardcoded, or stored. |
| Whitespace checks | From repository root: `git diff --check`; `git diff --cached --check` | Both exit 0; Git printed only existing LF-to-CRLF working-copy warnings. |

No PostgreSQL identity, database catalog, target-name absence, run-role absence, owner/session state, SQL setup, runtime grants, financial regression, API integration, or cleanup could be verified in this checkpoint. No database was created, queried, initialized, modified, or dropped. Neither protected database was targeted. The minimum blocker is a locally protected, usable PostgreSQL administrator authentication path and a usable existing project Python interpreter; do not bypass authentication or change system/dependency configuration without authorization.

### Acceptance decision and remaining limits

**LOCK PENDING.** The prior recorded 43-pass database-independent suite and formal OpenAPI validation remain valid as historical results for their executed source revision, but could not be rerun here. The prior PostgreSQL acceptance run likewise remains evidence for its recorded revision only. Latest-source database projections/grants and acceptance behavior remain unverified. F21 remains PARTIAL; audit fault injection does not cover campaign approval or consent insertion; deployment authorization/grant evidence, production identity-provider operation, guest-token expiry/revocation, backup/restore, legacy-data migration/backfill, and frontend end-to-end integration remain open. Financial write defaults are still disabled. Do not declare the backend locked until the required current-source database, API, runtime-role, test-suite, and formal OpenAPI gates execute successfully with verified cleanup.

## A1 acceptance ownership retry - 2026-10-23

This retry independently rechecked the local environment and acceptance sources. The result remains **LOCK PENDING**. No database connection was established and no project database, role, or SQL file was changed.

### Source review

- Read the complete `backend/tests/test_postgres_acceptance.py`, `backend/app/database.py`, `backend/app/config.py`, `database/schema.sql`, `database/workflows.sql`, `database/runtime-roles.sql`, and `tests/test-plan.md`.
- The opt-in PostgreSQL API test sets test-process financial flags, creates committed organization/campaign/donor/beneficiary/disbursement/payment fixtures, uses concurrent requests/sessions for idempotent creation, disbursements, and pledge clears, and has no fixture-deletion routine. Its documented cleanup is to remove only the exact disposable database after evidence and owner/session checks.
- The test connects to `CHARITY_TEST_ADMIN_DATABASE_URL` for fixture writes and concurrency observers; API connections use `CHARITY_DATABASE_URL`. Neither variable is set in this process and `backend/.env` is absent. The test does not itself assert that the two DSNs resolve to the same exact database. A future run must construct both DSNs for the same verified target and confirm `current_database()` on each connection before fixture writes.
- `database/runtime-roles.sql` creates/validates cluster-wide NOLOGIN roles and changes ownership of every function in `public`; it must run only after exact absence/attribute checks and only in the dedicated project database. A separate login is required. No fresh catalog evidence was available to establish role absence or privileges.
- The schema/workflow source contains INR-only checks, campaign eligibility and state guards, composite campaign/scope foreign keys, allocation caps and immutability after clearing, append-only refund/ledger/audit records, scope-ordered no-borrowing refunds, payment/review/beneficiary role guards, idempotency workflows, scoped read functions, and ledger-derived raised-fund projections. These are source observations, not current execution evidence. The read helpers expose actor-scoped data through SECURITY DEFINER functions; the source still documents that `app.actor_id` is trusted only when set by the authenticated API service.

### Commands and actual results

| Command | Result |
|---|---|
| From `backend/`: `& '.\\.venv-cpython314\\Scripts\\python.exe' -m pytest -q` | Exit 1 before collection: base interpreter path `C:\\Users\\ayans\\AppData\\Local\\Programs\\Python\\Python314\\python.exe` returned `Access is denied`; no test cases ran. |
| From `backend/`: `python -m pytest -q` | Exit 1; system interpreter `C:\\msys64\\ucrt64\\bin\\python.exe` reported `No module named pytest`. |
| From `backend/`: `& '.\\.venv-cpython314\\Scripts\\openapi-spec-validator.exe' '..\\contracts\\openapi.yaml'` | Exit 103 before validation because the validator launcher could not start the inaccessible venv base interpreter. |
| From `backend/`: `python -c "import yaml; print(yaml.__version__)"` | Exit 1; `ModuleNotFoundError: No module named 'yaml'`. |
| From `backend/`: project-only `ast.parse` check over `app/` and `tests/` | Exit 0; 23 Python files parsed. Syntax-only check, not tests. |
| `pg_isready -h localhost -p 5432`; `psql --version` | PostgreSQL accepts connections; client version 18.6. No authenticated server identity obtained. |
| `psql -X -w ... -U postgres -d postgres` read-only identity query | Exit 1 before connection: `fe_sendauth: no password supplied`; no statement reached the server. |
| `psql -X -W ... -U postgres -d postgres` read-only identity query | A password prompt appeared but no credential was supplied; authentication failed before connection. No credential was exposed in command text or output. |
| Environment probes for acceptance DSNs/flag, PostgreSQL password/service variables, and `backend/.env` | All queried environment variables were unset; `.env` was absent. Only presence/absence was checked; no secret values were read. |

The prior check's report that `charity_a1_acceptance_20261023_a1` and project roles were absent is historical only. This retry could not repeat the required immediate exact-name and role preflight. No database was created, read, initialized, tested, cleaned up, or dropped. Neither protected database was targeted. F22/F27 concurrency, SQL regression, runtime-role positive/negative checks, PostgreSQL API acceptance, and current formal contract validation remain unexecuted in this retry.

The staged milestone remained exactly 15 paths; the intentional presentation deletion and untracked `structure.md` remained as recorded. No Git staging, commit, push, reset, clean, or revert was performed. The minimum next requirements are restored access to the existing CPython 3.14.9 environment and an approved protected PostgreSQL authentication path. Then repeat authenticated identity, exact target/role absence, and both-DSN identity preflights before creating only the named disposable target. The previous successful runs remain historical; do not label the latest source locked until all current-source checks and verified cleanup succeed.
