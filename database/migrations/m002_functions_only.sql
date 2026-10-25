-- m002_functions_only.sql
-- Targeted application of new/modified PL/pgSQL functions only.
-- Safe to apply on the acceptance database. Does NOT recreate triggers.

-- 1. Fix submit_campaign (now validates org verification + draft completeness)
CREATE OR REPLACE FUNCTION submit_campaign(p_campaign_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE c campaign%ROWTYPE; v_actor TEXT; v_previous TEXT; v_org_status VARCHAR(20);
BEGIN
    SELECT * INTO c FROM campaign WHERE campaign_id = p_campaign_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P1003', MESSAGE = 'CAMPAIGN_NOT_FOUND'; END IF;
    v_actor := require_organization_role(c.organization_id, 'CAMPAIGN_EDITOR');

    SELECT verification_status INTO v_org_status FROM organization WHERE organization_id = c.organization_id;
    IF v_org_status <> 'VERIFIED' THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'ORGANIZATION_NOT_VERIFIED';
    END IF;

    IF c.campaign_name IS NULL OR length(btrim(c.campaign_name)) < 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INCOMPLETE_CAMPAIGN_DRAFT';
    END IF;
    IF c.purpose IS NULL OR length(btrim(c.purpose)) < 10 THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INCOMPLETE_CAMPAIGN_DRAFT';
    END IF;
    IF c.purpose_code IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INCOMPLETE_CAMPAIGN_DRAFT';
    END IF;
    IF c.target_amount IS NULL OR c.target_amount <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INCOMPLETE_CAMPAIGN_DRAFT';
    END IF;
    IF c.start_date IS NULL OR c.end_date IS NULL OR c.end_date < c.start_date THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INCOMPLETE_CAMPAIGN_DRAFT';
    END IF;

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
$fn$;

-- 2. Fix create_campaign_draft (all optional except campaign_name)
CREATE OR REPLACE FUNCTION create_campaign_draft(
    p_organization_id BIGINT, p_name TEXT,
    p_purpose TEXT DEFAULT NULL, p_purpose_code TEXT DEFAULT NULL,
    p_target NUMERIC(14,2) DEFAULT NULL, p_start DATE DEFAULT NULL, p_end DATE DEFAULT NULL
) RETURNS BIGINT LANGUAGE plpgsql AS $fn$
DECLARE c_id BIGINT; v_actor TEXT;
BEGIN
    IF NULLIF(BTRIM(p_name),'') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='CAMPAIGN_NAME_REQUIRED';
    END IF;
    IF p_target IS NOT NULL AND p_target <= 0 THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='INVALID_TARGET_AMOUNT';
    END IF;
    IF p_start IS NOT NULL AND p_end IS NOT NULL AND p_end < p_start THEN
        RAISE EXCEPTION USING ERRCODE='P1005', MESSAGE='INVALID_DATE_RANGE';
    END IF;
    v_actor := require_organization_role(p_organization_id, 'CAMPAIGN_EDITOR');
    INSERT INTO campaign(organization_id, campaign_name, purpose, purpose_code, target_amount, start_date, end_date)
    VALUES (p_organization_id, p_name, p_purpose, p_purpose_code, p_target, p_start, p_end)
    RETURNING campaign_id INTO c_id;
    PERFORM write_audit('CAMPAIGN_DRAFT_CREATED', 'campaign', c_id::TEXT, NULL,
        (SELECT to_jsonb(c) FROM campaign c WHERE c.campaign_id=c_id));
    RETURN c_id;
END;
$fn$;

-- 3. Add register_organization function
CREATE OR REPLACE FUNCTION register_organization(
    p_name TEXT, p_reg_ref TEXT, p_email TEXT, p_phone TEXT, p_token_sha256 CHAR(64)
) RETURNS BIGINT LANGUAGE plpgsql AS $fn$
DECLARE v_org_id BIGINT; v_actor TEXT;
BEGIN
    IF NULLIF(BTRIM(p_name),'') IS NULL OR length(p_name) > 160 THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_ORGANIZATION_NAME';
    END IF;
    IF NULLIF(BTRIM(p_reg_ref),'') IS NULL OR length(p_reg_ref) > 100 THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_REGISTRATION_REF';
    END IF;
    IF p_token_sha256 IS NULL OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_APPLICANT_TOKEN';
    END IF;
    IF EXISTS (SELECT 1 FROM organization WHERE registration_ref = p_reg_ref) THEN
        RAISE EXCEPTION USING ERRCODE = 'P1001', MESSAGE = 'DUPLICATE_REGISTRATION_REF';
    END IF;

    INSERT INTO organization(organization_name, registration_ref, email, phone, verification_status)
    VALUES (p_name, p_reg_ref, p_email, p_phone, 'PENDING')
    RETURNING organization.organization_id INTO v_org_id;

    INSERT INTO organization_applicant_access(organization_id, token_sha256)
    VALUES (v_org_id, p_token_sha256);

    v_actor := 'applicant:' || p_token_sha256;
    INSERT INTO organization_membership(organization_id, actor_id, membership_role)
    VALUES (v_org_id, v_actor, 'CAMPAIGN_EDITOR');

    PERFORM write_audit('ORGANIZATION_REGISTERED', 'organization', v_org_id::TEXT, NULL,
        (SELECT to_jsonb(o) FROM organization o WHERE o.organization_id=v_org_id));

    RETURN v_org_id;
END;
$fn$;

-- 4. Add review_organization function
CREATE OR REPLACE FUNCTION review_organization(
    p_organization_id BIGINT, p_decision TEXT, p_reason TEXT
) RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE o organization%ROWTYPE; v_actor TEXT;
BEGIN
    PERFORM require_platform_role('CAMPAIGN_REVIEWER');
    v_actor := require_actor();
    IF p_decision NOT IN ('VERIFIED','REJECTED') OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P1005', MESSAGE = 'INVALID_ORGANIZATION_REVIEW';
    END IF;
    SELECT * INTO o FROM organization WHERE organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P1003', MESSAGE = 'ORGANIZATION_NOT_FOUND';
    END IF;
    IF EXISTS (
        SELECT 1 FROM organization_membership m
        WHERE m.organization_id = p_organization_id AND m.actor_id = v_actor AND m.is_active
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P1004', MESSAGE = 'REVIEWER_SEPARATION_VIOLATION';
    END IF;

    UPDATE organization
    SET verification_status = p_decision,
        verified_by = v_actor,
        verified_at = CURRENT_TIMESTAMP,
        review_reason = p_reason
    WHERE organization_id = p_organization_id;

    PERFORM write_audit('ORGANIZATION_' || p_decision, 'organization', p_organization_id::TEXT,
        to_jsonb(o), (SELECT to_jsonb(x) FROM organization x WHERE x.organization_id=p_organization_id), p_reason);
END;
$fn$;

-- 5. Add get_organization_review_queue function
CREATE OR REPLACE FUNCTION get_organization_review_queue(p_limit INTEGER, p_offset INTEGER)
RETURNS TABLE(
    organization_id BIGINT, organization_name VARCHAR(160), registration_ref VARCHAR(100),
    email VARCHAR(254), phone VARCHAR(30), verification_status VARCHAR(20),
    review_reason TEXT, created_at TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
    PERFORM assert_read_page(p_limit, p_offset);
    PERFORM require_platform_role('CAMPAIGN_REVIEWER');
    RETURN QUERY
    SELECT o.organization_id, o.organization_name, o.registration_ref,
           o.email, o.phone, o.verification_status, o.review_reason, o.created_at
    FROM organization o
    ORDER BY CASE WHEN o.verification_status = 'PENDING' THEN 0 ELSE 1 END,
             o.created_at DESC, o.organization_id DESC
    LIMIT p_limit + 1 OFFSET p_offset;
END;
$fn$;

-- 6. Update get_actor_organizations to return verification_status and review_reason
CREATE OR REPLACE FUNCTION get_actor_organizations()
RETURNS TABLE(
    organization_id BIGINT, organization_name VARCHAR(160), roles TEXT[],
    verification_status VARCHAR(20), review_reason TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_actor TEXT := require_actor();
BEGIN
    RETURN QUERY
    SELECT o.organization_id, o.organization_name,
           array_agg(m.membership_role::TEXT ORDER BY m.membership_role),
           o.verification_status, o.review_reason
    FROM organization AS o
    JOIN organization_membership AS m ON m.organization_id=o.organization_id
    WHERE m.actor_id=v_actor AND m.is_active
    GROUP BY o.organization_id, o.organization_name, o.verification_status, o.review_reason
    ORDER BY o.organization_name, o.organization_id;
END;
$fn$;

-- 7. Grant execute on new functions and set SECURITY DEFINER with charity_portal_owner
ALTER FUNCTION submit_campaign(BIGINT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION create_campaign_draft(BIGINT,TEXT,TEXT,TEXT,NUMERIC,DATE,DATE) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION register_organization(TEXT,TEXT,TEXT,TEXT,CHAR(64)) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION review_organization(BIGINT,TEXT,TEXT) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_organization_review_queue(INTEGER,INTEGER) SECURITY DEFINER SET search_path=pg_catalog,public;
ALTER FUNCTION get_actor_organizations() SECURITY DEFINER SET search_path=pg_catalog,public;

DO $$
DECLARE f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prokind='f'
    LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO charity_portal_owner', f.signature);
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION register_organization(TEXT,TEXT,TEXT,TEXT,CHAR(64)),
    review_organization(BIGINT,TEXT,TEXT),
    get_organization_review_queue(INTEGER,INTEGER)
TO charity_portal_runtime;
