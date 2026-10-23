-- Rollback-based financial-integrity regression tests.
-- Run only in a newly created isolated database after schema.sql/workflows.sql.
-- This file does not connect to, reset, or drop any database. Execution evidence is recorded in docs/database-execution-report.md.
BEGIN;
SET LOCAL app.actor_id = 'synthetic-test-operator';
SET LOCAL app.request_id = 'financial-integrity-regression';

CREATE TEMP TABLE regression_context (test_run BOOLEAN NOT NULL);

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_sql TEXT, p_state TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE actual_state TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
        IF actual_state <> p_state THEN
            RAISE EXCEPTION 'Expected SQLSTATE %, observed % for: %', p_state, actual_state, p_sql;
        END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected SQLSTATE % but statement succeeded: %', p_state, p_sql;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.approve_test_campaign(p_campaign_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM submit_campaign(p_campaign_id);
    PERFORM review_campaign(p_campaign_id,'APPROVED','Synthetic regression fixture approval');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.approve_test_disbursement(p_disbursement_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_actor TEXT := current_setting('app.actor_id',TRUE);
BEGIN
    PERFORM set_config('app.actor_id','synthetic-test-approver',TRUE);
    PERFORM approve_disbursement(p_disbursement_id,'APPROVED');
    PERFORM set_config('app.actor_id',COALESCE(v_actor,''),TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.pay_test_disbursement(p_disbursement_id BIGINT,p_reference TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_actor TEXT := current_setting('app.actor_id',TRUE);
BEGIN
    PERFORM set_config('app.actor_id','synthetic-payout-operator',TRUE);
    PERFORM pay_disbursement(p_disbursement_id,p_reference);
    PERFORM set_config('app.actor_id',COALESCE(v_actor,''),TRUE);
END;
$$;

DO $$
DECLARE v_org_id BIGINT; v_donor_id BIGINT; v_anon_id BIGINT; v_campaign_id BIGINT;
        v_guest_hash CHAR(64) := repeat('a',64)::CHAR(64);
        v_timeout_guest_hash CHAR(64) := repeat('b',64)::CHAR(64);
        v_failure_guest_hash CHAR(64) := repeat('c',64)::CHAR(64);
        v_idem_donation_id BIGINT; v_idem_donation_replay_id BIGINT;
        v_idem_attempt_id BIGINT; v_idem_attempt_replay_id BIGINT;
        v_idem_replayed BOOLEAN;
        v_timeout_donation_id BIGINT; v_timeout_attempt_id BIGINT;
        v_timeout_attempt_replay_id BIGINT;
        v_failure_donation_id BIGINT; v_failure_attempt_id BIGINT;
        v_failure_retry_attempt_id BIGINT;
        v_f03_campaign_id BIGINT; v_f03_audit_before BIGINT; v_f03_pledges_before BIGINT;
        v_f02_future_campaign_id BIGINT; v_f02_past_campaign_id BIGINT;
        v_f02_boundary_campaign_id BIGINT; v_f02_pledge_id BIGINT;
        v_f18_campaign_id BIGINT; v_f18_restriction_id BIGINT; v_f18_donation_id BIGINT;
        v_f18_disbursement_id BIGINT; v_f19_campaign_id BIGINT; v_f19_donation_id BIGINT;
        v_f19_disbursement_id BIGINT;
        v_f26_campaign_id BIGINT; v_f26_clear_donation_id BIGINT;
        v_f26_disbursement_id BIGINT;
        v_pledge_id BIGINT; v_exact_pledge_id BIGINT; v_exact_donation_id BIGINT;
        v_donation_a BIGINT; v_donation_b BIGINT; v_restriction_id BIGINT; v_restriction_two_id BIGINT;
        v_other_campaign_id BIGINT; v_other_restriction_id BIGINT; v_mismatch_donation_id BIGINT;
        v_multi_scope_donation_id BIGINT; v_no_borrow_donation_id BIGINT;
        v_beneficiary_id BIGINT; v_unverified_id BIGINT; v_disbursement_id BIGINT;
        v_blank_disbursement_id BIGINT; v_test_id BIGINT;
        v_f20_balance_before NUMERIC(14,2); v_f24_refund_id BIGINT;
        v_consent_event_id BIGINT;
        v_refund_headers_before BIGINT; v_refund_scopes_before BIGINT;
        v_refund_ledger_before BIGINT; v_refund_audit_before BIGINT;
BEGIN
    INSERT INTO organization(organization_name) VALUES ('Synthetic Test Org') RETURNING organization_id INTO v_org_id;
    INSERT INTO organization_membership(organization_id,actor_id,membership_role)
    VALUES (v_org_id,'synthetic-test-operator','CAMPAIGN_EDITOR'),
           (v_org_id,'synthetic-test-operator','BENEFICIARY_MANAGER'),
           (v_org_id,'synthetic-test-operator','DISBURSEMENT_REQUESTER');
    INSERT INTO organization_membership(organization_id,actor_id,membership_role)
    VALUES (v_org_id,'synthetic-test-approver','DISBURSEMENT_REQUESTER');
    INSERT INTO platform_role(actor_id,platform_role) VALUES
        ('synthetic-test-operator','CAMPAIGN_REVIEWER'),
        ('synthetic-test-operator','BENEFICIARY_VERIFIER'),
        ('synthetic-test-operator','REFUND_OPERATOR'),
        ('synthetic-test-operator','PAYMENT_RECONCILER'),
        ('synthetic-test-approver','PAYOUT_APPROVER'),
        ('synthetic-payout-operator','PAYOUT_OPERATOR');
    INSERT INTO donor(display_name) VALUES ('Synthetic Donor') RETURNING donor_id INTO v_donor_id;
    INSERT INTO donor(is_anonymous_record) VALUES (TRUE) RETURNING donor_id INTO v_anon_id;
    PERFORM pg_temp.assert_raises(
        'INSERT INTO donor(is_anonymous_record) VALUES (TRUE)', '23505');

    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code,
        target_amount, start_date, end_date)
    VALUES (v_org_id, 'Synthetic Fund', 'Synthetic purpose', 'GENERAL', 1000,
        CURRENT_DATE - 1, CURRENT_DATE + 10) RETURNING campaign_id INTO v_campaign_id;
    PERFORM pg_temp.assert_raises(format(
        'INSERT INTO pledge(donor_id,campaign_id,pledged_amount) VALUES (%s,%s,10)', v_donor_id,v_campaign_id), 'P0001');
    PERFORM pg_temp.approve_test_campaign(v_campaign_id);

    -- Durable guest creation and simulated-payment idempotency are separate
    -- operations. Same-key/same-payload replays return the stored IDs; a
    -- changed payload conflicts without creating extra business or audit rows.
    PERFORM set_config('app.actor_id','guest:' || v_guest_hash,TRUE);
    SELECT donation_id,replayed INTO v_idem_donation_id,v_idem_replayed
    FROM create_donation_idempotent(v_campaign_id,'Synthetic Guest',NULL,NULL,25,
        'creation-idem-key-001',repeat('1',64),v_guest_hash);
    IF v_idem_replayed THEN RAISE EXCEPTION 'First donation creation unexpectedly replayed'; END IF;
    SELECT donation_id,replayed INTO v_idem_donation_replay_id,v_idem_replayed
    FROM create_donation_idempotent(v_campaign_id,'Synthetic Guest',NULL,NULL,25,
        'creation-idem-key-001',repeat('1',64),v_guest_hash);
    IF NOT v_idem_replayed OR v_idem_donation_replay_id <> v_idem_donation_id
       OR (SELECT COUNT(*) FROM api_idempotency_request
           WHERE principal_id='guest:' || v_guest_hash AND operation='DONATION_CREATE'
             AND idempotency_key='creation-idem-key-001') <> 1
       OR (SELECT COUNT(*) FROM donation_guest_access WHERE donation_id=v_idem_donation_id) <> 1 THEN
        RAISE EXCEPTION 'Donation creation replay did not return one persisted guest donation';
    END IF;
    PERFORM pg_temp.assert_raises(format(
        'SELECT donation_id FROM create_donation_idempotent(%s,''Synthetic Guest'',NULL,NULL,25,''creation-idem-key-001'',%L,%L)',
        v_campaign_id,repeat('2',64),v_guest_hash), 'P1001');
    IF (SELECT COUNT(*) FROM donation WHERE donor_id=(SELECT donor_id FROM donation WHERE donation_id=v_idem_donation_id)) <> 1 THEN
        RAISE EXCEPTION 'Conflicting creation replay created an additional donation for the guest';
    END IF;

    SELECT payment_attempt_id,replayed INTO v_idem_attempt_id,v_idem_replayed
    FROM simulate_donation_payment_idempotent(v_idem_donation_id,'payment-idem-key-001',
        repeat('3',64),'SUCCEEDED',v_guest_hash);
    IF v_idem_replayed THEN RAISE EXCEPTION 'First simulated payment unexpectedly replayed'; END IF;
    SELECT payment_attempt_id,replayed INTO v_idem_attempt_replay_id,v_idem_replayed
    FROM simulate_donation_payment_idempotent(v_idem_donation_id,'payment-idem-key-001',
        repeat('3',64),'SUCCEEDED',v_guest_hash);
    IF NOT v_idem_replayed OR v_idem_attempt_replay_id <> v_idem_attempt_id
       OR (SELECT COUNT(*) FROM payment_attempt WHERE donation_id=v_idem_donation_id) <> 1
       OR (SELECT payment_status FROM donation WHERE donation_id=v_idem_donation_id) <> 'SUCCESSFUL'
       OR (SELECT transaction_reference FROM donation WHERE donation_id=v_idem_donation_id) IS NULL
       OR (SELECT receipt_number FROM donation WHERE donation_id=v_idem_donation_id) IS NULL
       OR (SELECT COUNT(*) FROM fund_ledger_entry WHERE donation_id=v_idem_donation_id
           AND entry_type='DONATION_CLEARING') <> 1 THEN
        RAISE EXCEPTION 'Successful payment replay failed to preserve one clearing and issued receipt';
    END IF;
    IF (SELECT receipt_number FROM get_owned_donation(v_idem_donation_id,v_guest_hash)) IS NULL THEN
        RAISE EXCEPTION 'Owned donation lookup withheld the receipt after successful clearing';
    END IF;
    PERFORM pg_temp.assert_raises(format(
        'SELECT payment_attempt_id FROM simulate_donation_payment_idempotent(%s,''payment-idem-key-001'',%L,''FAILED'',%L)',
        v_idem_donation_id,repeat('7',64),v_guest_hash), 'P1001');

    PERFORM set_config('app.actor_id','guest:' || v_timeout_guest_hash,TRUE);
    SELECT r.donation_id INTO v_timeout_donation_id
    FROM create_donation_idempotent(v_campaign_id,'Synthetic Guest Timeout',NULL,NULL,5,
        'creation-idem-key-002',repeat('4',64),v_timeout_guest_hash) AS r;
    SELECT payment_attempt_id,replayed INTO v_timeout_attempt_id,v_idem_replayed
    FROM simulate_donation_payment_idempotent(v_timeout_donation_id,'payment-idem-key-002',
        repeat('5',64),'TIMEOUT',v_timeout_guest_hash);
    SELECT payment_attempt_id,replayed INTO v_timeout_attempt_replay_id,v_idem_replayed
    FROM simulate_donation_payment_idempotent(v_timeout_donation_id,'payment-idem-key-002',
        repeat('5',64),'TIMEOUT',v_timeout_guest_hash);
    IF NOT v_idem_replayed OR v_timeout_attempt_replay_id <> v_timeout_attempt_id
       OR (SELECT attempt_status FROM payment_attempt WHERE payment_attempt_id=v_timeout_attempt_id) <> 'UNKNOWN'
       OR (SELECT payment_status FROM donation WHERE donation_id=v_timeout_donation_id) <> 'PENDING'
       OR (SELECT transaction_reference FROM donation WHERE donation_id=v_timeout_donation_id) IS NOT NULL
       OR (SELECT receipt_number FROM donation WHERE donation_id=v_timeout_donation_id) IS NOT NULL THEN
        RAISE EXCEPTION 'Timeout replay incorrectly converted an unknown outcome to a terminal payment';
    END IF;
    PERFORM pg_temp.assert_raises(format(
        'SELECT payment_attempt_id FROM simulate_donation_payment_idempotent(%s,''payment-idem-key-003'',%L,''FAILED'',%L)',
        v_timeout_donation_id,repeat('6',64),v_timeout_guest_hash), 'P1004');
    PERFORM set_config('app.actor_id','synthetic-test-operator',TRUE);
    PERFORM reconcile_simulated_payment(v_timeout_attempt_id,'SUCCEEDED');
    IF (SELECT payment_status FROM donation WHERE donation_id=v_timeout_donation_id) <> 'SUCCESSFUL'
       OR (SELECT receipt_number FROM donation WHERE donation_id=v_timeout_donation_id) IS NULL
       OR (SELECT attempt_status FROM payment_attempt WHERE payment_attempt_id=v_timeout_attempt_id) <> 'SUCCEEDED' THEN
        RAISE EXCEPTION 'Authorized reconciliation did not finalize the unknown simulated outcome atomically';
    END IF;

    PERFORM set_config('app.actor_id','guest:' || v_failure_guest_hash,TRUE);
    SELECT r.donation_id INTO v_failure_donation_id
    FROM create_donation_idempotent(v_campaign_id,'Synthetic Guest Retry',NULL,NULL,5,
        'creation-idem-key-003',repeat('8',64),v_failure_guest_hash) AS r;
    SELECT r.payment_attempt_id INTO v_failure_attempt_id
    FROM simulate_donation_payment_idempotent(v_failure_donation_id,'payment-idem-key-004',
        repeat('9',64),'FAILED',v_failure_guest_hash) AS r;
    IF (SELECT attempt_status FROM payment_attempt WHERE payment_attempt_id=v_failure_attempt_id) <> 'FAILED'
       OR (SELECT payment_status FROM donation WHERE donation_id=v_failure_donation_id) <> 'PENDING'
       OR (SELECT receipt_number FROM donation WHERE donation_id=v_failure_donation_id) IS NOT NULL THEN
        RAISE EXCEPTION 'Failed simulation did not remain a failed attempt without a receipt';
    END IF;
    SELECT r.payment_attempt_id INTO v_failure_retry_attempt_id
    FROM simulate_donation_payment_idempotent(v_failure_donation_id,'payment-idem-key-005',
        repeat('a',64),'SUCCEEDED',v_failure_guest_hash) AS r;
    IF (SELECT attempt_status FROM payment_attempt WHERE payment_attempt_id=v_failure_retry_attempt_id) <> 'SUCCEEDED'
       OR (SELECT payment_status FROM donation WHERE donation_id=v_failure_donation_id) <> 'SUCCESSFUL'
       OR (SELECT receipt_number FROM donation WHERE donation_id=v_failure_donation_id) IS NULL THEN
        RAISE EXCEPTION 'Successful retry after a recorded failed attempt did not clear and issue a receipt';
    END IF;

    -- Restore the campaign reviewer fixture actor after guest-flow checks.
    PERFORM set_config('app.actor_id','synthetic-test-operator',TRUE);

    -- F03: enforce the actual approval/activation guard, audit valid status changes,
    -- and reject new pledges while an approved campaign is paused.
    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code,
        target_amount, start_date, end_date)
    VALUES (v_org_id, 'F03 Campaign State Audit', 'Synthetic F03 purpose', 'GENERAL', 100,
        CURRENT_DATE - 1, CURRENT_DATE + 10) RETURNING campaign_id INTO v_f03_campaign_id;
    SELECT COUNT(*) INTO v_f03_audit_before FROM audit_log
    WHERE entity_type='campaign' AND entity_id=v_f03_campaign_id::TEXT;
    PERFORM pg_temp.assert_raises(format(
        'SELECT activate_campaign(%s)', v_f03_campaign_id), 'P1004');
    IF (SELECT campaign_status FROM campaign WHERE campaign_id=v_f03_campaign_id) <> 'DRAFT'
       OR (SELECT approval_status FROM campaign WHERE campaign_id=v_f03_campaign_id) <> 'PENDING'
       OR (SELECT COUNT(*) FROM audit_log WHERE entity_type='campaign'
           AND entity_id=v_f03_campaign_id::TEXT) <> v_f03_audit_before THEN
        RAISE EXCEPTION 'Rejected pre-approval activation changed campaign state or left audit residue';
    END IF;

    PERFORM pg_temp.approve_test_campaign(v_f03_campaign_id);
    IF (SELECT COUNT(*) FROM audit_log a
        WHERE a.action_type='CAMPAIGN_STATUS_ACTIVE' AND a.entity_type='campaign'
          AND a.entity_id=v_f03_campaign_id::TEXT AND a.actor_id='synthetic-test-operator'
          AND a.occurred_at IS NOT NULL AND a.old_values->>'campaign_status'='DRAFT'
          AND a.new_values->>'campaign_status'='ACTIVE') <> 1 THEN
        RAISE EXCEPTION 'Valid campaign activation audit event is missing or has incorrect metadata';
    END IF;

    PERFORM change_campaign_status(v_f03_campaign_id,'PAUSED','Regression pause');
    IF (SELECT COUNT(*) FROM audit_log a
        WHERE a.action_type='CAMPAIGN_STATUS_PAUSED' AND a.entity_type='campaign'
          AND a.entity_id=v_f03_campaign_id::TEXT AND a.actor_id='synthetic-test-operator'
          AND a.occurred_at IS NOT NULL AND a.old_values->>'campaign_status'='ACTIVE'
          AND a.new_values->>'campaign_status'='PAUSED') <> 1 THEN
        RAISE EXCEPTION 'Valid campaign pause audit event is missing or has incorrect metadata';
    END IF;
    SELECT COUNT(*) INTO v_f03_audit_before FROM audit_log
    WHERE entity_type='campaign' AND entity_id=v_f03_campaign_id::TEXT;
    SELECT COUNT(*) INTO v_f03_pledges_before FROM pledge WHERE campaign_id=v_f03_campaign_id;
    PERFORM pg_temp.assert_raises(format(
        'INSERT INTO pledge(donor_id,campaign_id,pledged_amount) VALUES (%s,%s,10)',
        v_donor_id,v_f03_campaign_id), 'P0001');
    IF (SELECT campaign_status FROM campaign WHERE campaign_id=v_f03_campaign_id) <> 'PAUSED'
       OR (SELECT COUNT(*) FROM pledge WHERE campaign_id=v_f03_campaign_id) <> v_f03_pledges_before
       OR (SELECT COUNT(*) FROM audit_log WHERE entity_type='campaign'
           AND entity_id=v_f03_campaign_id::TEXT) <> v_f03_audit_before THEN
        RAISE EXCEPTION 'Paused campaign pledge rejection changed state or left business/audit residue';
    END IF;

    -- F02: activation is rejected outside the inclusive campaign date window.
    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code,
        target_amount, start_date, end_date)
    VALUES (v_org_id, 'F02 Future Campaign', 'Synthetic future purpose', 'GENERAL', 20,
        CURRENT_DATE + 1, CURRENT_DATE + 10) RETURNING campaign_id INTO v_f02_future_campaign_id;
    PERFORM pg_temp.approve_test_campaign(v_f02_future_campaign_id);
    PERFORM pg_temp.assert_raises(format(
        'SELECT activate_campaign(%s)',v_f02_future_campaign_id), 'P1004');
    IF (SELECT campaign_status FROM campaign WHERE campaign_id=v_f02_future_campaign_id) <> 'DRAFT'
       OR EXISTS (SELECT 1 FROM audit_log WHERE action_type='CAMPAIGN_STATUS_ACTIVE'
                  AND entity_id=v_f02_future_campaign_id::TEXT) THEN
        RAISE EXCEPTION 'Pre-start activation rejection changed campaign state or left active audit';
    END IF;

    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code,
        target_amount, start_date, end_date)
    VALUES (v_org_id, 'F02 Ended Campaign', 'Synthetic expired purpose', 'GENERAL', 20,
        CURRENT_DATE - 10, CURRENT_DATE - 1) RETURNING campaign_id INTO v_f02_past_campaign_id;
    PERFORM pg_temp.approve_test_campaign(v_f02_past_campaign_id);
    PERFORM pg_temp.assert_raises(format(
        'SELECT activate_campaign(%s)',v_f02_past_campaign_id), 'P1004');
    IF (SELECT campaign_status FROM campaign WHERE campaign_id=v_f02_past_campaign_id) <> 'DRAFT'
       OR EXISTS (SELECT 1 FROM audit_log WHERE action_type='CAMPAIGN_STATUS_ACTIVE'
                  AND entity_id=v_f02_past_campaign_id::TEXT) THEN
        RAISE EXCEPTION 'Post-end activation rejection changed campaign state or left active audit';
    END IF;

    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code,
        target_amount, start_date, end_date)
    VALUES (v_org_id, 'F02 Inclusive Boundary Campaign', 'Synthetic boundary purpose', 'GENERAL', 20,
        CURRENT_DATE, CURRENT_DATE) RETURNING campaign_id INTO v_f02_boundary_campaign_id;
    PERFORM pg_temp.approve_test_campaign(v_f02_boundary_campaign_id);
    INSERT INTO pledge(donor_id, campaign_id, pledged_amount)
    VALUES (v_donor_id, v_f02_boundary_campaign_id, 10) RETURNING pledge_id INTO v_f02_pledge_id;
    IF (SELECT campaign_status FROM campaign WHERE campaign_id=v_f02_boundary_campaign_id) <> 'ACTIVE'
       OR NOT EXISTS (SELECT 1 FROM pledge WHERE pledge_id=v_f02_pledge_id
                      AND campaign_id=v_f02_boundary_campaign_id) THEN
        RAISE EXCEPTION 'Campaign on inclusive start/end date boundary did not activate and accept pledge';
    END IF;

    INSERT INTO fund_restriction(campaign_id, restriction_code, restriction_name, allowed_purpose_code)
    VALUES (v_campaign_id, 'FOOD_ONLY', 'Food only', 'FOOD') RETURNING restriction_id INTO v_restriction_id;
    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code,
        target_amount, start_date, end_date)
    VALUES (v_org_id, 'Synthetic Other Fund', 'Other synthetic purpose', 'GENERAL', 100,
        CURRENT_DATE - 1, CURRENT_DATE + 10) RETURNING campaign_id INTO v_other_campaign_id;
    PERFORM pg_temp.approve_test_campaign(v_other_campaign_id);
    INSERT INTO fund_restriction(campaign_id, restriction_code, restriction_name, allowed_purpose_code)
    VALUES (v_other_campaign_id, 'OTHER_FOOD_ONLY', 'Other campaign food only', 'FOOD')
    RETURNING restriction_id INTO v_other_restriction_id;
    INSERT INTO pledge(donor_id, campaign_id, pledged_amount)
    VALUES (v_donor_id, v_campaign_id, 100) RETURNING pledge_id INTO v_pledge_id;
    INSERT INTO donation(donor_id, campaign_id, pledge_id, donation_amount, payment_method,
        payment_status, transaction_reference, receipt_number)
    VALUES (v_donor_id, v_campaign_id, v_pledge_id, 60, 'ONLINE', 'PENDING', 'synthetic-txn-a', 'synthetic-receipt-a')
    RETURNING donation_id INTO v_donation_a;
    INSERT INTO donation(donor_id, campaign_id, pledge_id, donation_amount, payment_method,
        payment_status, transaction_reference, receipt_number)
    VALUES (v_donor_id, v_campaign_id, v_pledge_id, 50, 'ONLINE', 'PENDING', 'synthetic-txn-b', 'synthetic-receipt-b')
    RETURNING donation_id INTO v_donation_b;
    PERFORM pg_temp.assert_raises(format(
        'INSERT INTO donation(donor_id,campaign_id,donation_amount,payment_method,transaction_reference,receipt_number) VALUES (%s,%s,1,''ONLINE'',''synthetic-txn-a'',''other-receipt'')',
        v_donor_id,v_campaign_id), '23505');
    PERFORM pg_temp.assert_raises(format(
        'INSERT INTO donation(donor_id,campaign_id,donation_amount,payment_method,transaction_reference,receipt_number) VALUES (%s,%s,1,''ONLINE'',''other-txn'',''synthetic-receipt-a'')',
        v_donor_id,v_campaign_id), '23505');
    INSERT INTO donation(donor_id, campaign_id, donation_amount, payment_method)
    VALUES (v_donor_id, v_campaign_id, 1, 'ONLINE') RETURNING donation_id INTO v_test_id;
    PERFORM pg_temp.assert_raises(format(
        'UPDATE donation SET payment_status=''SUCCESSFUL'',cleared_at=CURRENT_TIMESTAMP WHERE donation_id=%s',v_test_id), '23514');
    IF (SELECT payment_status FROM donation WHERE donation_id=v_test_id) <> 'PENDING'
       OR (SELECT cleared_at FROM donation WHERE donation_id=v_test_id) IS NOT NULL
       OR EXISTS (SELECT 1 FROM fund_ledger_entry WHERE donation_id=v_test_id)
       OR EXISTS (SELECT 1 FROM audit_log WHERE action_type='DONATION_CLEARED'
                  AND entity_type='donation' AND entity_id=v_test_id::TEXT) THEN
        RAISE EXCEPTION 'Missing online metadata rejection left successful state, clearing ledger, or audit residue';
    END IF;
    INSERT INTO donation_restriction(donation_id, campaign_id, restriction_id, restricted_amount)
    VALUES (v_donation_a, v_campaign_id, v_restriction_id, 40);
    INSERT INTO donation(donor_id, campaign_id, donation_amount, payment_method,
        transaction_reference, receipt_number)
    VALUES (v_donor_id, v_campaign_id, 5, 'ONLINE',
        'synthetic-txn-mismatched-campaign', 'synthetic-receipt-mismatched-campaign')
    RETURNING donation_id INTO v_mismatch_donation_id;
    PERFORM pg_temp.assert_raises(format(
        'INSERT INTO donation_restriction(donation_id,campaign_id,restriction_id,restricted_amount) VALUES (%s,%s,%s,1)',
        v_mismatch_donation_id,v_campaign_id,v_other_restriction_id), '23503');
    IF EXISTS (SELECT 1 FROM donation_restriction dr
               WHERE dr.donation_id=v_mismatch_donation_id) THEN
        RAISE EXCEPTION 'Mismatched campaign restriction allocation was retained';
    END IF;
    PERFORM pg_temp.assert_raises(format(
        'INSERT INTO donation_restriction(donation_id,campaign_id,restriction_id,restricted_amount) VALUES (%s,%s,%s,61)',
        v_donation_b,v_campaign_id,v_restriction_id), 'P0001');
    PERFORM pg_temp.assert_raises(format(
        'UPDATE donation SET currency=''USD'' WHERE donation_id=%s', v_donation_b), 'P0001');

    PERFORM clear_donation(v_donation_a);
    IF (SELECT COUNT(*) FROM fund_ledger_entry l
        WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_CLEARING') <> 2
       OR NOT EXISTS (SELECT 1 FROM fund_ledger_entry l
           WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_CLEARING'
             AND l.campaign_id=v_campaign_id AND l.restriction_id=v_restriction_id
             AND l.amount_delta=40 AND l.currency='INR')
       OR NOT EXISTS (SELECT 1 FROM fund_ledger_entry l
           WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_CLEARING'
             AND l.campaign_id=v_campaign_id AND l.restriction_id IS NULL
             AND l.amount_delta=20 AND l.currency='INR') THEN
        RAISE EXCEPTION 'Donation clearing ledger did not split 40 INR restricted and 20 INR unrestricted';
    END IF;
    PERFORM pg_temp.assert_raises(format(
        'UPDATE donation_restriction SET restricted_amount=39 WHERE donation_id=%s AND restriction_id=%s',
        v_donation_a,v_restriction_id), 'P0001');
    IF (SELECT COUNT(*) FROM donation_restriction dr
        WHERE dr.donation_id=v_donation_a AND dr.campaign_id=v_campaign_id
          AND dr.restriction_id=v_restriction_id AND dr.restricted_amount=40) <> 1
       OR (SELECT COUNT(*) FROM fund_ledger_entry l
           WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_CLEARING') <> 2
       OR NOT EXISTS (SELECT 1 FROM fund_ledger_entry l
           WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_CLEARING'
             AND l.campaign_id=v_campaign_id AND l.restriction_id=v_restriction_id
             AND l.amount_delta=40 AND l.currency='INR')
       OR NOT EXISTS (SELECT 1 FROM fund_ledger_entry l
           WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_CLEARING'
             AND l.campaign_id=v_campaign_id AND l.restriction_id IS NULL
             AND l.amount_delta=20 AND l.currency='INR') THEN
        RAISE EXCEPTION 'Rejected allocation update changed the allocation or clearing ledger';
    END IF;
    PERFORM pg_temp.assert_raises(format(
        'DELETE FROM donation_restriction WHERE donation_id=%s AND restriction_id=%s',
        v_donation_a,v_restriction_id), 'P0001');
    IF (SELECT COUNT(*) FROM donation_restriction dr
        WHERE dr.donation_id=v_donation_a AND dr.campaign_id=v_campaign_id
          AND dr.restriction_id=v_restriction_id AND dr.restricted_amount=40) <> 1
       OR (SELECT COUNT(*) FROM fund_ledger_entry l
           WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_CLEARING') <> 2
       OR NOT EXISTS (SELECT 1 FROM fund_ledger_entry l
           WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_CLEARING'
             AND l.campaign_id=v_campaign_id AND l.restriction_id=v_restriction_id
             AND l.amount_delta=40 AND l.currency='INR')
       OR NOT EXISTS (SELECT 1 FROM fund_ledger_entry l
           WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_CLEARING'
             AND l.campaign_id=v_campaign_id AND l.restriction_id IS NULL
             AND l.amount_delta=20 AND l.currency='INR') THEN
        RAISE EXCEPTION 'Rejected allocation delete changed the allocation or clearing ledger';
    END IF;
    IF (SELECT p.pledge_status FROM pledge p WHERE p.pledge_id=v_pledge_id) <> 'PARTIALLY_FULFILLED' THEN
        RAISE EXCEPTION 'Expected partial pledge fulfillment after first cleared donation';
    END IF;
    PERFORM pg_temp.assert_raises(format('SELECT clear_donation(%s)', v_donation_b), 'P0001');
    IF (SELECT d.payment_status FROM donation d WHERE d.donation_id=v_donation_b) <> 'PENDING' THEN
        RAISE EXCEPTION 'Over-fulfillment failure changed the pending donation';
    END IF;

    INSERT INTO pledge(donor_id, campaign_id, pledged_amount)
    VALUES (v_donor_id, v_campaign_id, 25) RETURNING pledge_id INTO v_exact_pledge_id;
    INSERT INTO donation(donor_id, campaign_id, pledge_id, donation_amount, payment_method,
        transaction_reference, receipt_number)
    VALUES (v_donor_id, v_campaign_id, v_exact_pledge_id, 25, 'ONLINE',
        'synthetic-txn-exact', 'synthetic-receipt-exact') RETURNING donation_id INTO v_exact_donation_id;
    PERFORM clear_donation(v_exact_donation_id);
    IF (SELECT p.pledge_status FROM pledge p WHERE p.pledge_id=v_exact_pledge_id) <> 'FULFILLED' THEN
        RAISE EXCEPTION 'Exact pledge fulfillment did not set FULFILLED status';
    END IF;

    PERFORM post_donation_refund(v_donation_a, 10, 'refund-part-1', 'Synthetic partial refund');
    PERFORM post_donation_refund(v_donation_a, 10, 'refund-part-2', 'Synthetic repeated partial refund');
    SELECT COUNT(*) INTO v_refund_headers_before
    FROM donation_refund r WHERE r.donation_id=v_donation_a;
    SELECT COUNT(*) INTO v_refund_scopes_before
    FROM donation_refund_scope s WHERE s.donation_id=v_donation_a;
    SELECT COUNT(*) INTO v_refund_ledger_before
    FROM fund_ledger_entry l WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_REFUND';
    SELECT COUNT(*) INTO v_refund_audit_before
    FROM audit_log a WHERE a.action_type='DONATION_REFUNDED' AND a.entity_id=v_donation_a::TEXT;
    PERFORM pg_temp.assert_raises(format(
        'SELECT post_donation_refund(%s,10,''refund-part-2'',''duplicate reference'')', v_donation_a), '23505');
    IF (SELECT COUNT(*) FROM donation_refund r WHERE r.donation_id=v_donation_a) <> v_refund_headers_before
       OR (SELECT COUNT(*) FROM donation_refund_scope s WHERE s.donation_id=v_donation_a) <> v_refund_scopes_before
       OR (SELECT COUNT(*) FROM fund_ledger_entry l WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_REFUND') <> v_refund_ledger_before
       OR (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='DONATION_REFUNDED' AND a.entity_id=v_donation_a::TEXT) <> v_refund_audit_before THEN
        RAISE EXCEPTION 'Duplicate refund reference failure left refund, scope, ledger, or audit residue';
    END IF;
    PERFORM post_donation_refund(v_donation_a, 40, 'refund-final', 'Synthetic full refund');
    IF (SELECT d.payment_status FROM donation d WHERE d.donation_id=v_donation_a) <> 'REFUNDED'
       OR (SELECT d.refunded_amount FROM donation d WHERE d.donation_id=v_donation_a) <> 60 THEN
        RAISE EXCEPTION 'Expected original donation to remain with full refund metadata';
    END IF;
    SELECT COUNT(*) INTO v_refund_headers_before
    FROM donation_refund r WHERE r.donation_id=v_donation_a;
    SELECT COUNT(*) INTO v_refund_scopes_before
    FROM donation_refund_scope s WHERE s.donation_id=v_donation_a;
    SELECT COUNT(*) INTO v_refund_ledger_before
    FROM fund_ledger_entry l WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_REFUND';
    SELECT COUNT(*) INTO v_refund_audit_before
    FROM audit_log a WHERE a.action_type='DONATION_REFUNDED' AND a.entity_id=v_donation_a::TEXT;
    PERFORM pg_temp.assert_raises(format(
        'SELECT post_donation_refund(%s,1,''refund-too-much'',''excess'')', v_donation_a), 'P0001');
    IF (SELECT COUNT(*) FROM donation_refund r WHERE r.donation_id=v_donation_a) <> v_refund_headers_before
       OR (SELECT COUNT(*) FROM donation_refund_scope s WHERE s.donation_id=v_donation_a) <> v_refund_scopes_before
       OR (SELECT COUNT(*) FROM fund_ledger_entry l WHERE l.donation_id=v_donation_a AND l.entry_type='DONATION_REFUND') <> v_refund_ledger_before
       OR (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='DONATION_REFUNDED' AND a.entity_id=v_donation_a::TEXT) <> v_refund_audit_before THEN
        RAISE EXCEPTION 'Excessive refund failure left refund, scope, ledger, or audit residue';
    END IF;
    PERFORM pg_temp.assert_raises(format(
        'UPDATE donation SET payment_status=''PENDING'' WHERE donation_id=%s', v_donation_a), 'P0001');

    INSERT INTO donation(donor_id, campaign_id, donation_amount, payment_method,
        payment_status, transaction_reference, receipt_number)
    VALUES (v_donor_id, v_campaign_id, 50, 'ONLINE', 'PENDING', 'synthetic-txn-c', 'synthetic-receipt-c')
    RETURNING donation_id INTO v_donation_b;
    INSERT INTO donation_restriction(donation_id, campaign_id, restriction_id, restricted_amount)
    VALUES (v_donation_b, v_campaign_id, v_restriction_id, 50);
    PERFORM clear_donation(v_donation_b);

    INSERT INTO beneficiary(organization_id,beneficiary_name, beneficiary_type)
    VALUES (v_org_id,'Synthetic Beneficiary','GROUP')
    RETURNING beneficiary_id INTO v_beneficiary_id;
    PERFORM verify_beneficiary(v_beneficiary_id,'VERIFIED','Synthetic test verification');

    -- F18: a funded restriction must reject a payout classified under a different purpose.
    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code,
        target_amount, start_date, end_date)
    VALUES (v_org_id, 'F18 Restricted Purpose Guard', 'Synthetic restricted purpose', 'GENERAL', 20,
        CURRENT_DATE - 1, CURRENT_DATE + 10) RETURNING campaign_id INTO v_f18_campaign_id;
    PERFORM pg_temp.approve_test_campaign(v_f18_campaign_id);
    INSERT INTO fund_restriction(campaign_id, restriction_code, restriction_name, allowed_purpose_code)
    VALUES (v_f18_campaign_id, 'F18_FOOD_ONLY', 'F18 food only', 'FOOD')
    RETURNING restriction_id INTO v_f18_restriction_id;
    INSERT INTO donation(donor_id, campaign_id, donation_amount, payment_method,
        transaction_reference, receipt_number)
    VALUES (v_donor_id, v_f18_campaign_id, 10, 'ONLINE',
        'f18-purpose-funding-txn', 'f18-purpose-funding-receipt')
    RETURNING donation_id INTO v_f18_donation_id;
    INSERT INTO donation_restriction(donation_id, campaign_id, restriction_id, restricted_amount)
    VALUES (v_f18_donation_id, v_f18_campaign_id, v_f18_restriction_id, 10);
    PERFORM clear_donation(v_f18_donation_id);
    IF (SELECT COALESCE(SUM(amount_delta),0) FROM fund_ledger_entry
        WHERE campaign_id=v_f18_campaign_id AND restriction_id=v_f18_restriction_id) < 5
       OR (SELECT verification_status FROM beneficiary WHERE beneficiary_id=v_beneficiary_id) <> 'VERIFIED' THEN
        RAISE EXCEPTION 'F18 fixture did not reach the restriction purpose guard with verified beneficiary and sufficient funds';
    END IF;
    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_f18_campaign_id, v_beneficiary_id, v_f18_restriction_id, 5,
        'Synthetic purpose mismatch', 'GENERAL') RETURNING disbursement_id INTO v_f18_disbursement_id;
    PERFORM pg_temp.approve_test_disbursement(v_f18_disbursement_id);
    PERFORM pg_temp.assert_raises(format(
        'SELECT pg_temp.pay_test_disbursement(%s,''f18-purpose-mismatch-payment-ref'')',v_f18_disbursement_id), 'P0001');
    IF (SELECT disbursement_status FROM disbursement WHERE disbursement_id=v_f18_disbursement_id) <> 'PENDING'
       OR (SELECT payment_reference FROM disbursement WHERE disbursement_id=v_f18_disbursement_id) IS NOT NULL
       OR (SELECT paid_at FROM disbursement WHERE disbursement_id=v_f18_disbursement_id) IS NOT NULL
       OR EXISTS (SELECT 1 FROM fund_ledger_entry WHERE disbursement_id=v_f18_disbursement_id
                  AND entry_type='DISBURSEMENT')
       OR EXISTS (SELECT 1 FROM audit_log WHERE action_type='DISBURSEMENT_PAID'
                  AND entity_type='disbursement' AND entity_id=v_f18_disbursement_id::TEXT) THEN
        RAISE EXCEPTION 'F18 rejected payout left payment, ledger, or paid-audit residue';
    END IF;

    -- F19: an unrestricted payout must use the campaign's purpose code.
    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code,
        target_amount, start_date, end_date)
    VALUES (v_org_id, 'F19 Unrestricted Purpose Guard', 'Synthetic general purpose', 'GENERAL', 20,
        CURRENT_DATE - 1, CURRENT_DATE + 10) RETURNING campaign_id INTO v_f19_campaign_id;
    PERFORM pg_temp.approve_test_campaign(v_f19_campaign_id);
    INSERT INTO donation(donor_id, campaign_id, donation_amount, payment_method,
        transaction_reference, receipt_number)
    VALUES (v_donor_id, v_f19_campaign_id, 10, 'ONLINE',
        'f19-purpose-funding-txn', 'f19-purpose-funding-receipt')
    RETURNING donation_id INTO v_f19_donation_id;
    PERFORM clear_donation(v_f19_donation_id);
    IF (SELECT COALESCE(SUM(amount_delta),0) FROM fund_ledger_entry
        WHERE campaign_id=v_f19_campaign_id AND restriction_id IS NULL) < 5
       OR (SELECT verification_status FROM beneficiary WHERE beneficiary_id=v_beneficiary_id) <> 'VERIFIED' THEN
        RAISE EXCEPTION 'F19 fixture did not reach the campaign purpose guard with verified beneficiary and sufficient funds';
    END IF;
    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_f19_campaign_id, v_beneficiary_id, NULL, 5,
        'Synthetic purpose mismatch', 'FOOD') RETURNING disbursement_id INTO v_f19_disbursement_id;
    PERFORM pg_temp.approve_test_disbursement(v_f19_disbursement_id);
    PERFORM pg_temp.assert_raises(format(
        'SELECT pg_temp.pay_test_disbursement(%s,''f19-purpose-mismatch-payment-ref'')',v_f19_disbursement_id), 'P0001');
    IF (SELECT disbursement_status FROM disbursement WHERE disbursement_id=v_f19_disbursement_id) <> 'PENDING'
       OR (SELECT payment_reference FROM disbursement WHERE disbursement_id=v_f19_disbursement_id) IS NOT NULL
       OR (SELECT paid_at FROM disbursement WHERE disbursement_id=v_f19_disbursement_id) IS NOT NULL
       OR EXISTS (SELECT 1 FROM fund_ledger_entry WHERE disbursement_id=v_f19_disbursement_id
                  AND entry_type='DISBURSEMENT')
       OR EXISTS (SELECT 1 FROM audit_log WHERE action_type='DISBURSEMENT_PAID'
                  AND entity_type='disbursement' AND entity_id=v_f19_disbursement_id::TEXT) THEN
        RAISE EXCEPTION 'F19 rejected payout left payment, ledger, or paid-audit residue';
    END IF;

    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_campaign_id, v_beneficiary_id, v_restriction_id, 40, 'Synthetic food support', 'FOOD')
    RETURNING disbursement_id INTO v_disbursement_id;
    PERFORM pg_temp.approve_test_disbursement(v_disbursement_id);
    SELECT COALESCE(SUM(amount_delta),0) INTO v_f20_balance_before FROM fund_ledger_entry
    WHERE campaign_id=v_campaign_id AND restriction_id=v_restriction_id;
    PERFORM pg_temp.pay_test_disbursement(v_disbursement_id, 'synthetic-payout-1');
    IF (SELECT disbursement_status FROM disbursement WHERE disbursement_id=v_disbursement_id) <> 'PAID'
       OR (SELECT payment_reference FROM disbursement WHERE disbursement_id=v_disbursement_id) <> 'synthetic-payout-1'
       OR (SELECT paid_at FROM disbursement WHERE disbursement_id=v_disbursement_id) IS NULL
       OR (SELECT COUNT(*) FROM fund_ledger_entry WHERE disbursement_id=v_disbursement_id
           AND entry_type='DISBURSEMENT' AND campaign_id=v_campaign_id
           AND restriction_id=v_restriction_id AND amount_delta=-40 AND currency='INR'
           AND external_reference='synthetic-payout-1') <> 1
       OR (SELECT COALESCE(SUM(amount_delta),0) FROM fund_ledger_entry
           WHERE campaign_id=v_campaign_id AND restriction_id=v_restriction_id) <> v_f20_balance_before - 40
       OR (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='DISBURSEMENT_PAID'
           AND a.entity_type='disbursement' AND a.entity_id=v_disbursement_id::TEXT
           AND a.actor_id='synthetic-payout-operator' AND a.occurred_at IS NOT NULL
           AND a.old_values->>'disbursement_status'='PENDING'
           AND a.new_values->>'disbursement_status'='PAID'
           AND a.new_values->>'payment_reference'='synthetic-payout-1'
           AND a.new_values->>'paid_at' IS NOT NULL) <> 1 THEN
        RAISE EXCEPTION 'F20 successful payout state, scoped ledger, audit metadata, or balance delta is incorrect';
    END IF;

    -- F25: direct ledger currency guard using an otherwise valid paid source.
    PERFORM pg_temp.assert_raises(format(
        'INSERT INTO fund_ledger_entry(campaign_id,restriction_id,disbursement_id,entry_type,amount_delta,currency,external_reference) VALUES (%s,%s,%s,''DISBURSEMENT'',-40,''USD'',''synthetic-payout-1'')',
        v_campaign_id,v_restriction_id,v_disbursement_id), 'P0001');
    IF (SELECT COUNT(*) FROM fund_ledger_entry WHERE disbursement_id=v_disbursement_id) <> 1
       OR EXISTS (SELECT 1 FROM fund_ledger_entry WHERE disbursement_id=v_disbursement_id AND currency <> 'INR') THEN
        RAISE EXCEPTION 'Rejected non-INR ledger entry was retained or changed the valid payout ledger';
    END IF;
    PERFORM pg_temp.assert_raises(format(
        'UPDATE disbursement SET disbursement_status=''PENDING'' WHERE disbursement_id=%s', v_disbursement_id), 'P0001');
    INSERT INTO beneficiary(organization_id,beneficiary_name, beneficiary_type)
    VALUES (v_org_id,'Unverified Synthetic Beneficiary','GROUP')
    RETURNING beneficiary_id INTO v_unverified_id;
    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_campaign_id, v_unverified_id, v_restriction_id, 1, 'Synthetic food support', 'FOOD')
    RETURNING disbursement_id INTO v_test_id;
    PERFORM pg_temp.approve_test_disbursement(v_test_id);
    PERFORM pg_temp.assert_raises(format('SELECT pg_temp.pay_test_disbursement(%s,''synthetic-payout-unverified'')',v_test_id), 'P0001');
    IF (SELECT x.disbursement_status FROM disbursement x WHERE x.disbursement_id=v_test_id) <> 'PENDING'
       OR (SELECT x.payment_reference FROM disbursement x WHERE x.disbursement_id=v_test_id) IS NOT NULL
       OR (SELECT x.paid_at FROM disbursement x WHERE x.disbursement_id=v_test_id) IS NOT NULL
       OR EXISTS (SELECT 1 FROM fund_ledger_entry l WHERE l.disbursement_id=v_test_id)
       OR EXISTS (SELECT 1 FROM audit_log a WHERE a.action_type='DISBURSEMENT_PAID' AND a.entity_id=v_test_id::TEXT) THEN
        RAISE EXCEPTION 'Unverified-beneficiary rejection left payment, ledger, or audit residue';
    END IF;
    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_campaign_id, (SELECT b.beneficiary_id FROM beneficiary b WHERE b.verification_status='VERIFIED' LIMIT 1),
        v_restriction_id, 20, 'Synthetic food support', 'FOOD') RETURNING disbursement_id INTO v_test_id;
    PERFORM pg_temp.approve_test_disbursement(v_test_id);
    PERFORM pg_temp.assert_raises(format('SELECT pg_temp.pay_test_disbursement(%s,''synthetic-payout-too-large'')',v_test_id), 'P0001');
    IF (SELECT x.disbursement_status FROM disbursement x WHERE x.disbursement_id=v_test_id) <> 'PENDING'
       OR EXISTS (SELECT 1 FROM fund_ledger_entry l WHERE l.disbursement_id=v_test_id) THEN
        RAISE EXCEPTION 'Rejected disbursement left status or ledger changes';
    END IF;

    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_campaign_id, v_beneficiary_id, v_restriction_id, 1,
        'Synthetic duplicate reference check', 'FOOD') RETURNING disbursement_id INTO v_test_id;
    PERFORM pg_temp.approve_test_disbursement(v_test_id);
    PERFORM pg_temp.assert_raises(format(
        'SELECT pg_temp.pay_test_disbursement(%s,''synthetic-payout-1'')', v_test_id), '23505');
    IF (SELECT x.disbursement_status FROM disbursement x WHERE x.disbursement_id=v_test_id) <> 'PENDING'
       OR EXISTS (SELECT 1 FROM fund_ledger_entry l WHERE l.disbursement_id=v_test_id)
       OR EXISTS (SELECT 1 FROM audit_log a WHERE a.action_type='DISBURSEMENT_PAID' AND a.entity_id=v_test_id::TEXT) THEN
        RAISE EXCEPTION 'Duplicate payment reference left payment, ledger, or audit changes';
    END IF;

    PERFORM pg_temp.assert_raises(format(
        'SELECT post_donation_refund(%s,20,''refund-after-spend'',''insufficient scope funds'')', v_donation_b), 'P0001');
    IF (SELECT d.refunded_amount FROM donation d WHERE d.donation_id=v_donation_b) <> 0
       OR EXISTS (SELECT 1 FROM donation_refund r WHERE r.donation_id=v_donation_b)
       OR EXISTS (SELECT 1 FROM donation_refund_scope s WHERE s.donation_id=v_donation_b)
       OR EXISTS (SELECT 1 FROM fund_ledger_entry l WHERE l.donation_id=v_donation_b AND l.entry_type='DONATION_REFUND')
       OR EXISTS (SELECT 1 FROM audit_log a WHERE a.action_type='DONATION_REFUNDED' AND a.entity_id=v_donation_b::TEXT) THEN
        RAISE EXCEPTION 'Failed after-spend refund left refund, ledger, audit, or metadata residue';
    END IF;

    INSERT INTO fund_restriction(campaign_id, restriction_code, restriction_name, allowed_purpose_code)
    VALUES (v_campaign_id, 'EDUCATION_ONLY', 'Education only', 'EDUCATION')
    RETURNING restriction_id INTO v_restriction_two_id;
    INSERT INTO donation(donor_id, campaign_id, donation_amount, payment_method,
        transaction_reference, receipt_number)
    VALUES (v_donor_id, v_campaign_id, 100, 'ONLINE', 'synthetic-txn-multiscope', 'synthetic-receipt-multiscope')
    RETURNING donation_id INTO v_multi_scope_donation_id;
    INSERT INTO donation_restriction(donation_id, campaign_id, restriction_id, restricted_amount) VALUES
        (v_multi_scope_donation_id, v_campaign_id, v_restriction_id, 20),
        (v_multi_scope_donation_id, v_campaign_id, v_restriction_two_id, 20);
    PERFORM clear_donation(v_multi_scope_donation_id);

    -- Leave part of the first restriction scope available. The refund must
    -- consume it first, then the second restriction, then unrestricted funds.
    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_campaign_id, v_beneficiary_id, v_restriction_id, 15,
        'Synthetic remaining food balance', 'FOOD') RETURNING disbursement_id INTO v_test_id;
    PERFORM pg_temp.approve_test_disbursement(v_test_id);
    PERFORM pg_temp.pay_test_disbursement(v_test_id, 'synthetic-payout-partial-first-scope');
    PERFORM post_donation_refund(v_multi_scope_donation_id, 38,
        'refund-multiscope-ordered', 'Synthetic ordered multi-scope refund');
    IF (SELECT COUNT(*) FROM donation_refund_scope s JOIN donation_refund r USING (refund_id)
        WHERE r.refund_reference='refund-multiscope-ordered') <> 3
       OR NOT EXISTS (SELECT 1 FROM donation_refund_scope s JOIN donation_refund r USING (refund_id)
           WHERE r.refund_reference='refund-multiscope-ordered'
             AND s.restriction_id=v_restriction_id AND s.amount=15)
       OR NOT EXISTS (SELECT 1 FROM donation_refund_scope s JOIN donation_refund r USING (refund_id)
           WHERE r.refund_reference='refund-multiscope-ordered'
             AND s.restriction_id=v_restriction_two_id AND s.amount=20)
       OR NOT EXISTS (SELECT 1 FROM donation_refund_scope s JOIN donation_refund r USING (refund_id)
           WHERE r.refund_reference='refund-multiscope-ordered'
             AND s.restriction_id IS NULL AND s.amount=3)
       OR (SELECT MIN(s.refund_scope_id) FROM donation_refund_scope s JOIN donation_refund r USING (refund_id)
           WHERE r.refund_reference='refund-multiscope-ordered' AND s.restriction_id=v_restriction_id)
          >= (SELECT MIN(s.refund_scope_id) FROM donation_refund_scope s JOIN donation_refund r USING (refund_id)
              WHERE r.refund_reference='refund-multiscope-ordered' AND s.restriction_id=v_restriction_two_id)
       OR (SELECT MIN(s.refund_scope_id) FROM donation_refund_scope s JOIN donation_refund r USING (refund_id)
           WHERE r.refund_reference='refund-multiscope-ordered' AND s.restriction_id=v_restriction_two_id)
          >= (SELECT MIN(s.refund_scope_id) FROM donation_refund_scope s JOIN donation_refund r USING (refund_id)
              WHERE r.refund_reference='refund-multiscope-ordered' AND s.restriction_id IS NULL) THEN
        RAISE EXCEPTION 'Multi-scope refund did not follow restriction-first, unrestricted-last policy';
    END IF;

    -- Funds in the unrestricted scope cannot cover a refund whose only original
    -- allocation was a fully spent restriction scope.
    INSERT INTO donation(donor_id, campaign_id, donation_amount, payment_method,
        transaction_reference, receipt_number)
    VALUES (v_donor_id, v_campaign_id, 10, 'ONLINE', 'synthetic-txn-no-borrow', 'synthetic-receipt-no-borrow')
    RETURNING donation_id INTO v_no_borrow_donation_id;
    INSERT INTO donation_restriction(donation_id, campaign_id, restriction_id, restricted_amount)
    VALUES (v_no_borrow_donation_id, v_campaign_id, v_restriction_id, 10);
    PERFORM clear_donation(v_no_borrow_donation_id);
    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_campaign_id, v_beneficiary_id, v_restriction_id, 10,
        'Synthetic final food balance', 'FOOD') RETURNING disbursement_id INTO v_test_id;
    PERFORM pg_temp.approve_test_disbursement(v_test_id);
    PERFORM pg_temp.pay_test_disbursement(v_test_id, 'synthetic-payout-spend-no-borrow');
    PERFORM pg_temp.assert_raises(format(
        'SELECT post_donation_refund(%s,1,''refund-no-cross-scope-borrow'',''scope exhausted'')',
        v_no_borrow_donation_id), 'P0001');
    IF (SELECT d.refunded_amount FROM donation d WHERE d.donation_id=v_no_borrow_donation_id) <> 0
       OR EXISTS (SELECT 1 FROM donation_refund r WHERE r.donation_id=v_no_borrow_donation_id)
       OR EXISTS (SELECT 1 FROM donation_refund_scope s WHERE s.donation_id=v_no_borrow_donation_id)
       OR EXISTS (SELECT 1 FROM fund_ledger_entry l WHERE l.donation_id=v_no_borrow_donation_id AND l.entry_type='DONATION_REFUND')
       OR EXISTS (SELECT 1 FROM audit_log a WHERE a.action_type='DONATION_REFUNDED'
                  AND a.entity_id=v_no_borrow_donation_id::TEXT) THEN
        RAISE EXCEPTION 'Refund borrowed from a different allocation scope';
    END IF;
    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_campaign_id, v_beneficiary_id, v_restriction_id, 1,
        'Synthetic blank payment reference check', 'FOOD')
    RETURNING disbursement_id INTO v_blank_disbursement_id;
    PERFORM pg_temp.approve_test_disbursement(v_blank_disbursement_id);
    PERFORM pg_temp.assert_raises(format(
        'SELECT pg_temp.pay_test_disbursement(%s,''   '')', v_blank_disbursement_id), 'P0001');
    IF (SELECT x.disbursement_status FROM disbursement x WHERE x.disbursement_id=v_blank_disbursement_id) <> 'PENDING'
       OR (SELECT x.payment_reference FROM disbursement x WHERE x.disbursement_id=v_blank_disbursement_id) IS NOT NULL
       OR (SELECT x.paid_at FROM disbursement x WHERE x.disbursement_id=v_blank_disbursement_id) IS NOT NULL
       OR EXISTS (SELECT 1 FROM fund_ledger_entry l WHERE l.disbursement_id=v_blank_disbursement_id)
       OR EXISTS (SELECT 1 FROM audit_log a WHERE a.action_type='DISBURSEMENT_PAID'
                  AND a.entity_id=v_blank_disbursement_id::TEXT) THEN
        RAISE EXCEPTION 'Blank payment reference rejection left payment, ledger, or audit residue';
    END IF;

    INSERT INTO donor_consent_event(donor_id, consent_purpose, consent_action)
    VALUES (v_donor_id, 'SYNTHETIC_TEST', 'GRANTED') RETURNING consent_event_id INTO v_consent_event_id;
    IF (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='CAMPAIGN_APPROVAL_APPROVED'
        AND a.entity_type='campaign' AND a.entity_id=v_campaign_id::TEXT
        AND a.actor_id='synthetic-test-operator' AND a.occurred_at IS NOT NULL
        AND a.old_values->>'approval_status'='PENDING' AND a.new_values->>'approval_status'='APPROVED') <> 1 THEN
        RAISE EXCEPTION 'F23 campaign approval audit metadata mismatch';
    END IF;
    IF (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='DONATION_CLEARED'
           AND a.entity_type='donation' AND a.entity_id=v_donation_a::TEXT
           AND a.actor_id='synthetic-test-operator' AND a.occurred_at IS NOT NULL
           AND a.old_values->>'payment_status'='PENDING' AND a.new_values->>'payment_status'='SUCCESSFUL') <> 1 THEN
        RAISE EXCEPTION 'F23 donation-clearing audit metadata mismatch';
    END IF;
    IF (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='DONATION_REFUNDED'
           AND a.entity_type='donation' AND a.entity_id=v_donation_a::TEXT
           AND a.actor_id='synthetic-test-operator' AND a.occurred_at IS NOT NULL
           AND a.old_values->>'payment_status'='PARTIALLY_REFUNDED'
           AND (a.old_values->>'refunded_amount')::NUMERIC=20
           AND a.new_values->>'payment_status'='REFUNDED'
           AND (a.new_values->>'refunded_amount')::NUMERIC=60) <> 1 THEN
        RAISE EXCEPTION 'F23 donation-refund audit metadata mismatch';
    END IF;
    IF (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='BENEFICIARY_VERIFIED'
           AND a.entity_type='beneficiary' AND a.entity_id=v_beneficiary_id::TEXT
           AND a.actor_id='synthetic-test-operator' AND a.occurred_at IS NOT NULL
           AND a.old_values->>'verification_status'='PENDING'
           AND a.new_values->>'verification_status'='VERIFIED'
           AND a.new_values->>'verified_by'='synthetic-test-operator'
           AND a.new_values->>'verified_at' IS NOT NULL) <> 1 THEN
        RAISE EXCEPTION 'F23 beneficiary-verification audit metadata mismatch';
    END IF;
    IF (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='DISBURSEMENT_APPROVED'
           AND a.entity_type='disbursement' AND a.entity_id=v_disbursement_id::TEXT
           AND a.actor_id='synthetic-test-approver' AND a.occurred_at IS NOT NULL
           AND a.old_values->>'approval_status'='PENDING'
           AND a.new_values->>'approval_status'='APPROVED'
           AND a.new_values->>'approved_by'='synthetic-test-approver'
           AND a.new_values->>'approved_at' IS NOT NULL) <> 1 THEN
        RAISE EXCEPTION 'F23 disbursement-approval audit metadata mismatch';
    END IF;
    IF (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='DISBURSEMENT_PAID'
           AND a.entity_type='disbursement' AND a.entity_id=v_disbursement_id::TEXT
           AND a.actor_id='synthetic-payout-operator' AND a.occurred_at IS NOT NULL
           AND a.old_values->>'disbursement_status'='PENDING'
           AND a.new_values->>'disbursement_status'='PAID'
           AND a.new_values->>'payment_reference'='synthetic-payout-1'
           AND a.new_values->>'paid_at' IS NOT NULL) <> 1 THEN
        RAISE EXCEPTION 'F23 disbursement-payment audit metadata mismatch';
    END IF;
    IF (SELECT COUNT(*) FROM audit_log a WHERE a.action_type='DONOR_CONSENT_GRANTED'
           AND a.entity_type='donor' AND a.entity_id=v_donor_id::TEXT
           AND a.actor_id='synthetic-test-operator' AND a.occurred_at IS NOT NULL
           AND a.new_values->>'consent_event_id'=v_consent_event_id::TEXT
           AND a.new_values->>'consent_purpose'='SYNTHETIC_TEST'
           AND a.new_values->>'consent_action'='GRANTED'
           AND a.new_values->>'actor_id'='synthetic-test-operator') <> 1 THEN
        RAISE EXCEPTION 'F23 donor-consent audit metadata mismatch';
    END IF;
    IF (SELECT COALESCE(SUM(amount_delta),0) FROM fund_ledger_entry
        WHERE donation_id=v_donation_a) <> 0 THEN
        RAISE EXCEPTION 'Fully refunded donation ledger did not reconcile to zero';
    END IF;

    -- F26: inject a test-only failure at the audit insert, after the clearing,
    -- refund, or payout workflow has already written its ledger/business rows.
    EXECUTE $sql$
        CREATE FUNCTION public.fi_test_audit_fault()
        RETURNS trigger LANGUAGE plpgsql AS $body$
        BEGIN
            IF NULLIF(current_setting('app.financial_integrity_fault_action', TRUE), '') = NEW.action_type THEN
                RAISE EXCEPTION 'Injected financial-integrity test fault for %', NEW.action_type
                    USING ERRCODE='P0001';
            END IF;
            RETURN NEW;
        END;
        $body$;
    $sql$;
    EXECUTE 'CREATE TRIGGER trg_fi_test_audit_fault BEFORE INSERT ON audit_log
             FOR EACH ROW EXECUTE FUNCTION public.fi_test_audit_fault()';

    INSERT INTO donation(donor_id, campaign_id, donation_amount, payment_method,
        transaction_reference, receipt_number)
    VALUES (v_donor_id, v_campaign_id, 4, 'ONLINE',
        'f26-clear-fault-txn', 'f26-clear-fault-receipt')
    RETURNING donation_id INTO v_f26_clear_donation_id;
    PERFORM set_config('app.financial_integrity_fault_action', 'DONATION_CLEARED', TRUE);
    PERFORM pg_temp.assert_raises(format('SELECT clear_donation(%s)',v_f26_clear_donation_id), 'P0001');
    PERFORM set_config('app.financial_integrity_fault_action', '', TRUE);
    IF (SELECT payment_status FROM donation WHERE donation_id=v_f26_clear_donation_id) <> 'PENDING'
       OR (SELECT cleared_at FROM donation WHERE donation_id=v_f26_clear_donation_id) IS NOT NULL
       OR EXISTS (SELECT 1 FROM fund_ledger_entry WHERE donation_id=v_f26_clear_donation_id)
       OR EXISTS (SELECT 1 FROM audit_log WHERE action_type='DONATION_CLEARED'
                  AND entity_id=v_f26_clear_donation_id::TEXT) THEN
        RAISE EXCEPTION 'F26 injected clear failure left donation, ledger, or audit changes';
    END IF;

    PERFORM set_config('app.financial_integrity_fault_action', 'DONATION_REFUNDED', TRUE);
    PERFORM pg_temp.assert_raises(format(
        'SELECT post_donation_refund(%s,5,''f26-refund-fault-ref'',''injected audit failure'')',v_donation_b), 'P0001');
    PERFORM set_config('app.financial_integrity_fault_action', '', TRUE);
    IF (SELECT payment_status FROM donation WHERE donation_id=v_donation_b) <> 'SUCCESSFUL'
       OR (SELECT refunded_amount FROM donation WHERE donation_id=v_donation_b) <> 0
       OR EXISTS (SELECT 1 FROM donation_refund WHERE refund_reference='f26-refund-fault-ref')
       OR EXISTS (SELECT 1 FROM donation_refund_scope s JOIN donation_refund r USING (refund_id)
                  WHERE s.donation_id=v_donation_b AND r.refund_reference='f26-refund-fault-ref')
       OR EXISTS (SELECT 1 FROM fund_ledger_entry WHERE donation_id=v_donation_b
                  AND entry_type='DONATION_REFUND'
                  AND external_reference='f26-refund-fault-ref')
       OR EXISTS (SELECT 1 FROM audit_log WHERE action_type='DONATION_REFUNDED'
                  AND entity_id=v_donation_b::TEXT
                  AND new_values->>'refunded_amount'='5') THEN
        RAISE EXCEPTION 'F26 injected refund failure left refund metadata, scope, ledger, or audit changes';
    END IF;

    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code,
        target_amount, start_date, end_date)
    VALUES (v_org_id, 'F26 Payout Rollback Campaign', 'Synthetic rollback purpose', 'GENERAL', 10,
        CURRENT_DATE - 1, CURRENT_DATE + 10) RETURNING campaign_id INTO v_f26_campaign_id;
    PERFORM pg_temp.approve_test_campaign(v_f26_campaign_id);
    INSERT INTO donation(donor_id, campaign_id, donation_amount, payment_method,
        transaction_reference, receipt_number)
    VALUES (v_donor_id, v_f26_campaign_id, 8, 'ONLINE',
        'f26-payout-funding-txn', 'f26-payout-funding-receipt')
    RETURNING donation_id INTO v_test_id;
    PERFORM clear_donation(v_test_id);
    INSERT INTO disbursement(campaign_id, beneficiary_id, restriction_id, disbursement_amount,
        approved_purpose, purpose_code)
    VALUES (v_f26_campaign_id, v_beneficiary_id, NULL, 5,
        'Synthetic payout rollback', 'GENERAL') RETURNING disbursement_id INTO v_f26_disbursement_id;
    PERFORM pg_temp.approve_test_disbursement(v_f26_disbursement_id);
    PERFORM set_config('app.financial_integrity_fault_action', 'DISBURSEMENT_PAID', TRUE);
    PERFORM pg_temp.assert_raises(format(
        'SELECT pg_temp.pay_test_disbursement(%s,''f26-payout-fault-ref'')',v_f26_disbursement_id), 'P0001');
    PERFORM set_config('app.financial_integrity_fault_action', '', TRUE);
    IF (SELECT disbursement_status FROM disbursement WHERE disbursement_id=v_f26_disbursement_id) <> 'PENDING'
       OR (SELECT payment_reference FROM disbursement WHERE disbursement_id=v_f26_disbursement_id) IS NOT NULL
       OR (SELECT paid_at FROM disbursement WHERE disbursement_id=v_f26_disbursement_id) IS NOT NULL
       OR EXISTS (SELECT 1 FROM fund_ledger_entry WHERE disbursement_id=v_f26_disbursement_id)
       OR EXISTS (SELECT 1 FROM audit_log WHERE action_type='DISBURSEMENT_PAID'
                  AND entity_id=v_f26_disbursement_id::TEXT) THEN
        RAISE EXCEPTION 'F26 injected payout failure left payment, ledger, or audit changes';
    END IF;

    EXECUTE 'DROP TRIGGER trg_fi_test_audit_fault ON audit_log';
    EXECUTE 'DROP FUNCTION public.fi_test_audit_fault()';
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_fi_test_audit_fault' AND NOT tgisinternal)
       OR to_regprocedure('public.fi_test_audit_fault()') IS NOT NULL
       OR NULLIF(current_setting('app.financial_integrity_fault_action', TRUE), '') IS NOT NULL
       OR EXISTS (SELECT 1 FROM pg_db_role_setting
                  WHERE array_to_string(setconfig, ',') LIKE '%app.financial_integrity_fault_action=%') THEN
        RAISE EXCEPTION 'F26 test-only fault trigger, function, or persistent configuration remains';
    END IF;

    PERFORM pg_temp.assert_raises(format('DELETE FROM donation WHERE donation_id=%s',v_donation_a), 'P0001');
    PERFORM pg_temp.assert_raises(format('DELETE FROM fund_ledger_entry WHERE donation_id=%s',v_donation_a), 'P0001');
    PERFORM pg_temp.assert_raises(format('UPDATE fund_ledger_entry SET notes=''tamper'' WHERE donation_id=%s',v_donation_a), 'P0001');
    PERFORM pg_temp.assert_raises(format('DELETE FROM audit_log WHERE entity_id=%L',v_donation_a::TEXT), 'P0001');
    PERFORM pg_temp.assert_raises(format('UPDATE audit_log SET reason=''tamper'' WHERE entity_id=%L',v_donation_a::TEXT), 'P0001');
    PERFORM pg_temp.assert_raises(format('UPDATE donation_refund SET reason=''tamper'' WHERE donation_id=%s',v_donation_a), 'P0001');
    SELECT refund_id INTO v_f24_refund_id FROM donation_refund WHERE refund_reference='refund-part-1';
    PERFORM pg_temp.assert_raises(format(
        'DELETE FROM donation_refund WHERE refund_id=%s',v_f24_refund_id), 'P0001');
    IF (SELECT COUNT(*) FROM donation_refund WHERE refund_id=v_f24_refund_id
        AND donation_id=v_donation_a AND campaign_id=v_campaign_id
        AND refund_amount=10 AND reason='Synthetic partial refund') <> 1 THEN
        RAISE EXCEPTION 'F24 rejected refund deletion changed the original refund event';
    END IF;
    PERFORM pg_temp.assert_raises(format('DELETE FROM donation_refund_scope WHERE refund_id=(SELECT refund_id FROM donation_refund WHERE donation_id=%s LIMIT 1)',v_donation_a), 'P0001');
    PERFORM pg_temp.assert_raises(format(
        'UPDATE donor_consent_event SET consent_action=''REVOKED'' WHERE consent_event_id=%s',v_consent_event_id), 'P0001');
    IF (SELECT COUNT(*) FROM donor_consent_event WHERE consent_event_id=v_consent_event_id
        AND donor_id=v_donor_id AND consent_purpose='SYNTHETIC_TEST'
        AND consent_action='GRANTED' AND actor_id='synthetic-test-operator'
        AND occurred_at IS NOT NULL) <> 1 THEN
        RAISE EXCEPTION 'F24 rejected consent update changed the original consent event';
    END IF;
    PERFORM pg_temp.assert_raises(format(
        'DELETE FROM donor_consent_event WHERE consent_event_id=%s',v_consent_event_id), 'P0001');
    IF (SELECT COUNT(*) FROM donor_consent_event WHERE consent_event_id=v_consent_event_id
        AND donor_id=v_donor_id AND consent_purpose='SYNTHETIC_TEST'
        AND consent_action='GRANTED' AND actor_id='synthetic-test-operator'
        AND occurred_at IS NOT NULL) <> 1 THEN
        RAISE EXCEPTION 'F24 rejected consent deletion changed the original consent event';
    END IF;
END;
$$;

-- The whole fixture, audit trail, ledger, and all assertions are discarded.
ROLLBACK;
