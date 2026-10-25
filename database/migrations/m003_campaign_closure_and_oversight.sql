-- ============================================================================
-- Migration: m003_campaign_closure_and_oversight
-- Adds campaign closure request workflow and IRB campaign oversight procedures.
-- Safe to apply idempotently.
-- ============================================================================

BEGIN;

-- 1. Campaign Closure Request Table
CREATE TABLE IF NOT EXISTS campaign_closure_request (
    request_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id       BIGINT NOT NULL REFERENCES campaign(campaign_id) ON DELETE CASCADE,
    organization_id   BIGINT NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
    requested_by      VARCHAR(512) NOT NULL,
    request_reason    TEXT NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by       VARCHAR(512),
    reviewed_at       TIMESTAMPTZ,
    review_reason     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_closure_request_reason CHECK (length(btrim(request_reason)) > 0)
);

-- Unique constraint: Only one active PENDING closure request per campaign at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_closure_request
ON campaign_closure_request(campaign_id)
WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_closure_request_org ON campaign_closure_request(organization_id);
CREATE INDEX IF NOT EXISTS idx_closure_request_status ON campaign_closure_request(status);

-- 2. Procedure: Request Campaign Closure (NGO Editor or Applicant)
CREATE OR REPLACE FUNCTION request_campaign_closure(p_campaign_id BIGINT, p_reason TEXT)
RETURNS BIGINT LANGUAGE plpgsql AS $fn$
DECLARE
    c campaign%ROWTYPE;
    v_actor TEXT;
    v_req_id BIGINT;
BEGIN
    SELECT * INTO c FROM campaign WHERE campaign_id = p_campaign_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P1003', MESSAGE = 'CAMPAIGN_NOT_FOUND';
    END IF;

    v_actor := require_organization_role(c.organization_id, 'CAMPAIGN_EDITOR');

    IF c.campaign_status NOT IN ('ACTIVE', 'PAUSED') THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'CAMPAIGN_NOT_ELIGIBLE_FOR_CLOSURE';
    END IF;

    IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_CLOSURE_REASON';
    END IF;

    -- Check for duplicate pending requests
    IF EXISTS (
        SELECT 1 FROM campaign_closure_request
        WHERE campaign_id = p_campaign_id AND status = 'PENDING'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'DUPLICATE_PENDING_CLOSURE_REQUEST';
    END IF;

    INSERT INTO campaign_closure_request (
        campaign_id, organization_id, requested_by, request_reason
    ) VALUES (
        p_campaign_id, c.organization_id, v_actor, btrim(p_reason)
    ) RETURNING request_id INTO v_req_id;

    PERFORM write_audit('CAMPAIGN_CLOSURE_REQUESTED', 'campaign_closure_request', v_req_id::TEXT,
        NULL, (SELECT to_jsonb(r) FROM campaign_closure_request r WHERE r.request_id = v_req_id), btrim(p_reason));

    RETURN v_req_id;
END;
$fn$;

-- 3. Procedure: Review Campaign Closure Request (IRB Platform Reviewer)
CREATE OR REPLACE FUNCTION review_campaign_closure_request(p_request_id BIGINT, p_decision TEXT, p_review_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE
    r campaign_closure_request%ROWTYPE;
    v_actor TEXT;
BEGIN
    v_actor := require_platform_role('CAMPAIGN_REVIEWER');

    IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_CLOSURE_DECISION';
    END IF;

    IF p_review_reason IS NULL OR length(btrim(p_review_reason)) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_REVIEW_REASON';
    END IF;

    SELECT * INTO r FROM campaign_closure_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P1003', MESSAGE = 'CLOSURE_REQUEST_NOT_FOUND';
    END IF;

    IF r.status <> 'PENDING' THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'CLOSURE_REQUEST_ALREADY_REVIEWED';
    END IF;

    -- If approved, execute authorized permanent closure workflow
    IF p_decision = 'APPROVED' THEN
        PERFORM change_campaign_status(r.campaign_id, 'CLOSED', p_review_reason);
    END IF;

    UPDATE campaign_closure_request
    SET status = p_decision,
        reviewed_by = v_actor,
        reviewed_at = CURRENT_TIMESTAMP,
        review_reason = btrim(p_review_reason)
    WHERE request_id = p_request_id;

    PERFORM write_audit('CAMPAIGN_CLOSURE_REQUEST_REVIEWED', 'campaign_closure_request', p_request_id::TEXT,
        to_jsonb(r), (SELECT to_jsonb(x) FROM campaign_closure_request x WHERE x.request_id = p_request_id), btrim(p_review_reason));
END;
$fn$;

-- 4. Procedure: Suspend Campaign (IRB Platform Reviewer)
CREATE OR REPLACE FUNCTION suspend_campaign(p_campaign_id BIGINT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE
    c campaign%ROWTYPE;
    v_actor TEXT;
    v_prev_workflow TEXT;
    v_old_reason TEXT;
BEGIN
    v_actor := require_platform_role('CAMPAIGN_REVIEWER');

    IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_SUSPENSION_REASON';
    END IF;

    SELECT * INTO c FROM campaign WHERE campaign_id = p_campaign_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P1003', MESSAGE = 'CAMPAIGN_NOT_FOUND';
    END IF;

    IF c.approval_status <> 'APPROVED' THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'CAMPAIGN_NOT_SUSPENDABLE';
    END IF;

    v_prev_workflow := current_setting('app.campaign_workflow', TRUE);
    v_old_reason := current_setting('app.campaign_reason', TRUE);
    PERFORM set_config('app.campaign_workflow', 'on', TRUE);
    PERFORM set_config('app.campaign_reason', btrim(p_reason), TRUE);

    -- An active campaign being suspended transitions to PAUSED and SUSPENDED
    UPDATE campaign
    SET approval_status = 'SUSPENDED',
        campaign_status = CASE WHEN campaign_status = 'ACTIVE' THEN 'PAUSED' ELSE campaign_status END,
        reviewed_by = v_actor,
        reviewed_at = CURRENT_TIMESTAMP,
        review_reason = btrim(p_reason)
    WHERE campaign_id = p_campaign_id;

    PERFORM set_config('app.campaign_reason', COALESCE(v_old_reason, ''), TRUE);
    PERFORM set_config('app.campaign_workflow', COALESCE(v_prev_workflow, ''), TRUE);

    PERFORM write_audit('CAMPAIGN_SUSPENDED', 'campaign', p_campaign_id::TEXT,
        to_jsonb(c), (SELECT to_jsonb(x) FROM campaign x WHERE x.campaign_id = p_campaign_id), btrim(p_reason));
END;
$fn$;

-- 5. Procedure: Reopen Suspended Campaign (IRB Platform Reviewer)
CREATE OR REPLACE FUNCTION reopen_campaign(p_campaign_id BIGINT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE
    c campaign%ROWTYPE;
    v_org_status VARCHAR(20);
    v_actor TEXT;
    v_prev_workflow TEXT;
    v_old_reason TEXT;
BEGIN
    v_actor := require_platform_role('CAMPAIGN_REVIEWER');

    IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_REOPEN_REASON';
    END IF;

    SELECT * INTO c FROM campaign WHERE campaign_id = p_campaign_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P1003', MESSAGE = 'CAMPAIGN_NOT_FOUND';
    END IF;

    IF c.approval_status <> 'SUSPENDED' THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'CAMPAIGN_NOT_REOPENABLE';
    END IF;

    -- Strict eligibility check: Organization must still be VERIFIED
    SELECT verification_status INTO v_org_status FROM organization WHERE organization_id = c.organization_id;
    IF v_org_status <> 'VERIFIED' THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'ORGANIZATION_NOT_VERIFIED';
    END IF;

    -- Strict eligibility check: Current date must be within active campaign window
    IF CURRENT_DATE < c.start_date OR CURRENT_DATE > c.end_date THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'CAMPAIGN_DATES_EXPIRED';
    END IF;

    v_prev_workflow := current_setting('app.campaign_workflow', TRUE);
    v_old_reason := current_setting('app.campaign_reason', TRUE);
    PERFORM set_config('app.campaign_workflow', 'on', TRUE);
    PERFORM set_config('app.campaign_reason', btrim(p_reason), TRUE);

    UPDATE campaign
    SET approval_status = 'APPROVED',
        campaign_status = CASE WHEN campaign_status = 'PAUSED' AND CURRENT_DATE BETWEEN start_date AND end_date THEN 'ACTIVE' ELSE campaign_status END,
        reviewed_by = v_actor,
        reviewed_at = CURRENT_TIMESTAMP,
        review_reason = btrim(p_reason)
    WHERE campaign_id = p_campaign_id;

    PERFORM set_config('app.campaign_reason', COALESCE(v_old_reason, ''), TRUE);
    PERFORM set_config('app.campaign_workflow', COALESCE(v_prev_workflow, ''), TRUE);

    PERFORM write_audit('CAMPAIGN_REOPENED', 'campaign', p_campaign_id::TEXT,
        to_jsonb(c), (SELECT to_jsonb(x) FROM campaign x WHERE x.campaign_id = p_campaign_id), btrim(p_reason));
END;
$fn$;

-- 6. Procedure: List All Campaigns for IRB Oversight
CREATE OR REPLACE FUNCTION get_irb_campaign_oversight_list(
    p_status_filter TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    campaign_id BIGINT,
    organization_id BIGINT,
    organization_name VARCHAR(180),
    campaign_name VARCHAR(180),
    purpose_code VARCHAR(40),
    target_amount NUMERIC(14,2),
    amount_raised NUMERIC(14,2),
    start_date DATE,
    end_date DATE,
    approval_status VARCHAR(20),
    campaign_status VARCHAR(20),
    pending_closure_request BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE AS $fn$
BEGIN
    PERFORM require_platform_role('CAMPAIGN_REVIEWER');

    RETURN QUERY
    SELECT
        c.campaign_id,
        c.organization_id,
        o.organization_name,
        c.campaign_name,
        c.purpose_code,
        c.target_amount,
        COALESCE((
            SELECT SUM(le.amount_delta)
            FROM fund_ledger_entry le
            WHERE le.campaign_id = c.campaign_id
              AND le.entry_type IN ('DONATION_CLEARING','DONATION_REFUND')
        ), 0::NUMERIC) AS amount_raised,
        c.start_date,
        c.end_date,
        c.approval_status,
        c.campaign_status,
        EXISTS (
            SELECT 1 FROM campaign_closure_request cr
            WHERE cr.campaign_id = c.campaign_id AND cr.status = 'PENDING'
        ) AS pending_closure_request,
        c.created_at
    FROM campaign c
    JOIN organization o ON o.organization_id = c.organization_id
    WHERE (
        p_status_filter IS NULL
        OR p_status_filter = 'ALL'
        OR (p_status_filter = 'ACTIVE' AND c.campaign_status = 'ACTIVE' AND c.approval_status = 'APPROVED')
        OR (p_status_filter = 'SUSPENDED' AND c.approval_status = 'SUSPENDED')
        OR (p_status_filter = 'CLOSED' AND c.campaign_status = 'CLOSED')
        OR (p_status_filter = 'PAUSED' AND c.campaign_status = 'PAUSED')
        OR (p_status_filter = 'DRAFT' AND c.campaign_status = 'DRAFT' AND c.approval_status <> 'SUSPENDED')
        OR (p_status_filter = 'SUBMITTED' AND c.approval_status = 'PENDING' AND c.submitted_at IS NOT NULL)
        OR (p_status_filter = 'PENDING_CLOSURE' AND EXISTS (
            SELECT 1 FROM campaign_closure_request cr
            WHERE cr.campaign_id = c.campaign_id AND cr.status = 'PENDING'
        ))
    )
    AND (
        p_search IS NULL
        OR length(btrim(p_search)) = 0
        OR c.campaign_name ILIKE '%' || btrim(p_search) || '%'
        OR o.organization_name ILIKE '%' || btrim(p_search) || '%'
    )
    ORDER BY c.created_at DESC, c.campaign_id DESC
    LIMIT p_limit OFFSET p_offset;
END;
$fn$;

-- 7. Procedure: List Closure Requests (IRB Reviewer or Organization Member)
CREATE OR REPLACE FUNCTION get_closure_requests(p_organization_id BIGINT DEFAULT NULL)
RETURNS TABLE (
    request_id BIGINT,
    campaign_id BIGINT,
    campaign_name VARCHAR(160),
    organization_id BIGINT,
    organization_name VARCHAR(160),
    requested_by VARCHAR(512),
    request_reason TEXT,
    status VARCHAR(20),
    reviewed_by VARCHAR(512),
    reviewed_at TIMESTAMPTZ,
    review_reason TEXT,
    created_at TIMESTAMPTZ
) LANGUAGE plpgsql AS $fn$
BEGIN
    IF p_organization_id IS NOT NULL THEN
        PERFORM require_organization_role(p_organization_id, 'CAMPAIGN_EDITOR');
        RETURN QUERY
        SELECT
            r.request_id,
            r.campaign_id,
            c.campaign_name,
            r.organization_id,
            o.organization_name,
            r.requested_by,
            r.request_reason,
            r.status,
            r.reviewed_by,
            r.reviewed_at,
            r.review_reason,
            r.created_at
        FROM campaign_closure_request r
        JOIN campaign c ON c.campaign_id = r.campaign_id
        JOIN organization o ON o.organization_id = r.organization_id
        WHERE r.organization_id = p_organization_id
        ORDER BY r.created_at DESC, r.request_id DESC;
    ELSE
        PERFORM require_platform_role('CAMPAIGN_REVIEWER');
        RETURN QUERY
        SELECT
            r.request_id,
            r.campaign_id,
            c.campaign_name,
            r.organization_id,
            o.organization_name,
            r.requested_by,
            r.request_reason,
            r.status,
            r.reviewed_by,
            r.reviewed_at,
            r.review_reason,
            r.created_at
        FROM campaign_closure_request r
        JOIN campaign c ON c.campaign_id = r.campaign_id
        JOIN organization o ON o.organization_id = r.organization_id
        ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END, r.created_at DESC, r.request_id DESC;
    END IF;
END;
$fn$;

-- 8. Security Definer & Permission Grants
ALTER FUNCTION request_campaign_closure(BIGINT, TEXT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION review_campaign_closure_request(BIGINT, TEXT, TEXT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION suspend_campaign(BIGINT, TEXT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION reopen_campaign(BIGINT, TEXT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_irb_campaign_oversight_list(TEXT, TEXT, INT, INT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_closure_requests(BIGINT) SECURITY DEFINER SET search_path=pg_catalog,public;

DO $$
DECLARE f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN (
            'request_campaign_closure',
            'review_campaign_closure_request',
            'suspend_campaign',
            'reopen_campaign',
            'get_irb_campaign_oversight_list',
            'get_closure_requests'
        )
    LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO charity_portal_owner', f.signature);
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION
    request_campaign_closure(BIGINT, TEXT),
    review_campaign_closure_request(BIGINT, TEXT, TEXT),
    suspend_campaign(BIGINT, TEXT),
    reopen_campaign(BIGINT, TEXT),
    get_irb_campaign_oversight_list(TEXT, TEXT, INT, INT),
    get_closure_requests(BIGINT)
TO charity_portal_runtime;

ALTER TABLE campaign_closure_request OWNER TO charity_portal_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE campaign_closure_request TO charity_portal_runtime;

COMMIT;
