-- Charity Donation & Beneficiary Portal
-- PostgreSQL 15+ recommended for this schema.
-- This is a proposed implementation baseline, not code previously present on main.
BEGIN;

-- Evaluation scope is INR-only. This category table is a controlled purpose
-- vocabulary; it is a classification aid, not a legal determination of purpose.
CREATE TABLE purpose_category (
    purpose_code VARCHAR(40) PRIMARY KEY,
    purpose_name VARCHAR(120) NOT NULL UNIQUE,
    description TEXT NOT NULL
);
INSERT INTO purpose_category(purpose_code, purpose_name, description) VALUES
    ('GENERAL', 'General campaign purpose', 'Campaign-wide purpose classification'),
    ('FOOD', 'Food support', 'Food and nutrition support'),
    ('EDUCATION', 'Education', 'Education and learning support'),
    ('HEALTH', 'Health', 'Health and medical support'),
    ('SHELTER', 'Shelter', 'Housing and shelter support');

CREATE TABLE organization (
    organization_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_name VARCHAR(160) NOT NULL,
    registration_ref VARCHAR(100) UNIQUE,
    email VARCHAR(254),
    phone VARCHAR(30),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED')),
    verification_reference VARCHAR(160),
    verified_by VARCHAR(512),
    verified_at TIMESTAMPTZ,
    review_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT organization_verification_metadata_check CHECK (
        (verification_status = 'VERIFIED' AND verified_at IS NOT NULL AND verified_by IS NOT NULL)
        OR (verification_status = 'REJECTED' AND verified_at IS NOT NULL AND verified_by IS NOT NULL AND review_reason IS NOT NULL)
        OR (verification_status = 'PENDING' AND verified_at IS NULL AND verified_by IS NULL)
    )
);

CREATE INDEX idx_organization_verification ON organization(verification_status);

CREATE TABLE organization_applicant_access (
    applicant_access_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organization(organization_id),
    token_sha256 CHAR(64) NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_applicant_token ON organization_applicant_access(token_sha256);

CREATE TABLE donor (
    donor_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name VARCHAR(160),
    email VARCHAR(254),
    phone VARCHAR(30),
    -- Linked only to a server-verified external principal; guests remain accountless.
    actor_id VARCHAR(512) UNIQUE,
    is_anonymous_record BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT donor_identity_check CHECK (
        (is_anonymous_record = TRUE AND display_name IS NULL AND email IS NULL AND phone IS NULL)
        OR is_anonymous_record = FALSE
    )
);
-- Create one explicit anonymous donor record and reference it for anonymous gifts.
-- Applications should restrict duplicate anonymous records through seed/setup procedure.

CREATE TABLE campaign (
    campaign_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organization(organization_id),
    campaign_name VARCHAR(180) NOT NULL,
    purpose TEXT,
    purpose_code VARCHAR(40) REFERENCES purpose_category(purpose_code),
    target_amount NUMERIC(14,2) CHECK (target_amount IS NULL OR target_amount > 0),
    start_date DATE,
    end_date DATE,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),
    campaign_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (campaign_status IN ('DRAFT','ACTIVE','PAUSED','CLOSED','CANCELLED')),
    approved_by VARCHAR(512),
    approved_at TIMESTAMPTZ,
    submitted_by VARCHAR(512),
    submitted_at TIMESTAMPTZ,
    reviewed_by VARCHAR(512),
    reviewed_at TIMESTAMPTZ,
    review_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT campaign_name_nonempty_check CHECK (length(btrim(campaign_name)) > 0),
    CONSTRAINT campaign_dates_check CHECK (
        start_date IS NULL OR end_date IS NULL OR end_date >= start_date
    ),
    CONSTRAINT campaign_approval_metadata_check CHECK (
        (approval_status = 'APPROVED' AND approved_at IS NOT NULL)
        OR approval_status <> 'APPROVED'
    ),
    CONSTRAINT campaign_submission_metadata_check CHECK (
        (submitted_at IS NULL AND submitted_by IS NULL)
        OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
    ),
    CONSTRAINT campaign_review_metadata_check CHECK (
        (reviewed_at IS NULL AND reviewed_by IS NULL)
        OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    )
);

CREATE UNIQUE INDEX donor_one_anonymous_record
    ON donor(is_anonymous_record) WHERE is_anonymous_record;

-- Membership and platform permissions are provisioned administratively.
CREATE TABLE organization_membership (
    organization_id BIGINT NOT NULL REFERENCES organization(organization_id),
    actor_id VARCHAR(512) NOT NULL,
    membership_role VARCHAR(40) NOT NULL CHECK (membership_role IN (
        'CAMPAIGN_EDITOR','BENEFICIARY_MANAGER','DISBURSEMENT_REQUESTER'
    )),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, actor_id, membership_role)
);
CREATE INDEX idx_organization_membership_actor ON organization_membership(actor_id, is_active);

CREATE TABLE platform_role (
    actor_id VARCHAR(512) NOT NULL,
    platform_role VARCHAR(40) NOT NULL CHECK (platform_role IN (
        'CAMPAIGN_REVIEWER','BENEFICIARY_VERIFIER','PAYOUT_APPROVER',
        'PAYOUT_OPERATOR','REFUND_OPERATOR','PAYMENT_RECONCILER'
    )),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_id, platform_role)
);

CREATE TABLE pledge (
    pledge_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donor_id BIGINT NOT NULL REFERENCES donor(donor_id),
    campaign_id BIGINT NOT NULL REFERENCES campaign(campaign_id),
    pledged_amount NUMERIC(14,2) NOT NULL CHECK (pledged_amount > 0),
    pledged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pledge_status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (pledge_status IN ('OPEN','PARTIALLY_FULFILLED','FULFILLED','CANCELLED')),
    notes TEXT
);

CREATE TABLE donation (
    donation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donor_id BIGINT NOT NULL REFERENCES donor(donor_id),
    campaign_id BIGINT NOT NULL REFERENCES campaign(campaign_id),
    pledge_id BIGINT REFERENCES pledge(pledge_id),
    donation_amount NUMERIC(14,2) NOT NULL CHECK (donation_amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    payment_method VARCHAR(20) NOT NULL
        CHECK (payment_method IN ('ONLINE','BANK_TRANSFER','CASH','CHEQUE','OTHER')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (payment_status IN ('PENDING','SUCCESSFUL','FAILED','CANCELLED','PARTIALLY_REFUNDED','REFUNDED')),
    transaction_reference VARCHAR(160),
    receipt_number VARCHAR(80),
    donated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cleared_at TIMESTAMPTZ,
    refunded_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= donation_amount),
    CONSTRAINT donation_online_success_ref_check CHECK (
        NOT (payment_method = 'ONLINE' AND payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED'))
        OR (transaction_reference IS NOT NULL AND BTRIM(transaction_reference) <> ''
            AND receipt_number IS NOT NULL AND BTRIM(receipt_number) <> '')
    ),
    CONSTRAINT donation_refund_status_check CHECK (
        (payment_status = 'PARTIALLY_REFUNDED' AND refunded_amount > 0 AND refunded_amount < donation_amount)
        OR (payment_status = 'REFUNDED' AND refunded_amount = donation_amount)
        OR (payment_status NOT IN ('PARTIALLY_REFUNDED','REFUNDED') AND refunded_amount = 0)
    ),
    CONSTRAINT donation_cleared_check CHECK (
        cleared_at IS NULL OR payment_status IN ('SUCCESSFUL','PARTIALLY_REFUNDED','REFUNDED')
    ),
    CONSTRAINT donation_transaction_unique UNIQUE (transaction_reference),
    CONSTRAINT donation_receipt_unique UNIQUE (receipt_number),
    CONSTRAINT donation_id_campaign_unique UNIQUE (donation_id, campaign_id)
);

CREATE TABLE donation_guest_access (
    donation_id BIGINT PRIMARY KEY REFERENCES donation(donation_id),
    token_sha256 CHAR(64) NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE receipt_number_sequence AS BIGINT START WITH 1;
CREATE SEQUENCE payment_reference_sequence AS BIGINT START WITH 1;

CREATE TABLE payment_attempt (
    payment_attempt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_id BIGINT NOT NULL REFERENCES donation(donation_id),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('SIMULATOR','EXTERNAL')),
    attempt_status VARCHAR(20) NOT NULL CHECK (
        attempt_status IN ('PENDING','SUCCEEDED','FAILED','UNKNOWN')
    ),
    requested_outcome VARCHAR(20) CHECK (
        requested_outcome IS NULL OR requested_outcome IN ('SUCCEEDED','FAILED','TIMEOUT')
    ),
    transaction_reference VARCHAR(160) UNIQUE,
    actor_id VARCHAR(512) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    failure_reason TEXT,
    reconciliation_reference VARCHAR(160) UNIQUE,
    CONSTRAINT payment_attempt_outcome_metadata_check CHECK (
        (attempt_status = 'PENDING' AND completed_at IS NULL)
        OR (attempt_status <> 'PENDING' AND completed_at IS NOT NULL)
    ),
    CONSTRAINT payment_attempt_success_reference_check CHECK (
        attempt_status <> 'SUCCEEDED' OR transaction_reference IS NOT NULL
    )
);
CREATE INDEX idx_payment_attempt_donation_date
    ON payment_attempt(donation_id, started_at DESC);

CREATE TABLE beneficiary (
    beneficiary_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Nullable for an unambiguous, reviewed legacy backfill; payout guards reject NULL.
    organization_id BIGINT REFERENCES organization(organization_id),
    beneficiary_name VARCHAR(180) NOT NULL,
    beneficiary_type VARCHAR(20) NOT NULL
        CHECK (beneficiary_type IN ('INDIVIDUAL','GROUP','ORGANIZATION')),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED','SUSPENDED')),
    verification_reference VARCHAR(160),
    verified_by VARCHAR(512),
    verified_at TIMESTAMPTZ,
    contact_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT beneficiary_verification_metadata_check CHECK (
        (verification_status = 'VERIFIED' AND verified_at IS NOT NULL)
        OR verification_status <> 'VERIFIED'
    )
);

CREATE TABLE fund_restriction (
    restriction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES campaign(campaign_id),
    restriction_code VARCHAR(60) NOT NULL,
    restriction_name VARCHAR(160) NOT NULL,
    allowed_purpose_code VARCHAR(40) NOT NULL REFERENCES purpose_category(purpose_code),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, restriction_code),
    UNIQUE (campaign_id, restriction_id)
);

CREATE TABLE donation_restriction (
    donation_id BIGINT NOT NULL REFERENCES donation(donation_id),
    campaign_id BIGINT NOT NULL,
    restriction_id BIGINT NOT NULL REFERENCES fund_restriction(restriction_id),
    restricted_amount NUMERIC(14,2) NOT NULL CHECK (restricted_amount > 0),
    PRIMARY KEY (donation_id, restriction_id),
    FOREIGN KEY (donation_id, campaign_id) REFERENCES donation(donation_id, campaign_id),
    FOREIGN KEY (campaign_id, restriction_id) REFERENCES fund_restriction(campaign_id, restriction_id)
);

CREATE TABLE donation_refund (
    refund_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_id BIGINT NOT NULL REFERENCES donation(donation_id),
    campaign_id BIGINT NOT NULL,
    refund_reference VARCHAR(160) NOT NULL UNIQUE,
    refund_amount NUMERIC(14,2) NOT NULL CHECK (refund_amount > 0),
    reason TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (refund_id, campaign_id, donation_id),
    FOREIGN KEY (donation_id, campaign_id) REFERENCES donation(donation_id, campaign_id)
);

-- One refund can reverse several original allocation scopes. NULL restriction_id
-- denotes the donation's unrestricted portion. PostgreSQL 15+ treats NULLs as equal
-- for this key so each refund has at most one allocation per scope.
CREATE TABLE donation_refund_scope (
    refund_scope_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    refund_id BIGINT NOT NULL REFERENCES donation_refund(refund_id),
    campaign_id BIGINT NOT NULL,
    donation_id BIGINT NOT NULL,
    restriction_id BIGINT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    UNIQUE NULLS NOT DISTINCT (refund_id, restriction_id),
    UNIQUE NULLS NOT DISTINCT (refund_scope_id, campaign_id, restriction_id, donation_id),
    UNIQUE (refund_scope_id, campaign_id, donation_id),
    FOREIGN KEY (refund_id, campaign_id, donation_id)
        REFERENCES donation_refund(refund_id, campaign_id, donation_id),
    FOREIGN KEY (campaign_id, restriction_id) REFERENCES fund_restriction(campaign_id, restriction_id)
);

-- Idempotency results commit with their business outcome. Advisory transaction
-- locks serialize same-key races; no incomplete claim is allowed to commit.
CREATE TABLE api_idempotency_request (
    idempotency_request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    principal_id VARCHAR(512) NOT NULL,
    operation VARCHAR(32) NOT NULL CHECK (
        operation IN ('DONATION_CREATE','SIMULATED_PAYMENT','DONATION_REFUND','DISBURSEMENT_PAYMENT')
    ),
    idempotency_key VARCHAR(200) NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 200),
    request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    result_donation_id BIGINT REFERENCES donation(donation_id),
    result_payment_attempt_id BIGINT REFERENCES payment_attempt(payment_attempt_id),
    result_refund_id BIGINT REFERENCES donation_refund(refund_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (principal_id, operation, idempotency_key),
    CONSTRAINT idempotency_result_matches_operation CHECK (
        (operation = 'DONATION_CREATE' AND result_donation_id IS NOT NULL AND result_payment_attempt_id IS NULL AND result_refund_id IS NULL)
        OR (operation = 'SIMULATED_PAYMENT' AND result_donation_id IS NOT NULL AND result_payment_attempt_id IS NOT NULL AND result_refund_id IS NULL)
        OR (operation = 'DONATION_REFUND' AND result_donation_id IS NOT NULL AND result_payment_attempt_id IS NULL AND result_refund_id IS NOT NULL)
        OR (operation = 'DISBURSEMENT_PAYMENT' AND result_donation_id IS NULL AND result_payment_attempt_id IS NULL AND result_refund_id IS NULL)
    )
);

CREATE TABLE disbursement (
    disbursement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES campaign(campaign_id),
    beneficiary_id BIGINT NOT NULL REFERENCES beneficiary(beneficiary_id),
    restriction_id BIGINT,
    disbursement_amount NUMERIC(14,2) NOT NULL CHECK (disbursement_amount > 0),
    approved_purpose TEXT NOT NULL,
    purpose_code VARCHAR(40) NOT NULL REFERENCES purpose_category(purpose_code),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING','APPROVED','REJECTED')),
    disbursement_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (disbursement_status IN ('PENDING','PROCESSING','PAID','FAILED','CANCELLED')),
    requested_by VARCHAR(512),
    approved_by VARCHAR(512),
    approved_at TIMESTAMPTZ,
    paid_by VARCHAR(512),
    payment_reference VARCHAR(160) UNIQUE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMPTZ,
    CONSTRAINT disbursement_campaign_restriction_fk
        FOREIGN KEY (campaign_id, restriction_id)
        REFERENCES fund_restriction(campaign_id, restriction_id),
    CONSTRAINT disbursement_id_campaign_unique UNIQUE (disbursement_id, campaign_id),
    CONSTRAINT disbursement_reference_nonblank CHECK (
        payment_reference IS NULL OR BTRIM(payment_reference) <> ''
    ),
    CONSTRAINT disbursement_approval_metadata_check CHECK (
        (approval_status = 'APPROVED' AND approved_at IS NOT NULL)
        OR approval_status <> 'APPROVED'
    ),
    CONSTRAINT disbursement_separation_metadata_check CHECK (
        (requested_by IS NULL OR approved_by IS NULL OR requested_by <> approved_by)
        AND (paid_by IS NULL OR approved_by IS NULL OR paid_by <> approved_by)
        AND (paid_by IS NULL OR requested_by IS NULL OR paid_by <> requested_by)
    ),
    CONSTRAINT disbursement_paid_metadata_check CHECK (
        (disbursement_status = 'PAID' AND paid_at IS NOT NULL
            AND payment_reference IS NOT NULL AND BTRIM(payment_reference) <> ''
            AND paid_by IS NOT NULL AND BTRIM(paid_by) <> '')
        OR disbursement_status <> 'PAID'
    )
);

ALTER TABLE api_idempotency_request
    ADD COLUMN result_disbursement_id BIGINT REFERENCES disbursement(disbursement_id);
ALTER TABLE api_idempotency_request
    DROP CONSTRAINT idempotency_result_matches_operation;
ALTER TABLE api_idempotency_request
    ADD CONSTRAINT idempotency_result_matches_operation CHECK (
        (operation = 'DONATION_CREATE' AND result_donation_id IS NOT NULL
            AND result_payment_attempt_id IS NULL AND result_refund_id IS NULL AND result_disbursement_id IS NULL)
        OR (operation = 'SIMULATED_PAYMENT' AND result_donation_id IS NOT NULL
            AND result_payment_attempt_id IS NOT NULL AND result_refund_id IS NULL AND result_disbursement_id IS NULL)
        OR (operation = 'DONATION_REFUND' AND result_donation_id IS NOT NULL
            AND result_payment_attempt_id IS NULL AND result_refund_id IS NOT NULL AND result_disbursement_id IS NULL)
        OR (operation = 'DISBURSEMENT_PAYMENT' AND result_donation_id IS NULL
            AND result_payment_attempt_id IS NULL AND result_refund_id IS NULL AND result_disbursement_id IS NOT NULL)
    );
CREATE UNIQUE INDEX idx_idempotency_payment_attempt
    ON api_idempotency_request(result_payment_attempt_id)
    WHERE result_payment_attempt_id IS NOT NULL;
CREATE UNIQUE INDEX idx_idempotency_refund
    ON api_idempotency_request(result_refund_id)
    WHERE result_refund_id IS NOT NULL;
CREATE UNIQUE INDEX idx_idempotency_disbursement
    ON api_idempotency_request(result_disbursement_id)
    WHERE result_disbursement_id IS NOT NULL;

CREATE TABLE audit_log (
    audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id VARCHAR(512) NOT NULL,
    action_type VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    request_id VARCHAR(120)
);

-- Append-oriented ledger: use positive inflow and negative reversal/outflow entries.
-- Ledger events must be written in the same transaction as the business event.
CREATE TABLE fund_ledger_entry (
    ledger_entry_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES campaign(campaign_id),
    restriction_id BIGINT,
    donation_id BIGINT REFERENCES donation(donation_id),
    disbursement_id BIGINT REFERENCES disbursement(disbursement_id),
    refund_scope_id BIGINT UNIQUE REFERENCES donation_refund_scope(refund_scope_id),
    entry_type VARCHAR(30) NOT NULL
        CHECK (entry_type IN ('DONATION_CLEARING','DONATION_REFUND','DISBURSEMENT')),
    amount_delta NUMERIC(14,2) NOT NULL CHECK (amount_delta <> 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    external_reference VARCHAR(160),
    notes TEXT,
    CONSTRAINT ledger_campaign_restriction_fk
        FOREIGN KEY (campaign_id, restriction_id)
        REFERENCES fund_restriction(campaign_id, restriction_id),
    CONSTRAINT ledger_donation_campaign_fk
        FOREIGN KEY (donation_id, campaign_id)
        REFERENCES donation(donation_id, campaign_id),
    CONSTRAINT ledger_disbursement_campaign_fk
        FOREIGN KEY (disbursement_id, campaign_id)
        REFERENCES disbursement(disbursement_id, campaign_id),
    CONSTRAINT ledger_refund_scope_fk
        FOREIGN KEY (refund_scope_id, campaign_id, restriction_id, donation_id)
        REFERENCES donation_refund_scope(refund_scope_id, campaign_id, restriction_id, donation_id),
    CONSTRAINT ledger_refund_scope_source_fk
        FOREIGN KEY (refund_scope_id, campaign_id, donation_id)
        REFERENCES donation_refund_scope(refund_scope_id, campaign_id, donation_id),
    CONSTRAINT ledger_entry_source_check CHECK (
        (entry_type = 'DONATION_CLEARING' AND amount_delta > 0
            AND donation_id IS NOT NULL AND disbursement_id IS NULL AND refund_scope_id IS NULL)
        OR (entry_type = 'DONATION_REFUND' AND amount_delta < 0
            AND donation_id IS NOT NULL AND disbursement_id IS NULL AND refund_scope_id IS NOT NULL)
        OR (entry_type = 'DISBURSEMENT' AND amount_delta < 0
            AND disbursement_id IS NOT NULL AND donation_id IS NULL AND refund_scope_id IS NULL)
    )
);

CREATE UNIQUE INDEX ledger_one_disbursement_event
    ON fund_ledger_entry(disbursement_id) WHERE entry_type = 'DISBURSEMENT';
CREATE UNIQUE INDEX ledger_one_clearing_per_donation_scope
    ON fund_ledger_entry(donation_id, restriction_id) NULLS NOT DISTINCT
    WHERE entry_type = 'DONATION_CLEARING';

CREATE TABLE donor_consent_event (
    consent_event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donor_id BIGINT NOT NULL REFERENCES donor(donor_id),
    consent_purpose VARCHAR(80) NOT NULL,
    consent_action VARCHAR(10) NOT NULL CHECK (consent_action IN ('GRANTED','REVOKED')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_id VARCHAR(512) NOT NULL,
    details JSONB
);

CREATE INDEX idx_donation_pledge_status ON donation(pledge_id, payment_status, cleared_at);
CREATE INDEX idx_refund_donation ON donation_refund(donation_id, recorded_at);
CREATE INDEX idx_refund_scope_restriction ON donation_refund_scope(restriction_id, refund_id);

CREATE INDEX idx_campaign_org_status ON campaign(organization_id, approval_status, campaign_status);
CREATE INDEX idx_beneficiary_organization ON beneficiary(organization_id, verification_status);
CREATE INDEX idx_pledge_donor ON pledge(donor_id);
CREATE INDEX idx_pledge_campaign ON pledge(campaign_id);
CREATE INDEX idx_donation_campaign_status ON donation(campaign_id, payment_status, cleared_at);
CREATE INDEX idx_donation_donor_date ON donation(donor_id, donated_at);
CREATE INDEX idx_disbursement_campaign_status ON disbursement(campaign_id, disbursement_status);
CREATE INDEX idx_ledger_campaign_restriction_date ON fund_ledger_entry(campaign_id, restriction_id, occurred_at);
CREATE INDEX idx_audit_entity_date ON audit_log(entity_type, entity_id, occurred_at);

CREATE OR REPLACE FUNCTION campaign_accepts_donations(p_campaign_id BIGINT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1 FROM campaign c WHERE c.campaign_id=p_campaign_id
          AND c.approval_status='APPROVED' AND c.campaign_status='ACTIVE'
          AND CURRENT_DATE BETWEEN c.start_date AND c.end_date
    )
$$;

-- Campaign progress is derived from the append-only donation ledger. Refund
-- reversals reduce the total; disbursements are excluded from raised funds.
CREATE OR REPLACE FUNCTION campaign_amount_raised(p_campaign_id BIGINT)
RETURNS NUMERIC LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
    SELECT COALESCE(SUM(le.amount_delta), 0::NUMERIC)
    FROM fund_ledger_entry AS le
    WHERE le.campaign_id = p_campaign_id
      AND le.entry_type IN ('DONATION_CLEARING','DONATION_REFUND')
$$;

-- The runtime role reads this public-only projection instead of unpublished
-- campaign rows or organization contact details.
CREATE VIEW public_campaign_discovery AS
SELECT c.campaign_id, o.organization_name, c.campaign_name, c.purpose,
       c.purpose_code, c.target_amount, 'INR'::CHAR(3) AS currency,
       COALESCE((SELECT SUM(le.amount_delta)
                 FROM fund_ledger_entry AS le
                 WHERE le.campaign_id=c.campaign_id
                   AND le.entry_type IN ('DONATION_CLEARING','DONATION_REFUND')),0::NUMERIC) AS amount_raised,
       c.start_date, c.end_date, 'ACCEPTING_DONATIONS'::TEXT AS eligibility
FROM campaign AS c
JOIN organization AS o ON o.organization_id = c.organization_id
WHERE c.approval_status = 'APPROVED'
  AND c.campaign_status = 'ACTIVE'
  AND campaign_accepts_donations(c.campaign_id);

COMMIT;

-- Apply workflows.sql after this initializer. Cross-row pledge/allocation/refund/balance
-- rules and required audit generation are implemented there and remain unverified until run.
