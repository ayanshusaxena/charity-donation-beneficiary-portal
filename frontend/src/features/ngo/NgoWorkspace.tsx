import React, { useState, useEffect } from 'react';
import { Campaign, PurposeCode, BackendOrganizationMembershipOut, ClosureRequest } from '../../types/api';
import {
  fetchOrganizationCampaigns,
  createCampaignDraft,
  updateCampaignDraft,
  submitCampaignForReview,
  registerOrganization,
  fetchMyOrganizations,
  requestCampaignClosure,
  fetchOrganizationClosureRequests,
} from '../../api/ngo';
import { useSandbox } from '../../context/SandboxContext';

export const NgoWorkspace: React.FC = () => {
  const { isSandbox } = useSandbox();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active Organization identity
  const [activeOrg, setActiveOrg] = useState<BackendOrganizationMembershipOut>({
    organization_id: '1',
    organization_name: 'Bal Vikas Trust',
    roles: ['CAMPAIGN_EDITOR'],
    verification_status: 'VERIFIED',
    review_reason: null,
  });
  const [applicantToken, setApplicantToken] = useState<string>(() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem('donatekaro_applicant_token') || '' : '';
    } catch {
      return '';
    }
  });

  // Modals
  const [isDraftModalOpen, setIsDraftModalOpen] = useState<boolean>(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState<boolean>(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);

  // Draft form state (supports incomplete drafts)
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPurposeCode, setDraftPurposeCode] = useState<PurposeCode>('EDUCATION');
  const [draftTargetAmount, setDraftTargetAmount] = useState('350000');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftStartDate, setDraftStartDate] = useState('2026-10-01');
  const [draftEndDate, setDraftEndDate] = useState('2026-12-31');
  const [draftSubmitting, setDraftSubmitting] = useState(false);

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regRef, setRegRef] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);

  // Resume token input
  const [resumeTokenInput, setResumeTokenInput] = useState('');

  // Closure Request state
  const [closureRequests, setClosureRequests] = useState<ClosureRequest[]>([]);
  const [isClosureModalOpen, setIsClosureModalOpen] = useState<boolean>(false);
  const [closureCampaign, setClosureCampaign] = useState<Campaign | null>(null);
  const [closureReason, setClosureReason] = useState<string>('');
  const [closureSubmitting, setClosureSubmitting] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (isSandbox) {
        // Fetch organization info first if token present
        if (applicantToken) {
          try {
            const orgs = await fetchMyOrganizations(isSandbox, applicantToken);
            if (orgs.length > 0) {
              setActiveOrg(orgs[0]);
            }
          } catch {
            // Keep current active org on error
          }
        }
        const items = applicantToken
          ? await fetchOrganizationCampaigns(activeOrg.organization_id, isSandbox, applicantToken)
          : await fetchOrganizationCampaigns(activeOrg.organization_id, isSandbox);
        setCampaigns(items);

        try {
          const reqs = await fetchOrganizationClosureRequests(activeOrg.organization_id, isSandbox, applicantToken);
          setClosureRequests(reqs);
        } catch {
          setClosureRequests([]);
        }
      } else {
        // Live mode: Use registered applicant token or default demo mock token
        const effectiveToken = applicantToken || 'mock-ngo-editor';
        const orgs = await fetchMyOrganizations(false, effectiveToken);
        if (orgs.length > 0) {
          setActiveOrg(orgs[0]);
          const items = await fetchOrganizationCampaigns(orgs[0].organization_id, false, effectiveToken);
          setCampaigns(items);

          try {
            const reqs = await fetchOrganizationClosureRequests(orgs[0].organization_id, false, effectiveToken);
            setClosureRequests(reqs);
          } catch {
            setClosureRequests([]);
          }
          return;
        }
        setLoadError(
          'Live Access: No organizations found for this token. Register a new NGO or resume with a valid applicant token.'
        );
        setCampaigns([]);
        setClosureRequests([]);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load organization campaigns.');
      setCampaigns([]);
      setClosureRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isSandbox, activeOrg.organization_id, applicantToken]);

  const handleOpenCreateDraft = () => {
    setEditingCampaignId(null);
    setDraftTitle('');
    setDraftPurposeCode('EDUCATION');
    setDraftTargetAmount('');
    setDraftDescription('');
    setDraftStartDate('');
    setDraftEndDate('');
    setIsDraftModalOpen(true);
  };

  const handleOpenEditDraft = (campaign: Campaign) => {
    setEditingCampaignId(campaign.campaign_id);
    setDraftTitle(campaign.title);
    setDraftPurposeCode(campaign.purpose_code || 'EDUCATION');
    setDraftTargetAmount(campaign.target_amount && campaign.target_amount !== '0.00' ? campaign.target_amount : '');
    setDraftDescription(campaign.description || '');
    setDraftStartDate(campaign.start_date || '');
    setDraftEndDate(campaign.end_date || '');
    setIsDraftModalOpen(true);
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) {
      setActionError('Campaign title is required to save a draft.');
      return;
    }

    setDraftSubmitting(true);
    setActionError(null);
    const token = applicantToken || (isSandbox ? undefined : 'mock-ngo-editor');
    try {
      if (editingCampaignId) {
        // Edit existing draft
        await updateCampaignDraft(
          editingCampaignId,
          {
            title: draftTitle.trim(),
            purpose_code: draftPurposeCode,
            target_amount: draftTargetAmount ? draftTargetAmount : undefined,
            description: draftDescription.trim(),
            start_date: draftStartDate || undefined,
            end_date: draftEndDate || undefined,
          },
          isSandbox,
          token
        );
        setSuccessMsg(`Campaign #${editingCampaignId} draft updated successfully!`);
      } else {
        // Create new incomplete draft
        await createCampaignDraft(
          activeOrg.organization_id,
          {
            title: draftTitle.trim(),
            purpose_code: draftPurposeCode,
            target_amount: draftTargetAmount ? draftTargetAmount : undefined,
            description: draftDescription.trim(),
            start_date: draftStartDate || undefined,
            end_date: draftEndDate || undefined,
          },
          isSandbox,
          token
        );
        setSuccessMsg('New campaign draft created! You can edit and complete required fields anytime.');
      }
      setIsDraftModalOpen(false);
      loadData();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to save campaign draft.');
    } finally {
      setDraftSubmitting(false);
    }
  };

  const handleSubmitForReview = async (campaign: Campaign) => {
    setActionError(null);

    // 1. Check organization verification status
    if (activeOrg.verification_status !== 'VERIFIED') {
      setActionError(
        `Organization Verification Required: ${activeOrg.organization_name} is currently ${activeOrg.verification_status}. Campaigns cannot be submitted until an IRB faculty reviewer approves the organization.`
      );
      return;
    }

    // 2. Validate completeness of required fields
    const missing: string[] = [];
    if (!campaign.title || campaign.title.trim().length < 1) missing.push('Title');
    if (!campaign.description || campaign.description.trim().length < 10) {
      missing.push('Purpose description (at least 10 characters)');
    }
    if (!campaign.purpose_code) missing.push('Purpose classification');
    const target = parseFloat(campaign.target_amount);
    if (isNaN(target) || target <= 0) missing.push('Target funding goal (> 0)');
    if (!campaign.start_date || !campaign.end_date) missing.push('Start and End dates');
    if (campaign.start_date && campaign.end_date && campaign.end_date < campaign.start_date) {
      missing.push('End date must be after start date');
    }

    if (missing.length > 0) {
      setActionError(
        `Incomplete Draft: Cannot submit to review queue. Please complete: ${missing.join(', ')}.`
      );
      return;
    }

    const token = applicantToken || (isSandbox ? undefined : 'mock-ngo-editor');
    try {
      await submitCampaignForReview(campaign.campaign_id, isSandbox, token);
      setSuccessMsg(`Campaign #${campaign.campaign_id} submitted to Reviewer Queue!`);
      loadData();
    } catch (err: any) {
      setActionError(err?.message || `Failed to submit campaign #${campaign.campaign_id} for review.`);
    }
  };

  const handleOpenClosureModal = (campaign: Campaign) => {
    setClosureCampaign(campaign);
    setClosureReason('');
    setActionError(null);
    setIsClosureModalOpen(true);
  };

  const handleSubmitClosureRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closureCampaign) return;
    if (!closureReason.trim() || closureReason.trim().length < 5) {
      setActionError('A closure reason of at least 5 characters is required.');
      return;
    }
    setClosureSubmitting(true);
    setActionError(null);
    const token = applicantToken || (isSandbox ? undefined : 'mock-ngo-editor');
    try {
      await requestCampaignClosure(closureCampaign.campaign_id, closureReason.trim(), isSandbox, token);
      setSuccessMsg(`Closure request for Campaign #${closureCampaign.campaign_id} ("${closureCampaign.title}") submitted to IRB review.`);
      setIsClosureModalOpen(false);
      loadData();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to submit closure request.');
    } finally {
      setClosureSubmitting(false);
    }
  };

  const handleRegisterOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regRef.trim()) return;

    setRegSubmitting(true);
    setActionError(null);
    try {
      const res = await registerOrganization(
        {
          organization_name: regName.trim(),
          registration_ref: regRef.trim(),
          email: regEmail.trim() || undefined,
          phone: regPhone.trim() || undefined,
        },
        isSandbox
      );

      const token = res.applicant_access_token;
      setApplicantToken(token);
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('donatekaro_applicant_token', token);
      } catch {
        // ignore storage errors
      }

      setActiveOrg({
        organization_id: res.organization_id,
        organization_name: res.organization_name,
        roles: ['CAMPAIGN_EDITOR'],
        verification_status: 'PENDING',
        review_reason: null,
      });

      setSuccessMsg(
        `Registration Submitted! Your Applicant Capability Token: "${token}". Save this token securely to resume your workspace. Verification is PENDING review.`
      );
      setIsRegisterModalOpen(false);
      setRegName('');
      setRegRef('');
      setRegEmail('');
      setRegPhone('');
    } catch (err: any) {
      setActionError(err?.message || 'Failed to register organization.');
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleResumeWithToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeTokenInput.trim()) return;

    const token = resumeTokenInput.trim();
    setActionError(null);
    try {
      const orgs = await fetchMyOrganizations(isSandbox, token);
      if (orgs.length > 0) {
        setApplicantToken(token);
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem('donatekaro_applicant_token', token);
        } catch {
          // ignore
        }
        setActiveOrg(orgs[0]);
        setSuccessMsg(`Workspace resumed for ${orgs[0].organization_name}!`);
        setIsResumeModalOpen(false);
        setResumeTokenInput('');
      } else {
        setActionError('No organization found associated with this token.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Invalid applicant token.');
    }
  };

  const handleResetToDemo = () => {
    setApplicantToken('');
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('donatekaro_applicant_token');
    } catch {
      // ignore
    }
    setActiveOrg({
      organization_id: '1',
      organization_name: 'Bal Vikas Trust',
      roles: ['CAMPAIGN_EDITOR'],
      verification_status: 'VERIFIED',
      review_reason: null,
    });
    setSuccessMsg('Reset workspace to default demo organization (Bal Vikas Trust - VERIFIED).');
  };

  const totalRaised = campaigns.reduce(
    (acc, c) => acc + (parseFloat(c.amount_raised) || 0),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin py-8">
      {/* NGO Identity & Onboarding Banner */}
      <section className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-6 md:p-8 shadow-sm border border-outline-variant/30 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start md:items-center gap-4">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden shrink-0 shadow-md bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-4xl">domain</span>
            </div>
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {/* Verification Status Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${
                    activeOrg.verification_status === 'VERIFIED'
                      ? 'bg-primary-container text-white'
                      : activeOrg.verification_status === 'PENDING'
                      ? 'bg-secondary-fixed text-on-secondary-fixed'
                      : 'bg-error-container text-on-error-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-xs">
                    {activeOrg.verification_status === 'VERIFIED' ? 'verified' : activeOrg.verification_status === 'PENDING' ? 'hourglass_top' : 'cancel'}
                  </span>
                  Org Status: {activeOrg.verification_status}
                </span>

                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">
                  Role: CAMPAIGN_EDITOR
                </span>
                {applicantToken && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container text-outline font-mono text-xs" title={applicantToken}>
                    Token: {applicantToken.substring(0, 14)}...
                  </span>
                )}
              </div>
              <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
                {activeOrg.organization_name}
              </h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                <span className="material-symbols-outlined text-sm text-outline">verified_user</span>
                Org ID: #{activeOrg.organization_id} &bull; Academic Prototype Simulated NGO Lifecycle
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleOpenCreateDraft}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-secondary-container text-white font-label-md text-label-md hover:bg-secondary transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Create Campaign Draft
            </button>
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-surface-container-high text-primary hover:bg-surface-container-highest transition-colors font-label-md text-sm font-semibold shadow-sm"
            >
              <span className="material-symbols-outlined text-base">app_registration</span>
              Register New NGO
            </button>
            <button
              onClick={() => setIsResumeModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-sm"
              title="Resume with Token"
            >
              <span className="material-symbols-outlined text-base">key</span>
              Resume
            </button>
            {applicantToken && (
              <button
                onClick={handleResetToDemo}
                className="inline-flex items-center justify-center p-2.5 rounded-xl bg-surface-container text-outline hover:text-primary transition-colors"
                title="Reset to Demo (Bal Vikas Trust)"
              >
                <span className="material-symbols-outlined text-base">restart_alt</span>
              </button>
            )}
            <button
              onClick={loadData}
              className="p-2.5 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors shadow-sm"
              title="Refresh"
            >
              <span className="material-symbols-outlined text-lg">sync</span>
            </button>
          </div>
        </div>

        {/* Verification Status Banner */}
        {activeOrg.verification_status === 'PENDING' && (
          <div className="mt-4 p-4 rounded-xl bg-secondary-fixed/30 border border-secondary/40 text-on-surface flex items-start gap-3">
            <span className="material-symbols-outlined text-secondary text-2xl shrink-0">pending_actions</span>
            <div className="text-sm">
              <span className="font-bold block text-secondary">Organization Verification Pending Review</span>
              Your NGO registration is currently pending reviewer evaluation. You can prepare, edit, and refine campaign drafts now. However, campaigns cannot be submitted to the review queue until a reviewer verifies your organization.
            </div>
          </div>
        )}

        {activeOrg.verification_status === 'REJECTED' && (
          <div className="mt-4 p-4 rounded-xl bg-error-container/30 border border-error/40 text-on-surface flex items-start gap-3">
            <span className="material-symbols-outlined text-error text-2xl shrink-0">error</span>
            <div className="text-sm">
              <span className="font-bold block text-error">Organization Verification Rejected</span>
              {activeOrg.review_reason
                ? `Reviewer Reason: "${activeOrg.review_reason}"`
                : 'Your organization application was not approved by reviewers.'}
            </div>
          </div>
        )}
      </section>

      {/* Success Notification */}
      {successMsg && (
        <div className="mb-6 p-4 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            <span className="break-all">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Action Error Notification */}
      {actionError && (
        <div className="mb-6 p-4 rounded-xl bg-error-container/20 border border-error/30 text-on-surface font-label-sm text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error">error</span>
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Metrics Overview Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl p-4 bg-surface-container-lowest shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
              Total Raised (Simulated)
            </span>
            <span className="p-2 rounded-lg bg-surface-container text-primary">
              <span className="material-symbols-outlined text-base">payments</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="font-metric-lg text-metric-lg text-primary font-bold">
              ₹{totalRaised.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-on-tertiary-container mt-1">100% Cleared on Fund Ledger</div>
          </div>
        </div>

        <div className="rounded-xl p-4 bg-surface-container-lowest shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
              Active Campaigns
            </span>
            <span className="p-2 rounded-lg bg-primary-fixed/40 text-primary">
              <span className="material-symbols-outlined text-base">campaign</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="font-metric-lg text-metric-lg text-on-surface font-bold">
              {campaigns.filter((c) => c.status === 'ACTIVE').length}
            </div>
            <div className="text-xs text-outline mt-1">Accepting Contributions</div>
          </div>
        </div>

        <div className="rounded-xl p-4 bg-surface-container-lowest shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
              Drafts &amp; Under Review
            </span>
            <span className="p-2 rounded-lg bg-surface-container-high text-secondary">
              <span className="material-symbols-outlined text-base">fact_check</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="font-metric-lg text-metric-lg text-secondary font-bold">
              {campaigns.filter((c) => c.status === 'SUBMITTED' || c.status === 'DRAFT').length}
            </div>
            <div className="text-xs text-secondary mt-1">
              {campaigns.filter((c) => c.status === 'DRAFT').length} Drafts &bull; {campaigns.filter((c) => c.status === 'SUBMITTED').length} In Queue
            </div>
          </div>
        </div>

        {/* Organization Verification Status Card (replaces 100% disbursement readiness placeholder) */}
        <div className="rounded-xl p-4 bg-surface-container-lowest shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
              Organization Status
            </span>
            <span className="p-2 rounded-lg bg-tertiary-fixed text-primary">
              <span className="material-symbols-outlined text-base">verified_user</span>
            </span>
          </div>
          <div className="mt-3">
            <div
              className={`font-metric-lg text-xl font-bold ${
                activeOrg.verification_status === 'VERIFIED'
                  ? 'text-primary'
                  : activeOrg.verification_status === 'PENDING'
                  ? 'text-secondary'
                  : 'text-error'
              }`}
            >
              {activeOrg.verification_status}
            </div>
            <div className="text-xs text-outline mt-1">Reviewer Verification Status</div>
          </div>
        </div>
      </section>

      {/* Campaigns Lifecycle Table */}
      <section className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
            Owned Campaigns &amp; Lifecycle State
          </h2>
          <span className="text-xs text-outline">
            Incomplete drafts supported &bull; Validation enforced upon submission
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-outline flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-2xl animate-spin">progress_activity</span>
            <span>Loading campaigns...</span>
          </div>
        ) : loadError ? (
          <div className="py-10 px-6 text-center bg-surface-container rounded-xl border border-outline-variant/30 text-on-surface flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-secondary">lock</span>
            <span className="font-semibold text-base">{loadError}</span>
            <button
              onClick={loadData}
              className="mt-2 px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-sm font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Retry
            </button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-12 text-center text-outline flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-4xl text-outline-variant">post_add</span>
            <span>No campaigns found in this organization.</span>
            <button
              onClick={handleOpenCreateDraft}
              className="mt-2 text-sm text-secondary font-semibold hover:underline"
            >
              Create your first campaign draft
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-container text-on-surface-variant font-label-sm text-label-sm uppercase">
                <tr>
                  <th className="py-3 px-4">Campaign Title</th>
                  <th className="py-3 px-4">Purpose</th>
                  <th className="py-3 px-4">Target Goal</th>
                  <th className="py-3 px-4">Amount Raised</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {campaigns.map((c) => {
                  const isIncomplete =
                    !c.description ||
                    c.description.trim().length < 10 ||
                    parseFloat(c.target_amount) <= 0 ||
                    !c.start_date ||
                    !c.end_date;

                  const pendingClosure = closureRequests.find((r) => r.campaign_id === c.campaign_id && r.status === 'PENDING');
                  const rejectedClosure = closureRequests.find((r) => r.campaign_id === c.campaign_id && r.status === 'REJECTED');

                  return (
                    <tr key={c.campaign_id} className="hover:bg-surface-container/50">
                      <td className="py-3.5 px-4 font-semibold text-on-surface max-w-xs">
                        <div className="truncate">{c.title}</div>
                        <div className="flex items-center gap-2 text-xs font-mono text-outline font-normal">
                          <span>ID: #{c.campaign_id}</span>
                          {c.status === 'DRAFT' && isIncomplete && (
                            <span className="px-1.5 py-0.2 rounded bg-secondary-fixed/50 text-secondary text-[10px] font-sans font-bold">
                              Incomplete Draft
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-mono text-xs">
                          {c.purpose_code || 'GENERAL'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {parseFloat(c.target_amount) > 0
                          ? `₹${parseFloat(c.target_amount).toLocaleString('en-IN')}`
                          : <span className="text-outline italic">Not set</span>}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-primary">
                        ₹{parseFloat(c.amount_raised).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-label-sm text-xs font-bold ${
                              c.status === 'ACTIVE'
                                ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                                : c.status === 'APPROVED'
                                ? 'bg-primary-container text-white'
                                : c.status === 'SUBMITTED'
                                ? 'bg-secondary-fixed text-on-secondary-fixed'
                                : c.status === 'SUSPENDED'
                                ? 'bg-error-container text-error'
                                : c.status === 'CLOSED'
                                ? 'bg-outline-variant/60 text-outline'
                                : c.status === 'PAUSED'
                                ? 'bg-secondary-fixed/60 text-secondary'
                                : 'bg-surface-container text-outline'
                            }`}
                          >
                            {c.status === 'SUBMITTED' ? 'UNDER REVIEW' : c.status}
                          </span>
                          {pendingClosure && (
                            <span className="text-[10px] font-bold text-secondary flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-xs">pending</span> Closure Pending
                            </span>
                          )}
                          {rejectedClosure && !pendingClosure && (
                            <span className="text-[10px] text-error flex items-center gap-0.5" title={`Reviewer: ${rejectedClosure.review_reason}`}>
                              <span className="material-symbols-outlined text-xs">info</span> Closure Rejected
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {c.status === 'DRAFT' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditDraft(c)}
                              className="px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-sm text-xs font-semibold transition-colors"
                              title="Edit draft fields"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleSubmitForReview(c)}
                              className="px-3 py-1 rounded-lg bg-secondary-container hover:bg-secondary text-white font-label-sm text-xs font-bold transition-colors"
                              title="Submit for reviewer evaluation"
                            >
                              Submit
                            </button>
                          </div>
                        )}
                        {(c.status === 'ACTIVE' || c.status === 'PAUSED') && (
                          <div className="flex items-center justify-end">
                            {pendingClosure ? (
                              <span className="text-xs text-secondary font-semibold italic">Under Review</span>
                            ) : (
                              <button
                                onClick={() => handleOpenClosureModal(c)}
                                className="px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-error-container hover:text-error text-on-surface font-label-sm text-xs font-semibold transition-colors inline-flex items-center gap-1"
                                title="Request campaign closure"
                              >
                                <span className="material-symbols-outlined text-xs">block</span> Request Closure
                              </button>
                            )}
                          </div>
                        )}
                        {c.status === 'SUSPENDED' && (
                          <span className="text-xs text-error font-medium italic">Suspended by IRB</span>
                        )}
                        {c.status === 'CLOSED' && (
                          <span className="text-xs text-outline italic">Closed</span>
                        )}
                        {c.status === 'SUBMITTED' && (
                          <span className="text-xs text-outline italic">In Review Queue</span>
                        )}
                        {c.status === 'APPROVED' && (
                          <span className="text-xs text-primary font-medium italic">Approved</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Organization Closure Requests History */}
      {closureRequests.length > 0 && (
        <section className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-headline-sm text-base text-primary font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-lg">history_edu</span>
              Campaign Closure Requests
            </h3>
            <span className="text-xs text-outline">
              Governed by IRB Platform Reviewers
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-sm">
              <thead className="bg-surface-container/60 text-outline uppercase font-label-sm text-[11px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-4 rounded-l-lg">Req ID</th>
                  <th className="py-2.5 px-4">Campaign</th>
                  <th className="py-2.5 px-4">Reason</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 rounded-r-lg">Review Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {closureRequests.map((r) => (
                  <tr key={r.request_id} className="hover:bg-surface-container/40">
                    <td className="py-3 px-4 font-mono text-xs text-outline">#{r.request_id}</td>
                    <td className="py-3 px-4 font-medium text-on-surface">
                      {r.campaign_name || `Campaign #${r.campaign_id}`}
                    </td>
                    <td className="py-3 px-4 text-xs text-on-surface-variant max-w-xs truncate" title={r.request_reason}>
                      {r.request_reason}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full font-label-sm text-[11px] font-bold ${
                          r.status === 'PENDING'
                            ? 'bg-secondary-fixed text-secondary'
                            : r.status === 'APPROVED'
                            ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                            : 'bg-error-container text-error'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-outline">
                      {r.status === 'PENDING' ? (
                        <span className="italic">Awaiting IRB review</span>
                      ) : (
                        <span>
                          {r.reviewed_by && <span className="font-mono text-[10px] block">{r.reviewed_by}</span>}
                          {r.review_reason && <span className="text-on-surface italic block">"{r.review_reason}"</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Create / Edit Draft Modal */}
      {isDraftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-6 shadow-xl border border-outline-variant/40 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                {editingCampaignId ? `Edit Campaign Draft #${editingCampaignId}` : 'Create Campaign Draft'}
              </h3>
              <button
                onClick={() => setIsDraftModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-outline font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <div className="text-xs text-outline bg-surface-container/60 p-3 rounded-xl border border-outline-variant/20">
              <span className="font-semibold text-on-surface">Incremental Draft Support:</span> Only Campaign Title is required to save a draft. Complete remaining fields before submitting for review.
            </div>

            <form onSubmit={handleSaveDraft} className="flex flex-col gap-4">
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                  Campaign Title *
                </label>
                <input
                  type="text"
                  required
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="e.g. Village Solar Micro-Grid for PHC"
                  className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                    Purpose Category <span className="text-outline font-normal">(Optional)</span>
                  </label>
                  <select
                    value={draftPurposeCode}
                    onChange={(e) => setDraftPurposeCode(e.target.value as PurposeCode)}
                    className="w-full h-10 px-2 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="EDUCATION">EDUCATION</option>
                    <option value="FOOD">FOOD</option>
                    <option value="HEALTH">HEALTH</option>
                    <option value="SHELTER">SHELTER</option>
                    <option value="GENERAL">GENERAL</option>
                  </select>
                </div>
                <div>
                  <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                    Target Goal (INR) <span className="text-outline font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={draftTargetAmount}
                    onChange={(e) => setDraftTargetAmount(e.target.value)}
                    placeholder="e.g. 350000"
                    className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                  Description &amp; Purpose <span className="text-outline font-normal">(Optional in draft)</span>
                </label>
                <textarea
                  rows={3}
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="Describe beneficiary scope, operational timeline, and specific budget allocation..."
                  className="w-full p-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                    Start Date <span className="text-outline font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={draftStartDate}
                    onChange={(e) => setDraftStartDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm"
                  />
                </div>
                <div>
                  <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                    End Date <span className="text-outline font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={draftEndDate}
                    onChange={(e) => setDraftEndDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-outline-variant/30 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDraftModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={draftSubmitting}
                  className="px-5 py-2 rounded-xl bg-secondary-container hover:bg-secondary text-white font-label-md text-sm font-bold shadow-md"
                >
                  {draftSubmitting ? 'Saving...' : editingCampaignId ? 'Update Draft' : 'Save Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register New Organization Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-xl border border-outline-variant/40 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                Register New Organization
              </h3>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-outline font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-on-surface-variant">
              Simulated academic onboarding. New registrations start as <strong>PENDING</strong> and receive an Applicant Capability Token to draft campaigns. Reviewer approval is required before public launch.
            </p>

            <form onSubmit={handleRegisterOrg} className="flex flex-col gap-3">
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                  Organization Legal Name *
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Sahayata Rural Health Initiative"
                  className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                  Registration Ref / Darpan ID *
                </label>
                <input
                  type="text"
                  required
                  value={regRef}
                  onChange={(e) => setRegRef(e.target.value)}
                  placeholder="e.g. NGO-KA-2026-091"
                  className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="e.g. contact@sahayata.org"
                  className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="e.g. +91 98450 11223"
                  className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="pt-3 border-t border-outline-variant/30 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={regSubmitting}
                  className="px-5 py-2 rounded-xl bg-secondary-container hover:bg-secondary text-white font-label-md text-sm font-bold shadow-md"
                >
                  {regSubmitting ? 'Registering...' : 'Register Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resume with Applicant Token Modal */}
      {isResumeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-xl border border-outline-variant/40 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                Resume with Applicant Token
              </h3>
              <button
                onClick={() => setIsResumeModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-outline font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-on-surface-variant">
              Paste the Applicant Capability Token you received when registering your organization (starts with <code>dk_app_</code>).
            </p>

            <form onSubmit={handleResumeWithToken} className="flex flex-col gap-3">
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                  Applicant Token
                </label>
                <input
                  type="text"
                  required
                  value={resumeTokenInput}
                  onChange={(e) => setResumeTokenInput(e.target.value)}
                  placeholder="dk_app_..."
                  className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="pt-3 border-t border-outline-variant/30 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsResumeModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white font-label-md text-sm font-bold shadow-md"
                >
                  Load Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Campaign Closure Request Modal */}
      {isClosureModalOpen && closureCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-6 shadow-xl border border-outline-variant/40 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-xl">block</span>
                Request Campaign Closure
              </h3>
              <button
                onClick={() => setIsClosureModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-outline font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-container/70 border border-outline-variant/30 text-xs text-on-surface-variant flex flex-col gap-1.5">
              <div className="font-semibold text-on-surface flex items-center justify-between">
                <span>Campaign: {closureCampaign.title}</span>
                <span className="font-mono text-outline">#{closureCampaign.campaign_id}</span>
              </div>
              <div>
                Current Status: <strong className="text-primary">{closureCampaign.status}</strong> &bull; Total Cleared Raised: <strong className="text-primary">₹{parseFloat(closureCampaign.amount_raised).toLocaleString('en-IN')}</strong>
              </div>
            </div>

            <div className="text-xs text-on-surface-variant bg-secondary-fixed/20 p-3 rounded-xl border border-secondary/30 flex items-start gap-2">
              <span className="material-symbols-outlined text-secondary text-base shrink-0 mt-0.5">policy</span>
              <div>
                <strong>Governance Rule:</strong> Campaign closure is an immutable governance action. Once approved by an IRB platform reviewer, the campaign will be permanently closed, immediately stopping all contributions and public discovery. All historical donations, receipts, and ledgers are preserved.
              </div>
            </div>

            <form onSubmit={handleSubmitClosureRequest} className="flex flex-col gap-4">
              <div>
                <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                  Reason for Campaign Closure *
                </label>
                <textarea
                  required
                  rows={3}
                  value={closureReason}
                  onChange={(e) => setClosureReason(e.target.value)}
                  placeholder="e.g. Beneficiary goals achieved ahead of schedule, or project execution completed successfully."
                  className="w-full p-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-[11px] text-outline mt-1 block">
                  Minimum 5 characters ({closureReason.trim().length}/5)
                </span>
              </div>

              <div className="pt-3 border-t border-outline-variant/30 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsClosureModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-sm hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closureSubmitting || closureReason.trim().length < 5}
                  className="px-5 py-2 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-label-md text-sm font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {closureSubmitting && (
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  )}
                  Submit Closure Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
