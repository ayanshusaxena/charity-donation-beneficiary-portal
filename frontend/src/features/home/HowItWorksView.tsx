import React from 'react';

export const HowItWorksView: React.FC<{ onExplore: () => void }> = ({ onExplore }) => {
  return (
    <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin py-10">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <span className="px-3 py-1 rounded-full bg-primary-container text-white font-label-sm text-xs font-bold uppercase tracking-wider">
          Architecture & Verification
        </span>
        <h1 className="font-headline-lg text-headline-lg text-primary font-bold mt-3">
          How DonateKaro Guarantees Financial Integrity
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-2 leading-relaxed">
          Unlike platforms relying on self-reported spreadsheets or opaque escrow, DonateKaro implements problem-based learning (PBL) database triggers and strict workflow state-machines directly in PostgreSQL.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        {/* Pillar 1 */}
        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary-container text-white flex items-center justify-center font-bold text-xl">
            1
          </div>
          <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
            Double-Entry Fund Ledger
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            Every settled contribution generates balanced debit and credit entries in the database ledger. The <code className="font-mono text-xs px-1 bg-surface-container rounded">amount_raised</code> shown on campaigns is mathematically derived from immutable posted clearing events, eliminating inflated vanity metrics.
          </p>
        </div>

        {/* Pillar 2 */}
        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
          <div className="w-12 h-12 rounded-xl bg-secondary text-white flex items-center justify-center font-bold text-xl">
            2
          </div>
          <h3 className="font-headline-sm text-headline-sm text-secondary font-bold">
            Controlled Purpose Vocabulary
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            All causes are constrained to database-validated purpose codes (<code className="font-mono text-xs px-1 bg-surface-container rounded">EDUCATION</code>, <code className="font-mono text-xs px-1 bg-surface-container rounded">FOOD</code>, <code className="font-mono text-xs px-1 bg-surface-container rounded">HEALTH</code>, <code className="font-mono text-xs px-1 bg-surface-container rounded">SHELTER</code>, <code className="font-mono text-xs px-1 bg-surface-container rounded">GENERAL</code>). Beneficiary disbursements are restricted to matching categories.
          </p>
        </div>

        {/* Pillar 3 */}
        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
          <div className="w-12 h-12 rounded-xl bg-tertiary-container text-white flex items-center justify-center font-bold text-xl">
            3
          </div>
          <h3 className="font-headline-sm text-headline-sm text-tertiary font-bold">
            Multi-Party Separation of Duties
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            Database constraints enforce that a disbursement requester cannot approve their own payout, and payout operators cannot authorize disbursements. Beneficiaries must possess an independent verified onboarding record prior to payout release.
          </p>
        </div>

        {/* Pillar 4 */}
        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
          <div className="w-12 h-12 rounded-xl bg-inverse-surface text-secondary-container flex items-center justify-center font-bold text-xl">
            4
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
            Idempotent Settlement & Official Receipts
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            Payment attempts utilize client-generated idempotency keys. Official settlement receipts and unique transaction reference numbers are emitted only after clearing commits successfully, preventing double-charging on network retries.
          </p>
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={onExplore}
          className="px-6 py-3.5 rounded-xl bg-primary-container text-white font-label-md font-bold hover:bg-primary transition-colors shadow-md inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">explore</span>
          Explore Verified Causes
        </button>
      </div>
    </div>
  );
};
