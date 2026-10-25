import React, { useEffect } from 'react';

export interface AboutViewProps {
  onExplore: () => void;
  onNavigate?: (view: string) => void;
  initialSection?: string;
}

export const AboutView: React.FC<AboutViewProps> = ({
  onExplore,
  onNavigate,
  initialSection,
}) => {
  // Handle smooth scroll to section if an initialSection is specified (e.g., from consolidated links)
  useEffect(() => {
    if (initialSection) {
      const element = document.getElementById(initialSection);
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [initialSection]);

  return (
    <div className="max-w-6xl mx-auto px-margin-mobile md:px-margin py-8 md:py-12 space-y-16">
      {/* 1. MISSION HERO SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-surface-container-lowest border border-outline-variant/40 p-6 md:p-12 shadow-sm">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary font-label-sm text-xs font-bold uppercase tracking-wider mb-4">
            <span className="material-symbols-outlined text-sm">verified_user</span>
            About DonateKaro • Mission & Governance
          </div>
          <h1 className="font-headline-lg text-headline-lg md:text-display-lg text-primary font-bold tracking-tight leading-tight">
            Restoring Trust in Charitable Giving Through Relational Integrity
          </h1>
          <p className="mt-4 font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
            Empowering grassroots non-profits across India through transparent, direct, and accountable donor engagement.
          </p>
          <p className="mt-3 font-body-md text-body-md text-outline leading-relaxed">
            DonateKaro was conceived to solve a critical flaw in modern philanthropy: platforms relying on opaque escrow accounts, arbitrary vanity metrics, and self-reported spreadsheets. By grounding every rupee in PostgreSQL constraints, an immutable double-entry fund ledger, and multi-party separation of duties, DonateKaro proves that charity tech can be mathematically provable and transparent from pledge to field payout.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onExplore}
              className="h-12 px-6 rounded-lg bg-primary text-white font-label-md font-semibold hover:bg-primary-container transition-colors shadow-sm inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">explore</span>
              Explore Verified Causes
            </button>
            <a
              href="#fund-lifecycle"
              className="h-12 px-5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md font-medium transition-colors inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">account_tree</span>
              View Fund Lifecycle
            </a>
          </div>
        </div>

        {/* Feature Metric Highlights */}
        <div className="mt-10 pt-8 border-t border-outline-variant/20 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
          <div className="p-3 rounded-xl bg-surface-container-low/50">
            <span className="font-label-sm text-xs text-outline uppercase font-bold tracking-wider block">Accounting</span>
            <span className="font-headline-sm text-lg text-primary font-bold mt-0.5 block">Double-Entry Ledger</span>
            <span className="text-xs text-on-surface-variant">Immutable fund events</span>
          </div>
          <div className="p-3 rounded-xl bg-surface-container-low/50">
            <span className="font-label-sm text-xs text-outline uppercase font-bold tracking-wider block">Governance</span>
            <span className="font-headline-sm text-lg text-secondary font-bold mt-0.5 block">3-Party Separation</span>
            <span className="text-xs text-on-surface-variant">Requester ≠ Approver ≠ Payer</span>
          </div>
          <div className="p-3 rounded-xl bg-surface-container-low/50">
            <span className="font-label-sm text-xs text-outline uppercase font-bold tracking-wider block">Integrity</span>
            <span className="font-headline-sm text-lg text-primary font-bold mt-0.5 block">Zero Vanity Metrics</span>
            <span className="text-xs text-on-surface-variant">Derived from settled clearing</span>
          </div>
          <div className="p-3 rounded-xl bg-surface-container-low/50">
            <span className="font-label-sm text-xs text-outline uppercase font-bold tracking-wider block">Standard</span>
            <span className="font-headline-sm text-lg text-tertiary font-bold mt-0.5 block">PostgreSQL 15+</span>
            <span className="text-xs text-on-surface-variant">OpenAPI 3.1 Contract</span>
          </div>
        </div>
      </section>

      {/* 2. THE PROBLEM WE SOLVE */}
      <section id="the-problem" className="space-y-6">
        <div className="max-w-3xl">
          <span className="font-label-sm text-xs text-secondary font-bold uppercase tracking-wider block">
            The Philanthropic Accountability Gap
          </span>
          <h2 className="font-headline-lg text-headline-lg text-primary font-bold mt-1">
            Why Traditional Crowdfunding Platforms Fall Short
          </h2>
          <p className="font-body-md text-on-surface-variant mt-2 leading-relaxed">
            In charitable giving, opacity erodes generosity. When contributors cannot see how their gifts transition from bank settlement to beneficiary impact, skepticism replaces goodwill. DonateKaro addresses four systemic structural failures common in commercial philanthropy:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between shadow-xs">
            <div>
              <div className="w-10 h-10 rounded-lg bg-error-container/40 text-error flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">account_balance_wallet</span>
              </div>
              <h3 className="font-headline-sm text-base text-primary font-bold">Opaque Escrow & Commingled Accounts</h3>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                Most platforms pool millions into aggregate corporate bank accounts. A single mutable balance cannot distinguish between pledged commitments, cleared inflows, restricted cause allocations, or administrative expenditures.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/15 text-xs font-semibold text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-secondary">check_circle</span>
              DonateKaro Solution: Distinct ledger entries per campaign with restricted balance validation.
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between shadow-xs">
            <div>
              <div className="w-10 h-10 rounded-lg bg-secondary-container/30 text-secondary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">trending_up</span>
              </div>
              <h3 className="font-headline-sm text-base text-primary font-bold">Vanity Progress Metrics & False Success</h3>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                Fundraising thermometer bars are often updated through editable database columns or unverified pledges. Donors are presented with inflated numbers that do not reflect settled, available cash.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/15 text-xs font-semibold text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-secondary">check_circle</span>
              DonateKaro Solution: Public <code className="bg-surface-container px-1 rounded">amount_raised</code> is computed on-the-fly directly from cleared ledger events.
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between shadow-xs">
            <div>
              <div className="w-10 h-10 rounded-lg bg-tertiary-container/30 text-tertiary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">gavel</span>
              </div>
              <h3 className="font-headline-sm text-base text-primary font-bold">Internal Collusion & Unchecked Payouts</h3>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                Organizations frequently permit a single staff member or administrator to request money, approve the release, and execute the bank transfer. This lack of segregation invites unauthorized diversion of donor funds.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/15 text-xs font-semibold text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-secondary">check_circle</span>
              DonateKaro Solution: PostgreSQL constraint enforces that requester, approver, and payer must be distinct actors.
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between shadow-xs">
            <div>
              <div className="w-10 h-10 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">category</span>
              </div>
              <h3 className="font-headline-sm text-base text-primary font-bold">Unvetted Beneficiaries & Scope Drift</h3>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                Donations earmarked for children’s healthcare or rural schools often drift into general operating expenses because payouts are made without pre-verifying beneficiary eligibility or intent.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/15 text-xs font-semibold text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-secondary">check_circle</span>
              DonateKaro Solution: Beneficiaries must hold an independent verified onboarding record before disbursal release.
            </div>
          </div>
        </div>
      </section>

      {/* 3. MULTI-STAKEHOLDER ECOSYSTEM */}
      <section id="stakeholder-ecosystem" className="space-y-6">
        <div className="max-w-3xl">
          <span className="font-label-sm text-xs text-secondary font-bold uppercase tracking-wider block">
            The Connected Ecosystem
          </span>
          <h2 className="font-headline-lg text-headline-lg text-primary font-bold mt-1">
            How Donors, NGOs, Reviewers & Beneficiaries Connect
          </h2>
          <p className="font-body-md text-on-surface-variant mt-2 leading-relaxed">
            DonateKaro operates as a governed four-party network where responsibilities are partitioned to guarantee checks and balances across the entire philanthropic lifecycle:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Stakeholder 1: Donors */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="p-2 rounded-lg bg-primary-container text-white">
                <span className="material-symbols-outlined text-xl">shield_person</span>
              </span>
              <div>
                <h3 className="font-headline-sm text-base text-primary font-bold">Public Donors</h3>
                <span className="text-xs text-outline">Guest & Registered</span>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed flex-1">
              Browse approved public causes, make idempotent contributions, and receive official settlement receipts. Guest donors are protected via cryptographic capability tokens with zero data leakage.
            </p>
            <div className="mt-4 pt-3 border-t border-outline-variant/15 text-[11px] text-outline">
              <strong>Key Capability:</strong> Verifiable transaction receipts & duplicate charge prevention.
            </div>
          </div>

          {/* Stakeholder 2: Field NGOs */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="p-2 rounded-lg bg-secondary text-white">
                <span className="material-symbols-outlined text-xl">domain</span>
              </span>
              <div>
                <h3 className="font-headline-sm text-base text-secondary font-bold">Field NGOs</h3>
                <span className="text-xs text-outline">Campaign Partners</span>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed flex-1">
              Draft campaign proposals, define strict purpose categories, manage beneficiary target rosters, and request fund releases solely against cleared ledger balances.
            </p>
            <div className="mt-4 pt-3 border-t border-outline-variant/15 text-[11px] text-outline">
              <strong>Key Capability:</strong> Tenant isolation & purpose-constrained campaign drafting.
            </div>
          </div>

          {/* Stakeholder 3: Review Board */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="p-2 rounded-lg bg-tertiary-container text-white">
                <span className="material-symbols-outlined text-xl">gavel</span>
              </span>
              <div>
                <h3 className="font-headline-sm text-base text-tertiary font-bold">Review Board</h3>
                <span className="text-xs text-outline">IRB & Verifiers</span>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed flex-1">
              Inspect campaign narratives and budget breakdowns before public fundraising is unlocked. Independent verifiers inspect beneficiary credentials before disbursal release.
            </p>
            <div className="mt-4 pt-3 border-t border-outline-variant/15 text-[11px] text-outline">
              <strong>Key Capability:</strong> Mandatory pre-flight audit gates on campaigns and payouts.
            </div>
          </div>

          {/* Stakeholder 4: Beneficiaries */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="p-2 rounded-lg bg-inverse-surface text-secondary-container">
                <span className="material-symbols-outlined text-xl">groups</span>
              </span>
              <div>
                <h3 className="font-headline-sm text-base text-on-surface font-bold">Beneficiaries</h3>
                <span className="text-xs text-outline">Individuals & Groups</span>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed flex-1">
              Community members, students, rural health centers, and families receiving targeted aid. Payout records are explicitly bound to their verified identity reference.
            </p>
            <div className="mt-4 pt-3 border-t border-outline-variant/15 text-[11px] text-outline">
              <strong>Key Capability:</strong> Direct disbursal protection against unvetted third parties.
            </div>
          </div>
        </div>
      </section>

      {/* 4. END-TO-END DONATION & FUND LIFECYCLE */}
      <section id="fund-lifecycle" className="space-y-6">
        <div className="max-w-3xl">
          <span className="font-label-sm text-xs text-secondary font-bold uppercase tracking-wider block">
            End-to-End Traceability
          </span>
          <h2 className="font-headline-lg text-headline-lg text-primary font-bold mt-1">
            The Complete Lifecycle of Every Contribution
          </h2>
          <p className="font-body-md text-on-surface-variant mt-2 leading-relaxed">
            Follow the journey of a charitable cause from its initial grassroots proposal to verified field disbursement:
          </p>
        </div>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-4">
              <span className="w-9 h-9 rounded-xl bg-primary-container text-white flex items-center justify-center font-bold text-base shrink-0 mt-0.5">
                1
              </span>
              <div>
                <h3 className="font-headline-sm text-base text-primary font-bold">Campaign Formulation & IRB Inspection</h3>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                  The field NGO drafts a campaign with target budgets and a classified purpose category (<code className="bg-surface-container px-1 rounded text-xs font-mono">EDUCATION</code>, <code className="bg-surface-container px-1 rounded text-xs font-mono">FOOD</code>, etc.). The campaign remains locked in <code className="bg-surface-container px-1 rounded text-xs font-mono">DRAFT</code> until inspected and formally approved by the Institutional Review Board.
                </p>
              </div>
            </div>
            <span className="shrink-0 px-3 py-1 rounded-full bg-surface-container text-outline font-label-sm text-xs font-semibold">
              PostgreSQL State Guard
            </span>
          </div>

          {/* Step 2 */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-4">
              <span className="w-9 h-9 rounded-xl bg-primary-container text-white flex items-center justify-center font-bold text-base shrink-0 mt-0.5">
                2
              </span>
              <div>
                <h3 className="font-headline-sm text-base text-primary font-bold">Idempotent Donor Contribution & Settlement</h3>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                  The donor specifies a contribution amount. The client attaches a cryptographic <code className="bg-surface-container px-1 rounded text-xs font-mono">Idempotency-Key</code>. When payment simulation commits as <code className="bg-surface-container px-1 rounded text-xs font-mono">SUCCESSFUL</code>, a unique transaction reference and receipt number are permanently bound. Network timeouts transition to <code className="bg-surface-container px-1 rounded text-xs font-mono">UNKNOWN</code> for safe reconciliation without double-charging.
                </p>
              </div>
            </div>
            <span className="shrink-0 px-3 py-1 rounded-full bg-surface-container text-outline font-label-sm text-xs font-semibold">
              Replay-Safe Settlement
            </span>
          </div>

          {/* Step 3 */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-4">
              <span className="w-9 h-9 rounded-xl bg-primary-container text-white flex items-center justify-center font-bold text-base shrink-0 mt-0.5">
                3
              </span>
              <div>
                <h3 className="font-headline-sm text-base text-primary font-bold">Atomic Double-Entry Fund Ledger Posting</h3>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                  Upon clearing, database trigger <code className="bg-surface-container px-1 rounded text-xs font-mono">record_donation_clearing()</code> atomically writes an inflow entry to <code className="bg-surface-container px-1 rounded text-xs font-mono">fund_ledger_entry</code> with positive <code className="bg-surface-container px-1 rounded text-xs font-mono">amount_delta</code>. The campaign’s displayed funding total is recalculated dynamically from the sum of cleared ledger entries.
                </p>
              </div>
            </div>
            <span className="shrink-0 px-3 py-1 rounded-full bg-surface-container text-outline font-label-sm text-xs font-semibold">
              Immutable Ledger Trigger
            </span>
          </div>

          {/* Step 4 */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-4">
              <span className="w-9 h-9 rounded-xl bg-primary-container text-white flex items-center justify-center font-bold text-base shrink-0 mt-0.5">
                4
              </span>
              <div>
                <h3 className="font-headline-sm text-base text-primary font-bold">Beneficiary Verification & Purpose Gating</h3>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                  Field partners onboard local beneficiaries. An independent platform verifier inspects identification details and marks the record <code className="bg-surface-container px-1 rounded text-xs font-mono">VERIFIED</code>. Any payout requested for an unverified beneficiary or mismatched purpose code is rejected by database constraints.
                </p>
              </div>
            </div>
            <span className="shrink-0 px-3 py-1 rounded-full bg-surface-container text-outline font-label-sm text-xs font-semibold">
              Beneficiary Verification Gate
            </span>
          </div>

          {/* Step 5 */}
          <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-4">
              <span className="w-9 h-9 rounded-xl bg-primary-container text-white flex items-center justify-center font-bold text-base shrink-0 mt-0.5">
                5
              </span>
              <div>
                <h3 className="font-headline-sm text-base text-primary font-bold">Three-Way Separation of Duties Disbursal</h3>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                  To prevent unauthorized release: (1) An authorized NGO requester creates the disbursement request. (2) A distinct platform Payout Approver verifies the available ledger balance and approves it. (3) A third distinct Payout Operator executes payment and inputs the banking reference. Trigger <code className="bg-surface-container px-1 rounded text-xs font-mono">record_disbursement_payment()</code> posts the negative ledger entry.
                </p>
              </div>
            </div>
            <span className="shrink-0 px-3 py-1 rounded-full bg-surface-container text-outline font-label-sm text-xs font-semibold">
              Three-Way Separation
            </span>
          </div>
        </div>
      </section>

      {/* 5. DATABASE-BACKED INTEGRITY IN PLAIN LANGUAGE */}
      <section id="database-integrity" className="space-y-6">
        <div className="max-w-3xl">
          <span className="font-label-sm text-xs text-secondary font-bold uppercase tracking-wider block">
            Relational Architecture Explained
          </span>
          <h2 className="font-headline-lg text-headline-lg text-primary font-bold mt-1">
            How Database Constraints Enforce Honesty
          </h2>
          <p className="font-body-md text-on-surface-variant mt-2 leading-relaxed">
            While typical applications handle financial logic in easily modifiable JavaScript or Python code, DonateKaro delegates critical financial safety rules directly to the PostgreSQL engine:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl">account_balance</span>
              <h3 className="font-headline-sm text-base text-primary font-bold">Double-Entry Fund Ledger</h3>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Every financial event in DonateKaro is recorded as an immutable signed delta in <code className="font-mono text-xs px-1 bg-surface-container rounded">fund_ledger_entry</code>. When you view a campaign’s raised amount, the server does not read a static column that an administrator could inflate. It sums the real, settled inflow events minus any recorded refunds.
            </p>
            <div className="text-xs text-outline bg-surface-container-low/50 p-2.5 rounded-lg border border-outline-variant/15">
              <strong>Technical Implementation:</strong> View <code className="font-mono text-[11px]">public_campaign_discovery</code> dynamically aggregates ledger inflows with <code className="font-mono text-[11px]">COALESCE(SUM(amount_delta), 0)</code>.
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-2xl">security</span>
              <h3 className="font-headline-sm text-base text-secondary font-bold">Engine-Level Separation of Duties</h3>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              DonateKaro rejects the single-admin model. A disbursement requester cannot approve their own release, and the approver cannot be the individual who marks the payout paid. Even if an attacker compromised an application endpoint, the underlying PostgreSQL constraint blocks unauthorized single-actor payouts.
            </p>
            <div className="text-xs text-outline bg-surface-container-low/50 p-2.5 rounded-lg border border-outline-variant/15">
              <strong>Technical Implementation:</strong> Constraint <code className="font-mono text-[11px]">disbursement_separation_metadata_check</code> enforces <code className="font-mono text-[11px]">requested_by ≠ approved_by ≠ paid_by</code>.
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary text-2xl">label</span>
              <h3 className="font-headline-sm text-base text-tertiary font-bold">Controlled Purpose Vocabulary</h3>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              All campaigns and disbursements are bound to five discrete categories: <code className="font-mono text-xs px-1 bg-surface-container rounded">EDUCATION</code>, <code className="font-mono text-xs px-1 bg-surface-container rounded">FOOD</code>, <code className="font-mono text-xs px-1 bg-surface-container rounded">HEALTH</code>, <code className="font-mono text-xs px-1 bg-surface-container rounded">SHELTER</code>, and <code className="font-mono text-xs px-1 bg-surface-container rounded">GENERAL</code>. Money pledged for pediatric food mid-day meals cannot be siphoned into unrelated administrative travel.
            </p>
            <div className="text-xs text-outline bg-surface-container-low/50 p-2.5 rounded-lg border border-outline-variant/15">
              <strong>Technical Implementation:</strong> Foreign key references to <code className="font-mono text-[11px]">purpose_category</code> validated by trigger <code className="font-mono text-[11px]">guard_disbursement_payment()</code>.
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl">history</span>
              <h3 className="font-headline-sm text-base text-primary font-bold">Append-Only Immutability & Safe Refunds</h3>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Financial data cannot be deleted or overwritten. Database triggers reject direct <code className="font-mono text-xs px-1 bg-surface-container rounded">DELETE</code> or <code className="font-mono text-xs px-1 bg-surface-container rounded">UPDATE</code> calls on donations, ledger rows, and audit logs. Refunds insert compensating entries and are strictly blocked if the underlying funds have already been spent in the field.
            </p>
            <div className="text-xs text-outline bg-surface-container-low/50 p-2.5 rounded-lg border border-outline-variant/15">
              <strong>Technical Implementation:</strong> Trigger <code className="font-mono text-[11px]">reject_history_mutation()</code> guarantees append-only permanence for all financial tables.
            </div>
          </div>
        </div>
      </section>

      {/* 6. PROTOTYPE DISCLOSURES & ACADEMIC LIMITATIONS */}
      <section id="prototype-disclosures" className="p-6 md:p-8 rounded-2xl bg-surface-container-low/70 border border-outline-variant/40 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-secondary text-2xl">school</span>
          <div>
            <h2 className="font-headline-sm text-lg text-primary font-bold">
              Academic PBL Prototype & Operational Sandbox Disclosures
            </h2>
            <span className="text-xs text-outline">B.Tech CSE Semester III • DBMS Course CSL0311 Capstone Project</span>
          </div>
        </div>

        <p className="text-sm text-on-surface-variant leading-relaxed">
          In alignment with academic ethics and transparent software engineering, the following limitations and prototype boundaries are explicitly disclosed:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-on-surface-variant">
          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
            <strong className="text-primary block mb-1">Simulated Payment Gateway:</strong>
            All donation flows operate in a simulation sandbox backed by OpenAPI 3.1.0 specifications and PostgreSQL test harnesses. No live banking APIs, UPI switches, or real currency transactions are processed.
          </div>
          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
            <strong className="text-primary block mb-1">No 80G Tax Exemption:</strong>
            DonateKaro does not issue legal Indian Income Tax Section 80G tax exemption certificates. Settlement receipts represent database clearing proofs, not legal tax exemption claims.
          </div>
          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
            <strong className="text-primary block mb-1">Demo Persona & Mock State:</strong>
            The client-side role switcher (Donor, NGO, Reviewer) and in-memory mock campaigns (IDs 101–105) exist to demonstrate user interactions. Real backend writes require authenticated OIDC credentials and explicit database write flags.
          </div>
          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
            <strong className="text-primary block mb-1">Organizational Credential Recording:</strong>
            Participating non-profit registration references are recorded relationally for audit demonstration, but the system is not connected to external government databases (Darpan or FCRA portals).
          </div>
        </div>
      </section>

      {/* 7. CALL TO ACTION SECTION */}
      <section className="text-center py-8 space-y-4">
        <h2 className="font-headline-lg text-headline-lg text-primary font-bold">
          Ready to Explore Governed Philanthropy?
        </h2>
        <p className="font-body-md text-on-surface-variant max-w-xl mx-auto leading-relaxed">
          Discover verified charitable initiatives across India, or explore our institutional workspaces to see database-backed governance in action.
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onExplore}
            className="h-12 px-6 rounded-lg bg-primary text-white font-label-md font-semibold hover:bg-primary-container transition-colors shadow-sm inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">explore</span>
            Explore Active Campaigns
          </button>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('ngo-portal')}
              className="h-12 px-5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md font-semibold transition-colors inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">domain</span>
              Open NGO Partner Portal
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
