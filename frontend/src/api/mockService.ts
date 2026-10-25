import {
  Campaign,
  CampaignPage,
  Donation,
  CreateDonationRequest,
  SimulatedPaymentRequest,
  CampaignDraftInput,
  ReviewCampaignItem,
  ReviewDecisionRequest,
  OrganizationRegisterInput,
  OrganizationRegisterOut,
  BackendOrganizationReviewItemOut,
  ClosureRequest,
  IrbCampaignOversightItem,
} from '../types/api';

const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    campaign_id: '101',
    organization_id: '1',
    organization_name: 'Gyandeep Foundation',
    title: 'STEM Lab Kits for First-Generation Girl Scholars',
    purpose_code: 'EDUCATION',
    description:
      'Procuring interactive physics and robotics activity boxes for 450 middle school girls in remote parts of Western Ghats villages. Supports experiential laboratory learning and foundational STEM curriculum.',
    target_amount: '250000.00',
    amount_raised: '210000.00',
    currency: 'INR',
    start_date: '2025-01-10',
    end_date: '2025-12-31',
    status: 'ACTIVE',
    image_url:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCfXXlYHrGWz_uciYuIaHpWkHV7Nl_-2u8rJgGrMI28ltJo_zgews70TwjE-kywjOkOwp9kVu-j7ombnd_VGHaNAANRe7lRTteyVQP-YJqGwQV4TiKNpm5x2OYHKgEY_ttgVs9g_uQZbqAf7galit9-Phk_XxsONhNWJdyGrKQo87UITjeUyI4cWxPvhyJjUlgeRC1WCvwtLhVji-_UYNm_koOSOTWcEUx6rd9Ex-mTWoOSEpgWszRXbQ',
    location: 'Western Ghats, Maharashtra',
    days_left: 9,
    mock_backers: 289,
  },
  {
    campaign_id: '102',
    organization_id: '2',
    organization_name: 'Annapurna Bal Seva',
    title: 'Nutritional Midday Meals for 1,200 Underprivileged Children',
    purpose_code: 'FOOD',
    description:
      'Providing hot wholesome lentils, fresh vegetables, and fortified micro-nutrient snacks across 12 suburban community study centers. Enforces strict food quality audits and community meal log integrity.',
    target_amount: '380000.00',
    amount_raised: '295000.00',
    currency: 'INR',
    start_date: '2025-01-15',
    end_date: '2025-11-30',
    status: 'ACTIVE',
    image_url:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCi4Jnve2eJS9v3PWr-fJvvTDsmxkgXaGH7H_2X8HAlJtuIgtXEqduO9XnCbkmt4FjBjJz-PxJn_Q01Okmzj12noKJcf-MKrPN0tb3Z9PcmR9mjGbMLiYYeftQHlY2-sA6Kx3-rAIiVaHix2PHKB7KYUb35w12SU3ZM2H-p-LKTshx025m8_eHjxwkf_nY-N3HUIDiAiv847zOsenvsr8-UcGNvi2_XjJS8LXkmNIF8-jfnF09utLP_6g',
    location: 'Dharwad, Karnataka',
    days_left: 14,
    mock_backers: 412,
  },
  {
    campaign_id: '103',
    organization_id: '3',
    organization_name: 'Arogya Seva Mandir',
    title: 'Emergency Mobile Diagnostic Unit for Rural PHCs',
    purpose_code: 'HEALTH',
    description:
      'Supplying ECG monitors, hemoglobinometers, and cold-chain vaccine transports for 16 primary healthcare centers covering 24,000 residents without hospital access.',
    target_amount: '450000.00',
    amount_raised: '180000.00',
    currency: 'INR',
    start_date: '2025-02-01',
    end_date: '2025-12-15',
    status: 'ACTIVE',
    image_url:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD0fD5rr5DgEtzYgMCjNnA9Sw6CBBRfe7ePNSQ2-26m_N4TOxECqhVWcUPE1fUU8AuDk8MNj56JYpAL0UcWqVBsJdQh7JU9qggQ57t8IHxVoCMy-5Ewpcs4IX6dumTEdpcbUOcSSOzIU3Bx8YuAlbukbLWZRmzO5GI-n9CUkSgSF199SKMoYMZlUjZ2BMDz5VWKbZt7rawo6lD6Xc0UhyQboDNT0Avyr4S9iWpszN5zSiWsLuclrjCj6Q',
    location: 'Raichur, Karnataka',
    days_left: 21,
    mock_backers: 178,
  },
  {
    campaign_id: '104',
    organization_id: '4',
    organization_name: 'Ashray Sansthan',
    title: 'Monsoon Flood Relief Temporary Weatherproof Shelters',
    purpose_code: 'SHELTER',
    description:
      'Rapid deployment of elevated weatherproof shelters and bedding materials for 120 flood-displaced agrarian families awaiting permanent rehabilitation.',
    target_amount: '500000.00',
    amount_raised: '340000.00',
    currency: 'INR',
    start_date: '2025-01-20',
    end_date: '2025-10-31',
    status: 'ACTIVE',
    image_url:
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80',
    location: 'Kolhapur, Maharashtra',
    days_left: 11,
    mock_backers: 350,
  },
  {
    campaign_id: '105',
    organization_id: '5',
    organization_name: 'Gramin Vikas Manch',
    title: 'Community Bio-Sand Water Filters for Tribal Hamlets',
    purpose_code: 'GENERAL',
    description:
      'Constructing 24 community-managed bio-sand water filtration units to eradicate water-borne diseases in remote tribal settlements. Includes village water council training.',
    target_amount: '300000.00',
    amount_raised: '260000.00',
    currency: 'INR',
    start_date: '2025-01-05',
    end_date: '2025-11-20',
    status: 'ACTIVE',
    image_url:
      'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=1200&q=80',
    location: 'Wayanad, Kerala',
    days_left: 7,
    mock_backers: 195,
  },
];

class MockStore {
  private organizations: Array<{
    organization_id: string;
    organization_name: string;
    registration_ref: string;
    email: string;
    phone: string;
    verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
    review_reason: string | null;
    applicant_access_token: string;
    created_at: string;
  }> = [
    {
      organization_id: '1',
      organization_name: 'Bal Vikas Trust',
      registration_ref: 'NGO-DARPAN-4091',
      email: 'contact@balvikastrust.org',
      phone: '+919845012345',
      verification_status: 'VERIFIED',
      review_reason: null,
      applicant_access_token: 'mock-token-bal-vikas',
      created_at: '2025-01-01T00:00:00Z',
    },
  ];
  private campaigns: Campaign[] = [...INITIAL_CAMPAIGNS];
  private donations: Map<string, Donation> = new Map();
  private creationIdempotencyMap: Map<string, Donation> = new Map();
  private paymentIdempotencyMap: Map<string, Donation> = new Map();
  private reviewQueue: ReviewCampaignItem[] = [
    {
      campaign_id: '201',
      organization_id: '1',
      organization_name: 'Bal Vikas Trust',
      title: 'Dharwad Village Computer Literacy Lab',
      purpose_code: 'EDUCATION',
      target_amount: '350000.00',
      submitted_at: '2025-02-18 14:32:00',
      description:
        'Equipping a 15-terminal solar-powered community computer learning center for 300 rural high school students with certified digital literacy trainers.',
      status: 'SUBMITTED',
      compliance_flags: {
        fcra_valid: true,
        budget_breakdown_attached: true,
        purpose_eligible: true,
        beneficiary_linked: true,
      },
    },
    {
      campaign_id: '202',
      organization_id: '2',
      organization_name: 'Arogya Seva Mandir',
      title: 'Dialysis Consumables Assistance Program',
      purpose_code: 'HEALTH',
      target_amount: '400000.00',
      submitted_at: '2025-02-19 09:15:00',
      description:
        'Subsidizing dialysis kits and erythropoietin injections for 40 end-stage renal failure patients below poverty line.',
      status: 'SUBMITTED',
      compliance_flags: {
        fcra_valid: true,
        budget_breakdown_attached: true,
        purpose_eligible: true,
        beneficiary_linked: true,
      },
    },
    {
      campaign_id: '203',
      organization_id: '4',
      organization_name: 'Sahyadri Shramik Sangh',
      title: 'Permanent Concrete Flooring for Hill Tribe Dwellings',
      purpose_code: 'SHELTER',
      target_amount: '280000.00',
      submitted_at: '2025-02-19 16:45:00',
      description:
        'Replacing damp mud floors with waterproof sealed concrete across 65 indigenous households to eliminate parasitic infections.',
      status: 'SUBMITTED',
      compliance_flags: {
        fcra_valid: true,
        budget_breakdown_attached: true,
        purpose_eligible: true,
        beneficiary_linked: true,
      },
    },
  ];

  private closureRequests: ClosureRequest[] = [];

  getCampaigns(options: {
    limit?: number;
    offset?: number;
    search?: string;
    purpose_code?: string;
    sort?: 'date' | 'target_asc' | 'target_desc';
  }): CampaignPage {
    let list = [...this.campaigns].filter((c) => c.status === 'ACTIVE' || c.status === 'APPROVED');

    if (options.purpose_code) {
      list = list.filter((c) => c.purpose_code === options.purpose_code);
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.organization_name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.purpose_code.toLowerCase().includes(q)
      );
    }

    if (options.sort === 'target_asc') {
      list.sort((a, b) => parseFloat(a.target_amount) - parseFloat(b.target_amount));
    } else if (options.sort === 'target_desc') {
      list.sort((a, b) => parseFloat(b.target_amount) - parseFloat(a.target_amount));
    } else {
      // default: date
      list.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    }

    const limit = options.limit || 20;
    const offset = options.offset || 0;
    const paginated = list.slice(offset, offset + limit);
    const has_more = offset + limit < list.length;
    const next_offset = has_more ? offset + limit : null;

    return {
      items: paginated,
      limit,
      offset,
      has_more,
      next_offset,
    };
  }

  getCampaign(id: string): Campaign | undefined {
    return this.campaigns.find((c) => c.campaign_id === id);
  }

  createDonation(req: CreateDonationRequest, idempotencyKey?: string): Donation {
    if (idempotencyKey && this.creationIdempotencyMap.has(idempotencyKey)) {
      // Replay existing persisted donation for same idempotency key
      return this.creationIdempotencyMap.get(idempotencyKey)!;
    }

    const id = String(Date.now() % 1000000);
    const donation: Donation = {
      donation_id: id,
      campaign_id: req.campaign_id,
      campaign_title: this.getCampaign(req.campaign_id)?.title || 'General Relief Fund',
      amount: parseFloat(req.amount).toFixed(2),
      currency: 'INR',
      status: 'PENDING',
      created_at: new Date().toISOString(),
      attempts: [],
    };
    this.donations.set(id, donation);
    if (idempotencyKey) {
      this.creationIdempotencyMap.set(idempotencyKey, donation);
    }
    return donation;
  }

  getDonation(id: string): Donation | undefined {
    return this.donations.get(id);
  }

  simulatePayment(donationId: string, req: SimulatedPaymentRequest, idempotencyKey?: string): Donation {
    const paymentKey = idempotencyKey ? `${donationId}:${idempotencyKey}` : undefined;
    if (paymentKey && this.paymentIdempotencyMap.has(paymentKey)) {
      // Replay existing persisted payment result for same payment idempotency key
      return this.paymentIdempotencyMap.get(paymentKey)!;
    }

    const donation = this.donations.get(donationId);
    if (!donation) {
      throw new Error(`Donation ${donationId} not found`);
    }

    const attemptId = `ATT-SIM-${Date.now() % 100000}`;
    const now = new Date().toISOString();

    if (req.outcome === 'SUCCEEDED') {
      donation.status = 'CLEARED';
      donation.transaction_reference = `TXN-SIM-${Date.now()}`;
      donation.receipt_number = `REC-SIM-2025-${donationId}`;
      donation.attempts = [
        ...(donation.attempts || []),
        { attempt_id: attemptId, status: 'SUCCEEDED', created_at: now },
      ];

      // Credit amount to campaign in memory
      const campaign = this.getCampaign(donation.campaign_id);
      if (campaign) {
        const currentRaised = parseFloat(campaign.amount_raised);
        const added = parseFloat(donation.amount);
        campaign.amount_raised = (currentRaised + added).toFixed(2);
        if (campaign.mock_backers !== undefined) {
          campaign.mock_backers += 1;
        }
      }
    } else if (req.outcome === 'FAILED') {
      donation.status = 'FAILED';
      donation.receipt_number = null;
      donation.transaction_reference = null;
      donation.attempts = [
        ...(donation.attempts || []),
        { attempt_id: attemptId, status: 'FAILED', created_at: now },
      ];
    } else {
      // TIMEOUT -> UNKNOWN
      donation.status = 'UNKNOWN';
      donation.receipt_number = null;
      donation.transaction_reference = null;
      donation.attempts = [
        ...(donation.attempts || []),
        { attempt_id: attemptId, status: 'UNKNOWN', created_at: now },
      ];
    }

    this.donations.set(donationId, donation);
    if (paymentKey) {
      this.paymentIdempotencyMap.set(paymentKey, { ...donation });
    }
    return donation;
  }

  // NGO Workspace & Organization Lifecycle
  registerOrganization(input: OrganizationRegisterInput): OrganizationRegisterOut {
    if (!input.organization_name?.trim()) {
      throw new Error('Organization name is required');
    }
    if (!input.registration_ref?.trim()) {
      throw new Error('Registration reference is required');
    }
    if (this.organizations.some((o) => o.registration_ref === input.registration_ref.trim())) {
      throw new Error('An organization with this registration reference already exists');
    }

    const orgId = String(this.organizations.length + 10);
    const token = 'dk_app_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const newOrg = {
      organization_id: orgId,
      organization_name: input.organization_name.trim(),
      registration_ref: input.registration_ref.trim(),
      email: input.email?.trim() || '',
      phone: input.phone?.trim() || '',
      verification_status: 'PENDING' as const,
      review_reason: null,
      applicant_access_token: token,
      created_at: new Date().toISOString(),
    };
    this.organizations.push(newOrg);

    return {
      organization_id: orgId,
      organization_name: newOrg.organization_name,
      verification_status: 'PENDING',
      applicant_access_token: token,
    };
  }

  getOrganization(id: string) {
    return this.organizations.find((o) => o.organization_id === id) || null;
  }

  getOrganizationByToken(token: string) {
    return this.organizations.find((o) => o.applicant_access_token === token) || null;
  }

  getOrganizationReviewQueue(): BackendOrganizationReviewItemOut[] {
    return this.organizations.map((o) => ({
      organization_id: o.organization_id,
      organization_name: o.organization_name,
      registration_ref: o.registration_ref,
      email: o.email || null,
      phone: o.phone || null,
      verification_status: o.verification_status,
      review_reason: o.review_reason,
      created_at: o.created_at,
    }));
  }

  reviewOrganization(id: string, decision: 'VERIFIED' | 'REJECTED', reason: string): { organization_id: string; status: string } {
    const org = this.organizations.find((o) => o.organization_id === id);
    if (!org) {
      throw new Error(`Organization ${id} not found`);
    }
    org.verification_status = decision;
    org.review_reason = reason;
    return { organization_id: id, status: decision };
  }

  createCampaignDraft(input: CampaignDraftInput, orgId = '1'): Campaign {
    if (!input.title?.trim()) {
      throw new Error('CAMPAIGN_NAME_REQUIRED: Campaign title is required');
    }
    const org = this.getOrganization(orgId);
    const orgName = org?.organization_name || 'Bal Vikas Trust';

    const id = String(Date.now() % 1000000);
    const draft: Campaign = {
      campaign_id: id,
      organization_id: orgId,
      organization_name: orgName,
      title: input.title.trim(),
      purpose_code: input.purpose_code || 'EDUCATION',
      description: input.description?.trim() || '',
      target_amount: input.target_amount ? (parseFloat(input.target_amount) || 0).toFixed(2) : '0.00',
      amount_raised: '0.00',
      currency: 'INR',
      start_date: input.start_date || '',
      end_date: input.end_date || '',
      status: 'DRAFT',
      location: 'Dharwad, Karnataka',
      days_left: 30,
      mock_backers: 0,
    };
    this.campaigns.unshift(draft);
    return draft;
  }

  updateCampaignDraft(id: string, input: Partial<CampaignDraftInput>): Campaign {
    const campaign = this.getCampaign(id);
    if (!campaign) {
      throw new Error(`Campaign ${id} not found`);
    }
    if (campaign.status !== 'DRAFT') {
      throw new Error('CAMPAIGN_NOT_EDITABLE: Only draft campaigns can be edited');
    }
    if (input.title !== undefined) campaign.title = input.title.trim();
    if (input.purpose_code !== undefined) campaign.purpose_code = input.purpose_code;
    if (input.description !== undefined) campaign.description = input.description.trim();
    if (input.target_amount !== undefined) {
      campaign.target_amount = (parseFloat(input.target_amount) || 0).toFixed(2);
    }
    if (input.start_date !== undefined) campaign.start_date = input.start_date;
    if (input.end_date !== undefined) campaign.end_date = input.end_date;

    return campaign;
  }

  submitCampaign(id: string): Campaign {
    const campaign = this.getCampaign(id);
    if (!campaign) {
      throw new Error(`Campaign ${id} not found`);
    }

    // 1. Check organization verification status
    const org = this.getOrganization(campaign.organization_id);
    if (org && org.verification_status !== 'VERIFIED') {
      throw new Error('ORGANIZATION_NOT_VERIFIED: The organization must be verified by a reviewer before campaigns can be submitted.');
    }

    // 2. Validate completeness of the 6 required fields
    if (!campaign.title || campaign.title.trim().length < 1) {
      throw new Error('INCOMPLETE_CAMPAIGN_DRAFT: Campaign title is required');
    }
    if (!campaign.description || campaign.description.trim().length < 10) {
      throw new Error('INCOMPLETE_CAMPAIGN_DRAFT: Campaign purpose description must be at least 10 characters long');
    }
    if (!campaign.purpose_code) {
      throw new Error('INCOMPLETE_CAMPAIGN_DRAFT: Campaign purpose code is required');
    }
    const target = parseFloat(campaign.target_amount);
    if (isNaN(target) || target <= 0) {
      throw new Error('INCOMPLETE_CAMPAIGN_DRAFT: Target amount must be greater than zero');
    }
    if (!campaign.start_date || !campaign.end_date) {
      throw new Error('INCOMPLETE_CAMPAIGN_DRAFT: Start date and end date are required');
    }
    if (campaign.end_date < campaign.start_date) {
      throw new Error('INCOMPLETE_CAMPAIGN_DRAFT: End date cannot precede start date');
    }

    campaign.status = 'SUBMITTED';

    // Add to review queue
    this.reviewQueue.unshift({
      campaign_id: campaign.campaign_id,
      organization_id: campaign.organization_id,
      organization_name: campaign.organization_name,
      title: campaign.title,
      purpose_code: campaign.purpose_code,
      target_amount: campaign.target_amount,
      submitted_at: new Date().toISOString(),
      description: campaign.description,
      status: 'SUBMITTED',
      compliance_flags: {
        fcra_valid: true,
        budget_breakdown_attached: true,
        purpose_eligible: true,
        beneficiary_linked: true,
      },
    });

    return campaign;
  }

  // Reviewer Workspace
  getReviewQueue(): ReviewCampaignItem[] {
    return [...this.reviewQueue];
  }

  reviewCampaign(id: string, req: ReviewDecisionRequest): { campaign_id: string; status: string; reason: string } {
    const queueIndex = this.reviewQueue.findIndex((item) => item.campaign_id === id);
    if (queueIndex !== -1) {
      this.reviewQueue.splice(queueIndex, 1);
    }

    const campaign = this.getCampaign(id);
    if (campaign) {
      if (req.decision === 'APPROVED') {
        campaign.status = 'APPROVED';
      } else {
        // Backend contract rule: REJECTED returns to DRAFT so it can be revised
        campaign.status = 'DRAFT';
      }
    }

    return {
      campaign_id: id,
      status: req.decision === 'APPROVED' ? 'APPROVED' : 'DRAFT',
      reason: req.reason,
    };
  }

  // Closure Requests and Oversight
  requestCampaignClosure(campaignId: string, reason: string): { resource_id: string; status: string } {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
    const existing = this.closureRequests.find((r) => r.campaign_id === campaignId && r.status === 'PENDING');
    if (existing) throw new Error('DUPLICATE_PENDING_CLOSURE_REQUEST');

    const reqId = String(Date.now());
    const req: ClosureRequest = {
      request_id: reqId,
      campaign_id: campaignId,
      campaign_name: campaign.title,
      organization_id: campaign.organization_id,
      organization_name: campaign.organization_name,
      requested_by: 'mock:ngo-editor',
      request_reason: reason,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };
    this.closureRequests.push(req);
    return { resource_id: reqId, status: 'PENDING' };
  }

  getClosureRequests(orgId?: string): ClosureRequest[] {
    if (orgId) {
      return this.closureRequests.filter((r) => r.organization_id === orgId);
    }
    return [...this.closureRequests];
  }

  reviewClosureRequest(requestId: string, decision: 'APPROVED' | 'REJECTED', reason: string): { resource_id: string; status: string } {
    const req = this.closureRequests.find((r) => r.request_id === requestId);
    if (!req) throw new Error('CLOSURE_REQUEST_NOT_FOUND');
    req.status = decision;
    req.reviewed_by = 'mock:irb-reviewer';
    req.reviewed_at = new Date().toISOString();
    req.review_reason = reason;

    if (decision === 'APPROVED') {
      const camp = this.getCampaign(req.campaign_id);
      if (camp) {
        camp.status = 'CLOSED';
      }
    }
    return { resource_id: requestId, status: decision };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  suspendCampaign(campaignId: string, _reason: string): { resource_id: string; status: string } {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
    campaign.status = 'SUSPENDED';
    return { resource_id: campaignId, status: 'SUSPENDED' };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reopenCampaign(campaignId: string, _reason: string): { resource_id: string; status: string } {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
    campaign.status = 'ACTIVE';
    return { resource_id: campaignId, status: 'ACTIVE' };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  closeCampaign(campaignId: string, _reason: string): { resource_id: string; status: string } {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
    campaign.status = 'CLOSED';
    return { resource_id: campaignId, status: 'CLOSED' };
  }

  getIrbAllCampaigns(statusFilter?: string, search?: string): IrbCampaignOversightItem[] {
    let list = this.campaigns.map((c) => ({
      campaign_id: c.campaign_id,
      organization_id: c.organization_id,
      organization_name: c.organization_name,
      campaign_name: c.title,
      purpose_code: c.purpose_code,
      target_amount: c.target_amount,
      amount_raised: c.amount_raised,
      start_date: c.start_date,
      end_date: c.end_date,
      approval_status: c.status === 'SUSPENDED' ? 'SUSPENDED' : c.status === 'DRAFT' || c.status === 'SUBMITTED' ? 'PENDING' : c.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
      campaign_status: c.status === 'CLOSED' ? 'CLOSED' : c.status === 'SUSPENDED' ? 'PAUSED' : c.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
      pending_closure_request: this.closureRequests.some((r) => r.campaign_id === c.campaign_id && r.status === 'PENDING'),
      created_at: new Date().toISOString(),
    }));

    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'ACTIVE') list = list.filter((c) => c.campaign_status === 'ACTIVE');
      else if (statusFilter === 'SUSPENDED') list = list.filter((c) => c.approval_status === 'SUSPENDED');
      else if (statusFilter === 'CLOSED') list = list.filter((c) => c.campaign_status === 'CLOSED');
      else if (statusFilter === 'PAUSED') list = list.filter((c) => c.campaign_status === 'PAUSED');
      else if (statusFilter === 'DRAFT') list = list.filter((c) => c.campaign_status === 'DRAFT');
      else if (statusFilter === 'SUBMITTED') list = list.filter((c) => c.approval_status === 'PENDING');
      else if (statusFilter === 'PENDING_CLOSURE') list = list.filter((c) => c.pending_closure_request);
    }

    if (search && search.trim().length > 0) {
      const q = search.toLowerCase().trim();
      list = list.filter((c) => c.campaign_name.toLowerCase().includes(q) || c.organization_name.toLowerCase().includes(q));
    }

    return list;
  }
}

export const mockStore = new MockStore();
