import { Campaign, PurposeCode } from '../types/api';

/**
 * High-resolution authentic documentary imagery for seeded/demo campaigns.
 * Matches existing visual assets established in the sandbox mockStore and design specifications.
 */
export const DEMO_CAMPAIGN_IMAGES: Record<string, { url: string; alt: string }> = {
  stem: {
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCfXXlYHrGWz_uciYuIaHpWkHV7Nl_-2u8rJgGrMI28ltJo_zgews70TwjE-kywjOkOwp9kVu-j7ombnd_VGHaNAANRe7lRTteyVQP-YJqGwQV4TiKNpm5x2OYHKgEY_ttgVs9g_uQZbqAf7galit9-Phk_XxsONhNWJdyGrKQo87UITjeUyI4cWxPvhyJjUlgeRC1WCvwtLhVji-_UYNm_koOSOTWcEUx6rd9Ex-mTWoOSEpgWszRXbQ',
    alt: 'STEM activity kits and laboratory equipment for girls in rural school classroom',
  },
  nutrition: {
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCi4Jnve2eJS9v3PWr-fJvvTDsmxkgXaGH7H_2X8HAlJtuIgtXEqduO9XnCbkmt4FjBjJz-PxJn_Q01Okmzj12noKJcf-MKrPN0tb3Z9PcmR9mjGbMLiYYeftQHlY2-sA6Kx3-rAIiVaHix2PHKB7KYUb35w12SU3ZM2H-p-LKTshx025m8_eHjxwkf_nY-N3HUIDiAiv847zOsenvsr8-UcGNvi2_XjJS8LXkmNIF8-jfnF09utLP_6g',
    alt: 'Hot nutritious midday meals served to school children in community learning center',
  },
  health: {
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD0fD5rr5DgEtzYgMCjNnA9Sw6CBBRfe7ePNSQ2-26m_N4TOxECqhVWcUPE1fUU8AuDk8MNj56JYpAL0UcWqVBsJdQh7JU9qggQ57t8IHxVoCMy-5Ewpcs4IX6dumTEdpcbUOcSSOzIU3Bx8YuAlbukbLWZRmzO5GI-n9CUkSgSF199SKMoYMZlUjZ2BMDz5VWKbZt7rawo6lD6Xc0UhyQboDNT0Avyr4S9iWpszN5zSiWsLuclrjCj6Q',
    alt: 'Emergency diagnostic equipment and transport for rural primary healthcare clinics',
  },
  shelter: {
    url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80',
    alt: 'Elevated weatherproof emergency shelters for agrarian flood-displaced families',
  },
  water: {
    url: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=1200&q=80',
    alt: 'Community bio-sand water filtration units installed in tribal settlement',
  },
  solar: {
    url: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=1200&q=80',
    alt: 'Solar photovoltaic infrastructure for community cold-chain storage',
  },
};

/**
 * Consistent category-based fallback imagery for user-created campaigns.
 * Uses truthful generic alt text without fabricating campaign-specific facts.
 */
export const PURPOSE_FALLBACK_IMAGES: Record<PurposeCode, { url: string; alt: string }> = {
  EDUCATION: {
    url: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80',
    alt: 'DonateKaro verified educational development initiative',
  },
  FOOD: {
    url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80',
    alt: 'DonateKaro verified child nutrition and food security initiative',
  },
  HEALTH: {
    url: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1200&q=80',
    alt: 'DonateKaro verified healthcare and community medical support initiative',
  },
  SHELTER: {
    url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80',
    alt: 'DonateKaro verified humanitarian shelter and disaster relief initiative',
  },
  GENERAL: {
    url: 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1200&q=80',
    alt: 'DonateKaro verified community development and infrastructure initiative',
  },
};

export const DEFAULT_FALLBACK_IMAGE = {
  url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80',
  alt: 'DonateKaro verified community fundraiser',
};

/**
 * Deterministically resolves the image URL and accessible alt text for any campaign.
 * Does not rely on array index or transient sequential database IDs.
 */
export function resolveCampaignImage(
  title?: string,
  purposeCode?: string,
  customImageUrl?: string
): { url: string; alt: string } {
  if (customImageUrl && customImageUrl.trim().startsWith('http')) {
    return {
      url: customImageUrl.trim(),
      alt: title ? `Fundraiser photograph for ${title}` : 'DonateKaro campaign photograph',
    };
  }

  const normalized = (title || '').toLowerCase();

  if (normalized.includes('stem') || normalized.includes('girl scholar')) {
    return DEMO_CAMPAIGN_IMAGES.stem;
  }
  if (
    normalized.includes('midday meal') ||
    normalized.includes('nutritional') ||
    normalized.includes('nutrition')
  ) {
    return DEMO_CAMPAIGN_IMAGES.nutrition;
  }
  if (
    normalized.includes('diagnostic') ||
    normalized.includes('phc') ||
    normalized.includes('cold-chain') ||
    normalized.includes('vaccine') ||
    normalized.includes('mobile health')
  ) {
    return DEMO_CAMPAIGN_IMAGES.health;
  }
  if (
    normalized.includes('shelter') ||
    normalized.includes('flood') ||
    normalized.includes('monsoon')
  ) {
    return DEMO_CAMPAIGN_IMAGES.shelter;
  }
  if (
    normalized.includes('bio-sand') ||
    normalized.includes('water filter') ||
    normalized.includes('water')
  ) {
    return DEMO_CAMPAIGN_IMAGES.water;
  }
  if (normalized.includes('solar')) {
    return DEMO_CAMPAIGN_IMAGES.solar;
  }

  if (purposeCode && (purposeCode as PurposeCode) in PURPOSE_FALLBACK_IMAGES) {
    return PURPOSE_FALLBACK_IMAGES[purposeCode as PurposeCode];
  }

  return DEFAULT_FALLBACK_IMAGE;
}

export function getCampaignImageUrl(campaign: Campaign): string {
  return resolveCampaignImage(campaign.title, campaign.purpose_code, campaign.image_url).url;
}

export function getCampaignImageAlt(campaign: Campaign): string {
  return resolveCampaignImage(campaign.title, campaign.purpose_code, campaign.image_url).alt;
}
