import { describe, it, expect } from 'vitest';
import { fetchCampaigns, fetchCampaignById } from '../api/campaigns';

describe('Campaigns API & Mock Service Integration', () => {
  it('fetches default eligible campaigns list with pagination envelope', async () => {
    const result = await fetchCampaigns({ limit: 10, offset: 0 }, true);
    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(0);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('filters campaigns accurately by purpose_code (EDUCATION)', async () => {
    const result = await fetchCampaigns({ purpose_code: 'EDUCATION' }, true);
    expect(result.items.length).toBeGreaterThan(0);
    result.items.forEach((c) => {
      expect(c.purpose_code).toBe('EDUCATION');
    });
  });

  it('performs literal case-insensitive search over campaign title and org', async () => {
    const result = await fetchCampaigns({ search: 'Gyandeep' }, true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].organization_name).toBe('Gyandeep Foundation');
  });

  it('sorts campaigns ascending by target amount (target_asc)', async () => {
    const result = await fetchCampaigns({ sort: 'target_asc' }, true);
    for (let i = 0; i < result.items.length - 1; i++) {
      const current = parseFloat(result.items[i].target_amount);
      const next = parseFloat(result.items[i + 1].target_amount);
      expect(current).toBeLessThanOrEqual(next);
    }
  });

  it('fetches a single campaign by ID', async () => {
    const campaign = await fetchCampaignById('101', true);
    expect(campaign).toBeDefined();
    expect(campaign.campaign_id).toBe('101');
    expect(campaign.currency).toBe('INR');
  });
});
