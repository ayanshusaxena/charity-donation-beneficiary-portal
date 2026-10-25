import React from 'react';
import { PurposeCode, CampaignSort } from '../../types/api';

interface CauseFilterChipsProps {
  selectedPurpose?: PurposeCode;
  onSelectPurpose: (purpose?: PurposeCode) => void;
  selectedSort: CampaignSort;
  onSelectSort: (sort: CampaignSort) => void;
}

const CATEGORIES: { code?: PurposeCode; label: string; icon: string }[] = [
  { label: 'All Causes', icon: 'apps' },
  { code: 'EDUCATION', label: 'Education & STEM', icon: 'school' },
  { code: 'FOOD', label: 'Child Nutrition', icon: 'restaurant' },
  { code: 'HEALTH', label: 'Healthcare & PHCs', icon: 'medical_services' },
  { code: 'SHELTER', label: 'Shelter Relief', icon: 'home' },
  { code: 'GENERAL', label: 'Infrastructure', icon: 'water_drop' },
];

export const CauseFilterChips: React.FC<CauseFilterChipsProps> = ({
  selectedPurpose,
  onSelectPurpose,
  selectedSort,
  onSelectSort,
}) => {
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4 mb-6 border-b border-outline-variant/30">
      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedPurpose === cat.code;
          return (
            <button
              key={cat.label}
              onClick={() => onSelectPurpose(cat.code)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-primary text-white font-bold shadow-sm'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{cat.icon}</span>
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Sort Dropdown */}
      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
        <span className="font-label-sm text-label-sm text-outline">Sort by:</span>
        <select
          value={selectedSort}
          onChange={(e) => onSelectSort(e.target.value as CampaignSort)}
          className="h-9 px-3 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm border border-outline-variant/40 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="date">Latest Campaigns</option>
          <option value="target_asc">Funding Goal: Low to High</option>
          <option value="target_desc">Funding Goal: High to Low</option>
        </select>
      </div>
    </div>
  );
};
