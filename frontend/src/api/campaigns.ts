import { request } from './client';
import {
  Campaign,
  CampaignPage,
  BackendCampaignOut,
  BackendCampaignPage,
  PurposeCode,
  CampaignSort,
} from '../types/api';
import { mockStore } from './mockService';

export interface CampaignFilterOptions {
  limit?: number;
  offset?: number;
  search?: string;
  purpose_code?: PurposeCode;
  sort?: CampaignSort;
}

/**
 * Maps a single BackendCampaignOut (public API wire response) to the
 * frontend-internal Campaign model. This is the authoritative translation
 * layer for Fix 2.1 – every field mapping is intentional and documented.
 *
 * Field mapping (backend → frontend):
 *   campaign_name → title
 *   purpose       → description
 *   eligibility   → status ('ACCEPTING_DONATIONS' maps to 'ACTIVE')
 *   organization_id is not present in CampaignOut; set to empty string
 *   (only present in OrganizationCampaignOut via private NGO endpoint).
 */
export function mapBackendCampaignToFrontend(dto: BackendCampaignOut): Campaign {
  return {
    campaign_id: dto.campaign_id,
    organization_id: '',          // Not exposed on public CampaignOut endpoint
    organization_name: dto.organization_name,
    title: dto.campaign_name,
    purpose_code: dto.purpose_code,
    description: dto.purpose,
    target_amount: dto.target_amount,
    amount_raised: dto.amount_raised,
    currency: dto.currency,
    start_date: dto.start_date,
    end_date: dto.end_date,
    // Deliberate presentation mapping: the public_campaign_discovery view
    // (database/schema.sql:469-471) filters rows to WHERE approval_status='APPROVED'
    // AND campaign_status='ACTIVE' AND campaign_accepts_donations(...).
    // 'eligibility' is a hardcoded literal 'ACCEPTING_DONATIONS'::TEXT in the view —
    // it carries no independent lifecycle state. Every row in this response is
    // definitionally APPROVED+ACTIVE, so mapping to 'ACTIVE' is correct.
    // The frontend 'status' field is a presentation convenience for UI components;
    // it does NOT reflect the full lifecycle (DRAFT/SUBMITTED/PAUSED/CLOSED/CANCELLED)
    // which is only available via the private NGO endpoint (OrganizationCampaignOut).
    status: 'ACTIVE',
    // Optional display fields not present on public API endpoint; resolved dynamically by UI
    image_url: undefined,
    location: undefined,
    days_left: undefined,
    mock_backers: undefined,
  };
}

/**
 * Fetches the paginated list of public eligible campaigns.
 *
 * Sandbox mode: returns mock store data (already in Campaign shape).
 * Live mode: fetches BackendCampaignPage from the API and adapts each item.
 */
export async function fetchCampaigns(
  options: CampaignFilterOptions = {},
  isSandbox = true
): Promise<CampaignPage> {
  if (isSandbox) {
    // Artificial small delay for realistic loading feel
    await new Promise((r) => setTimeout(r, 60));
    return mockStore.getCampaigns(options);
  }

  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  if (options.purpose_code) params.set('purpose_code', options.purpose_code);
  if (options.search && options.search.trim()) params.set('search', options.search.trim());
  if (options.sort) params.set('sort', options.sort);

  const query = params.toString() ? `?${params.toString()}` : '';
  const backendPage = await request<BackendCampaignPage>(`/api/v1/campaigns${query}`);

  // Adapt each wire item to the frontend model
  return {
    items: backendPage.items.map(mapBackendCampaignToFrontend),
    limit: backendPage.limit,
    offset: backendPage.offset,
    has_more: backendPage.has_more,
    next_offset: backendPage.next_offset,
  };
}

/**
 * Fetches a single campaign by ID.
 *
 * Sandbox mode: returns mock store item directly.
 * Live mode: fetches BackendCampaignOut and adapts it.
 */
export async function fetchCampaignById(
  id: string,
  isSandbox = true
): Promise<Campaign> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    const campaign = mockStore.getCampaign(id);
    if (!campaign) {
      throw new Error(`Campaign with ID ${id} not found.`);
    }
    return campaign;
  }

  const backendDto = await request<BackendCampaignOut>(`/api/v1/campaigns/${id}`);
  return mapBackendCampaignToFrontend(backendDto);
}
