-- Transactional workflow helpers for PostgreSQL 15+
-- Run after database/schema.sql.
-- Review with your instructor and test in a disposable database before demo.

BEGIN;

-- Block pledge/donation creation unless the campaign is approved, active, and within dates.
CREATE OR REPLACE FUNCTION assert_campaign_accepts_funds(p_campaign_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    c campaign%ROWTYPE;
BEGIN
    SELECT * INTO c
    FROM campaign
    WHERE campaign_id = p_campaign_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign % does not exist', p_campaign_id;
    END IF;

    IF c.approval_status <> 'APPROVED'
       OR c.campaign_status <> 'ACTIVE'
       OR CURRENT_DATE < c.start_date
       OR CURRENT_DATE > c.end_date THEN
        RAISE EXCEPTION 'Campaign % is not approved, active, and within its campaign dates', p_campaign_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION guard_pledge_campaign()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM assert_campaign_accepts_funds(NEW.campaign_id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pledge_campaign_guard
BEFORE INSERT OR UPDATE OF campaign_id ON pledge
FOR EACH ROW EXECUTE FUNCTION guard_pledge_campaign();

CREATE OR REPLACE FUNCTION guard_donation_campaign()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM assert_campaign_accepts_funds(NEW.campaign_id);
    IF NEW.pledge_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pledge p
        WHERE p.pledge_id = NEW.pledge_id
          AND p.campaign_id = NEW.campaign_id
          AND p.donor_id = NEW.donor_id
    ) THEN
        RAISE EXCEPTION 'Linked pledge must belong to the same donor and campaign';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_donation_campaign_guard
BEFORE INSERT OR UPDATE OF campaign_id, donor_id, pledge_id ON donation
FOR EACH ROW EXECUTE FUNCTION guard_donation_campaign();

-- Ledger is append-only for application roles. Owners/superusers can bypass ordinary triggers;
-- production permissioning must revoke UPDATE/DELETE from the application role as well.
CREATE OR REPLACE FUNCTION reject_ledger_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Fund ledger entries are append-only; write a compensating entry instead';
END;
$$;

CREATE TRIGGER trg_ledger_no_update_delete
BEFORE UPDATE OR DELETE ON fund_ledger_entry
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE OR REPLACE FUNCTION reject_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are append-only';
END;
$$;

CREATE TRIGGER trg_audit_no_update_delete
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

-- Record a cleared donation and create its corresponding fund ledger inflow(s).
-- If restrictions are assigned, the allocated portions are tracked per restriction
-- and any remainder is unrestriced. The caller should invoke this in the same
-- transaction as payment-state transition to SUCCESSFUL and cleared_at assignment.
CREATE OR REPLACE FUNCTION post_donation_clearing(p_donation_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    d donation%ROWTYPE;
    allocated NUMERIC(14,2);
    a RECORD;
BEGIN
    SELECT * INTO d FROM donation WHERE donation_id = p_donation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Donation % not found', p_donation_id; END IF;

    IF d.payment_status <> 'SUCCESSFUL' OR d.cleared_at IS NULL THEN
        RAISE EXCEPTION 'Donation % must be successful and cleared before posting', p_donation_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM fund_ledger_entry
        WHERE donation_id = p_donation_id AND entry_type = 'DONATION_CLEARING'
    ) THEN
        RAISE EXCEPTION 'Donation % has already been posted to the ledger', p_donation_id;
    END IF;

    SELECT COALESCE(SUM(restricted_amount), 0) INTO allocated
    FROM donation_restriction WHERE donation_id = p_donation_id;

    IF allocated > d.donation_amount THEN
        RAISE EXCEPTION 'Restriction allocation exceeds donation amount';
    END IF;

    FOR a IN
        SELECT dr.restriction_id, dr.restricted_amount
        FROM donation_restriction dr
        WHERE dr.donation_id = p_donation_id
    LOOP
        INSERT INTO fund_ledger_entry(
            campaign_id, restriction_id, donation_id, entry_type,
            amount_delta, currency, external_reference, notes
        ) VALUES (
            d.campaign_id, a.restriction_id, d.donation_id, 'DONATION_CLEARING',
            a.restricted_amount, d.currency, d.transaction_reference,
            'Cleared donation allocated to fund restriction'
        );
    END LOOP;

    IF d.donation_amount > allocated THEN
        INSERT INTO fund_ledger_entry(
            campaign_id, restriction_id, donation_id, entry_type,
            amount_delta, currency, external_reference, notes
        ) VALUES (
            d.campaign_id, NULL, d.donation_id, 'DONATION_CLEARING',
            d.donation_amount - allocated, d.currency, d.transaction_reference,
            'Cleared unrestricted remainder'
        );
    END IF;
END;
$$;

-- Record a full or partial refund as a negative ledger event without deleting the donation.
-- Caller should update donation payment/refund fields and call this in a single transaction.
CREATE OR REPLACE FUNCTION post_donation_refund(p_donation_id BIGINT, p_refund_amount NUMERIC(14,2), p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    d donation%ROWTYPE;
    already_refunded NUMERIC(14,2);
    remaining NUMERIC(14,2);
    balance_row RECORD;
    to_reverse NUMERIC(14,2);
BEGIN
    IF p_refund_amount IS NULL OR p_refund_amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be positive';
    END IF;

    SELECT * INTO d FROM donation WHERE donation_id = p_donation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Donation % not found', p_donation_id; END IF;

    SELECT COALESCE(SUM(-amount_delta), 0) INTO already_refunded
    FROM fund_ledger_entry
    WHERE donation_id = p_donation_id AND entry_type IN ('DONATION_REFUND','DONATION_REVERSAL');

    IF p_refund_amount + already_refunded > d.donation_amount THEN
        RAISE EXCEPTION 'Cumulative refunds cannot exceed the original donation amount';
    END IF;

    remaining := p_refund_amount;

    -- Reverse this donation's own allocations first. Do not permit a refund that
    -- would make its campaign/restriction balance negative.
    FOR balance_row IN
        SELECT restriction_id, SUM(amount_delta) AS donation_net
        FROM fund_ledger_entry
        WHERE donation_id = p_donation_id AND entry_type = 'DONATION_CLEARING'
        GROUP BY restriction_id
        ORDER BY restriction_id NULLS FIRST
    LOOP
        EXIT WHEN remaining <= 0;
        to_reverse := LEAST(remaining, balance_row.donation_net);
        IF to_reverse > 0 THEN
            PERFORM 1 FROM campaign WHERE campaign_id = d.campaign_id FOR UPDATE;
            IF (SELECT COALESCE(SUM(amount_delta), 0)
                FROM fund_ledger_entry
                WHERE campaign_id = d.campaign_id
                  AND restriction_id IS NOT DISTINCT FROM balance_row.restriction_id) < to_reverse THEN
                RAISE EXCEPTION 'Refund would make available campaign/restriction balance negative';
            END IF;

            INSERT INTO fund_ledger_entry(
                campaign_id, restriction_id, donation_id, entry_type, amount_delta,
                currency, external_reference, notes
            ) VALUES (
                d.campaign_id, balance_row.restriction_id, d.donation_id,
                'DONATION_REFUND', -to_reverse, d.currency, d.transaction_reference, p_reason
            );
            remaining := remaining - to_reverse;
        END IF;
    END LOOP;

    IF remaining > 0 THEN
        RAISE EXCEPTION 'Could not map refund amount to posted clearing entries';
    END IF;
END;
$$;

-- Approve and pay only for a verified beneficiary and matching approved restriction.
-- The campaign row is locked to serialize payout checks for the same campaign.
-- A negative ledger delta is inserted atomically with the PAID status.
CREATE OR REPLACE FUNCTION pay_disbursement(p_disbursement_id BIGINT, p_payment_reference TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    x disbursement%ROWTYPE;
    available NUMERIC(14,2);
BEGIN
    SELECT * INTO x FROM disbursement WHERE disbursement_id = p_disbursement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Disbursement % not found', p_disbursement_id; END IF;

    PERFORM 1 FROM campaign WHERE campaign_id = x.campaign_id FOR UPDATE;

    IF NOT EXISTS (
        SELECT 1 FROM beneficiary
        WHERE beneficiary_id = x.beneficiary_id
          AND verification_status = 'VERIFIED'
          AND verified_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Beneficiary must be verified before payment';
    END IF;

    IF x.approval_status <> 'APPROVED' OR x.approved_at IS NULL THEN
        RAISE EXCEPTION 'Disbursement must be approved before payment';
    END IF;

    IF x.disbursement_status NOT IN ('PENDING','PROCESSING') THEN
        RAISE EXCEPTION 'Disbursement status % cannot be paid', x.disbursement_status;
    END IF;

    IF x.restriction_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM fund_restriction fr
        WHERE fr.restriction_id = x.restriction_id
          AND fr.campaign_id = x.campaign_id
          AND x.approved_purpose ILIKE '%' || fr.approved_purpose || '%'
    ) THEN
        RAISE EXCEPTION 'Disbursement purpose must comply with the selected restriction';
    END IF;

    SELECT COALESCE(SUM(amount_delta), 0) INTO available
    FROM fund_ledger_entry
    WHERE campaign_id = x.campaign_id
      AND restriction_id IS NOT DISTINCT FROM x.restriction_id;

    IF x.disbursement_amount > available THEN
        RAISE EXCEPTION 'Insufficient cleared available funds: available %, requested %',
            available, x.disbursement_amount;
    END IF;

    UPDATE disbursement
    SET disbursement_status = 'PAID',
        payment_reference = p_payment_reference,
        paid_at = CURRENT_TIMESTAMP
    WHERE disbursement_id = p_disbursement_id;

    INSERT INTO fund_ledger_entry(
        campaign_id, restriction_id, disbursement_id, entry_type, amount_delta,
        currency, external_reference, notes
    ) VALUES (
        x.campaign_id, x.restriction_id, x.disbursement_id, 'DISBURSEMENT',
        -x.disbursement_amount, 'INR', p_payment_reference,
        'Funds disbursed to verified beneficiary'
    );
END;
$$;

COMMIT;

-- Usage notes:
-- For a cleared payment, in one transaction set donation status and cleared_at,
-- then SELECT post_donation_clearing(<donation_id>).
-- For a refund, in one transaction call post_donation_refund(...), then update
-- the donation's refund metadata/status according to your partial/full-refund policy.
-- For a payout, approve the disbursement row, then SELECT pay_disbursement(id, reference).
-- All sample tests must be run before claiming these paths work as intended.
