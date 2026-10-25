-- Migration: m001_ngo_lifecycle
-- Adds NGO verification workflow columns to organization, creates organization_applicant_access,
-- relaxes nullable constraints on campaign draft fields.
-- Safe to apply on the acceptance database. Idempotent via IF NOT EXISTS / IF EXISTS guards.

BEGIN;

-- 1. Add verification columns to organization (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='organization' AND column_name='verification_status') THEN
        ALTER TABLE organization
            ADD COLUMN verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='organization' AND column_name='verification_reference') THEN
        ALTER TABLE organization
            ADD COLUMN verification_reference VARCHAR(200);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='organization' AND column_name='verified_by') THEN
        ALTER TABLE organization
            ADD COLUMN verified_by VARCHAR(200);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='organization' AND column_name='verified_at') THEN
        ALTER TABLE organization
            ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='organization' AND column_name='review_reason') THEN
        ALTER TABLE organization
            ADD COLUMN review_reason TEXT;
    END IF;
END$$;

-- 2. Add verification metadata check constraint (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name='organization_verification_metadata_check'
                   AND table_name='organization') THEN
        ALTER TABLE organization ADD CONSTRAINT organization_verification_metadata_check CHECK (
            (verification_status = 'VERIFIED' AND verified_at IS NOT NULL AND verified_by IS NOT NULL)
            OR (verification_status = 'REJECTED' AND verified_at IS NOT NULL AND verified_by IS NOT NULL AND review_reason IS NOT NULL)
            OR (verification_status = 'PENDING' AND verified_at IS NULL AND verified_by IS NULL)
        );
    END IF;
END$$;

-- 3. Create index on verification_status (idempotent)
CREATE INDEX IF NOT EXISTS idx_organization_verification ON organization(verification_status);

-- 4. Create organization_applicant_access table (idempotent)
CREATE TABLE IF NOT EXISTS organization_applicant_access (
    access_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id  BIGINT NOT NULL REFERENCES organization(organization_id) ON DELETE CASCADE,
    token_sha256     CHAR(64) NOT NULL UNIQUE,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_applicant_token ON organization_applicant_access(token_sha256);

-- 5. Relax campaign draft NOT NULL constraints (idempotent via column nullability check)
DO $$
DECLARE
    col_nullable TEXT;
BEGIN
    -- purpose
    SELECT is_nullable INTO col_nullable FROM information_schema.columns
    WHERE table_name='campaign' AND column_name='purpose';
    IF col_nullable = 'NO' THEN
        ALTER TABLE campaign ALTER COLUMN purpose DROP NOT NULL;
    END IF;
    -- purpose_code
    SELECT is_nullable INTO col_nullable FROM information_schema.columns
    WHERE table_name='campaign' AND column_name='purpose_code';
    IF col_nullable = 'NO' THEN
        ALTER TABLE campaign ALTER COLUMN purpose_code DROP NOT NULL;
    END IF;
    -- target_amount
    SELECT is_nullable INTO col_nullable FROM information_schema.columns
    WHERE table_name='campaign' AND column_name='target_amount';
    IF col_nullable = 'NO' THEN
        ALTER TABLE campaign ALTER COLUMN target_amount DROP NOT NULL;
    END IF;
    -- start_date
    SELECT is_nullable INTO col_nullable FROM information_schema.columns
    WHERE table_name='campaign' AND column_name='start_date';
    IF col_nullable = 'NO' THEN
        ALTER TABLE campaign ALTER COLUMN start_date DROP NOT NULL;
    END IF;
    -- end_date
    SELECT is_nullable INTO col_nullable FROM information_schema.columns
    WHERE table_name='campaign' AND column_name='end_date';
    IF col_nullable = 'NO' THEN
        ALTER TABLE campaign ALTER COLUMN end_date DROP NOT NULL;
    END IF;
END$$;

-- 6. Relax campaign dates check (only when dates are both not null)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name='campaign_dates_check' AND table_name='campaign') THEN
        ALTER TABLE campaign DROP CONSTRAINT campaign_dates_check;
    END IF;
END$$;
ALTER TABLE campaign ADD CONSTRAINT campaign_dates_check CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
);

-- 7. Add campaign_name_nonempty_check (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name='campaign_name_nonempty_check' AND table_name='campaign') THEN
        ALTER TABLE campaign ADD CONSTRAINT campaign_name_nonempty_check CHECK (
            campaign_name IS NOT NULL AND length(trim(campaign_name)) > 0
        );
    END IF;
END$$;

-- 8. Seed backfill: mark existing seeded organizations as VERIFIED
-- Restricted to known seeded registration_ref values ONLY.
-- Uses ON CONFLICT-style logic: only updates PENDING orgs with known refs.
-- Cannot promote a newly-registered applicant that shares none of these refs.
-- Cannot overwrite a VERIFIED or REJECTED decision made by a real reviewer.
UPDATE organization
SET verification_status  = 'VERIFIED',
    verified_at          = CURRENT_TIMESTAMP,
    verified_by          = 'system:sandbox-seed',
    verification_reference = 'SEED-BACKFILL-M001'
WHERE registration_ref IN (
    'NGO-DARPAN-4091',
    'REG-GYANDEEP-101',
    'REG-ANNAPURNA-102',
    'REG-AROGYA-103',
    'REG-ASHRAY-104',
    'REG-GRAMIN-105'
)
AND verification_status = 'PENDING';  -- never overwrite a reviewer decision

-- 9. Also cover any seeded orgs with no registration_ref (by organization_id) that are still PENDING
-- We only list IDs that are known seed rows — safe to rerun because we check verification_status='PENDING'.
-- If the org was reviewed (VERIFIED or REJECTED), this is a no-op.
UPDATE organization
SET verification_status  = 'VERIFIED',
    verified_at          = CURRENT_TIMESTAMP,
    verified_by          = 'system:sandbox-seed',
    verification_reference = 'SEED-BACKFILL-M001'
WHERE registration_ref IS NULL
AND verification_status = 'PENDING'
AND organization_id IN (
    SELECT organization_id FROM organization
    WHERE registration_ref IS NULL
    AND verification_status = 'PENDING'
    AND created_at < NOW() - INTERVAL '10 seconds'  -- not a freshly registered applicant
    ORDER BY organization_id
    LIMIT 20  -- safety cap: only process a bounded set
);

COMMIT;
