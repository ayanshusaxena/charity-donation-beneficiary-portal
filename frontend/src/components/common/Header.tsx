import React, { useState, useEffect, useRef } from 'react';
import { useAuth, UserRole } from '../../context/AuthContext';
import { useSandbox } from '../../context/SandboxContext';
import { Campaign } from '../../types/api';
import { fetchCampaigns } from '../../api/campaigns';

export interface HeaderProps {
  currentView: string;
  onNavigate: (view: string, extra?: unknown) => void;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  campaigns?: Campaign[];
  onSelectCampaign?: (campaign: Campaign) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  searchQuery = '',
  onSearchChange,
  campaigns = [],
  onSelectCampaign,
}) => {
  const { role, setRole } = useAuth();
  const { isSandbox, setIsSandbox, apiStatus } = useSandbox();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [portalsDropdownOpen, setPortalsDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Autocomplete state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [apiSuggestions, setApiSuggestions] = useState<Campaign[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchRequestIdRef = useRef(0);

  // Automatically manage dropdown visibility based on query length
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      setIsSearchOpen(true);
    } else {
      setIsSearchOpen(false);
      setActiveSuggestionIndex(-1);
    }
  }, [searchQuery]);

  // Compute immediate local matches from loaded campaigns
  const localMatches = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return campaigns.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.organization_name && c.organization_name.toLowerCase().includes(q)) ||
        c.purpose_code.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    ).slice(0, 5);
  }, [searchQuery, campaigns]);

  // Debounced API search for causes
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setApiSuggestions([]);
      setIsSearching(false);
      return;
    }

    const currentReqId = ++searchRequestIdRef.current;
    setIsSearching(true);

    const timer = setTimeout(() => {
      fetchCampaigns({ search: q, limit: 5 }, isSandbox)
        .then((page) => {
          if (currentReqId === searchRequestIdRef.current) {
            setApiSuggestions(page.items);
          }
        })
        .catch(() => {
          if (currentReqId === searchRequestIdRef.current) {
            setApiSuggestions([]);
          }
        })
        .finally(() => {
          if (currentReqId === searchRequestIdRef.current) {
            setIsSearching(false);
          }
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, isSandbox]);

  // Merge and deduplicate suggestions by campaign_id
  const combinedSuggestions = React.useMemo(() => {
    const list = [...localMatches];
    for (const item of apiSuggestions) {
      if (!list.some((c) => c.campaign_id === item.campaign_id)) {
        list.push(item);
      }
    }
    return list.slice(0, 5);
  }, [localMatches, apiSuggestions]);

  // Dismiss dropdown on outside clicks
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
        setActiveSuggestionIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (campaign: Campaign) => {
    setIsSearchOpen(false);
    setActiveSuggestionIndex(-1);
    setMobileMenuOpen(false);
    if (onSelectCampaign) {
      onSelectCampaign(campaign);
    } else {
      onNavigate('campaign-detail', campaign);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isSearchOpen && searchQuery.trim().length >= 2) {
        setIsSearchOpen(true);
      } else if (combinedSuggestions.length > 0) {
        setActiveSuggestionIndex((prev) => (prev + 1) % combinedSuggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (combinedSuggestions.length > 0) {
        setActiveSuggestionIndex((prev) => (prev - 1 + combinedSuggestions.length) % combinedSuggestions.length);
      }
    } else if (e.key === 'Enter') {
      if (isSearchOpen && activeSuggestionIndex >= 0 && combinedSuggestions[activeSuggestionIndex]) {
        e.preventDefault();
        handleSelectSuggestion(combinedSuggestions[activeSuggestionIndex]);
      } else {
        setIsSearchOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsSearchOpen(false);
      setActiveSuggestionIndex(-1);
    }
  };

  const handleRoleSelect = (newRole: UserRole) => {
    setRole(newRole);
    setRoleDropdownOpen(false);
    setMobileMenuOpen(false);
    if (newRole === 'NGO') {
      onNavigate('ngo-portal');
    } else if (newRole === 'REVIEWER') {
      onNavigate('reviewer-portal');
    } else {
      onNavigate('explore-campaigns');
    }
  };

  const showSuggestions = isSearchOpen && searchQuery.trim().length >= 2;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      {/* Top Academic Notice Bar */}
      <div className="bg-primary text-on-primary px-margin-mobile md:px-margin py-1.5 flex items-center justify-between font-label-sm text-label-sm">
        <div className="flex items-center gap-space-sm truncate">
          <span className="flex h-2 w-2 rounded-full bg-secondary-container animate-pulse shrink-0"></span>
          <span className="font-label-sm tracking-wide truncate">
            PBL Demo Environment — Local PostgreSQL Capstone | {isSandbox ? 'Sandbox Mode (Simulated Payments Only)' : 'Live API Mode (PostgreSQL REST Backend)'}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-space-md shrink-0">
          <button
            type="button"
            onClick={() => setIsSandbox(!isSandbox)}
            className={`px-2 py-0.5 rounded font-label-sm transition-colors ${
              isSandbox
                ? 'bg-secondary-container text-on-secondary-container font-bold'
                : 'bg-primary-container text-white font-bold'
            }`}
            title="Toggle between in-memory mock sandbox and live PostgreSQL REST backend"
          >
            {isSandbox ? 'Sandbox: Active' : 'Live API Mode'}
          </button>
          <span className="text-primary-fixed-dim">
            REST API: {apiStatus === 'online' ? '● Online' : '○ Offline (Using Sandbox)'}
          </span>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="h-20 max-w-7xl mx-auto px-margin-mobile md:px-margin flex items-center justify-between gap-3">
        {/* Brand & Search */}
        <div className="flex items-center gap-4 lg:gap-6">
          <button
            type="button"
            onClick={() => {
              onNavigate('explore-campaigns');
              setMobileMenuOpen(false);
            }}
            className="flex items-center gap-2 focus:outline-none shrink-0"
          >
            <span className="w-9 h-9 rounded-lg bg-primary text-secondary-container flex items-center justify-center font-bold text-xl shadow-sm">
              <span className="material-symbols-outlined text-secondary-container" style={{ fontVariationSettings: "'FILL' 1" }}>
                volunteer_activism
              </span>
            </span>
            <span className="font-headline-sm text-headline-sm text-primary tracking-tight font-bold">
              DonateKaro
            </span>
          </button>

          {/* Desktop/Tablet Autocomplete Search Input */}
          <div ref={searchContainerRef} className="relative hidden md:block w-56 lg:w-72">
            <div className="relative">
              <input
                id="header-search-desktop"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  onSearchChange?.(e.target.value);
                  setIsSearchOpen(true);
                  setActiveSuggestionIndex(-1);
                }}
                onFocus={() => {
                  if (searchQuery.trim().length >= 2) setIsSearchOpen(true);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search verified causes..."
                aria-autocomplete="list"
                aria-expanded={showSuggestions}
                aria-controls="header-search-suggestions"
                role="combobox"
                className="w-full h-10 pl-9 pr-8 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-sm text-body-sm shadow-[0_1px_2px_rgba(17,24,39,0.04)] border border-outline-variant/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-outline text-lg pointer-events-none">
                search
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange?.('');
                    setIsSearchOpen(false);
                  }}
                  aria-label="Clear search query"
                  className="absolute right-2 top-2.5 text-outline hover:text-on-surface p-0.5 rounded-full"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            {/* Suggestions Popover */}
            {showSuggestions && (
              <div
                id="header-search-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-full mt-1.5 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/40 overflow-hidden z-50 max-h-80 overflow-y-auto"
              >
                {combinedSuggestions.length > 0 ? (
                  <div className="py-1">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-outline uppercase tracking-wider bg-surface-container-low/50 border-b border-outline-variant/20 flex items-center justify-between">
                      <span>Matching Causes</span>
                      <span className="text-[10px] text-outline font-normal lowercase">press Enter to view</span>
                    </div>
                    {combinedSuggestions.map((camp, idx) => {
                      const isSelected = idx === activeSuggestionIndex;
                      return (
                        <div
                          key={camp.campaign_id}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelectSuggestion(camp)}
                          onMouseEnter={() => setActiveSuggestionIndex(idx)}
                          className={`px-3.5 py-2.5 cursor-pointer transition-colors border-b border-outline-variant/10 last:border-b-0 ${
                            isSelected
                              ? 'bg-primary-container/15 text-primary'
                              : 'hover:bg-surface-container/60 text-on-surface'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm line-clamp-1">{camp.title}</span>
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-surface-container-high text-on-surface-variant">
                              {camp.purpose_code}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-on-surface-variant">
                            {camp.organization_name && (
                              <span className="flex items-center gap-1 truncate">
                                <span className="material-symbols-outlined text-xs text-primary">verified</span>
                                {camp.organization_name}
                              </span>
                            )}
                            {camp.target_amount && (
                              <span className="text-outline truncate">
                                • Target: ₹{parseFloat(camp.target_amount).toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : isSearching ? (
                  <div className="p-4 text-center text-sm text-outline flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                    Searching causes...
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-outline">
                    <span className="material-symbols-outlined text-2xl text-outline mb-1 block">search_off</span>
                    <p className="font-medium text-on-surface">No matching causes found</p>
                    <p className="text-xs text-outline mt-0.5">Try searching by cause title, category, or organization name.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center Public Donor Navigation Links */}
        <nav className="hidden lg:flex items-center gap-space-lg">
          <button
            type="button"
            onClick={() => onNavigate('explore-campaigns')}
            className={`font-label-md text-label-md transition-colors ${
              currentView === 'explore-campaigns'
                ? 'text-primary font-bold border-b-2 border-primary py-1'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Explore Campaigns
          </button>
          <button
            type="button"
            onClick={() => onNavigate('about')}
            className={`font-label-md text-label-md transition-colors ${
              currentView === 'about' || currentView === 'how-it-works' || currentView === 'trust-and-verification'
                ? 'text-primary font-bold border-b-2 border-primary py-1'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            About DonateKaro
          </button>

          {/* Institutional Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPortalsDropdownOpen(!portalsDropdownOpen)}
              className={`font-label-md text-label-md flex items-center gap-1 transition-colors ${
                currentView === 'ngo-portal' || currentView === 'reviewer-portal'
                  ? 'text-primary font-bold border-b-2 border-primary py-1'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Institutional Portals
              <span className="material-symbols-outlined text-sm">expand_more</span>
            </button>
            {portalsDropdownOpen && (
              <div
                onMouseLeave={() => setPortalsDropdownOpen(false)}
                className="absolute left-0 top-full mt-2 w-56 rounded-xl bg-surface-container-lowest shadow-lg border border-outline-variant/40 p-1.5 z-50"
              >
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('ngo-portal');
                    setPortalsDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg font-label-sm text-label-sm hover:bg-surface-container flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm text-primary">domain</span>
                  NGO Partner Workspace
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('reviewer-portal');
                    setPortalsDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg font-label-sm text-label-sm hover:bg-surface-container flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm text-secondary">gavel</span>
                  Reviewer Audit Desk
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Role Switcher (Explicit Sandbox Persona Switcher) */}
          <div className="relative inline-flex items-center bg-surface-container-high rounded-lg p-1">
            <button
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              type="button"
              aria-haspopup="true"
              aria-expanded={roleDropdownOpen}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-lowest text-on-surface font-label-sm text-label-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-outline-variant/40"
            >
              <span className="material-symbols-outlined text-sm text-secondary">
                {role === 'DONOR' ? 'shield_person' : role === 'NGO' ? 'domain' : 'gavel'}
              </span>
              <span className="font-label-sm font-semibold truncate max-w-[100px] sm:max-w-none">
                {role === 'DONOR' ? 'Donor View' : role === 'NGO' ? 'NGO Partner' : 'IRB Reviewer'}
              </span>
              <span className="material-symbols-outlined text-sm text-outline">expand_more</span>
            </button>

            {roleDropdownOpen && (
              <div
                onMouseLeave={() => setRoleDropdownOpen(false)}
                className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-surface-container-lowest shadow-lg border border-outline-variant/50 p-2 z-50 text-left"
              >
                <div className="px-2.5 py-1.5 text-xs text-outline border-b border-outline-variant/30 mb-1">
                  <span className="font-bold text-on-surface">Sandbox Persona Switcher</span>
                  <p className="text-[11px] text-outline mt-0.5 leading-tight">
                    Switches simulated role views for demonstration. Does not grant production cryptographic authority.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRoleSelect('DONOR')}
                  className={`w-full text-left px-2.5 py-2 rounded-lg font-label-sm text-label-sm flex items-center gap-2 ${
                    role === 'DONOR' ? 'bg-primary-container text-on-primary font-bold' : 'hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">shield_person</span>
                  Donor View (Public Experience)
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleSelect('NGO')}
                  className={`w-full text-left px-2.5 py-2 rounded-lg font-label-sm text-label-sm flex items-center gap-2 ${
                    role === 'NGO' ? 'bg-primary-container text-on-primary font-bold' : 'hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">domain</span>
                  NGO Partner (Campaign Workspace)
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleSelect('REVIEWER')}
                  className={`w-full text-left px-2.5 py-2 rounded-lg font-label-sm text-label-sm flex items-center gap-2 ${
                    role === 'REVIEWER' ? 'bg-primary-container text-on-primary font-bold' : 'hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">gavel</span>
                  IRB Reviewer (Audit Queue)
                </button>
              </div>
            )}
          </div>

          {/* Start Fundraiser Button */}
          <button
            type="button"
            onClick={() => onNavigate('ngo-portal')}
            className="hidden sm:inline-flex items-center h-10 px-4 rounded-lg bg-primary text-white font-label-sm text-label-sm font-semibold hover:bg-primary-container transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined mr-1.5 text-base">add_circle</span>
            Start a Fundraiser
          </button>

          {/* Mobile Menu Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 rounded-lg text-on-surface hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-surface-container-lowest border-t border-outline-variant/30 px-margin-mobile py-4 flex flex-col gap-4 shadow-xl">
          {/* Mobile Search Bar */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange?.(e.target.value);
                setIsSearchOpen(true);
              }}
              placeholder="Search verified causes..."
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm border border-outline-variant/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-outline text-lg pointer-events-none">
              search
            </span>
            {/* Mobile Suggestions if open */}
            {showSuggestions && combinedSuggestions.length > 0 && (
              <div className="mt-2 bg-surface-container-lowest rounded-lg border border-outline-variant/40 divide-y divide-outline-variant/20 shadow-md">
                {combinedSuggestions.map((camp) => (
                  <div
                    key={camp.campaign_id}
                    onClick={() => handleSelectSuggestion(camp)}
                    className="p-2.5 cursor-pointer hover:bg-surface-container/60 text-on-surface"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs line-clamp-1">{camp.title}</span>
                      <span className="text-[10px] uppercase font-bold text-outline">{camp.purpose_code}</span>
                    </div>
                    {camp.organization_name && (
                      <span className="text-[11px] text-on-surface-variant block mt-0.5 truncate">
                        {camp.organization_name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mobile Links */}
          <nav className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                onNavigate('explore-campaigns');
                setMobileMenuOpen(false);
              }}
              className={`text-left px-3 py-2 rounded-lg font-label-md text-label-md ${
                currentView === 'explore-campaigns' ? 'bg-primary-container text-white font-bold' : 'text-on-surface'
              }`}
            >
              Explore Campaigns
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('about');
                setMobileMenuOpen(false);
              }}
              className={`text-left px-3 py-2 rounded-lg font-label-md text-label-md ${
                currentView === 'about' || currentView === 'how-it-works' || currentView === 'trust-and-verification'
                  ? 'bg-primary-container text-white font-bold'
                  : 'text-on-surface'
              }`}
            >
              About DonateKaro
            </button>
            <div className="border-t border-outline-variant/20 my-1 pt-1">
              <span className="px-3 text-xs font-bold text-outline uppercase tracking-wider block mb-1">
                Institutional Portals
              </span>
              <button
                type="button"
                onClick={() => {
                  onNavigate('ngo-portal');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 ${
                  currentView === 'ngo-portal' ? 'bg-primary-container text-white font-bold' : 'text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-sm">domain</span>
                NGO Partner Workspace
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate('reviewer-portal');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 ${
                  currentView === 'reviewer-portal' ? 'bg-primary-container text-white font-bold' : 'text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-sm">gavel</span>
                Reviewer Audit Desk
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};
