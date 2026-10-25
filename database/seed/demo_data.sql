-- ============================================================================
-- DonateKaro — Local Development Realistic Demo Seed
-- Target Database: charity_portal_dev
-- All records are explicitly identified as simulated demo records.
-- ============================================================================

BEGIN;

-- 1. Demo Organizations
INSERT INTO organization (
    organization_id, organization_name, registration_ref, email, phone,
    verification_status, verification_reference, verified_by, verified_at, review_reason
) OVERRIDING SYSTEM VALUE VALUES
(
    1,
    'Bal Vikas Trust (Demo)',
    'DEMO-DARPAN-4091',
    'contact@balvikas.demo',
    '+919845012345',
    'VERIFIED',
    'MCA-REG-2022-4091',
    'mock:irb-faculty-reviewer',
    CURRENT_TIMESTAMP - INTERVAL '30 days',
    'Verified against official registration records and compliance checklist.'
),
(
    2,
    'Annapurna Food Relief (Demo)',
    'DEMO-DARPAN-8102',
    'info@annapurna.demo',
    '+919845012346',
    'VERIFIED',
    'MCA-REG-2021-8102',
    'mock:irb-faculty-reviewer',
    CURRENT_TIMESTAMP - INTERVAL '25 days',
    'Verified food-security nonprofit operations and mid-day meal kitchens.'
),
(
    3,
    'Arogya Seva Mandir (Demo)',
    'DEMO-DARPAN-9314',
    'support@arogyaseva.demo',
    '+919845012347',
    'VERIFIED',
    'MCA-REG-2020-9314',
    'mock:irb-faculty-reviewer',
    CURRENT_TIMESTAMP - INTERVAL '20 days',
    'Verified rural primary healthcare outreach and diagnostic compliance.'
),
(
    4,
    'Gramin Swasthya Initiative (Demo)',
    'DEMO-REG-2026-PENDING',
    'applicant@graminswasthya.demo',
    '+919845012348',
    'PENDING',
    NULL,
    NULL,
    NULL,
    NULL
)
ON CONFLICT (organization_id) DO UPDATE SET
    organization_name = EXCLUDED.organization_name,
    verification_status = EXCLUDED.verification_status,
    verified_at = EXCLUDED.verified_at;

-- Reset sequence to prevent collision on future inserts
SELECT setval('organization_organization_id_seq', (SELECT MAX(organization_id) FROM organization));

-- 2. Applicant Capability Tokens for Org 1 and Org 4
INSERT INTO organization_applicant_access (organization_id, token_sha256) VALUES
(1, 'd5d2e698fe576040213f7352bc07389ff1db6e0d5511b36b284a7104998bcfb8'), -- dk_app_bal_vikas_demo_token_2026_01
(4, '150b6f2e6eedcf34105da82c6f6ddb04285c5c69c537583673e8b03c507d681b')  -- dk_app_gramin_demo_token_2026_04
ON CONFLICT (token_sha256) DO NOTHING;

-- 3. Platform Reviewer & Organization Memberships
INSERT INTO platform_role (actor_id, platform_role) VALUES
('mock:irb-faculty-reviewer', 'CAMPAIGN_REVIEWER')
ON CONFLICT DO NOTHING;

INSERT INTO organization_membership (organization_id, actor_id, membership_role) VALUES
(1, 'mock:bal-vikas-editor', 'CAMPAIGN_EDITOR'),
(2, 'mock:bal-vikas-editor', 'CAMPAIGN_EDITOR')
ON CONFLICT DO NOTHING;

-- 4. Insert Campaigns initially in PENDING and DRAFT state (satisfies guard_campaign_state trigger)
INSERT INTO campaign (
    campaign_id, organization_id, campaign_name, purpose, purpose_code,
    target_amount, start_date, end_date, approval_status, campaign_status
) OVERRIDING SYSTEM VALUE VALUES
(
    1, 1,
    'STEM Lab Kits for First-Generation Girl Scholars',
    'Procuring interactive physics and robotics activity boxes for 450 middle school girls in remote Western Ghats villages. Supports experiential laboratory learning and foundational STEM curriculum.',
    'EDUCATION',
    250000.00,
    CURRENT_DATE - INTERVAL '15 days',
    CURRENT_DATE + INTERVAL '60 days',
    'PENDING',
    'DRAFT'
),
(
    2, 2,
    'Nutritional Midday Meals for 1,200 Underprivileged Children',
    'Providing hot wholesome lentils, fresh vegetables, and fortified micro-nutrient snacks across suburban community study centers. Enforces strict food quality audits and community meal log integrity.',
    'FOOD',
    380000.00,
    CURRENT_DATE - INTERVAL '10 days',
    CURRENT_DATE + INTERVAL '45 days',
    'PENDING',
    'DRAFT'
),
(
    3, 3,
    'Emergency Mobile Diagnostic Unit for Rural PHCs',
    'Supplying ECG monitors, hemoglobinometers, and cold-chain vaccine transports for 16 primary healthcare centers covering 24,000 residents without hospital access.',
    'HEALTH',
    450000.00,
    CURRENT_DATE - INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '50 days',
    'PENDING',
    'DRAFT'
),
(
    4, 1,
    'Monsoon Weatherproof Shelters for Displaced Families',
    'Rapid deployment of elevated weatherproof shelters and bedding materials for 120 flood-displaced agrarian families awaiting permanent rehabilitation.',
    'SHELTER',
    500000.00,
    CURRENT_DATE - INTERVAL '8 days',
    CURRENT_DATE + INTERVAL '40 days',
    'PENDING',
    'DRAFT'
),
(
    5, 2,
    'Community Bio-Sand Water Filters for Tribal Hamlets',
    'Constructing 24 community-managed bio-sand water filtration units to eradicate water-borne diseases in remote tribal settlements. Includes village water council training.',
    'GENERAL',
    300000.00,
    CURRENT_DATE - INTERVAL '12 days',
    CURRENT_DATE + INTERVAL '35 days',
    'PENDING',
    'DRAFT'
),
(
    6, 1,
    'Solar Cold-Chain Storage for Vaccine Preservation',
    'Installing reliable solar-powered refrigeration units in 8 off-grid clinics to maintain vaccines between 2 and 8 degrees Celsius.',
    'HEALTH',
    320000.00,
    CURRENT_DATE - INTERVAL '1 day',
    CURRENT_DATE + INTERVAL '90 days',
    'PENDING',
    'DRAFT'
),
(
    7, 1,
    'Dharwad Digital Classroom Initiative',
    NULL,
    'EDUCATION',
    180000.00,
    NULL,
    NULL,
    'PENDING',
    'DRAFT'
)
ON CONFLICT (campaign_id) DO NOTHING;

-- Reset sequence to prevent collision
SELECT setval('campaign_campaign_id_seq', (SELECT MAX(campaign_id) FROM campaign));

-- 5. Transition campaigns using the workflow session parameters
DO $$
BEGIN
    PERFORM set_config('app.actor_id', 'mock:irb-faculty-reviewer', TRUE);
    PERFORM set_config('app.campaign_workflow', 'on', TRUE);

    -- Activate Campaigns 1 to 5
    UPDATE campaign SET
        submitted_by = 'mock:bal-vikas-editor',
        submitted_at = CURRENT_TIMESTAMP - INTERVAL '15 days',
        approval_status = 'APPROVED',
        approved_by = 'mock:irb-faculty-reviewer',
        approved_at = CURRENT_TIMESTAMP - INTERVAL '14 days',
        campaign_status = 'ACTIVE'
    WHERE campaign_id IN (1, 2, 3, 4, 5);

    -- Campaign 6 remains SUBMITTED (PENDING approval, in Reviewer Queue!)
    UPDATE campaign SET
        submitted_by = 'mock:bal-vikas-editor',
        submitted_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
    WHERE campaign_id = 6;

    -- Campaign 7 remains DRAFT (Incomplete draft in NGO Workspace)

    PERFORM set_config('app.campaign_workflow', '', TRUE);
    PERFORM set_config('app.actor_id', '', TRUE);
END$$;

-- 6. Seed Donors (for simulated historical donations)
INSERT INTO donor (donor_id, display_name, email, actor_id, is_anonymous_record)
OVERRIDING SYSTEM VALUE VALUES
(1, 'Aarav Patel (Demo)', 'aarav.patel@example.demo', 'mock:donor-aarav', FALSE),
(2, 'Meera Sen (Demo)', 'meera.sen@example.demo', 'mock:donor-meera', FALSE),
(3, 'Rohan Gupta (Demo)', 'rohan.gupta@example.demo', 'mock:donor-rohan', FALSE),
(4, 'Ananya Deshmukh (Demo)', 'ananya.d@example.demo', 'mock:donor-ananya', FALSE),
(5, 'Vikram Malhotra (Demo)', 'vikram.m@example.demo', 'mock:donor-vikram', FALSE),
(6, 'Siddharth Rao (Demo)', 'siddharth.r@example.demo', 'mock:donor-siddharth', FALSE)
ON CONFLICT (donor_id) DO NOTHING;

SELECT setval('donor_donor_id_seq', (SELECT MAX(donor_id) FROM donor));

-- 7. Seed Simulated Donations in PENDING state first
INSERT INTO donation (
    donation_id, campaign_id, donor_id, donation_amount, currency,
    payment_method, payment_status, donated_at
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 1, 2500.00, 'INR', 'ONLINE', 'PENDING', CURRENT_TIMESTAMP - INTERVAL '10 days'),
(2, 1, 2, 5000.00, 'INR', 'ONLINE', 'PENDING', CURRENT_TIMESTAMP - INTERVAL '8 days'),
(3, 2, 3, 10000.00, 'INR', 'ONLINE', 'PENDING', CURRENT_TIMESTAMP - INTERVAL '6 days'),
(4, 3, 4, 7500.00, 'INR', 'ONLINE', 'PENDING', CURRENT_TIMESTAMP - INTERVAL '4 days'),
(5, 4, 5, 15000.00, 'INR', 'ONLINE', 'PENDING', CURRENT_TIMESTAMP - INTERVAL '5 days'),
(6, 5, 6, 8000.00, 'INR', 'ONLINE', 'PENDING', CURRENT_TIMESTAMP - INTERVAL '3 days')
ON CONFLICT (donation_id) DO NOTHING;

SELECT setval('donation_donation_id_seq', (SELECT MAX(donation_id) FROM donation));

-- Payment Attempts
INSERT INTO payment_attempt (
    payment_attempt_id, donation_id, provider, attempt_status, requested_outcome,
    transaction_reference, actor_id, started_at, completed_at
) OVERRIDING SYSTEM VALUE VALUES
(1, 1, 'SIMULATOR', 'SUCCEEDED', 'SUCCEEDED', 'SIM-DEMO-TXN-2026-0001', 'mock:donor-aarav', CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP - INTERVAL '10 days'),
(2, 2, 'SIMULATOR', 'SUCCEEDED', 'SUCCEEDED', 'SIM-DEMO-TXN-2026-0002', 'mock:donor-meera', CURRENT_TIMESTAMP - INTERVAL '8 days', CURRENT_TIMESTAMP - INTERVAL '8 days'),
(3, 3, 'SIMULATOR', 'SUCCEEDED', 'SUCCEEDED', 'SIM-DEMO-TXN-2026-0003', 'mock:donor-rohan', CURRENT_TIMESTAMP - INTERVAL '6 days', CURRENT_TIMESTAMP - INTERVAL '6 days'),
(4, 4, 'SIMULATOR', 'SUCCEEDED', 'SUCCEEDED', 'SIM-DEMO-TXN-2026-0004', 'mock:donor-ananya', CURRENT_TIMESTAMP - INTERVAL '4 days', CURRENT_TIMESTAMP - INTERVAL '4 days'),
(5, 5, 'SIMULATOR', 'SUCCEEDED', 'SUCCEEDED', 'SIM-DEMO-TXN-2026-0005', 'mock:donor-vikram', CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '5 days'),
(6, 6, 'SIMULATOR', 'SUCCEEDED', 'SUCCEEDED', 'SIM-DEMO-TXN-2026-0006', 'mock:donor-siddharth', CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '3 days')
ON CONFLICT (payment_attempt_id) DO NOTHING;

SELECT setval('payment_attempt_payment_attempt_id_seq', (SELECT MAX(payment_attempt_id) FROM payment_attempt));

-- Now clear the donations (updating payment_status to 'SUCCESSFUL' fires trg_donation_clearing which generates fund_ledger_entry!)
DO $$
BEGIN
    PERFORM set_config('app.actor_id', 'mock:payment-simulator', TRUE);

    UPDATE donation SET
        transaction_reference = 'SIM-DEMO-TXN-2026-0001',
        receipt_number = 'DK-20261015-000000000001',
        cleared_at = CURRENT_TIMESTAMP - INTERVAL '10 days',
        payment_status = 'SUCCESSFUL'
    WHERE donation_id = 1;

    UPDATE donation SET
        transaction_reference = 'SIM-DEMO-TXN-2026-0002',
        receipt_number = 'DK-20261016-000000000002',
        cleared_at = CURRENT_TIMESTAMP - INTERVAL '8 days',
        payment_status = 'SUCCESSFUL'
    WHERE donation_id = 2;

    UPDATE donation SET
        transaction_reference = 'SIM-DEMO-TXN-2026-0003',
        receipt_number = 'DK-20261017-000000000003',
        cleared_at = CURRENT_TIMESTAMP - INTERVAL '6 days',
        payment_status = 'SUCCESSFUL'
    WHERE donation_id = 3;

    UPDATE donation SET
        transaction_reference = 'SIM-DEMO-TXN-2026-0004',
        receipt_number = 'DK-20261018-000000000004',
        cleared_at = CURRENT_TIMESTAMP - INTERVAL '4 days',
        payment_status = 'SUCCESSFUL'
    WHERE donation_id = 4;

    UPDATE donation SET
        transaction_reference = 'SIM-DEMO-TXN-2026-0005',
        receipt_number = 'DK-20261019-000000000005',
        cleared_at = CURRENT_TIMESTAMP - INTERVAL '5 days',
        payment_status = 'SUCCESSFUL'
    WHERE donation_id = 5;

    UPDATE donation SET
        transaction_reference = 'SIM-DEMO-TXN-2026-0006',
        receipt_number = 'DK-20261020-000000000006',
        cleared_at = CURRENT_TIMESTAMP - INTERVAL '3 days',
        payment_status = 'SUCCESSFUL'
    WHERE donation_id = 6;

    PERFORM set_config('app.actor_id', '', TRUE);
END$$;

COMMIT;
