import React from 'react';
import { Campaign } from '../../types/api';
import { getCampaignImageUrl, getCampaignImageAlt } from '../../utils/campaignImagery';

interface CampaignCardProps {
  campaign: Campaign;
  onDonate: (campaign: Campaign) => void;
  onViewDetails: (campaign: Campaign) => void;
}

export const CampaignCard: React.FC<CampaignCardProps> = ({
  campaign,
  onDonate,
  onViewDetails,
}) => {
  const raised = parseFloat(campaign.amount_raised) || 0;
  const target = parseFloat(campaign.target_amount) || 1;
  const percentage = Math.min(100, Math.round((raised / target) * 100));

  const getCategoryBadgeClass = (code: string) => {
    switch (code) {
      case 'EDUCATION':
        return 'bg-primary-container text-white';
      case 'FOOD':
        return 'bg-secondary text-white';
      case 'HEALTH':
        return 'bg-tertiary-container text-white';
      case 'SHELTER':
        return 'bg-secondary-container text-on-secondary-container font-bold';
      default:
        return 'bg-surface-container-high text-on-surface';
    }
  };

  return (
    <div className="flex flex-col rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
      {/* Card Image */}
      <div className="relative h-48 w-full overflow-hidden bg-surface-container">
        <img
          src={getCampaignImageUrl(campaign)}
          alt={getCampaignImageAlt(campaign)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span className={`px-2.5 py-0.5 rounded-full font-label-sm text-label-sm uppercase tracking-wider ${getCategoryBadgeClass(campaign.purpose_code)}`}>
            {campaign.purpose_code}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-col flex-1 p-space-md justify-between gap-space-md">
        <div>
          {/* Org Header */}
          <div className="flex items-center gap-1.5 mb-2 text-on-surface-variant font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-xs text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              verified
            </span>
            <span className="font-semibold text-primary truncate">{campaign.organization_name}</span>
            {campaign.location && (
              <>
                <span className="text-outline">•</span>
                <span className="truncate">{campaign.location}</span>
              </>
            )}
          </div>

          {/* Title */}
          <h3
            onClick={() => onViewDetails(campaign)}
            className="font-headline-sm text-headline-sm text-on-surface font-bold line-clamp-2 hover:text-primary transition-colors cursor-pointer"
          >
            {campaign.title}
          </h3>

          {/* Description */}
          <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-1.5">
            {campaign.description}
          </p>
        </div>

        <div>
          {/* Progress Metrics */}
          <div className="mb-space-sm">
            <div className="flex items-center justify-between font-label-sm text-label-sm mb-1">
              <span className="font-bold text-on-surface">
                ₹{raised.toLocaleString('en-IN')}{' '}
                <span className="text-outline font-normal">raised</span>
              </span>
              <span className="text-outline">
                {percentage}% of ₹{target.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
              <div
                className="h-full bg-secondary-container rounded-full transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-on-surface-variant mt-1.5">
              <span>{campaign.days_left ?? 15} days left</span>
              <span>{campaign.mock_backers ?? 120} supporters</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/30">
            <button
              type="button"
              onClick={() => onDonate(campaign)}
              className="h-10 px-4 rounded-lg bg-secondary-container hover:bg-secondary text-white font-label-sm text-label-sm font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-base">volunteer_activism</span>
              Donate
            </button>
            <button
              type="button"
              onClick={() => onViewDetails(campaign)}
              className="h-10 px-4 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              Details
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
