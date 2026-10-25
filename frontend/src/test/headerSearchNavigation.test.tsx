import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { Header } from '../components/common/Header';
import { SandboxProvider } from '../context/SandboxContext';
import { AuthProvider } from '../context/AuthContext';
import { Campaign } from '../types/api';
import * as campaignsApi from '../api/campaigns';

const mockCampaigns: Campaign[] = [
  {
    campaign_id: 'real-camp-101',
    organization_id: 'org-1',
    organization_name: 'Gyandeep Trust',
    title: 'STEM Activity Kits for Rural Girls',
    purpose_code: 'EDUCATION',
    description: 'Providing physics activity boxes for middle school students.',
    target_amount: '250000.00',
    amount_raised: '150000.00',
    currency: 'INR',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    status: 'ACTIVE',
  },
  {
    campaign_id: 'real-camp-102',
    organization_id: 'org-2',
    organization_name: 'Annapurna Seva',
    title: 'Hot Midday Meals for Slum Children',
    purpose_code: 'FOOD',
    description: 'Providing cooked nutritious lunches daily.',
    target_amount: '350000.00',
    amount_raised: '200000.00',
    currency: 'INR',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    status: 'ACTIVE',
  },
];

describe('Phase C: Header Search Autocomplete & Responsive Navbar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderHeader = async (props: Partial<React.ComponentProps<typeof Header>> = {}) => {
    let renderResult: any;
    await act(async () => {
      renderResult = render(
        <AuthProvider>
          <SandboxProvider>
            <Header
              currentView="explore-campaigns"
              onNavigate={vi.fn()}
              campaigns={mockCampaigns}
              {...props}
            />
          </SandboxProvider>
        </AuthProvider>
      );
    });
    return renderResult;
  };

  describe('Search Suggestions & Autocomplete', () => {
    it('does not show autocomplete popup when query is under 2 characters', async () => {
      await renderHeader({ searchQuery: 'S' });

      expect(screen.queryByRole('listbox')).toBeNull();
      expect(screen.queryByText('STEM Activity Kits for Rural Girls')).toBeNull();
    });

    it('shows suggestions with title, organization, category, and target after 2+ characters', async () => {
      await renderHeader({ searchQuery: 'STEM' });

      // Suggestions popup should appear
      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();

      // Verify campaign title
      expect(screen.getByText('STEM Activity Kits for Rural Girls')).toBeInTheDocument();
      // Verify organization name
      expect(screen.getByText(/Gyandeep Trust/i)).toBeInTheDocument();
      // Verify category badge
      expect(screen.getByText('EDUCATION')).toBeInTheDocument();
      // Verify target amount
      expect(screen.getByText(/Target: ₹2,50,000/i)).toBeInTheDocument();
    });

    it('clicking a suggestion invokes onSelectCampaign with the authentic campaign object', async () => {
      const handleSelect = vi.fn();
      await renderHeader({ searchQuery: 'STEM', onSelectCampaign: handleSelect });

      const suggestionOption = screen.getByRole('option', { name: /STEM Activity Kits/i });
      fireEvent.click(suggestionOption);

      expect(handleSelect).toHaveBeenCalledTimes(1);
      const selected = handleSelect.mock.calls[0][0];
      expect(selected.campaign_id).toBe('real-camp-101');
      expect(selected.title).toBe('STEM Activity Kits for Rural Girls');
    });

    it('supports keyboard navigation (ArrowDown, ArrowUp, Enter to select)', async () => {
      const handleSelect = vi.fn();
      await renderHeader({ searchQuery: 'Midday', onSelectCampaign: handleSelect });

      const input = screen.getByPlaceholderText(/Search verified causes/i);

      // Arrow down to highlight first suggestion
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // Hit enter on highlighted suggestion
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(handleSelect).toHaveBeenCalledTimes(1);
      expect(handleSelect.mock.calls[0][0].campaign_id).toBe('real-camp-102');
    });

    it('dismisses suggestions on Escape key', async () => {
      await renderHeader({ searchQuery: 'STEM' });

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      const input = screen.getByPlaceholderText(/Search verified causes/i);
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('renders empty-results state when query matches no causes', async () => {
      vi.spyOn(campaignsApi, 'fetchCampaigns').mockResolvedValueOnce({
        items: [],
        limit: 5,
        offset: 0,
        has_more: false,
        next_offset: null,
      });

      await renderHeader({ searchQuery: 'NonExistentTermXYZ', campaigns: [] });

      await waitFor(() => {
        expect(screen.getByText(/No matching causes found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Navbar Structure & Sandbox Transparency', () => {
    it('displays single public informational link (About DonateKaro) with no duplicate visible links', async () => {
      await renderHeader();

      expect(screen.getByRole('button', { name: 'Explore Campaigns' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'About DonateKaro' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'How It Works' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Trust & Verification' })).toBeNull();
    });

    it('keeps institutional portals discoverable via menu dropdown', async () => {
      const handleNavigate = vi.fn();
      await renderHeader({ onNavigate: handleNavigate });

      const institutionalBtn = screen.getByRole('button', { name: /Institutional Portals/i });
      fireEvent.click(institutionalBtn);

      const ngoLink = screen.getByRole('button', { name: /NGO Partner Workspace/i });
      const reviewerLink = screen.getByRole('button', { name: /Reviewer Audit Desk/i });

      expect(ngoLink).toBeInTheDocument();
      expect(reviewerLink).toBeInTheDocument();

      fireEvent.click(ngoLink);
      expect(handleNavigate).toHaveBeenCalledWith('ngo-portal');
    });

    it('clearly labels the role switcher as a sandbox demonstration tool without pretending real auth', async () => {
      await renderHeader();

      const roleBtn = screen.getByRole('button', { name: /Donor View/i });
      fireEvent.click(roleBtn);

      // Verify the disclaimer inside the switcher dropdown
      expect(screen.getByText(/Sandbox Persona Switcher/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Does not grant production cryptographic authority/i)
      ).toBeInTheDocument();
    });

    it('preserves top global academic/sandbox notice banner', async () => {
      await renderHeader();

      expect(
        screen.getByText(/PBL Demo Environment — Local PostgreSQL Capstone/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Sandbox: Active/i)).toBeInTheDocument();
    });

    it('supports responsive mobile drawer toggle', async () => {
      await renderHeader();

      const mobileToggleBtn = screen.getByLabelText(/Toggle navigation menu/i);
      expect(mobileToggleBtn).toBeInTheDocument();

      // Open drawer
      fireEvent.click(mobileToggleBtn);

      // Close icon appears
      expect(mobileToggleBtn).toHaveTextContent('close');
    });
  });
});
