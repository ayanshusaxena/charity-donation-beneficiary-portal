/**
 * Batch 2: API Contract Alignment Tests
 *
 * These are sandbox/mock tests — they do NOT contact a live backend.
 * They verify DTO mapping, wire body construction, and envelope parsing
 * using vi.spyOn fetch mocks and the mock store.
 *
 * Each test is labeled with the Fix it covers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchCampaigns,
  fetchCampaignById,
  mapBackendCampaignToFrontend,
} from '../api/campaigns';
import { mapBackendOrgCampaignToFrontend } from '../api/ngo';
import { fetchReviewQueue } from '../api/reviewer';
import {
  createDonation,
  simulateDonationPayment,
  mapBackendDonationToFrontend,
} from '../api/donations';
import {
  BackendCampaignOut,
  BackendOrganizationCampaignOut,
  BackendDonationOut,
  BackendPaymentAttemptOut,
  BackendReviewQueuePage,
} from '../types/api';

// ─── Fix 2.1: Campaign DTO adapter ─────────────────────────────────────────

describe('Fix 2.1 — Campaign DTO adapter (BackendCampaignOut → Campaign)', () => {
  const backendDto: BackendCampaignOut = {
    campaign_id: '42',
    organization_name: 'Annapurna Trust',
    campaign_name: 'Mid-Day Meals for Rural Schools',
    purpose: 'Providing hot nutritious meals to 1200 students daily.',
    purpose_code: 'FOOD',
    target_amount: '400000.00',
    amount_raised: '150000.00',
    currency: 'INR',
    start_date: '2025-01-10',
    end_date: '2025-12-31',
    eligibility: 'ACCEPTING_DONATIONS',
  };

  it('maps campaign_name → title and purpose → description', () => {
    const campaign = mapBackendCampaignToFrontend(backendDto);
    expect(campaign.title).toBe('Mid-Day Meals for Rural Schools');
    expect(campaign.description).toBe('Providing hot nutritious meals to 1200 students daily.');
  });

  it('maps eligibility ACCEPTING_DONATIONS → status ACTIVE', () => {
    const campaign = mapBackendCampaignToFrontend(backendDto);
    expect(campaign.status).toBe('ACTIVE');
  });

  it('preserves monetary amounts as-is (two-decimal strings)', () => {
    const campaign = mapBackendCampaignToFrontend(backendDto);
    expect(campaign.target_amount).toBe('400000.00');
    expect(campaign.amount_raised).toBe('150000.00');
    expect(campaign.currency).toBe('INR');
  });

  it('preserves campaign_id, organization_name, purpose_code, dates', () => {
    const campaign = mapBackendCampaignToFrontend(backendDto);
    expect(campaign.campaign_id).toBe('42');
    expect(campaign.organization_name).toBe('Annapurna Trust');
    expect(campaign.purpose_code).toBe('FOOD');
    expect(campaign.start_date).toBe('2025-01-10');
    expect(campaign.end_date).toBe('2025-12-31');
  });

  it('leaves optional display fields undefined (not present in public endpoint)', () => {
    const campaign = mapBackendCampaignToFrontend(backendDto);
    expect(campaign.image_url).toBeUndefined();
    expect(campaign.days_left).toBeUndefined();
    expect(campaign.mock_backers).toBeUndefined();
    expect(campaign.location).toBeUndefined();
  });

  it('fetchCampaigns in live mode adapts the BackendCampaignPage envelope', async () => {
    const backendPage = {
      items: [backendDto],
      limit: 10,
      offset: 0,
      has_more: false,
      next_offset: null,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => backendPage,
    } as Response);

    const result = await fetchCampaigns({ limit: 10 }, false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Mid-Day Meals for Rural Schools');
    expect(result.items[0].status).toBe('ACTIVE');
    expect(result.limit).toBe(10);
    expect(result.has_more).toBe(false);
  });

  it('fetchCampaignById in live mode adapts a single BackendCampaignOut', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => backendDto,
    } as Response);

    const campaign = await fetchCampaignById('42', false);
    expect(campaign.campaign_id).toBe('42');
    expect(campaign.title).toBe('Mid-Day Meals for Rural Schools');
    expect(campaign.description).toBe('Providing hot nutritious meals to 1200 students daily.');
  });

  it('fetchCampaigns sandbox returns Campaign array (no adaptation needed)', async () => {
    const result = await fetchCampaigns({ limit: 5 }, true);
    expect(result.items.length).toBeGreaterThan(0);
    // Sandbox items have title field directly
    result.items.forEach((c) => {
      expect(typeof c.title).toBe('string');
      expect(c.title.length).toBeGreaterThan(0);
    });
  });
});

// ─── Fix 2.1 (NGO): OrganizationCampaignOut adapter ───────────────────────

describe('Fix 2.1 NGO — BackendOrganizationCampaignOut → Campaign adapter', () => {
  const baseDraft: BackendOrganizationCampaignOut = {
    campaign_id: '55',
    campaign_name: 'Clean Water Initiative',
    purpose: 'Install bio-sand filters in 20 tribal hamlets.',
    purpose_code: 'GENERAL',
    target_amount: '300000.00',
    amount_raised: '0.00',
    currency: 'INR',
    start_date: '2025-03-01',
    end_date: '2025-12-01',
    approval_status: 'PENDING',
    campaign_status: 'DRAFT',
    submitted_at: null,
    review_reason: null,
  };

  it('maps campaign_name → title, purpose → description', () => {
    const c = mapBackendOrgCampaignToFrontend(baseDraft, 'org_10');
    expect(c.title).toBe('Clean Water Initiative');
    expect(c.description).toBe('Install bio-sand filters in 20 tribal hamlets.');
  });

  it('maps DRAFT campaign_status → DRAFT frontend status', () => {
    const c = mapBackendOrgCampaignToFrontend(baseDraft, 'org_10');
    expect(c.status).toBe('DRAFT');
  });

  it('maps approval_status PENDING + non-DRAFT campaign_status → SUBMITTED', () => {
    const submitted = { ...baseDraft, campaign_status: 'ACTIVE' as const, approval_status: 'PENDING' as const };
    const c = mapBackendOrgCampaignToFrontend(submitted, 'org_10');
    expect(c.status).toBe('SUBMITTED');
  });

  it('maps approval_status APPROVED + ACTIVE campaign_status → ACTIVE', () => {
    const approved: BackendOrganizationCampaignOut = {
      ...baseDraft,
      campaign_status: 'ACTIVE',
      approval_status: 'APPROVED',
    };
    const c = mapBackendOrgCampaignToFrontend(approved, 'org_10');
    expect(c.status).toBe('ACTIVE');
  });

  it('maps approval_status REJECTED → REJECTED frontend status', () => {
    const rejected: BackendOrganizationCampaignOut = {
      ...baseDraft,
      campaign_status: 'ACTIVE',
      approval_status: 'REJECTED',
    };
    const c = mapBackendOrgCampaignToFrontend(rejected, 'org_10');
    expect(c.status).toBe('REJECTED');
  });

  it('sets organization_id from the caller-supplied parameter', () => {
    const c = mapBackendOrgCampaignToFrontend(baseDraft, 'org_99', 'Annapurna NGO');
    expect(c.organization_id).toBe('org_99');
    expect(c.organization_name).toBe('Annapurna NGO');
  });
});

// ─── Fix 2.2: Donation creation wire body ──────────────────────────────────

describe('Fix 2.2 — Donation creation wire body (nested donor, no forbidden extras)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends nested donor object with display_name and email in live mode', async () => {
    const backendResponse: BackendDonationOut = {
      donation_id: 'don_live_1',
      campaign_id: '42',
      amount: '500.00',
      currency: 'INR',
      payment_status: 'PENDING',
      created_at: new Date().toISOString(),
      transaction_reference: null,
      receipt_number: null,
      payment_attempts: [],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => backendResponse,
    } as Response);

    await createDonation(
      {
        campaign_id: '42',
        amount: '500.00',
        currency: 'INR',
        donor_type: 'GUEST',
        donor_name: 'Rahul Verma',
        donor_email: 'rahul@example.org',
        pan_number: 'ABCDE1234F',     // must NOT appear in wire body
        address: 'Pune, Maharashtra', // must NOT appear in wire body
      },
      false,
      undefined,
      'test-guest-token-with-sufficient-length-1234567',
      'idemp-don-test-2222'
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0];
    const wireBody = JSON.parse(options?.body as string);

    // Required fields present
    expect(wireBody.campaign_id).toBe('42');
    expect(wireBody.amount).toBe('500.00');
    expect(wireBody.currency).toBe('INR');

    // Nested donor object
    expect(wireBody.donor).toBeDefined();
    expect(wireBody.donor.display_name).toBe('Rahul Verma');
    expect(wireBody.donor.email).toBe('rahul@example.org');

    // Forbidden extra fields must NOT be sent
    expect(wireBody.donor_name).toBeUndefined();
    expect(wireBody.donor_email).toBeUndefined();
    expect(wireBody.donor_type).toBeUndefined();
    expect(wireBody.pan_number).toBeUndefined();
    expect(wireBody.address).toBeUndefined();
  });

  it('sets donor to null for registered donors (backend reads from JWT)', async () => {
    const backendResponse: BackendDonationOut = {
      donation_id: 'don_live_2',
      campaign_id: '42',
      amount: '1000.00',
      currency: 'INR',
      payment_status: 'PENDING',
      created_at: new Date().toISOString(),
      transaction_reference: null,
      receipt_number: null,
      payment_attempts: [],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => backendResponse,
    } as Response);

    await createDonation(
      {
        campaign_id: '42',
        amount: '1000.00',
        currency: 'INR',
        donor_type: 'REGISTERED',
        donor_name: 'Priya Iyer',
        donor_email: 'priya@example.org',
      },
      false,
      'bearer-jwt-token',
      undefined,
      'idemp-don-reg-test-3333'
    );

    const [, options] = fetchSpy.mock.calls[0];
    const wireBody = JSON.parse(options?.body as string);

    // Registered donor: donor should be null (backend extracts from JWT)
    expect(wireBody.donor).toBeNull();
    expect(wireBody.donor_name).toBeUndefined();
    expect(wireBody.donor_type).toBeUndefined();
  });

  it('sends Idempotency-Key and X-Guest-Token headers correctly', async () => {
    const backendResponse: BackendDonationOut = {
      donation_id: 'don_live_3',
      campaign_id: '42',
      amount: '200.00',
      currency: 'INR',
      payment_status: 'PENDING',
      created_at: new Date().toISOString(),
      transaction_reference: null,
      receipt_number: null,
      payment_attempts: [],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => backendResponse,
    } as Response);

    const guestToken = 'guest-tok-abcdefghijklmnopqrstuvwxyz-1234567890-padded';
    await createDonation(
      {
        campaign_id: '42',
        amount: '200.00',
        currency: 'INR',
        donor_type: 'GUEST',
        donor_name: 'Guest',
        donor_email: 'g@example.org',
      },
      false,
      undefined,
      guestToken,
      'idemp-don-hdr-test-4444'
    );

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/donations');
    const headers = options?.headers as Headers;
    expect(headers.get('Idempotency-Key')).toBe('idemp-don-hdr-test-4444');
    expect(headers.get('X-Guest-Token')).toBe(guestToken);
    expect(headers.get('Authorization')).toBeNull();
  });
});

// ─── Fix 2.3: DonationOut status and attempt enum alignment ────────────────

describe('Fix 2.3 — DonationOut adapter (payment_status / payment_attempts)', () => {
  const baseAttempt: BackendPaymentAttemptOut = {
    payment_attempt_id: '9001',
    status: 'SUCCEEDED',
    requested_outcome: 'SUCCEEDED',
    started_at: '2025-06-01T10:00:00Z',
    completed_at: '2025-06-01T10:00:03Z',
  };

  it('maps payment_status SUCCESSFUL → frontend status SUCCESSFUL', () => {
    const dto: BackendDonationOut = {
      donation_id: '77',
      campaign_id: '42',
      amount: '750.00',
      currency: 'INR',
      payment_status: 'SUCCESSFUL',
      created_at: '2025-06-01T10:00:00Z',
      transaction_reference: 'TXN-LIVE-12345',
      receipt_number: 'REC-LIVE-98765',
      payment_attempts: [baseAttempt],
    };

    const donation = mapBackendDonationToFrontend(dto);
    expect(donation.status).toBe('SUCCESSFUL');
    expect(donation.receipt_number).toBe('REC-LIVE-98765');
    expect(donation.transaction_reference).toBe('TXN-LIVE-12345');
  });

  it('maps payment_status PENDING → PENDING', () => {
    const dto: BackendDonationOut = {
      donation_id: '78',
      campaign_id: '42',
      amount: '500.00',
      currency: 'INR',
      payment_status: 'PENDING',
      created_at: '2025-06-01T10:00:00Z',
      transaction_reference: null,
      receipt_number: null,
      payment_attempts: [],
    };
    expect(mapBackendDonationToFrontend(dto).status).toBe('PENDING');
  });

  it('maps payment_status FAILED → FAILED', () => {
    const dto: BackendDonationOut = {
      donation_id: '79',
      campaign_id: '42',
      amount: '500.00',
      currency: 'INR',
      payment_status: 'FAILED',
      created_at: '2025-06-01T10:00:00Z',
      transaction_reference: null,
      receipt_number: null,
      payment_attempts: [],
    };
    expect(mapBackendDonationToFrontend(dto).status).toBe('FAILED');
  });

  it('maps payment_attempts using payment_attempt_id → attempt_id and started_at → created_at', () => {
    const dto: BackendDonationOut = {
      donation_id: '80',
      campaign_id: '42',
      amount: '500.00',
      currency: 'INR',
      payment_status: 'SUCCESSFUL',
      created_at: '2025-06-01T10:00:00Z',
      transaction_reference: 'TXN-LIVE-MULTI',
      receipt_number: 'REC-LIVE-MULTI',
      payment_attempts: [baseAttempt],
    };

    const donation = mapBackendDonationToFrontend(dto);
    expect(donation.attempts).toHaveLength(1);
    expect(donation.attempts![0].attempt_id).toBe('9001');
    expect(donation.attempts![0].status).toBe('SUCCEEDED');
    expect(donation.attempts![0].created_at).toBe('2025-06-01T10:00:00Z');
  });

  it('absent or null payment_attempts field does not crash — defaults to empty array', () => {
    // Gap A: malformed/unexpected backend response omitting payment_attempts.
    // Array.isArray guard in mapBackendDonationToFrontend must prevent TypeError.
    const dtoMissingAttempts = {
      donation_id: '88',
      campaign_id: '42',
      amount: '500.00',
      currency: 'INR' as const,
      payment_status: 'PENDING' as const,
      created_at: '2025-06-01T10:00:00Z',
      transaction_reference: null,
      receipt_number: null,
      // payment_attempts intentionally absent
    } as unknown as BackendDonationOut;

    expect(() => mapBackendDonationToFrontend(dtoMissingAttempts)).not.toThrow();
    const donation = mapBackendDonationToFrontend(dtoMissingAttempts);
    expect(donation.attempts).toEqual([]);
  });

  it('live simulateDonationPayment adapts BackendDonationOut response', async () => {
    const backendResponse: BackendDonationOut = {
      donation_id: 'don_pay_live',
      campaign_id: '42',
      amount: '300.00',
      currency: 'INR',
      payment_status: 'SUCCESSFUL',
      created_at: '2025-06-01T10:00:00Z',
      transaction_reference: 'TXN-LIVE-SIM',
      receipt_number: 'REC-LIVE-SIM',
      payment_attempts: [baseAttempt],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => backendResponse,
    } as Response);

    const donation = await simulateDonationPayment(
      'don_pay_live',
      'SUCCEEDED',
      false,
      undefined,
      'guest-token-for-payment-live-test-padded',
      'idemp-pay-live-test-5555'
    );

    expect(donation.status).toBe('SUCCESSFUL');
    expect(donation.receipt_number).toBe('REC-LIVE-SIM');
    expect(donation.transaction_reference).toBe('TXN-LIVE-SIM');
    expect(donation.attempts).toHaveLength(1);
    expect(donation.attempts![0].attempt_id).toBe('9001');
  });
});

// ─── Fix 2.4: Reviewer queue envelope parsing ──────────────────────────────

describe('Fix 2.4 — ReviewQueuePage envelope parsing and field mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchReviewQueue in sandbox mode returns ReviewCampaignItem[] directly', async () => {
    const queue = await fetchReviewQueue(true);
    expect(Array.isArray(queue)).toBe(true);
    expect(queue.length).toBeGreaterThan(0);
    queue.forEach((item) => {
      expect(item.status).toBe('SUBMITTED');
      expect(typeof item.title).toBe('string');
    });
  });

  it('fetchReviewQueue in live mode parses ReviewQueuePage envelope and maps fields', async () => {
    const backendPage: BackendReviewQueuePage = {
      items: [
        {
          campaign_id: '301',
          organization_id: 'org_20',
          organization_name: 'Gyandeep Foundation',
          campaign_name: 'Digital Literacy Lab',
          purpose: 'Equipping 15-terminal solar-powered computer center.',
          purpose_code: 'EDUCATION',
          target_amount: '350000.00',
          amount_raised: '0.00',
          currency: 'INR',
          start_date: '2025-04-01',
          end_date: '2025-12-31',
          approval_status: 'PENDING',
          campaign_status: 'DRAFT',
          submitted_at: '2025-02-18T14:32:00Z',
          review_reason: null,
        },
      ],
      limit: 20,
      offset: 0,
      has_more: false,
      next_offset: null,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => backendPage,
    } as Response);

    const queue = await fetchReviewQueue(false, 'bearer-reviewer-token');

    // Must return an array, not the page envelope
    expect(Array.isArray(queue)).toBe(true);
    expect(queue).toHaveLength(1);

    const item = queue[0];
    // campaign_name → title, purpose → description
    expect(item.title).toBe('Digital Literacy Lab');
    expect(item.description).toBe('Equipping 15-terminal solar-powered computer center.');
    expect(item.campaign_id).toBe('301');
    expect(item.organization_id).toBe('org_20');
    expect(item.organization_name).toBe('Gyandeep Foundation');
    expect(item.purpose_code).toBe('EDUCATION');
    expect(item.submitted_at).toBe('2025-02-18T14:32:00Z');
    expect(item.status).toBe('SUBMITTED');
    // compliance_flags not in backend response; should be absent
    expect(item.compliance_flags).toBeUndefined();
  });

  it('live fetchReviewQueue sends Authorization header', async () => {
    const emptyPage: BackendReviewQueuePage = {
      items: [],
      limit: 20,
      offset: 0,
      has_more: false,
      next_offset: null,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => emptyPage,
    } as Response);

    await fetchReviewQueue(false, 'reviewer-jwt-abc123');

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/review/campaigns');
    const headers = options?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer reviewer-jwt-abc123');
  });
});
