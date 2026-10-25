import { request } from './client';
import {
  ReviewCampaignItem,
  BackendReviewQueuePage,
  BackendReviewCampaignOut,
  ReviewDecisionRequest,
  ClosureRequest,
  ClosureRequestPage,
  IrbCampaignOversightItem,
  IrbCampaignOversightPage,
} from '../types/api';
import { mockStore } from './mockService';

/**
 * Maps a single BackendReviewCampaignOut to the frontend-internal ReviewCampaignItem.
 *
 * Field mapping (backend → frontend):
 *   campaign_name → title
 *   purpose       → description
 *   submitted_at  → submitted_at (may be null for un-submitted items; default to empty)
 *   approval_status/campaign_status not surfaced in ReviewCampaignItem; status fixed to 'SUBMITTED'
 */
function mapBackendReviewItemToFrontend(dto: BackendReviewCampaignOut): ReviewCampaignItem {
  return {
    campaign_id: dto.campaign_id,
    organization_id: dto.organization_id,
    organization_name: dto.organization_name,
    title: dto.campaign_name,
    purpose_code: dto.purpose_code,
    target_amount: dto.target_amount,
    submitted_at: dto.submitted_at ?? '',
    description: dto.purpose,
    status: 'SUBMITTED',
    // compliance_flags not present in backend ReviewCampaignOut; omit.
  };
}

/**
 * Fetches the campaign review queue.
 *
 * Sandbox mode: returns mock store data (already in ReviewCampaignItem[] shape).
 * Live mode: fetches BackendReviewQueuePage envelope and extracts + adapts items.
 *   Fix 2.4: backend returns { items, limit, offset, has_more, next_offset } — not a bare array.
 */
export async function fetchReviewQueue(
  isSandbox = true,
  token?: string
): Promise<ReviewCampaignItem[]> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    return mockStore.getReviewQueue();
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Fix 2.4: parse ReviewQueuePage envelope and extract items array.
  const backendPage = await request<BackendReviewQueuePage>('/api/v1/review/campaigns', {
    headers,
  });

  return backendPage.items.map(mapBackendReviewItemToFrontend);
}

/**
 * Submits a reviewer decision (APPROVED or REJECTED) for a campaign.
 *
 * The backend endpoint is POST /api/v1/campaigns/{id}/review
 * with body: CampaignReviewInput { decision, reason } (extra="forbid").
 *
 * Note: Backend contract (schemas.py CampaignReviewInput) uses `reason` field,
 * matching ReviewDecisionRequest. No mapping needed for the request body.
 */
export async function submitCampaignReview(
  campaignId: string,
  req: ReviewDecisionRequest,
  isSandbox = true,
  token?: string
): Promise<{ campaign_id: string; status: string; reason: string }> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.reviewCampaign(campaignId, req);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return request<{ campaign_id: string; status: string; reason: string }>(
    `/api/v1/campaigns/${campaignId}/review`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    }
  );
}

import {
  BackendOrganizationReviewItemOut,
  BackendOrganizationReviewQueuePage,
  OrganizationReviewInput,
} from '../types/api';

/**
 * Fetches organization verification queue.
 */
export async function fetchOrgReviewQueue(
  isSandbox = true,
  token?: string
): Promise<BackendOrganizationReviewItemOut[]> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    return mockStore.getOrganizationReviewQueue();
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const backendPage = await request<BackendOrganizationReviewQueuePage>('/api/v1/review/organizations', {
    headers,
  });
  return backendPage.items;
}

/**
 * Submits an organization verification decision (VERIFIED or REJECTED).
 */
export async function submitOrgReview(
  organizationId: string,
  req: OrganizationReviewInput,
  isSandbox = true,
  token?: string
): Promise<{ resource_id: string; status: string }> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    const res = mockStore.reviewOrganization(organizationId, req.decision, req.reason);
    return { resource_id: res.organization_id, status: res.status };
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return request<{ resource_id: string; status: string }>(
    `/api/v1/review/organizations/${organizationId}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    }
  );
}

/**
 * Activates an approved campaign that is within its active date window.
 * Backend endpoint: POST /api/v1/campaigns/{id}/activation
 */
export async function activateCampaign(
  campaignId: string,
  isSandbox = true,
  token?: string
): Promise<{ resource_id: string; status: string }> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    return { resource_id: campaignId, status: 'ACTIVE' };
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return request<{ resource_id: string; status: string }>(
    `/api/v1/campaigns/${campaignId}/activation`,
    {
      method: 'POST',
      headers,
    }
  );
}

/**
 * Fetches all campaigns for IRB Campaign Oversight across lifecycle states.
 */
export async function fetchIrbAllCampaigns(
  statusFilter = 'ALL',
  search = '',
  limit = 50,
  offset = 0,
  isSandbox = true,
  token?: string
): Promise<IrbCampaignOversightItem[]> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    return mockStore.getIrbAllCampaigns(statusFilter, search);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const params = new URLSearchParams({
    status_filter: statusFilter,
    limit: String(limit),
    offset: String(offset),
  });
  if (search.trim()) params.append('search', search.trim());

  const page = await request<IrbCampaignOversightPage>(
    `/api/v1/review/all-campaigns?${params.toString()}`,
    { headers }
  );
  return page.items;
}

/**
 * Fetches campaign closure requests submitted by NGOs for IRB review.
 */
export async function fetchClosureRequests(
  isSandbox = true,
  token?: string
): Promise<ClosureRequest[]> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    return mockStore.getClosureRequests();
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await request<ClosureRequestPage>('/api/v1/review/closure-requests', { headers });
  return res.items;
}

/**
 * Decides an NGO campaign closure request (APPROVED or REJECTED).
 */
export async function reviewClosureRequest(
  requestId: string,
  decision: 'APPROVED' | 'REJECTED',
  reason: string,
  isSandbox = true,
  token?: string
): Promise<{ resource_id: string; status: string }> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.reviewClosureRequest(requestId, decision, reason);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return request<{ resource_id: string; status: string }>(
    `/api/v1/review/closure-requests/${requestId}/decision`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ decision, reason }),
    }
  );
}

/**
 * Temporarily suspends an active campaign.
 */
export async function suspendCampaign(
  campaignId: string,
  reason: string,
  isSandbox = true,
  token?: string
): Promise<{ resource_id: string; status: string }> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.suspendCampaign(campaignId, reason);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return request<{ resource_id: string; status: string }>(
    `/api/v1/review/campaigns/${campaignId}/suspend`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason }),
    }
  );
}

/**
 * Reopens a suspended campaign within its active date window.
 */
export async function reopenCampaign(
  campaignId: string,
  reason: string,
  isSandbox = true,
  token?: string
): Promise<{ resource_id: string; status: string }> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.reopenCampaign(campaignId, reason);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return request<{ resource_id: string; status: string }>(
    `/api/v1/review/campaigns/${campaignId}/reopen`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason }),
    }
  );
}

/**
 * Permanently closes a campaign.
 */
export async function closeCampaign(
  campaignId: string,
  reason: string,
  isSandbox = true,
  token?: string
): Promise<{ resource_id: string; status: string }> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.closeCampaign(campaignId, reason);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return request<{ resource_id: string; status: string }>(
    `/api/v1/review/campaigns/${campaignId}/close`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason }),
    }
  );
}
