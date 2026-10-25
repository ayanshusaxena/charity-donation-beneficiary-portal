import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AboutView } from '../features/about/AboutView';
import { App } from '../App';
import { SandboxProvider } from '../context/SandboxContext';
import { AuthProvider } from '../context/AuthContext';

describe('About DonateKaro: Consolidated Mission, Governance & Architecture', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.scrollTo = vi.fn() as any;
  });

  it('renders the mission hero with approved brand identity, tagline, and architectural pills', () => {
    const handleExplore = vi.fn();
    render(<AboutView onExplore={handleExplore} />);

    // Brand and mission hero
    expect(screen.getByText(/About DonateKaro • Mission & Governance/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Restoring Trust in Charitable Giving Through Relational Integrity/i,
      })
    ).toBeInTheDocument();

    // Approved tagline
    expect(
      screen.getByText(
        /Empowering grassroots non-profits across India through transparent, direct, and accountable donor engagement/i
      )
    ).toBeInTheDocument();

    // Four core architectural summary pills
    expect(screen.getByText('Double-Entry Ledger')).toBeInTheDocument();
    expect(screen.getByText('3-Party Separation')).toBeInTheDocument();
    expect(screen.getByText('Zero Vanity Metrics')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL 15+')).toBeInTheDocument();
  });

  it('articulates the four systemic problems in traditional charity technology', () => {
    render(<AboutView onExplore={vi.fn()} />);

    expect(screen.getByText(/The Philanthropic Accountability Gap/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Why Traditional Crowdfunding Platforms Fall Short/i })
    ).toBeInTheDocument();

    // Four problem cards
    expect(screen.getByText(/Opaque Escrow & Commingled Accounts/i)).toBeInTheDocument();
    expect(screen.getByText(/Vanity Progress Metrics & False Success/i)).toBeInTheDocument();
    expect(screen.getByText(/Internal Collusion & Unchecked Payouts/i)).toBeInTheDocument();
    expect(screen.getByText(/Unvetted Beneficiaries & Scope Drift/i)).toBeInTheDocument();
  });

  it('illustrates how donors, NGOs, reviewers, and beneficiaries connect in a 4-party ecosystem', () => {
    render(<AboutView onExplore={vi.fn()} />);

    expect(screen.getByText(/The Connected Ecosystem/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /How Donors, NGOs, Reviewers & Beneficiaries Connect/i,
      })
    ).toBeInTheDocument();

    // 4 Stakeholders with exact regex name matching
    expect(screen.getByRole('heading', { name: /^Public Donors$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Field NGOs$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Review Board$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Beneficiaries$/ })).toBeInTheDocument();
  });

  it('explains the end-to-end donation and fund lifecycle step-by-step', () => {
    render(<AboutView onExplore={vi.fn()} />);

    expect(screen.getByText(/End-to-End Traceability/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /The Complete Lifecycle of Every Contribution/i,
      })
    ).toBeInTheDocument();

    // Lifecycle steps
    expect(screen.getByText(/Campaign Formulation & IRB Inspection/i)).toBeInTheDocument();
    expect(screen.getByText(/Idempotent Donor Contribution & Settlement/i)).toBeInTheDocument();
    expect(screen.getByText(/Atomic Double-Entry Fund Ledger Posting/i)).toBeInTheDocument();
    expect(screen.getByText(/Beneficiary Verification & Purpose Gating/i)).toBeInTheDocument();
    expect(screen.getByText(/Three-Way Separation of Duties Disbursal/i)).toBeInTheDocument();
  });

  it('explains database-backed integrity mechanisms in plain language with technical rigor', () => {
    render(<AboutView onExplore={vi.fn()} />);

    expect(screen.getByText(/Relational Architecture Explained/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /How Database Constraints Enforce Honesty/i,
      })
    ).toBeInTheDocument();

    // 4 Architectural pillars
    expect(screen.getAllByText(/Double-Entry Fund Ledger/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Engine-Level Separation of Duties/i)).toBeInTheDocument();
    expect(screen.getByText(/Controlled Purpose Vocabulary/i)).toBeInTheDocument();
    expect(screen.getByText(/Append-Only Immutability & Safe Refunds/i)).toBeInTheDocument();

    // Technical constraint references
    expect(screen.getByText(/public_campaign_discovery/i)).toBeInTheDocument();
    expect(screen.getByText(/disbursement_separation_metadata_check/i)).toBeInTheDocument();
    expect(screen.getByText(/guard_disbursement_payment\(\)/i)).toBeInTheDocument();
    expect(screen.getByText(/reject_history_mutation\(\)/i)).toBeInTheDocument();
  });

  it('transparently discloses academic prototype boundaries, simulated payments, and no 80G claims', () => {
    render(<AboutView onExplore={vi.fn()} />);

    // Academic origin
    expect(
      screen.getByText(/B\.Tech CSE Semester III • DBMS Course CSL0311 Capstone Project/i)
    ).toBeInTheDocument();

    // Simulated payments disclosure
    expect(screen.getByText(/Simulated Payment Gateway:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No live banking APIs, UPI switches, or real currency transactions are processed/i)
    ).toBeInTheDocument();

    // Explicit 80G tax exemption disclaimer (confirming NO 80G tax benefit claim)
    expect(screen.getByText(/No 80G Tax Exemption:/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /DonateKaro does not issue legal Indian Income Tax Section 80G tax exemption certificates/i
      )
    ).toBeInTheDocument();

    // Sandbox vs live mode disclaimer
    expect(screen.getByText(/Demo Persona & Mock State:/i)).toBeInTheDocument();

    // Organizational credentials disclaimer
    expect(screen.getByText(/Organizational Credential Recording:/i)).toBeInTheDocument();
  });

  it('has strong CTA buttons that invoke exploration callback and portal navigation', () => {
    const handleExplore = vi.fn();
    const handleNavigate = vi.fn();
    render(<AboutView onExplore={handleExplore} onNavigate={handleNavigate} />);

    // Top hero CTA
    const heroExploreBtn = screen.getByRole('button', { name: /Explore Verified Causes/i });
    fireEvent.click(heroExploreBtn);
    expect(handleExplore).toHaveBeenCalledTimes(1);

    // Bottom CTA
    const bottomExploreBtn = screen.getByRole('button', { name: /Explore Active Campaigns/i });
    fireEvent.click(bottomExploreBtn);
    expect(handleExplore).toHaveBeenCalledTimes(2);

    // NGO portal CTA
    const ngoPortalBtn = screen.getByRole('button', { name: /Open NGO Partner Portal/i });
    fireEvent.click(ngoPortalBtn);
    expect(handleNavigate).toHaveBeenCalledWith('ngo-portal');
  });

  it('renders single About DonateKaro navigation item and consolidates legacy views', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <SandboxProvider>
            <App />
          </SandboxProvider>
        </AuthProvider>
      );
    });

    // Verify duplicate links are completely absent from header navigation
    expect(screen.queryByRole('button', { name: 'How It Works' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trust & Verification' })).toBeNull();

    // Click "About DonateKaro" in header
    const aboutHeaderBtn = screen.getAllByRole('button', { name: 'About DonateKaro' })[0];
    await act(async () => {
      fireEvent.click(aboutHeaderBtn);
    });

    // Verify AboutView is rendered
    expect(
      screen.getByRole('heading', {
        name: /Restoring Trust in Charitable Giving Through Relational Integrity/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/The Complete Lifecycle of Every Contribution/i)).toBeInTheDocument();
    expect(screen.getByText(/How Database Constraints Enforce Honesty/i)).toBeInTheDocument();
  });

  it('preserves section anchors and handles smooth scroll to initialSection', () => {
    const scrollIntoViewMock = vi.fn();
    const mockElement = document.createElement('div');
    mockElement.id = 'fund-lifecycle';
    mockElement.scrollIntoView = scrollIntoViewMock;
    document.body.appendChild(mockElement);

    render(<AboutView onExplore={vi.fn()} initialSection="fund-lifecycle" />);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });

    document.body.removeChild(mockElement);
  });
});
