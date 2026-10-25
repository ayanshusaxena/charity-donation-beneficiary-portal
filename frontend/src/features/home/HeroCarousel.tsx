import React, { useState, useEffect, useRef } from 'react';
import { Campaign } from '../../types/api';
import { getCampaignImageUrl } from '../../utils/campaignImagery';

interface HeroCarouselProps {
  onDonateClick: (campaign: Campaign) => void;
  onViewDetailsClick: (campaign: Campaign) => void;
  campaigns?: Campaign[];
}

interface SlideData {
  title: string;
  category: string;
  orgName: string;
  description: string;
  raised: number;
  target: number;
  daysLeft: number;
  mockBackers: number;
  imageUrl: string;
  campaignId: string;
}

const SLIDES: SlideData[] = [
  {
    campaignId: '101',
    title: 'STEM Lab Kits for First-Generation Girl Scholars',
    category: 'Education & STEM',
    orgName: 'Gyandeep Foundation',
    description:
      'Procuring interactive physics and robotics activity boxes for 450 middle school girls in remote parts of Western Ghats villages.',
    raised: 210000,
    target: 250000,
    daysLeft: 9,
    mockBackers: 289,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCfXXlYHrGWz_uciYuIaHpWkHV7Nl_-2u8rJgGrMI28ltJo_zgews70TwjE-kywjOkOwp9kVu-j7ombnd_VGHaNAANRe7lRTteyVQP-YJqGwQV4TiKNpm5x2OYHKgEY_ttgVs9g_uQZbqAf7galit9-Phk_XxsONhNWJdyGrKQo87UITjeUyI4cWxPvhyJjUlgeRC1WCvwtLhVji-_UYNm_koOSOTWcEUx6rd9Ex-mTWoOSEpgWszRXbQ',
  },
  {
    campaignId: '102',
    title: 'Nutritional Midday Meals for 1,200 Underprivileged Children',
    category: 'Child Nutrition',
    orgName: 'Annapurna Bal Seva',
    description:
      'Providing hot wholesome lentils, fresh vegetables, and fortified micro-nutrient snacks across 12 suburban community study centers.',
    raised: 295000,
    target: 380000,
    daysLeft: 14,
    mockBackers: 412,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCi4Jnve2eJS9v3PWr-fJvvTDsmxkgXaGH7H_2X8HAlJtuIgtXEqduO9XnCbkmt4FjBjJz-PxJn_Q01Okmzj12noKJcf-MKrPN0tb3Z9PcmR9mjGbMLiYYeftQHlY2-sA6Kx3-rAIiVaHix2PHKB7KYUb35w12SU3ZM2H-p-LKTshx025m8_eHjxwkf_nY-N3HUIDiAiv847zOsenvsr8-UcGNvi2_XjJS8LXkmNIF8-jfnF09utLP_6g',
  },
  {
    campaignId: '103',
    title: 'Emergency Mobile Diagnostic Unit for Rural PHCs',
    category: 'Rural Healthcare',
    orgName: 'Arogya Seva Mandir',
    description:
      'Supplying ECG monitors, hemoglobinometers, and cold-chain vaccine transports for 16 primary healthcare centers covering 24,000 residents.',
    raised: 180000,
    target: 450000,
    daysLeft: 21,
    mockBackers: 178,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD0fD5rr5DgEtzYgMCjNnA9Sw6CBBRfe7ePNSQ2-26m_N4TOxECqhVWcUPE1fUU8AuDk8MNj56JYpAL0UcWqVBsJdQh7JU9qggQ57t8IHxVoCMy-5Ewpcs4IX6dumTEdpcbUOcSSOzIU3Bx8YuAlbukbLWZRmzO5GI-n9CUkSgSF199SKMoYMZlUjZ2BMDz5VWKbZt7rawo6lD6Xc0UhyQboDNT0Avyr4S9iWpszN5zSiWsLuclrjCj6Q',
  },
  {
    campaignId: '104',
    title: 'Monsoon Weatherproof Shelters for Displaced Families',
    category: 'Shelter & Relief',
    orgName: 'Bal Vikas Trust',
    description:
      'Rapid deployment of elevated weatherproof shelters and bedding materials for flood-displaced agrarian families.',
    raised: 15000,
    target: 500000,
    daysLeft: 30,
    mockBackers: 94,
    imageUrl:
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80',
  },
  {
    campaignId: '105',
    title: 'Community Bio-Sand Water Filters for Tribal Hamlets',
    category: 'Clean Water',
    orgName: 'Annapurna Food Relief',
    description:
      'Constructing community-managed bio-sand water filtration units to eradicate water-borne diseases in remote settlements.',
    raised: 8000,
    target: 300000,
    daysLeft: 25,
    mockBackers: 62,
    imageUrl:
      'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=1200&q=80',
  },
  {
    campaignId: '106',
    title: 'Solar Cold-Chain Storage for Vaccine Preservation',
    category: 'Healthcare',
    orgName: 'Bal Vikas Trust',
    description:
      'Installing reliable solar-powered refrigeration units in off-grid clinics to maintain vaccines between 2 and 8 degrees Celsius.',
    raised: 35000,
    target: 320000,
    daysLeft: 42,
    mockBackers: 110,
    imageUrl:
      'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=1200&q=80',
  },
];

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  onDonateClick,
  onViewDetailsClick,
  campaigns,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const timerRef = useRef<number | null>(null);

  const asCampaign = (s: SlideData): Campaign => ({
    campaign_id: s.campaignId,
    organization_id: '1',
    organization_name: s.orgName,
    title: s.title,
    purpose_code: s.category.includes('Education') ? 'EDUCATION' : s.category.includes('Nutrition') ? 'FOOD' : 'HEALTH',
    description: s.description,
    target_amount: s.target.toFixed(2),
    amount_raised: s.raised.toFixed(2),
    currency: 'INR',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    status: 'ACTIVE',
    image_url: s.imageUrl,
    days_left: s.daysLeft,
    mock_backers: s.mockBackers,
  });

  // Fix 3.1: Bind carousel slides to authentic campaigns when provided.
  // Preserves high-resolution documentary photography while using real campaign IDs and data.
  const activeSlides: { slide: SlideData; campaign: Campaign }[] = React.useMemo(() => {
    if (!campaigns || campaigns.length === 0) {
      return SLIDES.map((s) => ({ slide: s, campaign: asCampaign(s) }));
    }

    return campaigns.slice(0, 8).map((camp, idx) => {
      const fallback = SLIDES[idx % SLIDES.length];
      const raisedNum = parseFloat(camp.amount_raised) || 0;
      const targetNum = parseFloat(camp.target_amount) || 1;

      const slideData: SlideData = {
        campaignId: camp.campaign_id,
        title: camp.title,
        category:
          camp.purpose_code === 'EDUCATION'
            ? 'Education & STEM'
            : camp.purpose_code === 'FOOD'
            ? 'Child Nutrition'
            : camp.purpose_code === 'HEALTH'
            ? 'Healthcare'
            : camp.purpose_code === 'SHELTER'
            ? 'Shelter & Relief'
            : 'General Cause',
        orgName: camp.organization_name || fallback.orgName,
        description: camp.description,
        raised: raisedNum,
        target: targetNum,
        daysLeft: camp.days_left ?? fallback.daysLeft,
        mockBackers: camp.mock_backers ?? fallback.mockBackers,
        imageUrl: getCampaignImageUrl(camp),
      };

      return {
        slide: slideData,
        campaign: {
          ...camp,
          image_url: getCampaignImageUrl(camp),
          days_left: camp.days_left ?? fallback.daysLeft,
          mock_backers: camp.mock_backers ?? fallback.mockBackers,
        },
      };
    });
  }, [campaigns]);

  const slideCount = activeSlides.length;

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isPaused = isHovered || isFocused || prefersReducedMotion;

  const startTimer = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isPaused && slideCount > 1) {
      timerRef.current = window.setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % slideCount);
      }, 5500);
    }
  }, [isPaused, slideCount]);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer]);

  const handlePrev = () => {
    setCurrentSlide((prev) => (prev - 1 + slideCount) % slideCount);
    startTimer();
  };

  const handleNext = () => {
    setCurrentSlide((prev) => (prev + 1) % slideCount);
    startTimer();
  };

  const handleGoTo = (index: number) => {
    setCurrentSlide(index);
    startTimer();
  };

  return (
    <section aria-label="Featured Capstone Causes Carousel" className="relative w-full overflow-hidden bg-surface-container-lowest">
      <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin pt-6 pb-12">
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsFocused(false);
            }
          }}
          className="relative w-full rounded-2xl overflow-hidden shadow-xl bg-inverse-surface text-inverse-on-surface group min-h-[480px] md:min-h-[540px] flex flex-col justify-end"
        >
          {/* Synchronized Cross-Fading Slides */}
          {activeSlides.map((item, idx) => {
            const isSlideActive = idx === (currentSlide % slideCount);
            const slideData = item.slide;
            const pct = Math.min(100, Math.round((slideData.raised / slideData.target) * 100));

            return (
              <div
                key={`slide-${slideData.campaignId || idx}`}
                aria-hidden={!isSlideActive}
                className={`absolute inset-0 p-6 md:p-12 lg:p-16 flex flex-col justify-end transition-opacity duration-700 ease-in-out motion-reduce:transition-none ${
                  isSlideActive
                    ? 'opacity-100 z-10 pointer-events-auto'
                    : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                {/* Background Image and Gradient Scrim */}
                <div
                  className="absolute inset-0 bg-cover bg-center -z-10"
                  style={{ backgroundImage: `url('${slideData.imageUrl}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-[#003629]/80 to-transparent pointer-events-none -z-10" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent pointer-events-none -z-10" />

                {/* Slide Content */}
                <div className="relative z-10 max-w-2xl flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="px-3 py-1 rounded-full bg-primary-container text-white font-label-sm text-label-sm font-bold tracking-wide uppercase shadow-sm">
                      {slideData.category}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-surface-bright font-label-sm text-label-sm flex items-center gap-1 border border-white/15">
                      <span className="material-symbols-outlined text-xs">school</span> {slideData.orgName}
                    </span>
                  </div>

                  <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg text-white font-extrabold leading-tight tracking-tight drop-shadow-md">
                    {slideData.title}
                  </h1>

                  <p className="font-body-md text-body-md text-surface-container-high/95 max-w-xl line-clamp-2 drop-shadow">
                    {slideData.description}
                  </p>

                  {/* Progress Bar & Metrics */}
                  <div className="w-full max-w-lg bg-surface-container-lowest/15 backdrop-blur-md p-4 rounded-xl flex flex-col gap-2 mt-2 border border-white/10 shadow-inner">
                    <div className="flex items-center justify-between font-label-md text-label-md text-white font-medium">
                      <span>
                        Raised:{' '}
                        <strong className="text-secondary-fixed text-base font-bold">
                          ₹{slideData.raised.toLocaleString('en-IN')}
                        </strong>
                      </span>
                      <span className="text-surface-container-highest">
                        Target: ₹{slideData.target.toLocaleString('en-IN')} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden p-0.5">
                      <div
                        className="h-full bg-secondary-container rounded-full shadow-sm"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between font-label-sm text-label-sm text-surface-container-high">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs text-secondary-fixed">timer</span>{' '}
                        {slideData.daysLeft} Days Left
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs text-primary-fixed-dim">group</span>{' '}
                        {slideData.mockBackers} Supporters
                      </span>
                    </div>
                  </div>

                  {/* CTA Actions */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      tabIndex={isSlideActive ? 0 : -1}
                      onClick={() => onDonateClick(item.campaign)}
                      className="h-12 px-6 rounded-lg bg-secondary-container hover:bg-secondary text-white font-label-md text-label-md font-bold transition-all transform hover:-translate-y-0.5 active:translate-y-0 shadow-lg flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-lg">volunteer_activism</span> Donate to Cause
                    </button>
                    <button
                      type="button"
                      tabIndex={isSlideActive ? 0 : -1}
                      onClick={() => onViewDetailsClick(item.campaign)}
                      className="h-12 px-6 rounded-lg bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-label-md text-label-md font-semibold transition-colors flex items-center gap-2 border border-white/20"
                    >
                      View Campaign Details <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Navigation Controls */}
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous Slide"
            className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-xl md:text-2xl">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next Slide"
            className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-xl md:text-2xl">chevron_right</span>
          </button>

          {/* Dots Indicator */}
          <div className="absolute bottom-4 right-6 flex items-center gap-2 z-30">
            {activeSlides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleGoTo(idx)}
                className={`h-2.5 rounded-full transition-all ${
                  idx === (currentSlide % slideCount) ? 'w-8 bg-secondary-container' : 'w-2.5 bg-white/40 hover:bg-white/70'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Visible Tiles Track: at least 6 visible tiles on wide desktop, responsive for tablets & mobile */}
        <div className="mt-4 w-full">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="font-label-sm text-xs font-bold text-outline uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-primary">view_carousel</span> Featured Causes Overview
            </span>
            <span className="text-xs text-outline hidden md:inline">Select cause to explore</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {activeSlides.slice(0, 6).map((item, idx) => {
              const isSelected = idx === (currentSlide % slideCount);
              const s = item.slide;
              const pct = Math.min(100, Math.round((s.raised / s.target) * 100));
              return (
                <button
                  key={`tile-${s.campaignId || idx}`}
                  type="button"
                  onClick={() => handleGoTo(idx)}
                  className={`group/tile text-left rounded-xl overflow-hidden border transition-all flex flex-col p-2 bg-surface-container-lowest hover:bg-surface-container-low shadow-sm ${
                    isSelected
                      ? 'ring-2 ring-primary border-primary shadow-md bg-surface-container-low'
                      : 'border-outline-variant/60 hover:border-outline'
                  }`}
                >
                  <div className="relative w-full h-20 rounded-lg overflow-hidden mb-2 bg-surface-container">
                    <img
                      src={s.imageUrl}
                      alt={s.title}
                      className="w-full h-full object-cover group-hover/tile:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-black/70 text-white backdrop-blur-sm">
                      {s.category.split(' ')[0]}
                    </span>
                  </div>
                  <h4 className="font-label-sm text-xs font-bold text-on-surface line-clamp-1 group-hover/tile:text-primary transition-colors">
                    {s.title}
                  </h4>
                  <p className="text-[11px] text-outline line-clamp-1 mb-1.5">
                    {s.orgName}
                  </p>
                  <div className="mt-auto w-full">
                    <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isSelected ? 'bg-primary' : 'bg-secondary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-outline mt-1 font-medium">
                      <span>₹{(s.raised / 1000).toFixed(0)}k</span>
                      <span>{pct}%</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
