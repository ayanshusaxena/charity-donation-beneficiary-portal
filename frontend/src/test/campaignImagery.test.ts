import { describe, it, expect } from 'vitest';
import {
  resolveCampaignImage,
  getCampaignImageUrl,
  getCampaignImageAlt,
  DEMO_CAMPAIGN_IMAGES,
  PURPOSE_FALLBACK_IMAGES,
  DEFAULT_FALLBACK_IMAGE,
} from '../utils/campaignImagery';
import { Campaign } from '../types/api';

describe('Campaign Imagery Resolution', () => {
  it('deterministically matches STEM demo campaign to high-resolution classroom photography', () => {
    const res = resolveCampaignImage('STEM Lab Kits for First-Generation Girl Scholars', 'EDUCATION');
    expect(res.url).toBe(DEMO_CAMPAIGN_IMAGES.stem.url);
    expect(res.alt).toBe(DEMO_CAMPAIGN_IMAGES.stem.alt);
  });

  it('deterministically matches Nutrition demo campaign to child midday meals photography', () => {
    const res = resolveCampaignImage('Nutritional Midday Meals for 1,200 Underprivileged Children', 'FOOD');
    expect(res.url).toBe(DEMO_CAMPAIGN_IMAGES.nutrition.url);
    expect(res.alt).toBe(DEMO_CAMPAIGN_IMAGES.nutrition.alt);
  });

  it('deterministically matches Health demo campaign to rural diagnostic photography', () => {
    const res = resolveCampaignImage('Emergency Mobile Diagnostic Unit for Rural PHCs', 'HEALTH');
    expect(res.url).toBe(DEMO_CAMPAIGN_IMAGES.health.url);
    expect(res.alt).toBe(DEMO_CAMPAIGN_IMAGES.health.alt);
  });

  it('deterministically matches Shelter demo campaign to flood relief shelters photography', () => {
    const res = resolveCampaignImage('Monsoon Weatherproof Shelters for Displaced Families', 'SHELTER');
    expect(res.url).toBe(DEMO_CAMPAIGN_IMAGES.shelter.url);
    expect(res.alt).toBe(DEMO_CAMPAIGN_IMAGES.shelter.alt);
  });

  it('deterministically matches Water demo campaign to bio-sand water filters photography', () => {
    const res = resolveCampaignImage('Community Bio-Sand Water Filters for Tribal Hamlets', 'GENERAL');
    expect(res.url).toBe(DEMO_CAMPAIGN_IMAGES.water.url);
    expect(res.alt).toBe(DEMO_CAMPAIGN_IMAGES.water.alt);
  });

  it('deterministically matches Solar infrastructure campaigns', () => {
    const res = resolveCampaignImage('Solar Cold-Chain Storage for Vaccine Preservation', 'HEALTH');
    expect(res.url).toBe(DEMO_CAMPAIGN_IMAGES.health.url); // matched health/cold-chain
  });

  it('provides truthful category-based fallback for user-created campaigns without demo art', () => {
    const res = resolveCampaignImage('Tribal Digital Learning Hub (Demo Draft)', 'EDUCATION');
    expect(res.url).toBe(PURPOSE_FALLBACK_IMAGES.EDUCATION.url);
    expect(res.alt).toBe('DonateKaro verified educational development initiative');
  });

  it('provides default fallback for unspecified or unknown purpose code', () => {
    const res = resolveCampaignImage('Random Cause Title', undefined);
    expect(res.url).toBe(DEFAULT_FALLBACK_IMAGE.url);
    expect(res.alt).toBe(DEFAULT_FALLBACK_IMAGE.alt);
  });

  it('preserves custom image URL when explicitly provided', () => {
    const customUrl = 'https://example.org/custom-campaign-banner.jpg';
    const res = resolveCampaignImage('Custom Fundraiser', 'GENERAL', customUrl);
    expect(res.url).toBe(customUrl);
    expect(res.alt).toContain('Custom Fundraiser');
  });

  it('getCampaignImageUrl and getCampaignImageAlt helper functions work on Campaign object', () => {
    const mockCampaign: Campaign = {
      campaign_id: '99',
      organization_id: 'org-1',
      organization_name: 'Bal Vikas Trust',
      title: 'STEM Lab Kits for First-Generation Girl Scholars',
      purpose_code: 'EDUCATION',
      description: 'Test description',
      target_amount: '10000.00',
      amount_raised: '5000.00',
      currency: 'INR',
      start_date: '2026-10-01',
      end_date: '2026-12-31',
      status: 'ACTIVE',
    };

    expect(getCampaignImageUrl(mockCampaign)).toBe(DEMO_CAMPAIGN_IMAGES.stem.url);
    expect(getCampaignImageAlt(mockCampaign)).toBe(DEMO_CAMPAIGN_IMAGES.stem.alt);
  });
});
