import React from 'react';

export const TrustView: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin py-10">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <span className="px-3 py-1 rounded-full bg-tertiary-container text-white font-label-sm text-xs font-bold uppercase tracking-wider">
          Compliance & Assurance
        </span>
        <h1 className="font-headline-lg text-headline-lg text-primary font-bold mt-3">
          Trust & Verification Governance
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-2 leading-relaxed">
          How DonateKaro audits campaigns, verifies field organizations, and enforces transparency across the entire lifecycle.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-col gap-3">
          <span className="material-symbols-outlined text-primary text-3xl">verified</span>
          <h3 className="font-headline-sm text-base text-primary font-bold">NGO Partner Onboarding</h3>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            All participating organizations submit official registration numbers, FCRA accreditation certificates, and authorized signatory credentials before campaign creation is unlocked.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-col gap-3">
          <span className="material-symbols-outlined text-secondary text-3xl">fact_check</span>
          <h3 className="font-headline-sm text-base text-secondary font-bold">Independent IRB Review</h3>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Every proposed cause must pass formal inspection by the Institutional Review Board (IRB). Reviewers verify budget breakdowns, target demographic eligibility, and audit timelines.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-col gap-3">
          <span className="material-symbols-outlined text-tertiary text-3xl">history_edu</span>
          <h3 className="font-headline-sm text-base text-tertiary font-bold">Immutable Audit Trail</h3>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Every submission, review decision, payment attempt, clearing ledger delta, and disbursement is immutably timestamped and linked to actor principals in PostgreSQL.
          </p>
        </div>
      </div>
    </div>
  );
};
