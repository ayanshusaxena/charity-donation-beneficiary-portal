import React from 'react';
import { PurposeCode } from '../../types/api';

interface FooterProps {
  onNavigate?: (view: string) => void;
  onSelectPurpose?: (purpose?: PurposeCode) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onSelectPurpose }) => {
  return (
    <footer className="w-full bg-inverse-surface text-inverse-on-surface border-t border-outline-variant/20 pt-12 pb-10">
      <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-xl mb-10">
          {/* Brand & Mission */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary-container text-secondary-container flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-secondary-container" style={{ fontVariationSettings: "'FILL' 1" }}>
                  volunteer_activism
                </span>
              </span>
              <span className="font-headline-sm text-headline-sm text-surface-bright font-bold">
                DonateKaro
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-surface-dim leading-relaxed">
              Empowering grassroots non-profits across India through transparent, direct, and accountable donor engagement.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-container/60 text-primary-fixed font-label-sm text-label-sm border border-primary-fixed/20">
                <span className="material-symbols-outlined text-xs">verified</span> Verified Non-Profits
              </span>
            </div>
          </div>

          {/* Causes & Direct Impact */}
          <div className="flex flex-col gap-2.5">
            <h4 className="font-label-md text-label-md text-surface-bright font-bold uppercase tracking-wider mb-1">
              Verified Causes
            </h4>
            <button
              type="button"
              onClick={() => {
                onSelectPurpose?.('EDUCATION');
                onNavigate?.('explore-campaigns');
              }}
              className="text-left font-body-sm text-body-sm text-surface-dim hover:text-white transition-colors"
            >
              Foundational Education & STEM
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectPurpose?.('FOOD');
                onNavigate?.('explore-campaigns');
              }}
              className="text-left font-body-sm text-body-sm text-surface-dim hover:text-white transition-colors"
            >
              Child Nutrition & Food Security
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectPurpose?.('HEALTH');
                onNavigate?.('explore-campaigns');
              }}
              className="text-left font-body-sm text-body-sm text-surface-dim hover:text-white transition-colors"
            >
              Rural Healthcare & Diagnostics
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectPurpose?.('SHELTER');
                onNavigate?.('explore-campaigns');
              }}
              className="text-left font-body-sm text-body-sm text-surface-dim hover:text-white transition-colors"
            >
              Emergency Shelter & Relief
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectPurpose?.(undefined);
                onNavigate?.('explore-campaigns');
              }}
              className="text-left font-body-sm text-body-sm text-secondary-fixed hover:text-white transition-colors font-medium"
            >
              View All Active Causes →
            </button>
          </div>

          {/* Trust & Portals */}
          <div className="flex flex-col gap-2.5">
            <h4 className="font-label-md text-label-md text-surface-bright font-bold uppercase tracking-wider mb-1">
              Trust & Governance
            </h4>
            <button
              type="button"
              onClick={() => onNavigate?.('about')}
              className="text-left font-body-sm text-body-sm text-surface-dim hover:text-white transition-colors"
            >
              About DonateKaro & Governance
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('ngo-portal')}
              className="text-left font-body-sm text-body-sm text-surface-dim hover:text-white transition-colors"
            >
              NGO Partner Portal
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('reviewer-portal')}
              className="text-left font-body-sm text-body-sm text-surface-dim hover:text-white transition-colors"
            >
              Auditor & Reviewer Desk
            </button>
          </div>

          {/* Accountability Standards */}
          <div className="flex flex-col gap-2.5">
            <h4 className="font-label-md text-label-md text-surface-bright font-bold uppercase tracking-wider mb-1">
              Accountability
            </h4>
            <div className="flex items-start gap-2 text-surface-dim font-body-sm text-body-sm">
              <span className="material-symbols-outlined text-sm text-secondary-fixed mt-0.5">verified_user</span>
              <span>Direct Allocation to Verified Beneficiaries</span>
            </div>
            <div className="flex items-start gap-2 text-surface-dim font-body-sm text-body-sm">
              <span className="material-symbols-outlined text-sm text-secondary-fixed mt-0.5">receipt_long</span>
              <span>Audited Double-Entry Settlement Receipts</span>
            </div>
            <div className="flex items-start gap-2 text-surface-dim font-body-sm text-body-sm">
              <span className="material-symbols-outlined text-sm text-secondary-fixed mt-0.5">policy</span>
              <span>Strict Segregation of Review & Disbursal</span>
            </div>
            <div className="flex items-start gap-2 text-surface-dim font-body-sm text-body-sm">
              <span className="material-symbols-outlined text-sm text-secondary-fixed mt-0.5">lock_clock</span>
              <span>Auditable Ledger Trails for Every Rupee</span>
            </div>
          </div>
        </div>

        {/* Compact Academic PBL Prototype Disclaimer */}
        <div className="rounded-xl bg-surface-container-lowest/5 border border-outline-variant/15 p-4 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-surface-dim">
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined text-base text-secondary-fixed shrink-0 mt-0.5">school</span>
            <p className="leading-relaxed">
              <strong className="text-surface-bright">Academic Evaluation Prototype:</strong> DonateKaro is a Problem-Based Learning (PBL) prototype demonstrating end-to-end database constraint enforcement and multi-role charity governance. Transactions and payments operate in an educational sandbox environment.
            </p>
          </div>
          <span className="shrink-0 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 font-label-sm text-secondary-fixed font-semibold">
            PostgreSQL 15+ & OpenAPI 3.1
          </span>
        </div>

        {/* Bottom Legal / Metadata Bar */}
        <div className="border-t border-outline-variant/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 font-label-sm text-label-sm text-surface-dim">
          <span>© 2026 DonateKaro PBL Capstone • Educational Demonstration System</span>
          <span>OpenAPI 3.1.0 Specification Conformance</span>
        </div>
      </div>
    </footer>
  );
};
