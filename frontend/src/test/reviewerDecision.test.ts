import { describe, it, expect } from 'vitest';
import { fetchReviewQueue, submitCampaignReview } from '../api/reviewer';

describe('Reviewer Workspace & Contract State Transitions', () => {
  it('loads the pending review queue', async () => {
    const queue = await fetchReviewQueue(true);
    expect(Array.isArray(queue)).toBe(true);
    expect(queue.length).toBeGreaterThan(0);
  });

  it('approves a campaign: transitions status to APPROVED', async () => {
    const res = await submitCampaignReview(
      '201',
      {
        decision: 'APPROVED',
        reason: 'PBL compliance and budget breakdown confirmed.',
      },
      true
    );

    expect(res.campaign_id).toBe('201');
    expect(res.status).toBe('APPROVED');
  });

  it('rejects a campaign: returns status to DRAFT per contract', async () => {
    const res = await submitCampaignReview(
      '202',
      {
        decision: 'REJECTED',
        reason: 'Itemized vendor quote required for dialysis consumables.',
      },
      true
    );

    expect(res.campaign_id).toBe('202');
    expect(res.status).toBe('DRAFT');
  });
});
