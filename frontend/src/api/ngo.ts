import { request } from './client';
import {
  Campaign,
  CampaignDraftInput,
  BackendCampaignDraftInput,
  BackendOrganizationCampaignOut,
  BackendOrganizationCampaignPage,
  WorkflowResult,
  OrganizationRegisterInput,
  OrganizationRegisterOut,
  BackendOrganizationMembershipOut,
  OrganizationListOut,
  ClosureRequest,
  ClosureRequestPage,
} from '../types/api';
import { mockStore } from './mockService';

/**
 * Maps a BackendOrganizationCampaignOut (private NGO endpoint) to the
 * frontend-internal Campaign model.
 * Gracefully handles optional fields for incomplete drafts.
 */
export function mapBackendOrgCampaignToFrontend(
  dto: BackendOrganizationCampaignOut,
  organizationId: string,
  organizationName?: string
): Campaign {
  let status: Campaign['status'];
  if (dto.campaign_status === 'CLOSED') {
    status = 'CLOSED';
  } else if (dto.approval_status === 'SUSPENDED') {
    status = 'SUSPENDED';
  } else if (dto.campaign_status === 'PAUSED') {
    status = 'PAUSED';
  } else if (dto.approval_status === 'REJECTED') {
    status = 'REJECTED';
  } else if (dto.approval_status === 'APPROVED' && dto.campaign_status === 'ACTIVE') {
    status = 'ACTIVE';
  } else if (dto.approval_status === 'APPROVED') {
    status = 'APPROVED';
  } else if (dto.approval_status === 'PENDING' && (dto.submitted_at || dto.campaign_status !== 'DRAFT')) {
    status = 'SUBMITTED';
  } else {
    status = 'DRAFT';
  }

  return {
    campaign_id: dto.campaign_id,
    organization_id: organizationId,
    organization_name: organizationName ?? '',
    title: dto.campaign_name,
    purpose_code: dto.purpose_code ?? 'GENERAL',
    description: dto.purpose ?? '',
    target_amount: dto.target_amount ?? '0.00',
    amount_raised: dto.amount_raised ?? '0.00',
    currency: dto.currency ?? 'INR',
    start_date: dto.start_date ?? '',
    end_date: dto.end_date ?? '',
    status,
  };
}

/**
 * Builds the backend wire body for POST /api/v1/organizations/{id}/campaigns
 * from the frontend CampaignDraftInput form fields.
 */
function buildBackendDraftBody(input: CampaignDraftInput): BackendCampaignDraftInput {
  return {
    campaign_name: input.title,
    purpose: input.description?.trim() ? input.description.trim() : null,
    purpose_code: input.purpose_code || null,
    target_amount: input.target_amount ? parseFloat(input.target_amount).toFixed(2) : null,
    currency: 'INR',
    start_date: input.start_date || null,
    end_date: input.end_date || null,
  };
}

/**
 * Register a new organization.
 */
export async function registerOrganization(
  input: OrganizationRegisterInput,
  isSandbox = true
): Promise<OrganizationRegisterOut> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.registerOrganization(input);
  }

  return request<OrganizationRegisterOut>('/api/v1/organizations/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Fetch authenticated actor's organizations.
 */
export async function fetchMyOrganizations(
  isSandbox = true,
  token?: string
): Promise<BackendOrganizationMembershipOut[]> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    if (token) {
      const org = mockStore.getOrganizationByToken(token);
      if (org) {
        return [
          {
            organization_id: org.organization_id,
            organization_name: org.organization_name,
            roles: ['CAMPAIGN_EDITOR'],
            verification_status: org.verification_status,
            review_reason: org.review_reason,
          },
        ];
      }
    }
    const defaultOrg = mockStore.getOrganization('1');
    return [
      {
        organization_id: defaultOrg?.organization_id || '1',
        organization_name: defaultOrg?.organization_name || 'Bal Vikas Trust',
        roles: ['CAMPAIGN_EDITOR'],
        verification_status: defaultOrg?.verification_status || 'VERIFIED',
        review_reason: defaultOrg?.review_reason || null,
      },
    ];
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await request<OrganizationListOut>('/api/v1/me/organizations', { headers });
  return res.items;
}

/**
 * Creates a new campaign draft for an organization (supports incomplete drafts).
 */
export async function createCampaignDraft(
  organizationId: string,
  input: CampaignDraftInput,
  isSandbox = true,
  token?: string
): Promise<Campaign | WorkflowResult> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.createCampaignDraft(input, organizationId);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const wireBody = buildBackendDraftBody(input);
  return request<WorkflowResult>(`/api/v1/organizations/${organizationId}/campaigns`, {
    method: 'POST',
    headers,
    body: JSON.stringify(wireBody),
  });
}

/**
 * Updates an existing campaign draft.
 */
export async function updateCampaignDraft(
  campaignId: string,
  input: Partial<CampaignDraftInput>,
  isSandbox = true,
  token?: string
): Promise<Campaign | WorkflowResult> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.updateCampaignDraft(campaignId, input);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const wireBody: Record<string, any> = {};
  if (input.title !== undefined) wireBody.campaign_name = input.title;
  if (input.description !== undefined) wireBody.purpose = input.description;
  if (input.purpose_code !== undefined) wireBody.purpose_code = input.purpose_code;
  if (input.target_amount !== undefined) wireBody.target_amount = parseFloat(input.target_amount).toFixed(2);
  if (input.start_date !== undefined) wireBody.start_date = input.start_date;
  if (input.end_date !== undefined) wireBody.end_date = input.end_date;

  return request<WorkflowResult>(`/api/v1/campaigns/${campaignId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(wireBody),
  });
}

/**
 * Fetches the paginated list of campaigns owned by an organization.
 */
export async function fetchOrganizationCampaigns(
  organizationId: string,
  isSandbox = true,
  token?: string,
  limit = 20,
  offset = 0
): Promise<Campaign[]> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    const page = mockStore.getCampaigns({ limit, offset });
    return page.items.filter((c) => c.organization_id === organizationId || organizationId === '1');
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const backendPage = await request<BackendOrganizationCampaignPage>(
    `/api/v1/organizations/${organizationId}/campaigns?${params.toString()}`,
    { headers }
  );

  return backendPage.items.map((dto) =>
    mapBackendOrgCampaignToFrontend(dto, organizationId)
  );
}

/**
 * Submits a campaign draft for review.
 */
export async function submitCampaignForReview(
  campaignId: string,
  isSandbox = true,
  token?: string
): Promise<Campaign | WorkflowResult> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.submitCampaign(campaignId);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return request<WorkflowResult>(`/api/v1/campaigns/${campaignId}/submission`, {
    method: 'POST',
    headers,
  });
}

/**
 * Submits an organization closure request for an active or paused campaign.
 * Backend endpoint: POST /api/v1/campaigns/{campaign_id}/closure-request
 */
export async function requestCampaignClosure(
  campaignId: string,
  reason: string,
  isSandbox = true,
  token?: string
): Promise<WorkflowResult> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.requestCampaignClosure(campaignId, reason);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return request<WorkflowResult>(`/api/v1/campaigns/${campaignId}/closure-request`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason }),
  });
}

/**
 * Fetches closure requests submitted for an organization's campaigns.
 * Backend endpoint: GET /api/v1/organizations/{organization_id}/closure-requests
 */
export async function fetchOrganizationClosureRequests(
  organizationId: string,
  isSandbox = true,
  token?: string
): Promise<ClosureRequest[]> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    return mockStore.getClosureRequests(organizationId);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await request<ClosureRequestPage>(
    `/api/v1/organizations/${organizationId}/closure-requests`,
    { headers }
  );
  return res.items;
}
