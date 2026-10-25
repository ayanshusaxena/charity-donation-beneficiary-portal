import React, { useState, useEffect } from 'react';
import { Campaign } from '../../types/api';
import { fetchCampaignById } from '../../api/campaigns';
import { useSandbox } from '../../context/SandboxContext';
import { getCampaignImageUrl, getCampaignImageAlt } from '../../utils/campaignImagery';

interface CampaignDetailPageProps {
  campaign: Campaign;
  campaignId?: string;
  onBack: () => void;
  onDonate: (campaign: Campaign) => void;
}

export const CampaignDetailPage: React.FC<CampaignDetailPageProps> = ({
  campaign: initialCampaign,
  campaignId,
  onBack,
  onDonate,
}) => {
  const { isSandbox } = useSandbox();
  const [campaign, setCampaign] = useState<Campaign>(initialCampaign);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const targetId = campaignId || initialCampaign.campaign_id;

  const loadAuthoritativeCampaign = () => {
    if (!targetId) return;
    setLoading(true);
    setError(null);
    fetchCampaignById(targetId, isSandbox)
      .then((authoritative) => {
        setCampaign({
          ...authoritative,
          // Fix 3.4: Preserve client-side presentation art if backend DTO omits image_url
          image_url: authoritative.image_url || initialCampaign.image_url,
          days_left: authoritative.days_left ?? initialCampaign.days_left,
          mock_backers: authoritative.mock_backers ?? initialCampaign.mock_backers,
          location: authoritative.location || initialCampaign.location,
        });
      })
      .catch((err: any) => {
        setError(err?.message || `Failed to fetch authoritative details for campaign #${targetId}`);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAuthoritativeCampaign();
  }, [targetId, isSandbox]);

  const raised = parseFloat(campaign.amount_raised) || 0;
  const target = parseFloat(campaign.target_amount) || 1;
  const percentage = Math.min(100, Math.round((raised / target) * 100));

  return (
    <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin py-8">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
          <button
            onClick={onBack}
            className="hover:text-primary transition-colors flex items-center gap-1 font-semibold"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Explore Campaigns
          </button>
          <span>/</span>
          <span className="text-on-surface font-bold truncate max-w-xs md:max-w-md">{campaign.title}</span>
        </div>
        {loading && (
          <span className="text-xs text-outline flex items-center gap-1 animate-pulse">
            <span className="material-symbols-outlined text-xs animate-spin">sync</span>
            Verifying backend state...
          </span>
        )}
      </div>

      {/* Authoritative load error alert */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-error-container/20 border border-error/30 text-on-surface flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error">cloud_off</span>
            <span>{error}</span>
          </div>
          <button
            onClick={loadAuthoritativeCampaign}
            className="px-3 py-1 rounded-lg bg-surface-container font-semibold hover:bg-surface-container-high text-xs transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Cols: Story & Media */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="rounded-2xl overflow-hidden shadow-sm border border-outline-variant/30 bg-surface-container-lowest">
            <img
              src={getCampaignImageUrl(campaign)}
              alt={getCampaignImageAlt(campaign)}
              className="w-full max-h-[440px] object-cover"
            />
            <div className="p-6 md:p-8 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-primary-container text-white font-label-sm text-label-sm font-bold uppercase tracking-wide">
                  {campaign.purpose_code}
                </span>
                <span className="px-3 py-1 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                    verified
                  </span>
                  {campaign.organization_name}
                </span>
                {campaign.location && (
                  <span className="px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">
                    {campaign.location}
                  </span>
                )}
              </div>

              <h1 className="font-headline-lg text-headline-lg text-primary font-bold">
                {campaign.title}
              </h1>

              <div className="border-t border-b border-outline-variant/30 py-4 my-2 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="font-metric-md text-metric-md text-primary font-bold">
                    ₹{raised.toLocaleString('en-IN')}
                  </div>
                  <div className="font-label-sm text-label-sm text-outline">Net Cleared Donations</div>
                </div>
                <div>
                  <div className="font-metric-md text-metric-md text-on-surface font-bold">
                    ₹{target.toLocaleString('en-IN')}
                  </div>
                  <div className="font-label-sm text-label-sm text-outline">Target Goal</div>
                </div>
                <div>
                  <div className="font-metric-md text-metric-md text-secondary font-bold">
                    {campaign.days_left ?? 12}
                  </div>
                  <div className="font-label-sm text-label-sm text-outline">Days Remaining</div>
                </div>
              </div>

              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold mt-2">
                Cause Context & Operational Objective
              </h2>
              <p className="font-body-md text-body-md text-on-surface leading-relaxed">
                {campaign.description}
              </p>

              {/* Purpose classification disclosure */}
              <div className="rounded-xl bg-surface-container p-4 mt-4 border border-outline-variant/40 flex items-start gap-3">
                <span className="material-symbols-outlined text-primary text-xl mt-0.5">account_balance</span>
                <div className="flex flex-col gap-1 text-sm">
                  <span className="font-bold text-primary">Database-Enforced Purpose Restriction:</span>
                  <span className="text-on-surface-variant">
                    Contributions to this campaign are recorded in PostgreSQL with strict classification <code className="px-1.5 py-0.5 rounded bg-surface-container-high font-mono text-xs">{campaign.purpose_code}</code>. Subsequent disbursements can only be initiated toward verified beneficiaries matching this purpose.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Cols: Sticky Donation Action */}
        <div className="lg:col-span-4 sticky top-28 flex flex-col gap-6">
          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-md border border-outline-variant/40 flex flex-col gap-5">
            <div>
              <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
                Support this Cause
              </span>
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold mt-1">
                Make a Simulated Contribution
              </h3>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant font-medium">Progress</span>
                <span className="font-bold text-primary">{percentage}% Complete</span>
              </div>
              <div className="w-full h-3 rounded-full bg-surface-container overflow-hidden">
                <div
                  className="h-full bg-secondary-container rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-low p-4 text-xs text-on-surface-variant flex flex-col gap-1.5 border border-outline-variant/30">
              <div className="flex items-center gap-1.5 font-semibold text-primary">
                <span className="material-symbols-outlined text-sm">lock</span>
                PBL Sandbox Security
              </div>
              <span>• No real monetary instruments collected</span>
              <span>• Idempotency-Key generated per submission</span>
              <span>• Verifiable settlement receipt issued upon clearing</span>
            </div>

            <button
              onClick={() => onDonate(campaign)}
              className="w-full py-3.5 px-4 rounded-xl bg-secondary-container hover:bg-secondary text-white font-label-md text-label-md font-bold transition-all shadow-md flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">volunteer_activism</span>
              Contribute (Simulated Sandbox)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
