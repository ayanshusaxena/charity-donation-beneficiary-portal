import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HeroCarousel } from '../features/home/HeroCarousel';
import { CampaignCard } from '../features/home/CampaignCard';
import { Footer } from '../components/common/Footer';
import { Campaign } from '../types/api';

const mockCampaignTest: Campaign = {
  campaign_id: 'real-camp-404',
  organization_id: 'org-404',
  organization_name: 'Sahyadri Ecology Trust',
  title: 'Western Ghats Biodiversity Restoration',
  purpose_code: 'HEALTH',
  description: 'Restoring endemic micro-habitats and water harvesting reservoirs.',
  target_amount: '500000.00',
  amount_raised: '250000.00',
  currency: 'INR',
  start_date: '2025-01-01',
  end_date: '2025-12-31',
  status: 'ACTIVE',
  image_url: 'https://example.com/sahyadri.jpg',
  days_left: 20,
  mock_backers: 154,
};

describe('Phase A & B: Homepage Presentation and Footer Layout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Phase A: Hero Carousel presentation & labels', () => {
    it('renders truthful public labels (Raised, Supporters) and avoids internal PBL/Mock labels', () => {
      render(
        <HeroCarousel
          campaigns={[mockCampaignTest]}
          onDonateClick={vi.fn()}
          onViewDetailsClick={vi.fn()}
        />
      );

      // Verify truthful public label "Raised:" is present
      expect(screen.getByText(/Raised:/i)).toBeInTheDocument();
      // Ensure "Simulated Raised:" is NOT rendered on the public slide
      expect(screen.queryByText(/Simulated Raised:/i)).toBeNull();

      // Verify "Supporters" label
      expect(screen.getByText(/154 Supporters/i)).toBeInTheDocument();
      // Ensure "Mock Backers" is NOT rendered
      expect(screen.queryByText(/Mock Backers/i)).toBeNull();

      // Ensure "PBL Entry" tag is NOT rendered in slide badges
      expect(screen.queryByText(/PBL Entry/i)).toBeNull();
    });

    it('renders coherent rectangular CTA buttons with accessible roles', () => {
      render(
        <HeroCarousel
          campaigns={[mockCampaignTest]}
          onDonateClick={vi.fn()}
          onViewDetailsClick={vi.fn()}
        />
      );

      const donateBtn = screen.getByRole('button', { name: /Donate to Cause/i });
      const detailsBtn = screen.getByRole('button', { name: /View Campaign Details/i });

      // Rectangular styling checks (h-12 and rounded-lg)
      expect(donateBtn.className).toContain('rounded-lg');
      expect(donateBtn.className).toContain('h-12');
      expect(detailsBtn.className).toContain('rounded-lg');
      expect(detailsBtn.className).toContain('h-12');
    });

    it('implements coherent cross-fade image layers with reduced-motion classes', () => {
      const { container } = render(
        <HeroCarousel
          campaigns={[mockCampaignTest]}
          onDonateClick={vi.fn()}
          onViewDetailsClick={vi.fn()}
        />
      );

      // Check for stacked cross-fade slide background with transition-opacity and motion-reduce
      const bgLayer = container.querySelector('[class*="transition-opacity"]');
      expect(bgLayer).not.toBeNull();
      expect(bgLayer?.className).toContain('motion-reduce:transition-none');
    });

    it('automatically advances slide after 5.5s interval under normal conditions', () => {
      vi.useFakeTimers();
      try {
        render(
          <HeroCarousel
            campaigns={[]}
            onDonateClick={vi.fn()}
            onViewDetailsClick={vi.fn()}
          />
        );

        // Initially on first fallback slide
        expect(screen.getAllByText('STEM Lab Kits for First-Generation Girl Scholars').length).toBeGreaterThanOrEqual(1);

        // Advance 5.5 seconds
        act(() => {
          vi.advanceTimersByTime(5500);
        });

        // Now on second fallback slide
        expect(screen.getAllByText('Nutritional Midday Meals for 1,200 Underprivileged Children').length).toBeGreaterThanOrEqual(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('pauses autoplay on mouse hover and resumes when mouse leaves', () => {
      vi.useFakeTimers();
      try {
        const { container } = render(
          <HeroCarousel
            campaigns={[]}
            onDonateClick={vi.fn()}
            onViewDetailsClick={vi.fn()}
          />
        );

        const carouselBox = container.querySelector('[class*="rounded-2xl"]');
        expect(carouselBox).not.toBeNull();

        // Mouse enter -> pauses
        fireEvent.mouseEnter(carouselBox!);

        act(() => {
          vi.advanceTimersByTime(6000);
        });

        // Still on first slide because timer is paused
        expect(screen.getAllByText('STEM Lab Kits for First-Generation Girl Scholars').length).toBeGreaterThanOrEqual(1);

        // Mouse leave -> resumes
        fireEvent.mouseLeave(carouselBox!);

        act(() => {
          vi.advanceTimersByTime(5500);
        });

        // Now advances to second slide
        expect(screen.getAllByText('Nutritional Midday Meals for 1,200 Underprivileged Children').length).toBeGreaterThanOrEqual(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('resets timer countdown on manual next/prev button clicks', () => {
      vi.useFakeTimers();
      try {
        render(
          <HeroCarousel
            campaigns={[]}
            onDonateClick={vi.fn()}
            onViewDetailsClick={vi.fn()}
          />
        );

        // Click Next manually
        const nextBtn = screen.getByRole('button', { name: /Next Slide/i });
        fireEvent.click(nextBtn);

        // Immediately switches to second slide — use getAllByText because tile track also shows it
        expect(screen.getAllByText('Nutritional Midday Meals for 1,200 Underprivileged Children').length).toBeGreaterThanOrEqual(1);

        // Wait 3 seconds (less than 5.5s) -> should remain on slide 2
        act(() => {
          vi.advanceTimersByTime(3000);
        });
        expect(screen.getAllByText('Nutritional Midday Meals for 1,200 Underprivileged Children').length).toBeGreaterThanOrEqual(1);

        // Complete the remaining 2.5s -> now advances to slide 3
        act(() => {
          vi.advanceTimersByTime(2500);
        });
        expect(screen.getAllByText('Emergency Mobile Diagnostic Unit for Rural PHCs').length).toBeGreaterThanOrEqual(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Phase A: CampaignCard button and supporter presentation', () => {
    it('uses rectangular CTA buttons and displays supporters instead of mock backers', () => {
      render(
        <CampaignCard
          campaign={mockCampaignTest}
          onDonate={vi.fn()}
          onViewDetails={vi.fn()}
        />
      );

      expect(screen.getByText(/154 supporters/i)).toBeInTheDocument();
      expect(screen.queryByText(/mock backers/i)).toBeNull();

      const donateBtn = screen.getByRole('button', { name: /Donate/i });
      const detailsBtn = screen.getByRole('button', { name: /Details/i });

      expect(donateBtn.className).toContain('rounded-lg');
      expect(donateBtn.className).toContain('h-10');
      expect(detailsBtn.className).toContain('rounded-lg');
      expect(detailsBtn.className).toContain('h-10');
    });
  });

  describe('Phase B: Footer reorganization and spacing', () => {
    it('renders clean professional categories and navigates to valid destinations', () => {
      const handleNavigate = vi.fn();
      const handleSelectPurpose = vi.fn();

      render(
        <Footer
          onNavigate={handleNavigate}
          onSelectPurpose={handleSelectPurpose}
        />
      );

      // Check professional headers exist
      expect(screen.getByText('Verified Causes')).toBeInTheDocument();
      expect(screen.getByText('Trust & Governance')).toBeInTheDocument();
      expect(screen.getByText('Accountability')).toBeInTheDocument();

      // Test cause routing
      const educationLink = screen.getByRole('button', { name: /Foundational Education & STEM/i });
      fireEvent.click(educationLink);
      expect(handleSelectPurpose).toHaveBeenCalledWith('EDUCATION');
      expect(handleNavigate).toHaveBeenCalledWith('explore-campaigns');

      // Test about portal routing
      const aboutLink = screen.getByRole('button', { name: /About DonateKaro & Governance/i });
      fireEvent.click(aboutLink);
      expect(handleNavigate).toHaveBeenCalledWith('about');

      // Verify duplicate consolidated links are removed from footer
      expect(screen.queryByRole('button', { name: /How It Works & Integrity/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Trust & Verification Framework/i })).toBeNull();

      // Ensure raw database trigger jargon is removed from public view
      expect(screen.queryByText(/Double-entry fund ledger triggers/i)).toBeNull();
      expect(screen.queryByText(/Separation of duties \(Requester ≠ Approver\)/i)).toBeNull();
    });

    it('renders compact academic PBL disclaimer in a distinct container', () => {
      render(<Footer />);

      expect(screen.getByText(/Academic Evaluation Prototype:/i)).toBeInTheDocument();
      expect(screen.getByText(/Problem-Based Learning/i)).toBeInTheDocument();
    });

    it('avoids excessive mt-20 margin spacing on footer element', () => {
      const { container } = render(<Footer />);
      const footerElement = container.querySelector('footer');

      expect(footerElement).not.toBeNull();
      expect(footerElement?.className).not.toContain('mt-20');
      expect(footerElement?.className).toContain('border-t');
    });
  });
});
