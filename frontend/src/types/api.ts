export type PurposeCode = 'GENERAL' | 'FOOD' | 'EDUCATION' | 'HEALTH' | 'SHELTER';

export type CampaignSort = 'date' | 'target_asc' | 'target_desc';

export type CampaignStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'CLOSED' | 'PAUSED';

// ─── Frontend-internal Campaign model ────────────────────────────────────────
// Used throughout UI components. Populated either by the sandbox mock store
// or by adapting a BackendCampaignOut / BackendOrganizationCampaignOut response.
export interface Campaign {
  campaign_id: string;
  organization_id: string;
  organization_name: string;
  title: string;
  purpose_code: PurposeCode;
  description: string;
  target_amount: string; // two-decimal string in INR
  amount_raised: string; // net cleared donations from ledger
  currency: 'INR';
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  image_url?: string;
  location?: string;
  days_left?: number;
  mock_backers?: number;
}

export interface CampaignPage {
  items: Campaign[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}

// ─── Backend wire types: CampaignOut (public endpoint) ────────────────────────
// Mirrors backend schemas.py CampaignOut exactly.
// campaign_name → maps to Campaign.title
// purpose       → maps to Campaign.description
// eligibility   → 'ACCEPTING_DONATIONS' (public campaigns only); mapped to status 'ACTIVE'
export interface BackendCampaignOut {
  campaign_id: string;
  organization_name: string;
  campaign_name: string;
  purpose: string;
  purpose_code: PurposeCode;
  target_amount: string;
  amount_raised: string;
  currency: 'INR';
  start_date: string;
  end_date: string;
  eligibility: 'ACCEPTING_DONATIONS';
}

export interface BackendCampaignPage {
  items: BackendCampaignOut[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}

// ─── Backend wire types: OrganizationCampaignOut (NGO private endpoint) ──────
// Mirrors backend schemas.py OrganizationCampaignOut exactly.
export interface BackendOrganizationCampaignOut {
  campaign_id: string;
  campaign_name: string;
  purpose?: string | null;
  purpose_code?: PurposeCode | null;
  target_amount?: string | null;
  amount_raised: string;
  currency: 'INR';
  start_date?: string | null;
  end_date?: string | null;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  campaign_status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'CANCELLED';
  submitted_at: string | null;
  review_reason: string | null;
}

export interface BackendOrganizationCampaignPage {
  items: BackendOrganizationCampaignOut[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}

// ─── Donation types ──────────────────────────────────────────────────────────

export type DonationPaymentOutcome = 'SUCCEEDED' | 'FAILED' | 'TIMEOUT';

// Frontend-internal payment attempt (used by sandbox mock store).
// Maps from BackendPaymentAttemptOut when in live mode.
export interface PaymentAttempt {
  attempt_id: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  created_at: string;
}

// Backend wire type for a single payment attempt.
// Mirrors schemas.py PaymentAttemptOut exactly.
export interface BackendPaymentAttemptOut {
  payment_attempt_id: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  requested_outcome: 'SUCCEEDED' | 'FAILED' | 'TIMEOUT' | null;
  started_at: string;
  completed_at: string | null;
}

// Frontend-internal Donation model (used throughout UI components and sandbox).
// Note: status 'CLEARED' is the sandbox equivalent of backend 'SUCCESSFUL'.
export interface Donation {
  donation_id: string;
  campaign_id: string;
  campaign_title?: string;
  amount: string;
  currency: 'INR';
  // Sandbox uses 'CLEARED'; live backend uses 'SUCCESSFUL'.
  // UI logic must check both. See mapBackendDonationToFrontend().
  status: 'PENDING' | 'CLEARED' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'UNKNOWN';
  receipt_number?: string | null;
  transaction_reference?: string | null;
  created_at: string;
  attempts?: PaymentAttempt[];
}

// Backend wire type for a donation response.
// Mirrors schemas.py DonationOut exactly.
export interface BackendDonationOut {
  donation_id: string;
  campaign_id: string;
  amount: string;
  currency: 'INR';
  payment_status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  created_at: string;
  transaction_reference: string | null;
  receipt_number: string | null;
  payment_attempts: BackendPaymentAttemptOut[];
}

// ─── Donation creation wire types ────────────────────────────────────────────

// Frontend form fields (held in UI component state; never sent to the live API directly).
// Used by the sandbox mock store which has relaxed validation.
export interface CreateDonationRequest {
  campaign_id: string;
  amount: string;
  currency: 'INR';
  donor_type: 'GUEST' | 'REGISTERED';
  donor_name: string;
  donor_email: string;
  pan_number?: string;
  address?: string;
}

// Backend wire body for POST /api/v1/donations.
// Mirrors schemas.py CreateDonationRequest + DonorInput exactly.
// extra="forbid" — no additional fields are permitted.
export interface BackendDonorInput {
  display_name: string;
  email?: string | null;
  phone?: string | null;
}

export interface BackendCreateDonationRequest {
  campaign_id: string;
  amount: string;
  currency: 'INR';
  donor: BackendDonorInput | null;
}

export interface SimulatedPaymentRequest {
  outcome: DonationPaymentOutcome;
}

// ─── NGO Campaign Draft types ────────────────────────────────────────────────

// Frontend form fields for creating a campaign draft (UI state).
// Incomplete drafts require only title; other fields are optional until submission.
export interface CampaignDraftInput {
  title: string;
  purpose_code?: PurposeCode;
  description?: string;
  target_amount?: string;
  start_date?: string;
  end_date?: string;
}

// Backend wire body for POST /api/v1/organizations/{id}/campaigns.
// Mirrors schemas.py CampaignDraftInput exactly (extra="forbid").
export interface BackendCampaignDraftInput {
  campaign_name: string;
  purpose?: string | null;
  purpose_code?: PurposeCode | null;
  target_amount?: string | null;
  currency?: 'INR';
  start_date?: string | null;
  end_date?: string | null;
}

// Backend response from draft creation and campaign submission.
// Mirrors schemas.py WorkflowResult exactly.
export interface WorkflowResult {
  resource_id: string;
  status: string;
}

// ─── Reviewer types ──────────────────────────────────────────────────────────

// Frontend-internal reviewer queue item (used in sandbox mock and UI components).
export interface ReviewCampaignItem {
  campaign_id: string;
  organization_id: string;
  organization_name: string;
  title: string;
  purpose_code: PurposeCode;
  target_amount: string;
  submitted_at: string;
  description: string;
  status: 'SUBMITTED';
  compliance_flags?: {
    fcra_valid: boolean;
    budget_breakdown_attached: boolean;
    purpose_eligible: boolean;
    beneficiary_linked: boolean;
  };
}

// Backend wire type for a single item in the reviewer queue.
// Mirrors schemas.py ReviewCampaignOut (extends OrganizationCampaignOut).
export interface BackendReviewCampaignOut {
  campaign_id: string;
  organization_id: string;
  organization_name: string;
  campaign_name: string;
  purpose: string;
  purpose_code: PurposeCode;
  target_amount: string;
  amount_raised: string;
  currency: 'INR';
  start_date: string;
  end_date: string;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  campaign_status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'CANCELLED';
  submitted_at: string | null;
  review_reason: string | null;
}

// Backend wire type for GET /api/v1/review/campaigns.
// Mirrors schemas.py ReviewQueuePage exactly.
export interface BackendReviewQueuePage {
  items: BackendReviewCampaignOut[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}

// Reviewer decision request body.
// Mirrors schemas.py CampaignReviewInput (extra="forbid").
export interface ReviewDecisionRequest {
  decision: 'APPROVED' | 'REJECTED';
  reason: string;
}

// ─── Error envelope ──────────────────────────────────────────────────────────

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Organization Verification & Review types ───────────────────────────────────

export type OrganizationVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

export interface BackendOrganizationMembershipOut {
  organization_id: string;
  organization_name: string;
  roles: string[];
  verification_status: OrganizationVerificationStatus;
  review_reason: string | null;
}

export interface OrganizationListOut {
  items: BackendOrganizationMembershipOut[];
}

export interface OrganizationRegisterInput {
  organization_name: string;
  registration_ref: string;
  email?: string;
  phone?: string;
}

export interface OrganizationRegisterOut {
  organization_id: string;
  organization_name: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  applicant_access_token: string;
}

export interface OrganizationReviewInput {
  decision: 'VERIFIED' | 'REJECTED';
  reason: string;
}

export interface BackendOrganizationReviewItemOut {
  organization_id: string;
  organization_name: string;
  registration_ref?: string | null;
  email?: string | null;
  phone?: string | null;
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  review_reason?: string | null;
  created_at: string;
}

export interface BackendOrganizationReviewQueuePage {
  items: BackendOrganizationReviewItemOut[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}

// ─── Campaign Closure and IRB Oversight Types ────────────────────────────────
export type ClosureRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ClosureRequest {
  request_id: string;
  campaign_id: string;
  campaign_name?: string | null;
  organization_id: string;
  organization_name?: string | null;
  requested_by: string;
  request_reason: string;
  status: ClosureRequestStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_reason?: string | null;
  created_at: string;
}

export interface ClosureRequestPage {
  items: ClosureRequest[];
}

export interface IrbCampaignOversightItem {
  campaign_id: string;
  organization_id: string;
  organization_name: string;
  campaign_name: string;
  purpose_code: string;
  target_amount: string | null;
  amount_raised: string;
  start_date: string | null;
  end_date: string | null;
  approval_status: string;
  campaign_status: string;
  pending_closure_request: boolean;
  created_at: string;
}

export interface IrbCampaignOversightPage {
  items: IrbCampaignOversightItem[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}
