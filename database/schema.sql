-- Charity Donation & Beneficiary Portal
-- PostgreSQL 15+ recommended for this schema.
-- This is a proposed implementation baseline, not code previously present on main.
BEGIN;

CREATE TABLE organization (
    organization_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_name VARCHAR(160) NOT NULL,
    registration_ref VARCHAR(100) UNIQUE,
    email VARCHAR(254),
    phone VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE donor (
    donor_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name VARCHAR(160),
    email VARCHAR(254),
    phone VARCHAR(30),
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
    purpose TEXT NOT NULL,
    target_amount NUMERIC(14,2) NOT NULL CHECK (target_amount > 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),
    campaign_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (campaign_status IN ('DRAFT','ACTIVE','PAUSED','CLOSED','CANCELLED')),
    approved_by VARCHAR(160),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT campaign_dates_check CHECK (end_date >= start_date),
    CONSTRAINT campaign_approval_metadata_check CHECK (
        (approval_status = 'APPROVED' AND approved_at IS NOT NULL)
        OR approval_status <> 'APPROVED'
    )
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
    pledge_id BIGINT UNIQUE REFERENCES pledge(pledge_id),
    donation_amount NUMERIC(14,2) NOT NULL CHECK (donation_amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    payment_method VARCHAR(20) NOT NULL
        CHECK (payment_method IN ('ONLINE','BANK_TRANSFER','CASH','CHEQUE','OTHER')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (payment_status IN ('PENDING','SUCCESSFUL','FAILED','CANCELLED','REFUNDED')),
    transaction_reference VARCHAR(160),
    receipt_number VARCHAR(80),
    donated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cleared_at TIMESTAMPTZ,
    refund_of_donation_id BIGINT REFERENCES donation(donation_id),
    refund_amount NUMERIC(14,2) CHECK (refund_amount IS NULL OR refund_amount > 0),
    refund_recorded_at TIMESTAMPTZ,
    CONSTRAINT donation_online_success_ref_check CHECK (
        NOT (payment_method = 'ONLINE' AND payment_status = 'SUCCESSFUL')
        OR (transaction_reference IS NOT NULL AND receipt_number IS NOT NULL)
    ),
    CONSTRAINT donation_refund_metadata_check CHECK (
        (payment_status = 'REFUNDED' AND refund_recorded_at IS NOT NULL AND refund_amount IS NOT NULL)
        OR payment_status <> 'REFUNDED'
    ),
    CONSTRAINT donation_refund_amount_check CHECK (
        refund_amount IS NULL OR refund_amount <= donation_amount
    ),
    CONSTRAINT donation_refund_not_self_check CHECK (
        refund_of_donation_id IS NULL OR refund_of_donation_id <> donation_id
    ),
    CONSTRAINT donation_cleared_check CHECK (
        cleared_at IS NULL OR payment_status = 'SUCCESSFUL'
    ),
    CONSTRAINT donation_transaction_unique UNIQUE (transaction_reference),
    CONSTRAINT donation_receipt_unique UNIQUE (receipt_number)
);

CREATE TABLE beneficiary (
    beneficiary_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    beneficiary_name VARCHAR(180) NOT NULL,
    beneficiary_type VARCHAR(20) NOT NULL
        CHECK (beneficiary_type IN ('INDIVIDUAL','GROUP','ORGANIZATION')),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED','SUSPENDED')),
    verification_reference VARCHAR(160),
    verified_by VARCHAR(160),
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
    approved_purpose TEXT NOT NULL,
    is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, restriction_code),
    UNIQUE (campaign_id, restriction_id)
);

CREATE TABLE donation_restriction (
    donation_id BIGINT NOT NULL REFERENCES donation(donation_id),
    restriction_id BIGINT NOT NULL REFERENCES fund_restriction(restriction_id),
    restricted_amount NUMERIC(14,2) NOT NULL CHECK (restricted_amount > 0),
    PRIMARY KEY (donation_id, restriction_id)
);

CREATE TABLE disbursement (
    disbursement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES campaign(campaign_id),
    beneficiary_id BIGINT NOT NULL REFERENCES beneficiary(beneficiary_id),
    restriction_id BIGINT,
    disbursement_amount NUMERIC(14,2) NOT NULL CHECK (disbursement_amount > 0),
    approved_purpose TEXT NOT NULL,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING','APPROVED','REJECTED')),
    disbursement_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (disbursement_status IN ('PENDING','PROCESSING','PAID','FAILED','CANCELLED','REVERSED')),
    approved_by VARCHAR(160),
    approved_at TIMESTAMPTZ,
    payment_reference VARCHAR(160) UNIQUE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMPTZ,
    CONSTRAINT disbursement_campaign_restriction_fk
        FOREIGN KEY (campaign_id, restriction_id)
        REFERENCES fund_restriction(campaign_id, restriction_id),
    CONSTRAINT disbursement_approval_metadata_check CHECK (
        (approval_status = 'APPROVED' AND approved_at IS NOT NULL)
        OR approval_status <> 'APPROVED'
    ),
    CONSTRAINT disbursement_paid_metadata_check CHECK (
        (disbursement_status = 'PAID' AND paid_at IS NOT NULL)
        OR disbursement_status <> 'PAID'
    )
);

CREATE TABLE audit_log (
    audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id VARCHAR(160) NOT NULL,
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
    entry_type VARCHAR(30) NOT NULL
        CHECK (entry_type IN ('DONATION_CLEARING','DONATION_REFUND','DONATION_REVERSAL',
                              'ALLOCATION','DISBURSEMENT','DISBURSEMENT_REVERSAL','ADJUSTMENT')),
    amount_delta NUMERIC(14,2) NOT NULL CHECK (amount_delta <> 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    external_reference VARCHAR(160),
    notes TEXT,
    CONSTRAINT ledger_campaign_restriction_fk
        FOREIGN KEY (campaign_id, restriction_id)
        REFERENCES fund_restriction(campaign_id, restriction_id),
    CONSTRAINT ledger_entry_source_check CHECK (
        donation_id IS NOT NULL OR disbursement_id IS NOT NULL OR entry_type = 'ADJUSTMENT'
    )
);

CREATE INDEX idx_campaign_org_status ON campaign(organization_id, approval_status, campaign_status);
CREATE INDEX idx_pledge_donor ON pledge(donor_id);
CREATE INDEX idx_pledge_campaign ON pledge(campaign_id);
CREATE INDEX idx_donation_campaign_status ON donation(campaign_id, payment_status, cleared_at);
CREATE INDEX idx_donation_donor_date ON donation(donor_id, donated_at);
CREATE INDEX idx_disbursement_campaign_status ON disbursement(campaign_id, disbursement_status);
CREATE INDEX idx_ledger_campaign_restriction_date ON fund_ledger_entry(campaign_id, restriction_id, occurred_at);
CREATE INDEX idx_audit_entity_date ON audit_log(entity_type, entity_id, occurred_at);

COMMIT;

-- IMPORTANT transactional rules not enforceable with simple row-level CHECKs:
-- 1. Before inserting pledge/donation, lock/check campaign is APPROVED and ACTIVE
--    and the current date is in the campaign window.
-- 2. Before successful online payment, enforce one provider event/transaction per
--    transaction reference and generate a unique receipt.
-- 3. Verify beneficiary and approved purpose before approving/marking a disbursement PAID.
-- 4. Lock campaign/restriction ledger scope, calculate cleared available balance, and
--    reject disbursement if amount exceeds it. Insert ledger and business rows atomically.
-- 5. Refund/reversal must create compensating entries, never delete original donations.
-- 6. Restriction allocation must not exceed cleared funds eligible for that restriction.
-- 7. Add DB triggers or privilege policies to reject updates/deletes to audit_log and
--    fund_ledger_entry; controlled reversal events should be appended instead.
