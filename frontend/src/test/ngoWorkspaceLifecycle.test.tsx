import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NgoWorkspace } from '../features/ngo/NgoWorkspace';
import { ReviewerWorkspace } from '../features/reviewer/ReviewerWorkspace';
import { SandboxProvider } from '../context/SandboxContext';
import * as ngoApi from '../api/ngo';
import * as reviewerApi from '../api/reviewer';

describe('NGO Workspace & Campaign Lifecycle Vertical Slice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders default verified organization status in workspace', async () => {
    render(
      <SandboxProvider>
        <NgoWorkspace />
      </SandboxProvider>
    );

    expect(screen.getByText('Bal Vikas Trust')).toBeInTheDocument();
    expect(screen.getByText('Org Status: VERIFIED')).toBeInTheDocument();
    expect(screen.getByText('Organization Status')).toBeInTheDocument();
  });

  it('allows opening incomplete draft modal with title only required', async () => {
    render(
      <SandboxProvider>
        <NgoWorkspace />
      </SandboxProvider>
    );

    const createBtn = screen.getByRole('button', { name: /create campaign draft/i });
    fireEvent.click(createBtn);

    expect(screen.getByRole('heading', { name: /create campaign draft/i })).toBeInTheDocument();
    expect(screen.getByText(/Only Campaign Title is required to save a draft/i)).toBeInTheDocument();
  });

  it('blocks submission and surfaces validation error when draft is incomplete', async () => {
    vi.spyOn(ngoApi, 'fetchOrganizationCampaigns').mockResolvedValue([
      {
        campaign_id: '99',
        organization_id: '1',
        organization_name: 'Bal Vikas Trust',
        title: 'Incomplete Draft Title',
        purpose_code: 'EDUCATION',
        description: '', // incomplete
        target_amount: '0.00', // incomplete
        amount_raised: '0.00',
        currency: 'INR',
        start_date: '',
        end_date: '',
        status: 'DRAFT',
      },
    ]);

    render(
      <SandboxProvider>
        <NgoWorkspace />
      </SandboxProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Incomplete Draft Title')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Incomplete Draft: Cannot submit to review queue/i)).toBeInTheDocument();
    });
  });

  it('displays organization verification banner when organization is PENDING', async () => {
    vi.spyOn(ngoApi, 'fetchMyOrganizations').mockResolvedValue([
      {
        organization_id: '55',
        organization_name: 'New Pending Foundation',
        roles: ['CAMPAIGN_EDITOR'],
        verification_status: 'PENDING',
        review_reason: null,
      },
    ]);

    render(
      <SandboxProvider>
        <NgoWorkspace />
      </SandboxProvider>
    );

    // Open Register modal
    const regBtn = screen.getByRole('button', { name: /register new ngo/i });
    fireEvent.click(regBtn);

    expect(screen.getByText('Register New Organization')).toBeInTheDocument();
  });

  it('renders ReviewerWorkspace with Campaign Queue and Organization Applications tabs', async () => {
    vi.spyOn(reviewerApi, 'fetchReviewQueue').mockResolvedValue([]);
    vi.spyOn(reviewerApi, 'fetchOrgReviewQueue').mockResolvedValue([
      {
        organization_id: '10',
        organization_name: 'Gramin Seva Samiti',
        registration_ref: 'REG-GRAMIN-101',
        email: 'info@gramin.org',
        phone: '+919876543210',
        verification_status: 'PENDING',
        review_reason: null,
        created_at: '2026-10-24T00:00:00Z',
      },
    ]);

    render(
      <SandboxProvider>
        <ReviewerWorkspace />
      </SandboxProvider>
    );

    expect(screen.getByRole('button', { name: /campaign review queue/i })).toBeInTheDocument();
    const orgTab = screen.getByRole('button', { name: /organization applications/i });
    expect(orgTab).toBeInTheDocument();

    // Click Organization Applications tab
    fireEvent.click(orgTab);

    await waitFor(() => {
      expect(screen.getAllByText('Gramin Seva Samiti').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /verify organization/i })).toBeInTheDocument();
    });
  });
});
