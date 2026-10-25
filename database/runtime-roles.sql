-- Apply only to a dedicated DonateKaro database, as a database administrator,
-- after schema.sql and workflows.sql. This script creates no login or password.
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='charity_portal_owner') THEN
        CREATE ROLE charity_portal_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='charity_portal_owner'
                  AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole)) THEN
        RAISE EXCEPTION 'Existing charity_portal_owner role has unsafe attributes';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='charity_portal_runtime') THEN
        CREATE ROLE charity_portal_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='charity_portal_runtime'
                  AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole)) THEN
        RAISE EXCEPTION 'Existing charity_portal_runtime role has unsafe attributes';
    END IF;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO charity_portal_owner, charity_portal_runtime;
-- PostgreSQL requires the target owner to have CREATE on the schema during
-- ownership transfer; remove this temporary privilege immediately afterward.
GRANT CREATE ON SCHEMA public TO charity_portal_owner;
GRANT ALL ON ALL TABLES IN SCHEMA public TO charity_portal_owner;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO charity_portal_owner;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO charity_portal_owner;

-- Make all project functions non-privileged SECURITY DEFINER owners before
-- assigning this narrowly scoped owner. The database must contain only the
-- DonateKaro project objects in public when this loop runs.
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
REVOKE CREATE ON SCHEMA public FROM charity_portal_owner;

GRANT SELECT ON public_campaign_discovery TO charity_portal_runtime;
GRANT EXECUTE ON FUNCTION campaign_accepts_donations(BIGINT),
    get_actor_organizations(), get_organization_dashboard(BIGINT),
    get_organization_campaigns(BIGINT,INTEGER,INTEGER), get_organization_campaign(BIGINT,BIGINT),
    get_campaign_review_queue(INTEGER,INTEGER),
    get_organization_review_queue(INTEGER,INTEGER),
    get_organization_beneficiaries(BIGINT,INTEGER,INTEGER),
    get_registered_donation_history(INTEGER,INTEGER)
TO charity_portal_runtime;
GRANT EXECUTE ON FUNCTION register_organization(TEXT,TEXT,TEXT,TEXT,CHAR(64)),
    review_organization(BIGINT,TEXT,TEXT),
    create_campaign_draft(BIGINT,TEXT,TEXT,TEXT,NUMERIC,DATE,DATE),
    update_campaign_draft(BIGINT,TEXT,TEXT,TEXT,NUMERIC,DATE,DATE),
    submit_campaign(BIGINT), review_campaign(BIGINT,TEXT,TEXT), activate_campaign(BIGINT),
    change_campaign_status(BIGINT,TEXT,TEXT),
    create_donation_idempotent(BIGINT,TEXT,TEXT,TEXT,NUMERIC,TEXT,CHAR(64),CHAR(64)),
    simulate_donation_payment_idempotent(BIGINT,TEXT,CHAR(64),TEXT,CHAR(64)),
    reconcile_simulated_payment(BIGINT,TEXT), get_owned_donation(BIGINT,CHAR(64)),
    create_beneficiary(BIGINT,TEXT,TEXT,JSONB), verify_beneficiary(BIGINT,TEXT,TEXT),
    request_disbursement(BIGINT,BIGINT,BIGINT,NUMERIC,TEXT,TEXT),
    approve_disbursement(BIGINT,TEXT), pay_disbursement(BIGINT,TEXT),
    pay_disbursement_idempotent(BIGINT,TEXT,TEXT,CHAR(64)),
    post_donation_refund_idempotent(BIGINT,NUMERIC,TEXT,TEXT,TEXT,CHAR(64))
TO charity_portal_runtime;

COMMIT;

-- Create a separate LOGIN role operationally, grant it membership in
-- charity_portal_runtime, then use that login only for the API. Never grant it
-- membership in charity_portal_owner or direct DML on project tables.
