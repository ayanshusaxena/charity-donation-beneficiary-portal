import React, { useState, useEffect } from 'react';
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { HeroCarousel } from './features/home/HeroCarousel';
import { CauseFilterChips } from './features/home/CauseFilterChips';
import { CampaignCard } from './features/home/CampaignCard';
import { CampaignDetailPage } from './features/home/CampaignDetailPage';
import { AboutView } from './features/about/AboutView';
import { DonationWizard } from './features/donation/DonationWizard';
import { NgoWorkspace } from './features/ngo/NgoWorkspace';
import { ReviewerWorkspace } from './features/reviewer/ReviewerWorkspace';
import { fetchCampaigns } from './api/campaigns';
import { Campaign, PurposeCode, CampaignSort } from './types/api';
import { useSandbox } from './context/SandboxContext';

export const App: React.FC = () => {
  const { isSandbox } = useSandbox();

  // Navigation state
  const [currentView, setCurrentView] = useState<string>('explore-campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Filters & Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPurpose, setSelectedPurpose] = useState<PurposeCode | undefined>(undefined);
  const [selectedSort, setSelectedSort] = useState<CampaignSort>('date');
  const [offset, setOffset] = useState<number>(0);
  const [limit] = useState<number>(6);

  // Data state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);

  // Load campaigns whenever filters change
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setCampaignError(null);

    fetchCampaigns(
      {
        limit,
        offset,
        search: searchQuery,
        purpose_code: selectedPurpose,
        sort: selectedSort,
      },
      isSandbox
    )
      .then((page) => {
        if (!isCancelled) {
          setCampaigns(page.items);
          setHasMore(page.has_more);
          setCampaignError(null);
        }
      })
      .catch((err: any) => {
        if (!isCancelled) {
          setCampaigns([]);
          setHasMore(false);
          setCampaignError(
            err?.message ||
              'Could not reach the campaign API. Check your connection or switch to Sandbox mode.'
          );
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [searchQuery, selectedPurpose, selectedSort, offset, limit, isSandbox, reloadTrigger]);

  // Handlers
  const handleSelectPurpose = (purpose?: PurposeCode) => {
    setSelectedPurpose(purpose);
    setOffset(0);
  };

  const handleSelectSort = (sort: CampaignSort) => {
    setSelectedSort(sort);
    setOffset(0);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setOffset(0);
  };

  const handleDonateClick = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setCurrentView('checkout-sandbox');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleViewDetails = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setCurrentView('campaign-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigate = (view: string, extra?: unknown) => {
    if (view === 'campaign-detail' && extra) {
      setSelectedCampaign(extra as Campaign);
    }
    if (view === 'explore-campaigns') {
      setReloadTrigger((prev) => prev + 1);
    }
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-body-md text-on-surface">
      {/* Global Header */}
      <Header
        currentView={currentView}
        onNavigate={handleNavigate}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        campaigns={campaigns}
        onSelectCampaign={handleViewDetails}
      />

      {/* Main Content Area */}
      <main className="flex-1 pt-28">
        {/* VIEW 1: EXPLORE / HOME VIEW */}
        {currentView === 'explore-campaigns' && (
          <div>
            {/* Signature Hero Photographic Carousel */}
            <HeroCarousel
              campaigns={campaigns}
              onDonateClick={handleDonateClick}
              onViewDetailsClick={handleViewDetails}
            />

            {/* Campaign Discovery Section */}
            <section className="max-w-7xl mx-auto px-margin-mobile md:px-margin pt-2 pb-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                <div>
                  <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
                    Audited Campaigns
                  </span>
                  <h2 className="font-headline-lg text-headline-lg text-primary font-bold mt-1">
                    Discover Verified Causes
                  </h2>
                </div>
                <span className="text-on-surface-variant text-sm">
                  {campaigns.length === 0
                    ? 'No matching causes'
                    : hasMore || offset > 0
                    ? `Showing ${offset + 1}–${offset + campaigns.length} verified causes`
                    : `Showing all ${campaigns.length} verified causes`}
                </span>
              </div>

              {/* Filter Chips & Sort Dropdown */}
              <CauseFilterChips
                selectedPurpose={selectedPurpose}
                onSelectPurpose={handleSelectPurpose}
                selectedSort={selectedSort}
                onSelectSort={handleSelectSort}
              />

              {/* Grid of Campaign Cards */}
              {loading ? (
                <div className="py-20 text-center text-outline flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
                  <span>Fetching eligible campaigns...</span>
                </div>
              ) : campaignError ? (
                <div className="py-16 px-6 text-center bg-surface-container-lowest rounded-2xl border border-error/30 text-on-surface flex flex-col items-center gap-3">
                  <span className="material-symbols-outlined text-4xl text-error">cloud_off</span>
                  <span className="font-semibold text-lg text-primary">Unable to load campaigns</span>
                  <p className="text-sm text-outline max-w-md">{campaignError}</p>
                  <button
                    onClick={() => setReloadTrigger((prev) => prev + 1)}
                    className="mt-2 h-10 px-5 rounded-lg bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-base">refresh</span>
                    Retry Connection
                  </button>
                </div>
              ) : campaigns.length === 0 ? (
                <div className="py-20 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 text-outline flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-4xl">search_off</span>
                  <span className="font-semibold">No campaigns matched your search or category filter.</span>
                  <button
                    onClick={() => {
                      setSelectedPurpose(undefined);
                      setSearchQuery('');
                    }}
                    className="mt-2 h-10 px-4 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-sm font-semibold"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {campaigns.map((camp) => (
                    <CampaignCard
                      key={camp.campaign_id}
                      campaign={camp}
                      onDonate={handleDonateClick}
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </div>
              )}

              {/* Pagination Controls */}
              <div className="mt-8 flex items-center justify-between border-t border-outline-variant/30 pt-6">
                <button
                  type="button"
                  onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                  disabled={offset === 0}
                  className="h-10 px-4 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                  Previous
                </button>
                <span className="font-label-sm text-label-sm text-outline">
                  {hasMore || offset > 0
                    ? `Page ${Math.floor(offset / limit) + 1}`
                    : 'Page 1 of 1 • All matching causes loaded'}
                </span>
                <button
                  type="button"
                  onClick={() => setOffset((prev) => prev + limit)}
                  disabled={!hasMore}
                  className="h-10 px-4 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 shadow-sm"
                >
                  Next
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </section>
          </div>
        )}

        {/* VIEW 2: CAMPAIGN DETAIL VIEW */}
        {currentView === 'campaign-detail' && selectedCampaign && (
          <CampaignDetailPage
            campaign={selectedCampaign}
            campaignId={selectedCampaign.campaign_id}
            onBack={() => setCurrentView('explore-campaigns')}
            onDonate={handleDonateClick}
          />
        )}

        {/* VIEW 3: SIMULATED DONATION FLOW WIZARD */}
        {currentView === 'checkout-sandbox' && selectedCampaign && (
          <DonationWizard
            campaign={selectedCampaign}
            onBack={() => setCurrentView('explore-campaigns')}
          />
        )}

        {/* VIEW 4: NGO PORTAL */}
        {currentView === 'ngo-portal' && <NgoWorkspace />}

        {/* VIEW 5: REVIEWER PORTAL */}
        {currentView === 'reviewer-portal' && (
          <ReviewerWorkspace onCampaignReviewed={() => setReloadTrigger((prev) => prev + 1)} />
        )}

        {/* VIEW 6: ABOUT DONATEKARO (Consolidated Mission, How It Works, & Trust) */}
        {(currentView === 'about' ||
          currentView === 'how-it-works' ||
          currentView === 'trust-and-verification') && (
          <AboutView
            onExplore={() => {
              setCurrentView('explore-campaigns');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onNavigate={handleNavigate}
            initialSection={
              currentView === 'how-it-works'
                ? 'fund-lifecycle'
                : currentView === 'trust-and-verification'
                ? 'database-integrity'
                : undefined
            }
          />
        )}
      </main>

      {/* Global Footer */}
      <Footer
        onNavigate={handleNavigate}
        onSelectPurpose={(p) => {
          setSelectedPurpose(p);
          setCurrentView('explore-campaigns');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
};
