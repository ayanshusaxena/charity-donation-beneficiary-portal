-- Transactional workflows for the evaluation schema (PostgreSQL 15+).
-- Set transaction-local actor context before controlled writes:
--   SET LOCAL app.actor_id = 'synthetic-operator-1';
-- The application must derive this value from its authenticated session. A custom
-- GUC is not an authentication boundary; direct DML must be restricted by grants.

BEGIN;

CREATE OR REPLACE FUNCTION require_actor()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_actor TEXT;
BEGIN
    v_actor := NULLIF(BTRIM(current_setting('app.actor_id', TRUE)), '');
    IF v_actor IS NULL THEN RAISE EXCEPTION 'app.actor_id must be set for this operation'; END IF;
    RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION require_organization_role(p_organization_id BIGINT, p_role TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_actor TEXT := require_actor();
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_membership m
        WHERE m.organization_id = p_organization_id AND m.actor_id = v_actor
          AND m.membership_role = p_role AND m.is_active
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P1002', MESSAGE = 'ORGANIZATION_ACCESS_DENIED';
    END IF;
    RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION require_platform_role(p_role TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_actor TEXT := require_actor();
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.platform_role r
        WHERE r.actor_id = v_actor AND r.platform_role = p_role AND r.is_active
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P1002', MESSAGE = 'PLATFORM_ACCESS_DENIED';
    END IF;
    RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION write_audit(
    p_action TEXT, p_entity TEXT, p_id TEXT, p_old JSONB, p_new JSONB, p_reason TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log(actor_id, action_type, entity_type, entity_id, old_values, new_values, reason, request_id)
    VALUES (require_actor(), p_action, p_entity, p_id, p_old, p_new, p_reason,
            NULLIF(current_setting('app.request_id', TRUE), ''));
END;
$$;

CREATE OR REPLACE FUNCTION assert_campaign_accepts_funds(p_campaign_id BIGINT)
RETURNS campaign LANGUAGE plpgsql AS $$
DECLARE c campaign%ROWTYPE;
BEGIN
    SELECT * INTO c FROM campaign WHERE campaign_id = p_campaign_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign % does not exist', p_campaign_id; END IF;
    IF NOT campaign_accepts_donations(p_campaign_id) THEN
        RAISE EXCEPTION 'Campaign % is not approved, active, and within its campaign dates', p_campaign_id;
    END IF;
    RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION guard_campaign_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_approval_changed BOOLEAN; v_status_changed BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.approval_status <> 'PENDING' OR NEW.campaign_status <> 'DRAFT' THEN
            RAISE EXCEPTION 'Campaigns must be created pending and draft';
        END IF;
        RETURN NEW;
    END IF;
    v_approval_changed := NEW.approval_status IS DISTINCT FROM OLD.approval_status;
    v_status_changed := NEW.campaign_status IS DISTINCT FROM OLD.campaign_status;
    IF (v_approval_changed OR v_status_changed
        OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
        OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
        OR NEW.review_reason IS DISTINCT FROM OLD.review_reason)
       AND current_setting('app.campaign_workflow', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Campaign state changes must use the campaign workflow';
    END IF;
    IF v_approval_changed OR v_status_changed THEN
        PERFORM require_actor();
    END IF;
    IF v_approval_changed AND NOT (
        (OLD.approval_status = 'PENDING' AND NEW.approval_status IN ('APPROVED','REJECTED'))
        OR (OLD.approval_status = 'REJECTED' AND NEW.approval_status = 'PENDING')
        OR (OLD.approval_status = 'APPROVED' AND NEW.approval_status = 'SUSPENDED')
        OR (OLD.approval_status = 'SUSPENDED' AND NEW.approval_status = 'APPROVED')
    ) THEN
        RAISE EXCEPTION 'Invalid campaign approval transition';
    END IF;
    IF v_status_changed AND NOT (
        (OLD.campaign_status = 'DRAFT' AND NEW.campaign_status IN ('ACTIVE','CANCELLED'))
        OR (OLD.campaign_status = 'ACTIVE' AND NEW.campaign_status IN ('PAUSED','CLOSED','CANCELLED'))
        OR (OLD.campaign_status = 'PAUSED' AND NEW.campaign_status IN ('ACTIVE','CLOSED','CANCELLED'))
    ) THEN
        RAISE EXCEPTION 'Invalid campaign publication transition';
    END IF;
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
        NEW.submitted_by := require_actor();
    END IF;
    IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
        NEW.reviewed_by := require_actor();
    END IF;
    IF v_approval_changed AND NEW.approval_status = 'APPROVED' THEN
        NEW.approved_by := require_actor();
        NEW.approved_at := CURRENT_TIMESTAMP;
    ELSIF v_approval_changed AND NEW.approval_status <> 'APPROVED' THEN
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
    END IF;
    IF NEW.campaign_status = 'ACTIVE' AND (NEW.approval_status <> 'APPROVED'
       OR CURRENT_DATE < NEW.start_date OR CURRENT_DATE > NEW.end_date) THEN
        RAISE EXCEPTION 'Only an approved campaign within its date window can be active';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit_campaign_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        PERFORM write_audit('CAMPAIGN_APPROVAL_' || NEW.approval_status, 'campaign', NEW.campaign_id::TEXT,
            to_jsonb(OLD), to_jsonb(NEW), NEW.review_reason);
    END IF;
    IF NEW.campaign_status IS DISTINCT FROM OLD.campaign_status THEN
        PERFORM write_audit('CAMPAIGN_STATUS_' || NEW.campaign_status, 'campaign', NEW.campaign_id::TEXT,
            to_jsonb(OLD), to_jsonb(NEW), NULLIF(current_setting('app.campaign_reason',TRUE),''));
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_campaign_state_guard BEFORE INSERT OR UPDATE OF approval_status, campaign_status ON campaign
FOR EACH ROW EXECUTE FUNCTION guard_campaign_state();
CREATE TRIGGER trg_campaign_audit AFTER UPDATE OF approval_status, campaign_status ON campaign
FOR EACH ROW EXECUTE FUNCTION audit_campaign_change();

CREATE OR REPLACE FUNCTION create_campaign_draft(
    p_organization_id BIGINT,p_name TEXT,p_purpose TEXT,p_purpose_code TEXT,
    p_target NUMERIC(14,2),p_start DATE,p_end DATE
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_id BIGINT; v_actor TEXT;
BEGIN
    v_actor := require_organization_role(p_organization_id,'CAMPAIGN_EDITOR');
    INSERT INTO campaign(organization_id,campaign_name,purpose,purpose_code,target_amount,start_date,end_date)
    VALUES (p_organization_id,p_name,p_purpose,p_purpose_code,p_target,p_start,p_end)
    RETURNING campaign_id INTO v_id;
    PERFORM write_audit('CAMPAIGN_DRAFT_CREATED','campaign',v_id::TEXT,NULL,
        (SELECT to_jsonb(c) FROM campaign c WHERE c.campaign_id=v_id));
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION submit_campaign(p_campaign_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE c campaign%ROWTYPE; v_actor TEXT; v_previous TEXT;
BEGIN
    SELECT * INTO c FROM campaign WHERE campaign_id = p_campaign_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P1003', MESSAGE = 'CAMPAIGN_NOT_FOUND'; END IF;
    v_actor := require_organization_role(c.organization_id, 'CAMPAIGN_EDITOR');
    IF c.campaign_status <> 'DRAFT' OR c.approval_status NOT IN ('PENDING','REJECTED') THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'CAMPAIGN_NOT_SUBMITTABLE';
    END IF;
    v_previous := current_setting('app.campaign_workflow', TRUE);
    PERFORM set_config('app.campaign_workflow', 'on', TRUE);
    UPDATE campaign SET approval_status = CASE WHEN approval_status = 'REJECTED' THEN 'PENDING' ELSE approval_status END,
        submitted_by = v_actor, submitted_at = CURRENT_TIMESTAMP,
        reviewed_by = NULL, reviewed_at = NULL, review_reason = NULL
    WHERE campaign_id = p_campaign_id;
    PERFORM set_config('app.campaign_workflow', COALESCE(v_previous, ''), TRUE);
    PERFORM write_audit('CAMPAIGN_SUBMITTED', 'campaign', p_campaign_id::TEXT,
        to_jsonb(c), (SELECT to_jsonb(x) FROM campaign x WHERE x.campaign_id=p_campaign_id));
END;
$$;

CREATE OR REPLACE FUNCTION review_campaign(p_campaign_id BIGINT, p_decision TEXT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE c campaign%ROWTYPE; v_previous TEXT;
BEGIN
    PERFORM require_platform_role('CAMPAIGN_REVIEWER');
    IF p_decision NOT IN ('APPROVED','REJECTED') OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_CAMPAIGN_REVIEW';
    END IF;
    SELECT * INTO c FROM campaign WHERE campaign_id=p_campaign_id FOR UPDATE;
    IF NOT FOUND OR c.submitted_at IS NULL OR c.approval_status <> 'PENDING' OR c.campaign_status <> 'DRAFT' THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'CAMPAIGN_NOT_REVIEWABLE';
    END IF;
    v_previous := current_setting('app.campaign_workflow', TRUE);
    PERFORM set_config('app.campaign_workflow', 'on', TRUE);
    UPDATE campaign SET approval_status=p_decision, reviewed_at=CURRENT_TIMESTAMP,
        review_reason=p_reason,
        campaign_status=CASE WHEN p_decision='APPROVED' AND CURRENT_DATE BETWEEN start_date AND end_date
                             THEN 'ACTIVE' ELSE 'DRAFT' END
    WHERE campaign_id=p_campaign_id;
    PERFORM set_config('app.campaign_workflow', COALESCE(v_previous, ''), TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION update_campaign_draft(
    p_campaign_id BIGINT, p_name TEXT, p_purpose TEXT, p_purpose_code TEXT,
    p_target NUMERIC(14,2), p_start DATE, p_end DATE
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE c campaign%ROWTYPE;
BEGIN
    SELECT * INTO c FROM campaign WHERE campaign_id=p_campaign_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1003', MESSAGE='CAMPAIGN_NOT_FOUND'; END IF;
    PERFORM require_organization_role(c.organization_id, 'CAMPAIGN_EDITOR');
    IF c.campaign_status <> 'DRAFT' OR c.approval_status NOT IN ('PENDING','REJECTED')
       OR (c.approval_status='PENDING' AND c.submitted_at IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='CAMPAIGN_NOT_EDITABLE';
    END IF;
    UPDATE campaign SET campaign_name=COALESCE(p_name,c.campaign_name),
        purpose=COALESCE(p_purpose,c.purpose), purpose_code=COALESCE(p_purpose_code,c.purpose_code),
        target_amount=COALESCE(p_target,c.target_amount), start_date=COALESCE(p_start,c.start_date),
        end_date=COALESCE(p_end,c.end_date)
    WHERE campaign_id=p_campaign_id;
    PERFORM write_audit('CAMPAIGN_DRAFT_UPDATED','campaign',p_campaign_id::TEXT,to_jsonb(c),
        (SELECT to_jsonb(x) FROM campaign x WHERE x.campaign_id=p_campaign_id));
END;
$$;

CREATE OR REPLACE FUNCTION activate_campaign(p_campaign_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE c campaign%ROWTYPE; v_previous TEXT;
BEGIN
    PERFORM require_platform_role('CAMPAIGN_REVIEWER');
    SELECT * INTO c FROM campaign WHERE campaign_id=p_campaign_id FOR UPDATE;
    IF NOT FOUND OR c.approval_status <> 'APPROVED' OR c.campaign_status <> 'DRAFT'
       OR CURRENT_DATE NOT BETWEEN c.start_date AND c.end_date THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='CAMPAIGN_NOT_ACTIVATABLE';
    END IF;
    v_previous := current_setting('app.campaign_workflow', TRUE);
    PERFORM set_config('app.campaign_workflow','on',TRUE);
    UPDATE campaign SET campaign_status='ACTIVE' WHERE campaign_id=p_campaign_id;
    PERFORM set_config('app.campaign_workflow',COALESCE(v_previous,''),TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION change_campaign_status(p_campaign_id BIGINT,p_status TEXT,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE c campaign%ROWTYPE; v_previous TEXT; v_old_reason TEXT;
BEGIN
    PERFORM require_platform_role('CAMPAIGN_REVIEWER');
    IF p_status NOT IN ('PAUSED','CLOSED','CANCELLED')
       OR NULLIF(BTRIM(p_reason),'') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='INVALID_CAMPAIGN_STATUS_CHANGE';
    END IF;
    SELECT * INTO c FROM campaign WHERE campaign_id=p_campaign_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1003', MESSAGE='CAMPAIGN_NOT_FOUND'; END IF;
    v_previous := current_setting('app.campaign_workflow',TRUE);
    v_old_reason := current_setting('app.campaign_reason',TRUE);
    PERFORM set_config('app.campaign_workflow','on',TRUE);
    PERFORM set_config('app.campaign_reason',p_reason,TRUE);
    UPDATE campaign SET campaign_status=p_status WHERE campaign_id=p_campaign_id;
    PERFORM set_config('app.campaign_reason',COALESCE(v_old_reason,''),TRUE);
    PERFORM set_config('app.campaign_workflow',COALESCE(v_previous,''),TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION guard_pledge_campaign()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE received NUMERIC(14,2);
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.pledge_status <> 'OPEN' THEN RAISE EXCEPTION 'Pledges must be created OPEN'; END IF;
        PERFORM assert_campaign_accepts_funds(NEW.campaign_id);
    ELSE
        IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR NEW.donor_id IS DISTINCT FROM OLD.donor_id THEN
            IF EXISTS (SELECT 1 FROM donation WHERE pledge_id=OLD.pledge_id) THEN
                RAISE EXCEPTION 'Pledge donor/campaign is immutable after a donation is linked';
            END IF;
            PERFORM assert_campaign_accepts_funds(NEW.campaign_id);
        END IF;
        IF NEW.pledge_status IS DISTINCT FROM OLD.pledge_status
           AND current_setting('app.pledge_refresh', TRUE) IS DISTINCT FROM 'on' THEN
            PERFORM require_actor();
            RAISE EXCEPTION 'Pledge status can change only through its workflow';
        END IF;
        IF NEW.pledged_amount IS DISTINCT FROM OLD.pledged_amount THEN
            SELECT COALESCE(SUM(donation_amount-refunded_amount),0) INTO received FROM donation
            WHERE pledge_id=OLD.pledge_id AND payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED')
              AND cleared_at IS NOT NULL;
            IF NEW.pledged_amount < received THEN RAISE EXCEPTION 'Pledge amount cannot be below net received donations'; END IF;
        END IF;
    END IF;
    IF NEW.pledge_status = 'CANCELLED' AND EXISTS (
        SELECT 1 FROM donation d WHERE d.pledge_id = NEW.pledge_id
          AND d.payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED') AND d.cleared_at IS NOT NULL
    ) THEN RAISE EXCEPTION 'A pledge with received funds cannot be cancelled'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_pledge_campaign_guard BEFORE INSERT OR UPDATE ON pledge
FOR EACH ROW EXECUTE FUNCTION guard_pledge_campaign();

CREATE OR REPLACE FUNCTION guard_donation_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pledge_row pledge%ROWTYPE; already_received NUMERIC(14,2); entering_success BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.payment_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Donations must be created PENDING and cleared through the workflow';
    END IF;
    IF TG_OP = 'INSERT' THEN
        PERFORM assert_campaign_accepts_funds(NEW.campaign_id);
    ELSIF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id THEN
        PERFORM assert_campaign_accepts_funds(NEW.campaign_id);
    ELSIF NEW.payment_status = 'SUCCESSFUL' AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        PERFORM assert_campaign_accepts_funds(NEW.campaign_id);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.payment_status <> 'PENDING' AND
       (NEW.donor_id IS DISTINCT FROM OLD.donor_id OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
        OR NEW.pledge_id IS DISTINCT FROM OLD.pledge_id OR NEW.donation_amount IS DISTINCT FROM OLD.donation_amount
        OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
        OR NEW.transaction_reference IS DISTINCT FROM OLD.transaction_reference
        OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
        OR NEW.donated_at IS DISTINCT FROM OLD.donated_at
        OR NEW.cleared_at IS DISTINCT FROM OLD.cleared_at) THEN
        RAISE EXCEPTION 'Cleared/terminal donation source fields are immutable';
    END IF;
    IF NEW.payment_status = 'SUCCESSFUL' THEN
        IF TG_OP = 'INSERT' THEN
            entering_success := TRUE;
        ELSE
            entering_success := OLD.payment_status <> 'SUCCESSFUL';
        END IF;
    END IF;
    IF NEW.currency <> 'INR' THEN RAISE EXCEPTION 'Only INR is supported'; END IF;
    IF NEW.pledge_id IS NOT NULL THEN
        SELECT * INTO pledge_row FROM pledge WHERE pledge_id = NEW.pledge_id FOR UPDATE;
        IF NOT FOUND OR pledge_row.campaign_id <> NEW.campaign_id OR pledge_row.donor_id <> NEW.donor_id THEN
            RAISE EXCEPTION 'Linked pledge must belong to the same donor and campaign';
        END IF;
        IF pledge_row.pledge_status = 'CANCELLED' THEN RAISE EXCEPTION 'Cancelled pledge cannot receive donations'; END IF;
        IF entering_success THEN
            SELECT COALESCE(SUM(donation_amount - refunded_amount), 0) INTO already_received
            FROM donation WHERE pledge_id = NEW.pledge_id AND donation_id IS DISTINCT FROM NEW.donation_id
              AND payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED') AND cleared_at IS NOT NULL;
            IF already_received + NEW.donation_amount > pledge_row.pledged_amount THEN
                RAISE EXCEPTION 'Cleared donations would exceed pledged amount';
            END IF;
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        IF OLD.payment_status <> 'PENDING' OR NEW.payment_status NOT IN ('SUCCESSFUL','FAILED','CANCELLED') THEN
            IF current_setting('app.refund_workflow', TRUE) IS DISTINCT FROM 'on' THEN
                RAISE EXCEPTION 'Invalid donation payment-state transition';
            END IF;
            IF NEW.payment_status NOT IN ('PARTIALLY_REFUNDED','REFUNDED') THEN
                RAISE EXCEPTION 'Invalid refund state transition';
            END IF;
        END IF;
    END IF;
    IF NEW.payment_status = 'SUCCESSFUL' AND NEW.cleared_at IS NULL THEN
        RAISE EXCEPTION 'Successful donation must have a clearing timestamp';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_donation_allocation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_donation BIGINT; v_campaign BIGINT; v_amount NUMERIC(14,2); v_total NUMERIC(14,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_donation := OLD.donation_id;
    ELSE
        v_donation := NEW.donation_id;
    END IF;
    SELECT campaign_id, donation_amount INTO v_campaign, v_amount
    FROM donation WHERE donation_id = v_donation FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Donation % does not exist', v_donation; END IF;
    IF EXISTS (SELECT 1 FROM fund_ledger_entry WHERE donation_id = v_donation AND entry_type = 'DONATION_CLEARING') THEN
        RAISE EXCEPTION 'Donation allocation is frozen after clearing';
    END IF;
    IF TG_OP <> 'DELETE' THEN
        IF NEW.campaign_id <> v_campaign THEN
            RAISE EXCEPTION 'Restriction allocation campaign must match donation campaign';
        END IF;
    END IF;
    SELECT COALESCE(SUM(restricted_amount), 0) INTO v_total
    FROM donation_restriction WHERE donation_id = v_donation;
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        IF TG_OP = 'UPDATE' THEN
            IF NEW.donation_id <> OLD.donation_id THEN
                RAISE EXCEPTION 'Allocation donation_id cannot be changed';
            END IF;
        END IF;
        v_total := v_total - OLD.restricted_amount;
    END IF;
    IF TG_OP <> 'DELETE' THEN v_total := v_total + NEW.restricted_amount; END IF;
    IF v_total > v_amount THEN RAISE EXCEPTION 'Restriction allocations exceed donation amount'; END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_donation_write_guard BEFORE INSERT OR UPDATE ON donation
FOR EACH ROW EXECUTE FUNCTION guard_donation_write();
CREATE TRIGGER trg_donation_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON donation_restriction
FOR EACH ROW EXECUTE FUNCTION guard_donation_allocation();

CREATE OR REPLACE FUNCTION refresh_pledge_status(p_pledge_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE p pledge%ROWTYPE; fulfilled NUMERIC(14,2); new_status VARCHAR(20);
BEGIN
    SELECT * INTO p FROM pledge WHERE pledge_id = p_pledge_id FOR UPDATE;
    IF NOT FOUND OR p.pledge_status = 'CANCELLED' THEN RETURN; END IF;
    SELECT COALESCE(SUM(donation_amount - refunded_amount), 0) INTO fulfilled
    FROM donation WHERE pledge_id = p_pledge_id
      AND payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED') AND cleared_at IS NOT NULL;
    new_status := CASE WHEN fulfilled = 0 THEN 'OPEN'
                       WHEN fulfilled >= p.pledged_amount THEN 'FULFILLED'
                       ELSE 'PARTIALLY_FULFILLED' END;
    IF p.pledge_status IS DISTINCT FROM new_status THEN
        PERFORM set_config('app.pledge_refresh', 'on', TRUE);
        UPDATE pledge SET pledge_status = new_status WHERE pledge_id = p_pledge_id;
        PERFORM set_config('app.pledge_refresh', '', TRUE);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION guard_pledge_status_write()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- The row trigger below owns status changes; retained as an explicit guard
    -- so direct status updates cannot contradict the net cleared donation total.
    IF NEW.pledge_status IS DISTINCT FROM OLD.pledge_status
       AND current_setting('app.pledge_refresh', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Pledge status is workflow-maintained';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_pledge_status_guard BEFORE UPDATE OF pledge_status ON pledge
FOR EACH ROW EXECUTE FUNCTION guard_pledge_status_write();

CREATE OR REPLACE FUNCTION cancel_pledge(p_pledge_id BIGINT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM require_actor();
    IF EXISTS (SELECT 1 FROM donation WHERE pledge_id = p_pledge_id
               AND payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED') AND cleared_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Pledge with net received funds cannot be cancelled';
    END IF;
    PERFORM set_config('app.pledge_refresh', 'on', TRUE);
    UPDATE pledge SET pledge_status = 'CANCELLED'
    WHERE pledge_id = p_pledge_id AND pledge_status IN ('OPEN','PARTIALLY_FULFILLED');
    IF NOT FOUND THEN RAISE EXCEPTION 'Pledge % is missing or not cancellable', p_pledge_id; END IF;
    PERFORM set_config('app.pledge_refresh', '', TRUE);
    PERFORM write_audit('PLEDGE_CANCELLED', 'pledge', p_pledge_id::TEXT, NULL, NULL, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION record_donation_clearing()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE a RECORD; allocated NUMERIC(14,2);
BEGIN
    IF NEW.payment_status = 'SUCCESSFUL' AND OLD.payment_status IS DISTINCT FROM 'SUCCESSFUL' THEN
        SELECT COALESCE(SUM(restricted_amount), 0) INTO allocated
        FROM donation_restriction WHERE donation_id = NEW.donation_id;
        FOR a IN SELECT restriction_id, restricted_amount FROM donation_restriction
                 WHERE donation_id = NEW.donation_id ORDER BY restriction_id LOOP
            INSERT INTO fund_ledger_entry(campaign_id, restriction_id, donation_id, entry_type,
                amount_delta, currency, external_reference, notes)
            VALUES (NEW.campaign_id, a.restriction_id, NEW.donation_id, 'DONATION_CLEARING',
                a.restricted_amount, 'INR', COALESCE(NEW.transaction_reference, 'DONATION:' || NEW.donation_id::TEXT),
                'Cleared donation restriction allocation');
        END LOOP;
        IF NEW.donation_amount > allocated THEN
            INSERT INTO fund_ledger_entry(campaign_id, donation_id, entry_type, amount_delta,
                currency, external_reference, notes)
            VALUES (NEW.campaign_id, NEW.donation_id, 'DONATION_CLEARING',
                NEW.donation_amount - allocated, 'INR', COALESCE(NEW.transaction_reference, 'DONATION:' || NEW.donation_id::TEXT),
                'Unrestricted cleared remainder');
        END IF;
        PERFORM write_audit('DONATION_CLEARED', 'donation', NEW.donation_id::TEXT, to_jsonb(OLD), to_jsonb(NEW));
        IF NEW.pledge_id IS NOT NULL THEN PERFORM refresh_pledge_status(NEW.pledge_id); END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_donation_clearing AFTER UPDATE OF payment_status ON donation
FOR EACH ROW EXECUTE FUNCTION record_donation_clearing();

CREATE OR REPLACE FUNCTION guard_refund_metadata()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.refunded_amount IS DISTINCT FROM OLD.refunded_amount
       AND current_setting('app.refund_workflow', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Refund totals are maintained by post_donation_refund';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_refund_metadata_guard BEFORE UPDATE OF refunded_amount ON donation
FOR EACH ROW EXECUTE FUNCTION guard_refund_metadata();

CREATE OR REPLACE FUNCTION clear_donation(p_donation_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM require_actor();
    UPDATE donation SET payment_status = 'SUCCESSFUL', cleared_at = CURRENT_TIMESTAMP
    WHERE donation_id = p_donation_id AND payment_status = 'PENDING';
    IF NOT FOUND THEN RAISE EXCEPTION 'Donation % is missing or not pending', p_donation_id; END IF;
END;
$$;

-- Compatibility entry point; clearing and ledger/audit writes occur in one statement transaction.
CREATE OR REPLACE FUNCTION post_donation_clearing(p_donation_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN PERFORM clear_donation(p_donation_id); END;
$$;

CREATE OR REPLACE FUNCTION create_donation_idempotent(
    p_campaign_id BIGINT,p_display_name TEXT,p_email TEXT,p_phone TEXT,
    p_amount NUMERIC(14,2),p_idempotency_key TEXT,p_request_hash CHAR(64),p_guest_token_hash CHAR(64)
) RETURNS TABLE(donation_id BIGINT,replayed BOOLEAN) LANGUAGE plpgsql AS $$
DECLARE v_actor TEXT; v_donor BIGINT; v_existing api_idempotency_request%ROWTYPE;
        v_lock TEXT; v_previous TEXT; v_created_donation_id BIGINT;
BEGIN
    v_actor := require_actor();
    IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 16 AND 200
       OR p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='INVALID_DONATION_REQUEST';
    END IF;
    IF p_guest_token_hash IS NOT NULL AND v_actor <> 'guest:' || p_guest_token_hash THEN
        RAISE EXCEPTION USING ERRCODE='P1002', MESSAGE='GUEST_PRINCIPAL_MISMATCH';
    END IF;
    v_lock := v_actor || chr(31) || 'DONATION_CREATE' || chr(31) || p_idempotency_key;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock,0));
    SELECT * INTO v_existing FROM api_idempotency_request i
    WHERE i.principal_id=v_actor AND i.operation='DONATION_CREATE' AND i.idempotency_key=p_idempotency_key;
    IF FOUND THEN
        IF v_existing.request_hash <> p_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P1001', MESSAGE='IDEMPOTENCY_KEY_REUSED';
        END IF;
        donation_id := v_existing.result_donation_id; replayed := TRUE; RETURN NEXT; RETURN;
    END IF;
    BEGIN
        PERFORM assert_campaign_accepts_funds(p_campaign_id);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE='P1003', MESSAGE='CAMPAIGN_UNAVAILABLE';
    END;
    IF p_guest_token_hash IS NULL THEN
        SELECT d.donor_id INTO v_donor FROM donor d WHERE d.actor_id=v_actor FOR UPDATE;
        IF NOT FOUND THEN
            IF NULLIF(BTRIM(p_display_name),'') IS NULL THEN
                RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='DONOR_PROFILE_REQUIRED';
            END IF;
            INSERT INTO donor(display_name,email,phone,actor_id)
            VALUES (p_display_name,p_email,p_phone,v_actor)
            ON CONFLICT (actor_id) DO NOTHING;
            SELECT d.donor_id INTO v_donor FROM donor d WHERE d.actor_id=v_actor;
        END IF;
    ELSE
        IF NULLIF(BTRIM(p_display_name),'') IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='GUEST_DONOR_DETAILS_REQUIRED';
        END IF;
        INSERT INTO donor(display_name,email,phone) VALUES (p_display_name,p_email,p_phone)
        RETURNING donor_id INTO v_donor;
    END IF;
    INSERT INTO donation(donor_id,campaign_id,donation_amount,currency,payment_method,payment_status)
    VALUES (v_donor,p_campaign_id,p_amount,'INR','ONLINE','PENDING')
    RETURNING donation.donation_id INTO donation_id;
    v_created_donation_id := donation_id;
    IF p_guest_token_hash IS NOT NULL THEN
        INSERT INTO donation_guest_access(donation_id,token_sha256)
        VALUES (v_created_donation_id,p_guest_token_hash);
    END IF;
    INSERT INTO api_idempotency_request(principal_id,operation,idempotency_key,request_hash,result_donation_id)
    VALUES (v_actor,'DONATION_CREATE',p_idempotency_key,p_request_hash,v_created_donation_id);
    PERFORM write_audit('DONATION_CREATED','donation',donation_id::TEXT,NULL,
        (SELECT to_jsonb(d) FROM donation d WHERE d.donation_id=v_created_donation_id));
    replayed := FALSE; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION simulate_donation_payment_idempotent(
    p_donation_id BIGINT,p_idempotency_key TEXT,p_request_hash CHAR(64),
    p_outcome TEXT,p_guest_token_hash CHAR(64)
) RETURNS TABLE(payment_attempt_id BIGINT,replayed BOOLEAN) LANGUAGE plpgsql AS $$
DECLARE v_actor TEXT; v_existing api_idempotency_request%ROWTYPE; v_donation donation%ROWTYPE;
        v_attempt BIGINT; v_lock TEXT; v_tx TEXT; v_receipt TEXT;
BEGIN
    v_actor := require_actor();
    IF p_outcome NOT IN ('SUCCEEDED','FAILED','TIMEOUT')
       OR length(p_idempotency_key) NOT BETWEEN 16 AND 200 THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='INVALID_SIMULATED_PAYMENT_REQUEST';
    END IF;
    v_lock := v_actor || chr(31) || 'SIMULATED_PAYMENT' || chr(31) || p_idempotency_key;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock,0));
    SELECT * INTO v_existing FROM api_idempotency_request i
    WHERE i.principal_id=v_actor AND i.operation='SIMULATED_PAYMENT' AND i.idempotency_key=p_idempotency_key;
    IF FOUND THEN
        IF v_existing.request_hash <> p_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P1001', MESSAGE='IDEMPOTENCY_KEY_REUSED';
        END IF;
        payment_attempt_id := v_existing.result_payment_attempt_id; replayed := TRUE; RETURN NEXT; RETURN;
    END IF;
    SELECT d.* INTO v_donation FROM donation d
    WHERE d.donation_id=p_donation_id
      AND ((p_guest_token_hash IS NULL AND EXISTS
            (SELECT 1 FROM donor dn WHERE dn.donor_id=d.donor_id AND dn.actor_id=v_actor))
        OR (p_guest_token_hash IS NOT NULL AND EXISTS
            (SELECT 1 FROM donation_guest_access ga WHERE ga.donation_id=d.donation_id
             AND ga.token_sha256=p_guest_token_hash AND v_actor='guest:' || p_guest_token_hash)))
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1003', MESSAGE='DONATION_NOT_FOUND'; END IF;
    IF v_donation.payment_status <> 'PENDING' THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='DONATION_NOT_PAYABLE';
    END IF;
    IF EXISTS (SELECT 1 FROM payment_attempt a WHERE a.donation_id=p_donation_id AND a.attempt_status='UNKNOWN') THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='PAYMENT_OUTCOME_REQUIRES_RECONCILIATION';
    END IF;
    INSERT INTO payment_attempt(donation_id,provider,attempt_status,requested_outcome,actor_id)
    VALUES (p_donation_id,'SIMULATOR','PENDING',p_outcome,v_actor)
    RETURNING payment_attempt.payment_attempt_id INTO v_attempt;
    IF p_outcome='SUCCEEDED' THEN
        v_tx := 'SIM-' || nextval('payment_reference_sequence')::TEXT;
        v_receipt := 'DK-' || to_char(CURRENT_DATE,'YYYYMMDD') || '-' ||
            lpad(nextval('receipt_number_sequence')::TEXT,12,'0');
        UPDATE donation SET transaction_reference=v_tx,receipt_number=v_receipt
        WHERE donation.donation_id=p_donation_id;
        PERFORM clear_donation(p_donation_id);
        UPDATE payment_attempt SET attempt_status='SUCCEEDED',transaction_reference=v_tx,
            completed_at=CURRENT_TIMESTAMP WHERE payment_attempt.payment_attempt_id=v_attempt;
    ELSIF p_outcome='FAILED' THEN
        UPDATE payment_attempt SET attempt_status='FAILED',completed_at=CURRENT_TIMESTAMP,
            failure_reason='Simulated payment failure' WHERE payment_attempt.payment_attempt_id=v_attempt;
    ELSE
        UPDATE payment_attempt SET attempt_status='UNKNOWN',completed_at=CURRENT_TIMESTAMP,
            failure_reason='Simulated outcome timed out; reconciliation required'
        WHERE payment_attempt.payment_attempt_id=v_attempt;
    END IF;
    INSERT INTO api_idempotency_request(principal_id,operation,idempotency_key,request_hash,
        result_donation_id,result_payment_attempt_id)
    VALUES (v_actor,'SIMULATED_PAYMENT',p_idempotency_key,p_request_hash,p_donation_id,v_attempt);
    PERFORM write_audit('PAYMENT_ATTEMPT_' || p_outcome,'payment_attempt',v_attempt::TEXT,NULL,
        (SELECT to_jsonb(a) FROM payment_attempt a WHERE a.payment_attempt_id=v_attempt));
    payment_attempt_id:=v_attempt; replayed:=FALSE; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION reconcile_simulated_payment(p_payment_attempt_id BIGINT,p_outcome TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE a payment_attempt%ROWTYPE; d donation%ROWTYPE; v_tx TEXT; v_receipt TEXT;
BEGIN
    PERFORM require_platform_role('PAYMENT_RECONCILER');
    IF p_outcome NOT IN ('SUCCEEDED','FAILED') THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='INVALID_RECONCILIATION_OUTCOME';
    END IF;
    SELECT * INTO a FROM payment_attempt WHERE payment_attempt_id=p_payment_attempt_id FOR UPDATE;
    IF NOT FOUND OR a.attempt_status <> 'UNKNOWN' THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='PAYMENT_ATTEMPT_NOT_RECONCILABLE';
    END IF;
    SELECT * INTO d FROM donation WHERE donation_id=a.donation_id FOR UPDATE;
    IF d.payment_status <> 'PENDING' THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='DONATION_NOT_PAYABLE';
    END IF;
    IF p_outcome='SUCCEEDED' THEN
        v_tx := 'SIM-REC-' || nextval('payment_reference_sequence')::TEXT;
        v_receipt := 'DK-' || to_char(CURRENT_DATE,'YYYYMMDD') || '-' ||
            lpad(nextval('receipt_number_sequence')::TEXT,12,'0');
        UPDATE donation SET transaction_reference=v_tx,receipt_number=v_receipt WHERE donation_id=d.donation_id;
        PERFORM clear_donation(d.donation_id);
        UPDATE payment_attempt SET attempt_status='SUCCEEDED',transaction_reference=v_tx,
            reconciliation_reference='SIM-RECON-' || p_payment_attempt_id::TEXT,completed_at=CURRENT_TIMESTAMP,
            failure_reason=NULL WHERE payment_attempt_id=p_payment_attempt_id;
    ELSE
        UPDATE payment_attempt SET attempt_status='FAILED',
            reconciliation_reference='SIM-RECON-' || p_payment_attempt_id::TEXT,completed_at=CURRENT_TIMESTAMP,
            failure_reason='Reconciled as failed' WHERE payment_attempt_id=p_payment_attempt_id;
    END IF;
    PERFORM write_audit('PAYMENT_ATTEMPT_RECONCILED','payment_attempt',p_payment_attempt_id::TEXT,
        to_jsonb(a),(SELECT to_jsonb(x) FROM payment_attempt x WHERE x.payment_attempt_id=p_payment_attempt_id));
END;
$$;

CREATE OR REPLACE FUNCTION get_owned_donation(p_donation_id BIGINT,p_guest_token_hash CHAR(64) DEFAULT NULL)
RETURNS TABLE(
    donation_id BIGINT,campaign_id BIGINT,amount NUMERIC(14,2),currency CHAR(3),
    payment_status VARCHAR(20),created_at TIMESTAMPTZ,transaction_reference VARCHAR(160),
    receipt_number VARCHAR(80),payment_attempts JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor TEXT := require_actor();
BEGIN
    RETURN QUERY SELECT d.donation_id,d.campaign_id,d.donation_amount,d.currency,d.payment_status,d.donated_at,
        CASE WHEN d.payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED') THEN d.transaction_reference END,
        CASE WHEN d.payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED') THEN d.receipt_number END,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'payment_attempt_id',a.payment_attempt_id::TEXT,'status',a.attempt_status,
            'requested_outcome',a.requested_outcome,'started_at',a.started_at,'completed_at',a.completed_at
        ) ORDER BY a.started_at,a.payment_attempt_id) FROM payment_attempt a WHERE a.donation_id=d.donation_id),'[]'::JSONB)
    FROM donation d WHERE d.donation_id=p_donation_id AND (
        EXISTS (SELECT 1 FROM donor dn WHERE dn.donor_id=d.donor_id AND dn.actor_id=v_actor)
        OR (p_guest_token_hash IS NOT NULL AND EXISTS (SELECT 1 FROM donation_guest_access ga
            WHERE ga.donation_id=d.donation_id AND ga.token_sha256=p_guest_token_hash
              AND v_actor='guest:' || p_guest_token_hash))
    );
END;
$$;

CREATE OR REPLACE FUNCTION post_donation_refund(
    p_donation_id BIGINT, p_refund_amount NUMERIC(14,2), p_refund_reference TEXT, p_reason TEXT
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE d donation%ROWTYPE; a RECORD; scope_refundable NUMERIC(14,2); scope_available NUMERIC(14,2);
        remaining NUMERIC(14,2); reversal NUMERIC(14,2); v_refund BIGINT; v_scope BIGINT;
        v_actor TEXT; previous_setting TEXT;
BEGIN
    v_actor := require_actor();
    IF p_refund_amount IS NULL OR p_refund_amount <= 0 OR NULLIF(BTRIM(p_refund_reference), '') IS NULL THEN
        RAISE EXCEPTION 'Refund amount and reference must be valid';
    END IF;
    SELECT * INTO d FROM donation WHERE donation_id = p_donation_id FOR UPDATE;
    IF NOT FOUND OR d.payment_status NOT IN ('SUCCESSFUL','PARTIALLY_REFUNDED') THEN
        RAISE EXCEPTION 'Only cleared, not-fully-refunded donations can be refunded';
    END IF;
    IF d.refunded_amount + p_refund_amount > d.donation_amount THEN
        RAISE EXCEPTION 'Cumulative refunds cannot exceed the original donation amount';
    END IF;
    PERFORM 1 FROM campaign WHERE campaign_id = d.campaign_id FOR UPDATE;
    previous_setting := current_setting('app.refund_workflow', TRUE);
    PERFORM set_config('app.refund_workflow', 'on', TRUE);
    INSERT INTO donation_refund(donation_id, campaign_id, refund_reference, refund_amount, reason)
    VALUES (d.donation_id, d.campaign_id, p_refund_reference, p_refund_amount, p_reason)
    RETURNING refund_id INTO v_refund;
    remaining := p_refund_amount;

    -- Refunds follow original donation scopes in deterministic order (restriction
    -- IDs first, unrestricted last). A scope can be reversed only up to both its
    -- unrefunded original allocation and its currently unspent ledger balance.
    FOR a IN SELECT restriction_id FROM fund_ledger_entry
             WHERE donation_id = d.donation_id AND entry_type = 'DONATION_CLEARING'
             GROUP BY restriction_id ORDER BY restriction_id NULLS LAST LOOP
        EXIT WHEN remaining = 0;
        SELECT COALESCE(SUM(amount_delta), 0) INTO scope_refundable
        FROM fund_ledger_entry WHERE donation_id = d.donation_id
          AND restriction_id IS NOT DISTINCT FROM a.restriction_id
          AND entry_type IN ('DONATION_CLEARING','DONATION_REFUND');
        SELECT COALESCE(SUM(amount_delta), 0) INTO scope_available
        FROM fund_ledger_entry WHERE campaign_id = d.campaign_id
          AND restriction_id IS NOT DISTINCT FROM a.restriction_id;
        reversal := LEAST(remaining, scope_refundable, scope_available);
        IF reversal > 0 THEN
            INSERT INTO donation_refund_scope(refund_id, campaign_id, donation_id, restriction_id, amount)
            VALUES (v_refund, d.campaign_id, d.donation_id, a.restriction_id, reversal)
            RETURNING refund_scope_id INTO v_scope;
            INSERT INTO fund_ledger_entry(campaign_id, restriction_id, donation_id, refund_scope_id,
                entry_type, amount_delta, currency, external_reference, notes)
            VALUES (d.campaign_id, a.restriction_id, d.donation_id, v_scope, 'DONATION_REFUND',
                -reversal, 'INR', p_refund_reference, p_reason);
            remaining := remaining - reversal;
        END IF;
    END LOOP;
    IF remaining > 0 THEN
        RAISE EXCEPTION 'Refund cannot be funded from this donation''s unspent allocation scopes';
    END IF;

    UPDATE donation SET refunded_amount = refunded_amount + p_refund_amount,
        payment_status = CASE WHEN refunded_amount + p_refund_amount = donation_amount
                              THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END
    WHERE donation_id = d.donation_id;
    PERFORM set_config('app.refund_workflow', COALESCE(previous_setting, ''), TRUE);
    PERFORM write_audit('DONATION_REFUNDED', 'donation', d.donation_id::TEXT,
        to_jsonb(d), (SELECT to_jsonb(dn) FROM donation dn WHERE dn.donation_id = d.donation_id), p_reason);
    IF d.pledge_id IS NOT NULL THEN PERFORM refresh_pledge_status(d.pledge_id); END IF;
    RETURN v_refund;
END;
$$;

CREATE OR REPLACE FUNCTION post_donation_refund_idempotent(
    p_donation_id BIGINT,p_amount NUMERIC(14,2),p_reference TEXT,p_reason TEXT,
    p_idempotency_key TEXT,p_request_hash CHAR(64)
) RETURNS TABLE(refund_id BIGINT,replayed BOOLEAN) LANGUAGE plpgsql AS $$
DECLARE v_actor TEXT; v_existing api_idempotency_request%ROWTYPE; v_refund BIGINT; v_lock TEXT;
BEGIN
    v_actor := require_platform_role('REFUND_OPERATOR');
    v_lock := v_actor || chr(31) || 'DONATION_REFUND' || chr(31) || p_idempotency_key;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock,0));
    SELECT * INTO v_existing FROM api_idempotency_request i
    WHERE i.principal_id=v_actor AND i.operation='DONATION_REFUND' AND i.idempotency_key=p_idempotency_key;
    IF FOUND THEN
        IF v_existing.request_hash <> p_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P1001', MESSAGE='IDEMPOTENCY_KEY_REUSED';
        END IF;
        refund_id:=v_existing.result_refund_id; replayed:=TRUE; RETURN NEXT; RETURN;
    END IF;
    v_refund := post_donation_refund(p_donation_id,p_amount,p_reference,p_reason);
    INSERT INTO api_idempotency_request(principal_id,operation,idempotency_key,request_hash,
        result_donation_id,result_refund_id)
    VALUES (v_actor,'DONATION_REFUND',p_idempotency_key,p_request_hash,p_donation_id,v_refund);
    refund_id:=v_refund; replayed:=FALSE; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION guard_beneficiary_verification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.verification_status <> 'PENDING' THEN RAISE EXCEPTION 'Beneficiaries must be created pending verification'; END IF;
        RETURN NEW;
    END IF;
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        IF current_setting('app.beneficiary_workflow', TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Beneficiary verification must use its controlled workflow';
        END IF;
        NEW.verified_by := CASE WHEN NEW.verification_status = 'VERIFIED' THEN require_actor() ELSE NEW.verified_by END;
        NEW.verified_at := CASE WHEN NEW.verification_status = 'VERIFIED' THEN CURRENT_TIMESTAMP ELSE NULL END;
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION audit_beneficiary_verification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        PERFORM write_audit('BENEFICIARY_' || NEW.verification_status, 'beneficiary', NEW.beneficiary_id::TEXT,
            to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_beneficiary_verification_guard BEFORE INSERT OR UPDATE OF verification_status ON beneficiary
FOR EACH ROW EXECUTE FUNCTION guard_beneficiary_verification();
CREATE TRIGGER trg_beneficiary_verification_audit AFTER UPDATE OF verification_status ON beneficiary
FOR EACH ROW EXECUTE FUNCTION audit_beneficiary_verification();

CREATE OR REPLACE FUNCTION create_beneficiary(
    p_organization_id BIGINT, p_name TEXT, p_type TEXT, p_contact JSONB DEFAULT NULL
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_id BIGINT;
BEGIN
    PERFORM require_organization_role(p_organization_id,'BENEFICIARY_MANAGER');
    INSERT INTO beneficiary(organization_id,beneficiary_name,beneficiary_type,contact_details)
    VALUES (p_organization_id,p_name,p_type,p_contact) RETURNING beneficiary_id INTO v_id;
    PERFORM write_audit('BENEFICIARY_CREATED','beneficiary',v_id::TEXT,NULL,
        (SELECT to_jsonb(b) FROM beneficiary b WHERE b.beneficiary_id=v_id));
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION verify_beneficiary(p_beneficiary_id BIGINT, p_status TEXT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_previous TEXT; b beneficiary%ROWTYPE;
BEGIN
    PERFORM require_platform_role('BENEFICIARY_VERIFIER');
    IF p_status NOT IN ('VERIFIED','REJECTED','SUSPENDED','PENDING') THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='INVALID_BENEFICIARY_STATUS';
    END IF;
    SELECT * INTO b FROM beneficiary WHERE beneficiary_id=p_beneficiary_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P1003', MESSAGE='BENEFICIARY_NOT_FOUND'; END IF;
    v_previous := current_setting('app.beneficiary_workflow',TRUE);
    PERFORM set_config('app.beneficiary_workflow','on',TRUE);
    UPDATE beneficiary SET verification_status=p_status WHERE beneficiary_id=p_beneficiary_id;
    PERFORM set_config('app.beneficiary_workflow',COALESCE(v_previous,''),TRUE);
    PERFORM write_audit('BENEFICIARY_REVIEWED','beneficiary',p_beneficiary_id::TEXT,
        to_jsonb(b),(SELECT to_jsonb(x) FROM beneficiary x WHERE x.beneficiary_id=p_beneficiary_id),p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION audit_consent_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.actor_id := require_actor();
    INSERT INTO audit_log(actor_id, action_type, entity_type, entity_id, new_values)
    VALUES (NEW.actor_id, 'DONOR_CONSENT_' || NEW.consent_action, 'donor', NEW.donor_id::TEXT, to_jsonb(NEW));
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_consent_audit BEFORE INSERT ON donor_consent_event
FOR EACH ROW EXECUTE FUNCTION audit_consent_event();

CREATE OR REPLACE FUNCTION guard_disbursement_approval()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.approval_status <> 'PENDING' THEN RAISE EXCEPTION 'Disbursements must be created pending approval'; END IF;
        NEW.requested_by := COALESCE(NEW.requested_by,require_actor());
        RETURN NEW;
    END IF;
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        IF current_setting('app.disbursement_workflow',TRUE) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Disbursement approval must use its controlled workflow';
        END IF;
        IF OLD.approval_status <> 'PENDING' OR NEW.approval_status NOT IN ('APPROVED','REJECTED') THEN
            RAISE EXCEPTION 'Invalid disbursement approval transition';
        END IF;
        NEW.approved_by := require_actor();
        NEW.approved_at := CASE WHEN NEW.approval_status = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END;
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION audit_disbursement_approval()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        PERFORM write_audit('DISBURSEMENT_' || NEW.approval_status, 'disbursement', NEW.disbursement_id::TEXT,
            to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_disbursement_approval_guard BEFORE INSERT OR UPDATE OF approval_status ON disbursement
FOR EACH ROW EXECUTE FUNCTION guard_disbursement_approval();
CREATE TRIGGER trg_disbursement_approval_audit AFTER UPDATE OF approval_status ON disbursement
FOR EACH ROW EXECUTE FUNCTION audit_disbursement_approval();

CREATE OR REPLACE FUNCTION guard_disbursement_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE c campaign%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.disbursement_status = 'PAID' THEN RAISE EXCEPTION 'Disbursement must be paid through pay_disbursement'; END IF;
        RETURN NEW;
    END IF;
    IF NEW.disbursement_status = 'PAID' AND OLD.disbursement_status IS DISTINCT FROM 'PAID' THEN
        NEW.paid_by := require_actor();
        IF OLD.disbursement_status NOT IN ('PENDING','PROCESSING') OR NEW.approval_status <> 'APPROVED'
           OR NEW.approved_at IS NULL OR NEW.paid_at IS NULL
           OR NULLIF(BTRIM(NEW.payment_reference), '') IS NULL THEN
            RAISE EXCEPTION 'Disbursement must be approved with a nonblank payment reference before payment';
        END IF;
        SELECT * INTO c FROM campaign WHERE campaign_id = NEW.campaign_id FOR UPDATE;
        IF NOT EXISTS (SELECT 1 FROM beneficiary WHERE beneficiary_id = NEW.beneficiary_id
                       AND organization_id = c.organization_id
                       AND verification_status = 'VERIFIED' AND verified_at IS NOT NULL) THEN
            RAISE EXCEPTION 'Beneficiary must be verified and belong to the campaign organization';
        END IF;
        IF NEW.requested_by IS NOT NULL AND NEW.paid_by = NEW.requested_by THEN
            RAISE EXCEPTION 'Disbursement requester cannot execute the payout';
        END IF;
        IF NEW.approved_by = NEW.paid_by THEN
            RAISE EXCEPTION 'Disbursement approver cannot execute the payout';
        END IF;
        IF NEW.restriction_id IS NULL THEN
            IF NEW.purpose_code <> c.purpose_code THEN RAISE EXCEPTION 'Purpose code must match campaign purpose'; END IF;
        ELSIF NOT EXISTS (SELECT 1 FROM fund_restriction fr WHERE fr.campaign_id = NEW.campaign_id
                          AND fr.restriction_id = NEW.restriction_id
                          AND fr.allowed_purpose_code = NEW.purpose_code) THEN
            RAISE EXCEPTION 'Purpose code is not allowed by this restriction';
        END IF;
        IF NEW.disbursement_amount > (SELECT COALESCE(SUM(amount_delta), 0) FROM fund_ledger_entry
            WHERE campaign_id = NEW.campaign_id AND restriction_id IS NOT DISTINCT FROM NEW.restriction_id) THEN
            RAISE EXCEPTION 'Insufficient cleared available funds';
        END IF;
    END IF;
    IF NEW.disbursement_status IS DISTINCT FROM OLD.disbursement_status
       AND NOT ((OLD.disbursement_status = 'PENDING' AND NEW.disbursement_status IN ('PROCESSING','PAID','FAILED','CANCELLED'))
            OR (OLD.disbursement_status = 'PROCESSING' AND NEW.disbursement_status IN ('PAID','FAILED'))) THEN
        RAISE EXCEPTION 'Invalid disbursement payment-state transition';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION record_disbursement_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.disbursement_status = 'PAID' AND OLD.disbursement_status IS DISTINCT FROM 'PAID' THEN
        INSERT INTO fund_ledger_entry(campaign_id, restriction_id, disbursement_id, entry_type,
            amount_delta, currency, external_reference, notes)
        VALUES (NEW.campaign_id, NEW.restriction_id, NEW.disbursement_id, 'DISBURSEMENT',
            -NEW.disbursement_amount, 'INR', NEW.payment_reference, 'Funds disbursed to verified beneficiary');
        PERFORM write_audit('DISBURSEMENT_PAID', 'disbursement', NEW.disbursement_id::TEXT,
            to_jsonb(OLD), to_jsonb(NEW));
    ELSIF NEW.disbursement_status IS DISTINCT FROM OLD.disbursement_status THEN
        PERFORM write_audit('DISBURSEMENT_' || NEW.disbursement_status, 'disbursement', NEW.disbursement_id::TEXT,
            to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_disbursement_payment_guard BEFORE INSERT OR UPDATE OF disbursement_status ON disbursement
FOR EACH ROW EXECUTE FUNCTION guard_disbursement_payment();
CREATE TRIGGER trg_disbursement_payment_ledger AFTER UPDATE OF disbursement_status ON disbursement
FOR EACH ROW EXECUTE FUNCTION record_disbursement_payment();

CREATE OR REPLACE FUNCTION guard_disbursement_terms()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.approval_status IN ('APPROVED','REJECTED') OR OLD.disbursement_status <> 'PENDING' THEN
        IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id
           OR NEW.restriction_id IS DISTINCT FROM OLD.restriction_id
           OR NEW.disbursement_amount IS DISTINCT FROM OLD.disbursement_amount
           OR NEW.approved_purpose IS DISTINCT FROM OLD.approved_purpose
           OR NEW.purpose_code IS DISTINCT FROM OLD.purpose_code
           OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
            RAISE EXCEPTION 'Disbursement terms are immutable after approval or processing begins';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_disbursement_terms_guard BEFORE UPDATE ON disbursement
FOR EACH ROW EXECUTE FUNCTION guard_disbursement_terms();

CREATE OR REPLACE FUNCTION pay_disbursement(p_disbursement_id BIGINT, p_payment_reference TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM require_platform_role('PAYOUT_OPERATOR');
    IF NULLIF(BTRIM(p_payment_reference), '') IS NULL THEN RAISE EXCEPTION 'Payment reference is required'; END IF;
    UPDATE disbursement SET disbursement_status = 'PAID', payment_reference = p_payment_reference,
        paid_at = CURRENT_TIMESTAMP
    WHERE disbursement_id = p_disbursement_id AND disbursement_status IN ('PENDING','PROCESSING');
    IF NOT FOUND THEN RAISE EXCEPTION 'Disbursement % is missing or not payable', p_disbursement_id; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pay_disbursement_idempotent(
    p_disbursement_id BIGINT,p_payment_reference TEXT,p_idempotency_key TEXT,p_request_hash CHAR(64)
) RETURNS TABLE(disbursement_id BIGINT,replayed BOOLEAN) LANGUAGE plpgsql AS $$
DECLARE v_actor TEXT; v_existing api_idempotency_request%ROWTYPE; v_lock TEXT;
BEGIN
    v_actor := require_platform_role('PAYOUT_OPERATOR');
    v_lock := v_actor || chr(31) || 'DISBURSEMENT_PAYMENT' || chr(31) || p_idempotency_key;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock,0));
    SELECT * INTO v_existing FROM api_idempotency_request i
    WHERE i.principal_id=v_actor AND i.operation='DISBURSEMENT_PAYMENT'
      AND i.idempotency_key=p_idempotency_key;
    IF FOUND THEN
        IF v_existing.request_hash <> p_request_hash THEN
            RAISE EXCEPTION USING ERRCODE='P1001', MESSAGE='IDEMPOTENCY_KEY_REUSED';
        END IF;
        disbursement_id:=v_existing.result_disbursement_id; replayed:=TRUE; RETURN NEXT; RETURN;
    END IF;
    PERFORM pay_disbursement(p_disbursement_id,p_payment_reference);
    INSERT INTO api_idempotency_request(principal_id,operation,idempotency_key,request_hash,
        result_disbursement_id)
    VALUES (v_actor,'DISBURSEMENT_PAYMENT',p_idempotency_key,p_request_hash,p_disbursement_id);
    disbursement_id:=p_disbursement_id; replayed:=FALSE; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION request_disbursement(
    p_campaign_id BIGINT,p_beneficiary_id BIGINT,p_restriction_id BIGINT,
    p_amount NUMERIC(14,2),p_approved_purpose TEXT,p_purpose_code TEXT
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE c campaign%ROWTYPE; b beneficiary%ROWTYPE; v_id BIGINT;
BEGIN
    SELECT * INTO c FROM campaign WHERE campaign_id=p_campaign_id FOR UPDATE;
    IF NOT FOUND OR c.approval_status <> 'APPROVED' THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='CAMPAIGN_NOT_DISBURSABLE';
    END IF;
    PERFORM require_organization_role(c.organization_id,'DISBURSEMENT_REQUESTER');
    SELECT * INTO b FROM beneficiary WHERE beneficiary_id=p_beneficiary_id FOR UPDATE;
    IF NOT FOUND OR b.organization_id IS NULL OR b.organization_id <> c.organization_id THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='BENEFICIARY_ORGANIZATION_MISMATCH';
    END IF;
    IF p_restriction_id IS NULL THEN
        IF p_purpose_code <> c.purpose_code THEN
            RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='DISBURSEMENT_PURPOSE_MISMATCH';
        END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM fund_restriction r WHERE r.restriction_id=p_restriction_id
                      AND r.campaign_id=p_campaign_id AND r.allowed_purpose_code=p_purpose_code) THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='DISBURSEMENT_PURPOSE_MISMATCH';
    END IF;
    INSERT INTO disbursement(campaign_id,beneficiary_id,restriction_id,disbursement_amount,
        approved_purpose,purpose_code)
    VALUES (p_campaign_id,p_beneficiary_id,p_restriction_id,p_amount,p_approved_purpose,p_purpose_code)
    RETURNING disbursement_id INTO v_id;
    PERFORM write_audit('DISBURSEMENT_REQUESTED','disbursement',v_id::TEXT,NULL,
        (SELECT to_jsonb(d) FROM disbursement d WHERE d.disbursement_id=v_id));
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION approve_disbursement(p_disbursement_id BIGINT,p_decision TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_actor TEXT; v_previous TEXT; d disbursement%ROWTYPE;
BEGIN
    v_actor := require_platform_role('PAYOUT_APPROVER');
    SELECT * INTO d FROM disbursement WHERE disbursement_id=p_disbursement_id FOR UPDATE;
    IF NOT FOUND OR d.approval_status <> 'PENDING' OR d.disbursement_status <> 'PENDING' THEN
        RAISE EXCEPTION USING ERRCODE='P1004', MESSAGE='DISBURSEMENT_NOT_APPROVABLE';
    END IF;
    IF d.requested_by = v_actor OR d.paid_by = v_actor THEN
        RAISE EXCEPTION USING ERRCODE='P1002', MESSAGE='SEPARATION_OF_DUTIES_REQUIRED';
    END IF;
    IF p_decision NOT IN ('APPROVED','REJECTED') THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='INVALID_DISBURSEMENT_DECISION';
    END IF;
    v_previous := current_setting('app.disbursement_workflow',TRUE);
    PERFORM set_config('app.disbursement_workflow','on',TRUE);
    UPDATE disbursement SET approval_status=p_decision WHERE disbursement_id=p_disbursement_id;
    PERFORM set_config('app.disbursement_workflow',COALESCE(v_previous,''),TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION reject_history_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% rows are append-only; write a compensating event', TG_TABLE_NAME; END;
$$;
CREATE TRIGGER trg_donation_no_delete BEFORE DELETE ON donation
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER trg_ledger_no_update_delete BEFORE UPDATE OR DELETE ON fund_ledger_entry
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER trg_audit_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER trg_refund_no_update_delete BEFORE UPDATE OR DELETE ON donation_refund
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER trg_refund_scope_no_update_delete BEFORE UPDATE OR DELETE ON donation_refund_scope
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER trg_consent_no_update_delete BEFORE UPDATE OR DELETE ON donor_consent_event
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE OR REPLACE FUNCTION guard_refund_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF current_setting('app.refund_workflow', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Create refunds through post_donation_refund';
    END IF;
    PERFORM require_actor();
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_refund_insert_guard BEFORE INSERT ON donation_refund
FOR EACH ROW EXECUTE FUNCTION guard_refund_insert();
CREATE TRIGGER trg_refund_scope_insert_guard BEFORE INSERT ON donation_refund_scope
FOR EACH ROW EXECUTE FUNCTION guard_refund_insert();

CREATE OR REPLACE FUNCTION stamp_audit_actor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.actor_id := require_actor();
    NEW.occurred_at := COALESCE(NEW.occurred_at, CURRENT_TIMESTAMP);
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_audit_actor BEFORE INSERT ON audit_log
FOR EACH ROW EXECUTE FUNCTION stamp_audit_actor();

CREATE OR REPLACE FUNCTION validate_ledger_source()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE d donation%ROWTYPE; x disbursement%ROWTYPE; r donation_refund%ROWTYPE;
        s donation_refund_scope%ROWTYPE; expected_amount NUMERIC(14,2);
BEGIN
    PERFORM require_actor();
    IF NEW.currency <> 'INR' THEN RAISE EXCEPTION 'Only INR ledger entries are supported'; END IF;
    IF NEW.entry_type = 'DONATION_CLEARING' THEN
        SELECT * INTO d FROM donation WHERE donation_id = NEW.donation_id;
        IF d.payment_status NOT IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED') OR d.cleared_at IS NULL
           OR d.campaign_id <> NEW.campaign_id THEN
            RAISE EXCEPTION 'Clearing entry must reference a cleared donation in the same campaign';
        END IF;
        IF NEW.external_reference IS DISTINCT FROM COALESCE(d.transaction_reference, 'DONATION:' || d.donation_id::TEXT) THEN
            RAISE EXCEPTION 'Clearing entry reference must identify its source donation';
        END IF;
        IF NEW.restriction_id IS NULL THEN
            SELECT d.donation_amount - COALESCE(SUM(dr.restricted_amount),0) INTO expected_amount
            FROM donation_restriction dr WHERE dr.donation_id=d.donation_id;
        ELSE
            SELECT restricted_amount INTO expected_amount FROM donation_restriction
            WHERE donation_id=d.donation_id AND restriction_id=NEW.restriction_id;
        END IF;
        IF NEW.amount_delta IS DISTINCT FROM expected_amount THEN
            RAISE EXCEPTION 'Clearing amount must match the donation allocation for this scope';
        END IF;
    ELSIF NEW.entry_type = 'DONATION_REFUND' THEN
        SELECT * INTO s FROM donation_refund_scope WHERE refund_scope_id=NEW.refund_scope_id;
        SELECT * INTO r FROM donation_refund WHERE refund_id=s.refund_id;
        IF s.donation_id <> NEW.donation_id OR s.campaign_id <> NEW.campaign_id
           OR s.restriction_id IS DISTINCT FROM NEW.restriction_id
           OR NEW.amount_delta <> -s.amount OR NEW.external_reference <> r.refund_reference THEN
            RAISE EXCEPTION 'Refund ledger entry must match its recorded refund allocation';
        END IF;
    ELSIF NEW.entry_type = 'DISBURSEMENT' THEN
        SELECT * INTO x FROM disbursement WHERE disbursement_id=NEW.disbursement_id;
        IF x.disbursement_status <> 'PAID' OR x.campaign_id <> NEW.campaign_id
           OR x.restriction_id IS DISTINCT FROM NEW.restriction_id
           OR NEW.amount_delta <> -x.disbursement_amount
           OR NEW.external_reference IS DISTINCT FROM x.payment_reference THEN
            RAISE EXCEPTION 'Disbursement ledger entry must match its paid source';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_ledger_source_guard BEFORE INSERT ON fund_ledger_entry
FOR EACH ROW EXECUTE FUNCTION validate_ledger_source();

CREATE OR REPLACE FUNCTION guard_payment_attempt_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment attempt history is append-only'; END IF;
    IF NEW.donation_id IS DISTINCT FROM OLD.donation_id
       OR NEW.provider IS DISTINCT FROM OLD.provider
       OR NEW.requested_outcome IS DISTINCT FROM OLD.requested_outcome
       OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
       OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
        RAISE EXCEPTION 'Payment attempt source fields are immutable';
    END IF;
    IF OLD.attempt_status NOT IN ('PENDING','UNKNOWN')
       OR NEW.attempt_status NOT IN ('SUCCEEDED','FAILED','UNKNOWN')
       OR (OLD.attempt_status='UNKNOWN' AND NEW.attempt_status='UNKNOWN') THEN
        RAISE EXCEPTION 'Invalid payment attempt transition';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_payment_attempt_guard BEFORE UPDATE OR DELETE ON payment_attempt
FOR EACH ROW EXECUTE FUNCTION guard_payment_attempt_mutation();

CREATE OR REPLACE FUNCTION reject_idempotency_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Idempotency results are immutable'; END;
$$;
CREATE TRIGGER trg_idempotency_no_update_delete BEFORE UPDATE OR DELETE ON api_idempotency_request
FOR EACH ROW EXECUTE FUNCTION reject_idempotency_mutation();
CREATE TRIGGER trg_guest_access_no_update_delete BEFORE UPDATE OR DELETE ON donation_guest_access
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

-- Authenticated read projections for the frontend. Each function derives the
-- actor from the verified request-local context and returns only its permitted
-- tenant or donor records. Runtime callers receive EXECUTE only, never base-table
-- SELECT. Pagination is bounded in SQL as well as at the API boundary.
CREATE OR REPLACE FUNCTION assert_read_page(p_limit INTEGER, p_offset INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
       OR p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000 THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='INVALID_PAGE_BOUNDS';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_actor_organizations()
RETURNS TABLE(organization_id BIGINT, organization_name VARCHAR(160), roles TEXT[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor TEXT := require_actor();
BEGIN
    RETURN QUERY
    SELECT o.organization_id, o.organization_name,
           array_agg(m.membership_role::TEXT ORDER BY m.membership_role)
    FROM organization AS o
    JOIN organization_membership AS m ON m.organization_id=o.organization_id
    WHERE m.actor_id=v_actor AND m.is_active
    GROUP BY o.organization_id, o.organization_name
    ORDER BY o.organization_name, o.organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_organization_dashboard(p_organization_id BIGINT)
RETURNS TABLE(campaign_count BIGINT, draft_campaign_count BIGINT,
    submitted_campaign_count BIGINT, active_campaign_count BIGINT,
    rejected_campaign_count BIGINT, beneficiary_count BIGINT,
    pending_beneficiary_count BIGINT, pending_disbursement_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor TEXT := require_actor();
BEGIN
    IF NOT EXISTS (SELECT 1 FROM organization_membership AS m
                   WHERE m.organization_id=p_organization_id AND m.actor_id=v_actor
                     AND m.is_active) THEN
        RAISE EXCEPTION USING ERRCODE='P1002', MESSAGE='ORGANIZATION_ACCESS_DENIED';
    END IF;
    RETURN QUERY SELECT
        (SELECT count(*) FROM campaign c WHERE c.organization_id=p_organization_id),
        (SELECT count(*) FROM campaign c WHERE c.organization_id=p_organization_id
             AND c.campaign_status='DRAFT'),
        (SELECT count(*) FROM campaign c WHERE c.organization_id=p_organization_id
             AND c.submitted_at IS NOT NULL AND c.approval_status='PENDING'),
        (SELECT count(*) FROM campaign c WHERE c.organization_id=p_organization_id
             AND c.campaign_status='ACTIVE'),
        (SELECT count(*) FROM campaign c WHERE c.organization_id=p_organization_id
             AND c.approval_status='REJECTED'),
        (SELECT count(*) FROM beneficiary b WHERE b.organization_id=p_organization_id),
        (SELECT count(*) FROM beneficiary b WHERE b.organization_id=p_organization_id
             AND b.verification_status='PENDING'),
        (SELECT count(*) FROM disbursement d JOIN campaign c USING(campaign_id)
             WHERE c.organization_id=p_organization_id AND d.approval_status='PENDING');
END;
$$;

CREATE OR REPLACE FUNCTION get_organization_campaigns(
    p_organization_id BIGINT, p_limit INTEGER, p_offset INTEGER)
RETURNS TABLE(campaign_id BIGINT, campaign_name VARCHAR(180), purpose TEXT,
    purpose_code VARCHAR(40), target_amount NUMERIC(14,2), amount_raised NUMERIC,
    currency CHAR(3), start_date DATE, end_date DATE, approval_status VARCHAR(20),
    campaign_status VARCHAR(20), submitted_at TIMESTAMPTZ, review_reason TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    PERFORM assert_read_page(p_limit,p_offset);
    PERFORM require_organization_role(p_organization_id,'CAMPAIGN_EDITOR');
    RETURN QUERY SELECT c.campaign_id,c.campaign_name,c.purpose,c.purpose_code,
        c.target_amount,campaign_amount_raised(c.campaign_id),'INR'::CHAR(3),
        c.start_date,c.end_date,c.approval_status,c.campaign_status,c.submitted_at,c.review_reason
    FROM campaign c WHERE c.organization_id=p_organization_id
    ORDER BY c.created_at DESC,c.campaign_id DESC
    LIMIT p_limit+1 OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION get_organization_campaign(
    p_organization_id BIGINT,p_campaign_id BIGINT)
RETURNS TABLE(campaign_id BIGINT, campaign_name VARCHAR(180), purpose TEXT,
    purpose_code VARCHAR(40), target_amount NUMERIC(14,2), amount_raised NUMERIC,
    currency CHAR(3), start_date DATE, end_date DATE, approval_status VARCHAR(20),
    campaign_status VARCHAR(20), submitted_at TIMESTAMPTZ, review_reason TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    PERFORM require_organization_role(p_organization_id,'CAMPAIGN_EDITOR');
    RETURN QUERY SELECT c.campaign_id,c.campaign_name,c.purpose,c.purpose_code,
        c.target_amount,campaign_amount_raised(c.campaign_id),'INR'::CHAR(3),
        c.start_date,c.end_date,c.approval_status,c.campaign_status,c.submitted_at,c.review_reason
    FROM campaign c WHERE c.organization_id=p_organization_id AND c.campaign_id=p_campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_campaign_review_queue(p_limit INTEGER,p_offset INTEGER)
RETURNS TABLE(campaign_id BIGINT, campaign_name VARCHAR(180), purpose TEXT,
    purpose_code VARCHAR(40), target_amount NUMERIC(14,2), amount_raised NUMERIC,
    currency CHAR(3), start_date DATE, end_date DATE, approval_status VARCHAR(20),
    campaign_status VARCHAR(20), submitted_at TIMESTAMPTZ, review_reason TEXT,
    organization_id BIGINT, organization_name VARCHAR(160))
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    PERFORM assert_read_page(p_limit,p_offset);
    PERFORM require_platform_role('CAMPAIGN_REVIEWER');
    RETURN QUERY SELECT c.campaign_id,c.campaign_name,c.purpose,c.purpose_code,
        c.target_amount,campaign_amount_raised(c.campaign_id),'INR'::CHAR(3),
        c.start_date,c.end_date,c.approval_status,c.campaign_status,c.submitted_at,
        c.review_reason,c.organization_id,o.organization_name
    FROM campaign c JOIN organization o USING(organization_id)
    WHERE c.submitted_at IS NOT NULL AND c.approval_status='PENDING'
      AND c.campaign_status='DRAFT'
    ORDER BY c.submitted_at,c.campaign_id
    LIMIT p_limit+1 OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION get_organization_beneficiaries(
    p_organization_id BIGINT,p_limit INTEGER,p_offset INTEGER)
RETURNS TABLE(beneficiary_id BIGINT,beneficiary_name VARCHAR(180),
    beneficiary_type VARCHAR(20),verification_status VARCHAR(20),created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    PERFORM assert_read_page(p_limit,p_offset);
    PERFORM require_organization_role(p_organization_id,'BENEFICIARY_MANAGER');
    RETURN QUERY SELECT b.beneficiary_id,b.beneficiary_name,b.beneficiary_type,
        b.verification_status,b.created_at
    FROM beneficiary b WHERE b.organization_id=p_organization_id
    ORDER BY b.created_at DESC,b.beneficiary_id DESC
    LIMIT p_limit+1 OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION get_registered_donation_history(p_limit INTEGER,p_offset INTEGER)
RETURNS TABLE(donation_id BIGINT,campaign_id BIGINT,campaign_name VARCHAR(180),
    amount NUMERIC(14,2),currency CHAR(3),payment_status VARCHAR(20),created_at TIMESTAMPTZ,
    transaction_reference VARCHAR(160),receipt_number VARCHAR(80),payment_attempts JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor TEXT := require_actor();
BEGIN
    PERFORM assert_read_page(p_limit,p_offset);
    RETURN QUERY SELECT d.donation_id,d.campaign_id,c.campaign_name,d.donation_amount,d.currency,
        d.payment_status,d.donated_at,
        CASE WHEN d.payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED')
             THEN d.transaction_reference END,
        CASE WHEN d.payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED')
             THEN d.receipt_number END,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'payment_attempt_id',a.payment_attempt_id::TEXT,'status',a.attempt_status,
            'requested_outcome',a.requested_outcome,'started_at',a.started_at,
            'completed_at',a.completed_at) ORDER BY a.started_at,a.payment_attempt_id)
            FROM payment_attempt a WHERE a.donation_id=d.donation_id),'[]'::JSONB)
    FROM donor dn JOIN donation d ON d.donor_id=dn.donor_id
    JOIN campaign c ON c.campaign_id=d.campaign_id
    WHERE dn.actor_id=v_actor
    ORDER BY d.donated_at DESC,d.donation_id DESC
    LIMIT p_limit+1 OFFSET p_offset;
END;
$$;

-- API entry points are SECURITY DEFINER functions owned by the separate,
-- non-login charity_portal_owner role after runtime-roles.sql is applied.
ALTER FUNCTION create_campaign_draft(BIGINT,TEXT,TEXT,TEXT,NUMERIC,DATE,DATE)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION update_campaign_draft(BIGINT,TEXT,TEXT,TEXT,NUMERIC,DATE,DATE)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION submit_campaign(BIGINT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION review_campaign(BIGINT,TEXT,TEXT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION activate_campaign(BIGINT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION change_campaign_status(BIGINT,TEXT,TEXT)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION create_donation_idempotent(BIGINT,TEXT,TEXT,TEXT,NUMERIC,TEXT,CHAR(64),CHAR(64))
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION simulate_donation_payment_idempotent(BIGINT,TEXT,CHAR(64),TEXT,CHAR(64))
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION reconcile_simulated_payment(BIGINT,TEXT)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION create_beneficiary(BIGINT,TEXT,TEXT,JSONB)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION verify_beneficiary(BIGINT,TEXT,TEXT)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION request_disbursement(BIGINT,BIGINT,BIGINT,NUMERIC,TEXT,TEXT)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION approve_disbursement(BIGINT,TEXT)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION pay_disbursement(BIGINT,TEXT)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION pay_disbursement_idempotent(BIGINT,TEXT,TEXT,CHAR(64))
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION post_donation_refund_idempotent(BIGINT,NUMERIC,TEXT,TEXT,TEXT,CHAR(64))
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_owned_donation(BIGINT,CHAR(64))
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_actor_organizations() SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_organization_dashboard(BIGINT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_organization_campaigns(BIGINT,INTEGER,INTEGER)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_organization_campaign(BIGINT,BIGINT)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_campaign_review_queue(INTEGER,INTEGER)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_organization_beneficiaries(BIGINT,INTEGER,INTEGER)
    SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_registered_donation_history(INTEGER,INTEGER)
    SECURITY DEFINER SET search_path=pg_catalog,public;

COMMIT;
