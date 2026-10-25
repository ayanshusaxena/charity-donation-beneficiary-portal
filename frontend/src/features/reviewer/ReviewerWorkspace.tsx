import React, { useState, useEffect } from 'react';
import {
  ReviewCampaignItem,
  BackendOrganizationReviewItemOut,
  ClosureRequest,
  IrbCampaignOversightItem,
} from '../../types/api';
import {
  fetchReviewQueue,
  submitCampaignReview,
  activateCampaign,
  fetchOrgReviewQueue,
  submitOrgReview,
  fetchIrbAllCampaigns,
  fetchClosureRequests,
  reviewClosureRequest,
  suspendCampaign,
  reopenCampaign,
  closeCampaign,
} from '../../api/reviewer';
import { useSandbox } from '../../context/SandboxContext';

export interface ReviewerWorkspaceProps {
  onCampaignReviewed?: () => void;
}

export const ReviewerWorkspace: React.FC<ReviewerWorkspaceProps> = ({ onCampaignReviewed }) => {
  const { isSandbox } = useSandbox();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'organizations' | 'oversight' | 'closure-requests'>('campaigns');

  // Campaign Queue State
  const [campaignQueue, setCampaignQueue] = useState<ReviewCampaignItem[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<ReviewCampaignItem | null>(null);

  // Organization Queue State
  const [orgQueue, setOrgQueue] = useState<BackendOrganizationReviewItemOut[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<BackendOrganizationReviewItemOut | null>(null);

  // Oversight state
  const [oversightList, setOversightList] = useState<IrbCampaignOversightItem[]>([]);
  const [oversightFilter, setOversightFilter] = useState<string>('ALL');
  const [oversightSearch, setOversightSearch] = useState<string>('');

  // Closure requests state
  const [closureRequests, setClosureRequests] = useState<ClosureRequest[]>([]);

  // Action Modal State (Suspend, Reopen, Close, Closure Review)
  const [actionModal, setActionModal] = useState<{
    type: 'suspend' | 'reopen' | 'close' | 'closure-review' | null;
    campaign?: IrbCampaignOversightItem;
    closureRequest?: ClosureRequest;
    decision?: 'APPROVED' | 'REJECTED';
  }>({ type: null });
  const [modalReason, setModalReason] = useState<string>('');
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState<string>('Meets all PBL operational and purpose criteria.');
  const [orgActionReason, setOrgActionReason] = useState<string>('Verified against official registration records and compliance checklist.');
  const [timeline, setTimeline] = useState<Array<{ title: string; time: string; type: string }>>([
    { title: 'IRB Session Authenticated (REV-804)', time: 'Just now', type: 'info' },
  ]);
  const [decisionFeedback, setDecisionFeedback] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = isSandbox ? undefined : 'mock-irb-reviewer';
      if (isSandbox) {
        const [cItems, oItems, overItems, cReqs] = await Promise.all([
          fetchReviewQueue(isSandbox),
          fetchOrgReviewQueue(isSandbox),
          fetchIrbAllCampaigns(oversightFilter, oversightSearch, 100, 0, isSandbox),
          fetchClosureRequests(isSandbox),
        ]);
        setCampaignQueue(cItems);
        if (cItems.length > 0 && !selectedCampaign) {
          setSelectedCampaign(cItems[0]);
        }
        setOrgQueue(oItems);
        if (oItems.length > 0 && !selectedOrg) {
          setSelectedOrg(oItems[0]);
        }
        setOversightList(overItems);
        setClosureRequests(cReqs);
      } else {
        // Live mode with mock reviewer token
        try {
          const [cItems, oItems, overItems, cReqs] = await Promise.all([
            fetchReviewQueue(false, token),
            fetchOrgReviewQueue(false, token),
            fetchIrbAllCampaigns(oversightFilter, oversightSearch, 100, 0, false, token),
            fetchClosureRequests(false, token),
          ]);
          setCampaignQueue(cItems);
          if (cItems.length > 0 && !selectedCampaign) {
            setSelectedCampaign(cItems[0]);
          }
          setOrgQueue(oItems);
          if (oItems.length > 0 && !selectedOrg) {
            setSelectedOrg(oItems[0]);
          }
          setOversightList(overItems);
          setClosureRequests(cReqs);
        } catch {
          setLoadError(
            'Live Reviewer Access Gated: Review queue auditing requires an authenticated OIDC session with reviewer credentials. Switch to Sandbox mode to inspect submissions and test review approvals.'
          );
          setCampaignQueue([]);
          setSelectedCampaign(null);
          setOrgQueue([]);
          setSelectedOrg(null);
          setOversightList([]);
          setClosureRequests([]);
        }
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load reviewer inspection queue.');
      setCampaignQueue([]);
      setOrgQueue([]);
      setOversightList([]);
      setClosureRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isSandbox]);

  const loadOversight = async () => {
    try {
      const token = isSandbox ? undefined : 'mock-irb-reviewer';
      const items = await fetchIrbAllCampaigns(oversightFilter, oversightSearch, 100, 0, isSandbox, token);
      setOversightList(items);
    } catch (err: any) {
      setDecisionError(err?.message || 'Failed to filter oversight campaigns.');
    }
  };

  useEffect(() => {
    if (activeTab === 'oversight') {
      loadOversight();
    }
  }, [oversightFilter, oversightSearch, activeTab]);

  const handleOpenActionModal = (type: 'suspend' | 'reopen' | 'close', campaign: IrbCampaignOversightItem) => {
    setActionModal({ type, campaign });
    setModalReason(
      type === 'suspend'
        ? 'Temporary suspension pending compliance verification review.'
        : type === 'reopen'
        ? 'Compliance review completed; campaign restored to active status.'
        : 'Campaign permanently closed by authorized IRB review decision.'
    );
    setDecisionError(null);
  };

  const handleOpenClosureDecision = (closureRequest: ClosureRequest, decision: 'APPROVED' | 'REJECTED') => {
    setActionModal({ type: 'closure-review', closureRequest, decision });
    setModalReason(
      decision === 'APPROVED'
        ? 'Closure request approved; objectives validated or satisfactory completion.'
        : 'Closure request rejected; campaign must remain open until required term.'
    );
    setDecisionError(null);
  };

  const handleExecuteModalAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalReason.trim() || modalReason.trim().length < 5) {
      setDecisionError('Reason must be at least 5 characters for audit persistence.');
      return;
    }

    setModalSubmitting(true);
    setDecisionError(null);
    const token = isSandbox ? undefined : 'mock-irb-reviewer';

    try {
      if (actionModal.type === 'suspend' && actionModal.campaign) {
        await suspendCampaign(actionModal.campaign.campaign_id, modalReason.trim(), isSandbox, token);
        const msg = `Campaign #${actionModal.campaign.campaign_id} ("${actionModal.campaign.campaign_name}") SUSPENDED. Removed from public discovery.`;
        setDecisionFeedback(msg);
        setTimeline((prev) => [{ title: msg, time: new Date().toLocaleTimeString(), type: 'warning' }, ...prev]);
      } else if (actionModal.type === 'reopen' && actionModal.campaign) {
        await reopenCampaign(actionModal.campaign.campaign_id, modalReason.trim(), isSandbox, token);
        const msg = `Campaign #${actionModal.campaign.campaign_id} ("${actionModal.campaign.campaign_name}") REOPENED to ACTIVE status.`;
        setDecisionFeedback(msg);
        setTimeline((prev) => [{ title: msg, time: new Date().toLocaleTimeString(), type: 'success' }, ...prev]);
      } else if (actionModal.type === 'close' && actionModal.campaign) {
        await closeCampaign(actionModal.campaign.campaign_id, modalReason.trim(), isSandbox, token);
        const msg = `Campaign #${actionModal.campaign.campaign_id} ("${actionModal.campaign.campaign_name}") PERMANENTLY CLOSED.`;
        setDecisionFeedback(msg);
        setTimeline((prev) => [{ title: msg, time: new Date().toLocaleTimeString(), type: 'warning' }, ...prev]);
      } else if (actionModal.type === 'closure-review' && actionModal.closureRequest && actionModal.decision) {
        await reviewClosureRequest(
          actionModal.closureRequest.request_id,
          actionModal.decision,
          modalReason.trim(),
          isSandbox,
          token
        );
        const msg = `Closure Request #${actionModal.closureRequest.request_id} for "${actionModal.closureRequest.campaign_name}" ${actionModal.decision}.`;
        setDecisionFeedback(msg);
        setTimeline((prev) => [{ title: msg, time: new Date().toLocaleTimeString(), type: actionModal.decision === 'APPROVED' ? 'success' : 'warning' }, ...prev]);
      }

      onCampaignReviewed?.();
      setActionModal({ type: null });
      loadData();
    } catch (err: any) {
      setDecisionError(err?.message || 'Failed to execute authorized action.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleCampaignDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedCampaign) return;

    setDecisionError(null);
    try {
      await submitCampaignReview(
        selectedCampaign.campaign_id,
        {
          decision,
          reason: actionReason,
        },
        isSandbox,
        isSandbox ? undefined : 'mock-irb-reviewer'
      );

      // If approved in live mode, ensure the campaign is activated if within date window
      if (decision === 'APPROVED' && !isSandbox) {
        try {
          await activateCampaign(selectedCampaign.campaign_id, false, 'mock-irb-reviewer');
        } catch {
          // May already be active via trigger or start_date is in the future
        }
      }

      onCampaignReviewed?.();

      const decisionMsg =
        decision === 'APPROVED'
          ? `Campaign #${selectedCampaign.campaign_id} APPROVED for public fundraising.`
          : `Campaign #${selectedCampaign.campaign_id} REJECTED and returned to NGO as DRAFT for corrections.`;

      setDecisionFeedback(decisionMsg);
      setTimeline((prev) => [
        {
          title: decisionMsg,
          time: new Date().toLocaleTimeString(),
          type: decision === 'APPROVED' ? 'success' : 'warning',
        },
        ...prev,
      ]);

      const updatedQueue = campaignQueue.filter((q) => q.campaign_id !== selectedCampaign.campaign_id);
      setCampaignQueue(updatedQueue);
      setSelectedCampaign(updatedQueue.length > 0 ? updatedQueue[0] : null);
    } catch (err: any) {
      setDecisionError(err?.message || `Failed to submit review decision for campaign #${selectedCampaign.campaign_id}.`);
    }
  };

  const handleOrgDecision = async (decision: 'VERIFIED' | 'REJECTED') => {
    if (!selectedOrg) return;

    setDecisionError(null);
    try {
      await submitOrgReview(
        selectedOrg.organization_id,
        {
          decision,
          reason: orgActionReason,
        },
        isSandbox,
        isSandbox ? undefined : 'mock-irb-reviewer'
      );

      const decisionMsg =
        decision === 'VERIFIED'
          ? `Organization "${selectedOrg.organization_name}" VERIFIED! Can now submit campaigns.`
          : `Organization "${selectedOrg.organization_name}" REJECTED.`;

      setDecisionFeedback(decisionMsg);
      setTimeline((prev) => [
        {
          title: decisionMsg,
          time: new Date().toLocaleTimeString(),
          type: decision === 'VERIFIED' ? 'success' : 'warning',
        },
        ...prev,
      ]);

      // Update org status in local state
      const updated = orgQueue.map((o) =>
        o.organization_id === selectedOrg.organization_id
          ? { ...o, verification_status: decision, review_reason: orgActionReason }
          : o
      );

      setOrgQueue(updated);
      setSelectedOrg({ ...selectedOrg, verification_status: decision, review_reason: orgActionReason });
    } catch (err: any) {
      setDecisionError(err?.message || `Failed to submit verification decision for organization #${selectedOrg.organization_id}.`);
    }
  };

  const pendingOrgCount = orgQueue.filter((o) => o.verification_status === 'PENDING').length;

  return (
    <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin py-8">
      {/* Top Workspace Context Header */}
      <section className="w-full bg-surface-container-low py-6 px-6 rounded-2xl mb-8 border border-outline-variant/30">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-container text-white font-label-sm text-xs font-bold">
                <span className="material-symbols-outlined text-xs">verified_user</span>
                PBL Audit Session
              </span>
              <span className="text-outline text-xs">&bull;</span>
              <span className="font-label-sm text-xs text-on-surface-variant font-bold uppercase tracking-wider">
                Institutional Review Board
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold">
              DonateKaro Reviewer Workspace
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              PBL Quality &amp; Campaign Verification Portal | Reviewer ID: <span className="font-bold text-on-surface">REV-804 (Prof. S. K. Kulkarni / Capstone Audit Board)</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="p-2.5 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors shadow-sm"
              title="Refresh Review Queues"
            >
              <span className="material-symbols-outlined text-lg">sync</span>
            </button>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-container-lowest shadow-xs border border-outline-variant/30">
              <span className="material-symbols-outlined text-secondary text-base">timer</span>
              <div className="flex flex-col">
                <span className="text-[11px] text-outline font-semibold">Reviewer SLA Target</span>
                <span className="font-label-md text-xs text-secondary font-bold">&lt; 24h Response Guideline</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Queue Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-xs border border-outline-variant/20 flex flex-col justify-between">
            <span className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
              Campaigns In Queue
            </span>
            <div className="font-metric-lg text-metric-lg text-secondary font-bold mt-2">
              {campaignQueue.length}
            </div>
            <span className="text-xs text-outline mt-1">Pending Audit Action</span>
          </div>

          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-xs border border-outline-variant/20 flex flex-col justify-between">
            <span className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
              Pending Org Applications
            </span>
            <div className="font-metric-lg text-metric-lg text-secondary font-bold mt-2">
              {pendingOrgCount}
            </div>
            <span className="text-xs text-outline mt-1">Awaiting Verification</span>
          </div>

          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-xs border border-outline-variant/20 flex flex-col justify-between">
            <span className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
              Approved Organizations
            </span>
            <div className="font-metric-lg text-metric-lg text-primary font-bold mt-2">
              {orgQueue.filter((o) => o.verification_status === 'VERIFIED').length}
            </div>
            <span className="text-xs text-on-tertiary-container font-semibold mt-1">Verified Nonprofits</span>
          </div>

          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-xs border border-outline-variant/20 flex flex-col justify-between">
            <span className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
              Audit Compliance
            </span>
            <div className="font-metric-lg text-metric-lg text-primary font-bold mt-2">
              100%
            </div>
            <span className="text-xs text-outline mt-1">DB Separation of Duties</span>
          </div>
        </div>
      </section>

      {/* Tabs Bar */}
      <div className="flex border-b border-outline-variant/30 mb-6 gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`pb-3 font-label-md text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'campaigns'
              ? 'border-primary text-primary'
              : 'border-transparent text-outline hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-base">campaign</span>
          Campaign Review Queue ({campaignQueue.length})
        </button>
        <button
          onClick={() => setActiveTab('organizations')}
          className={`pb-3 font-label-md text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'organizations'
              ? 'border-primary text-primary'
              : 'border-transparent text-outline hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-base">domain</span>
          Organization Applications ({pendingOrgCount} Pending)
        </button>
        <button
          onClick={() => setActiveTab('oversight')}
          className={`pb-3 font-label-md text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'oversight'
              ? 'border-primary text-primary'
              : 'border-transparent text-outline hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-base">manage_search</span>
          Campaign Oversight ({oversightList.length})
        </button>
        <button
          onClick={() => setActiveTab('closure-requests')}
          className={`pb-3 font-label-md text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'closure-requests'
              ? 'border-primary text-primary'
              : 'border-transparent text-outline hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-base">block</span>
          Closure Requests
          {closureRequests.filter((r) => r.status === 'PENDING').length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-error text-white text-[10px] font-bold">
              {closureRequests.filter((r) => r.status === 'PENDING').length}
            </span>
          )}
        </button>
      </div>

      {/* Decision feedback banner */}
      {decisionFeedback && (
        <div className="mb-6 p-4 rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-between font-label-sm text-sm">
          <span>{decisionFeedback}</span>
          <button onClick={() => setDecisionFeedback(null)} className="font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Decision error banner */}
      {decisionError && (
        <div className="mb-6 p-4 rounded-xl bg-error-container/20 border border-error/30 text-on-surface flex items-center justify-between font-label-sm text-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error">error</span>
            <span>{decisionError}</span>
          </div>
          <button onClick={() => setDecisionError(null)} className="font-bold">
            &times;
          </button>
        </div>
      )}

      {/* TAB 1: CAMPAIGN REVIEW QUEUE */}
      {activeTab === 'campaigns' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Queue List (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-outline">
                Campaign Submissions ({campaignQueue.length})
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-outline bg-surface-container-lowest rounded-2xl border border-outline-variant/30 flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-2xl animate-spin">progress_activity</span>
                <span>Loading queue...</span>
              </div>
            ) : loadError ? (
              <div className="p-6 text-center text-on-surface bg-surface-container rounded-2xl border border-outline-variant/30 text-sm">
                {loadError}
              </div>
            ) : campaignQueue.length === 0 ? (
              <div className="p-8 text-center text-outline bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
                Inspection queue is clear. No campaigns pending review.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {campaignQueue.map((item) => (
                  <div
                    key={item.campaign_id}
                    onClick={() => setSelectedCampaign(item)}
                    className={`p-4 rounded-xl cursor-pointer transition-all border ${
                      selectedCampaign?.campaign_id === item.campaign_id
                        ? 'bg-surface-container-lowest border-primary shadow-sm ring-1 ring-primary'
                        : 'bg-surface-container-lowest hover:bg-surface-container/60 border-outline-variant/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-sm text-primary line-clamp-1">
                        {item.title}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[10px] font-bold shrink-0">
                        {item.status}
                      </span>
                    </div>

                    <div className="text-xs text-on-surface-variant line-clamp-1 mb-2">
                      {item.organization_name}
                    </div>

                    <div className="flex items-center justify-between text-xs text-outline font-mono">
                      <span>₹{parseFloat(item.target_amount).toLocaleString('en-IN')}</span>
                      <span>{item.purpose_code}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Campaign Audit Inspection Detail (8 cols) */}
          <div className="lg:col-span-8">
            {selectedCampaign ? (
              <div className="bg-surface-container-lowest p-6 md:p-8 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/30 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-white text-xs font-bold">
                        Campaign #{selectedCampaign.campaign_id}
                      </span>
                      <span className="text-xs text-outline font-mono">
                        {selectedCampaign.organization_name}
                      </span>
                    </div>
                    <h2 className="font-headline-md text-headline-md text-primary font-bold">
                      {selectedCampaign.title}
                    </h2>
                  </div>
                  <div className="text-right">
                    <div className="font-metric-md text-metric-md text-primary font-bold">
                      ₹{parseFloat(selectedCampaign.target_amount).toLocaleString('en-IN')}
                    </div>
                    <span className="text-xs text-outline">Proposed Target</span>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h4 className="font-label-sm text-xs text-outline uppercase font-bold tracking-wider mb-2">
                    Campaign Narrative &amp; Justification
                  </h4>
                  <p className="font-body-sm text-body-sm text-on-surface leading-relaxed p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    {selectedCampaign.description || 'No description provided.'}
                  </p>
                </div>

                {/* Compliance Checklist */}
                <div>
                  <h4 className="font-label-sm text-xs text-outline uppercase font-bold tracking-wider mb-2">
                    Institutional Verification Checklist
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-surface-container-low flex items-center gap-3 border border-outline-variant/20">
                      <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <div className="text-xs">
                        <span className="font-bold text-on-surface block">FCRA &amp; Registration</span>
                        <span className="text-outline">Active certificate on file</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-container-low flex items-center gap-3 border border-outline-variant/20">
                      <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <div className="text-xs">
                        <span className="font-bold text-on-surface block">Budget Breakdown Attached</span>
                        <span className="text-outline">Detailed unit cost itemized</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-container-low flex items-center gap-3 border border-outline-variant/20">
                      <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <div className="text-xs">
                        <span className="font-bold text-on-surface block">Purpose Code Classification</span>
                        <span className="font-mono text-outline">{selectedCampaign.purpose_code} vocabulary verified</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-surface-container-low flex items-center gap-3 border border-outline-variant/20">
                      <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      <div className="text-xs">
                        <span className="font-bold text-on-surface block">Beneficiary Target Group</span>
                        <span className="text-outline">Disbursement gate compliant</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Decision Input & Buttons */}
                <div className="pt-4 border-t border-outline-variant/30 flex flex-col gap-4">
                  <div>
                    <label className="font-label-sm text-xs text-on-surface-variant font-bold block mb-1">
                      Audit Decision Notes / Reason *
                    </label>
                    <input
                      type="text"
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      placeholder="Enter review explanation or required draft revisions..."
                      className="w-full h-10 px-3.5 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      onClick={() => handleCampaignDecision('REJECTED')}
                      className="px-5 py-2.5 rounded-xl border border-error/50 bg-surface hover:bg-error-container/30 text-error font-label-md text-sm font-bold transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-base">gavel</span>
                      Reject / Return to Draft
                    </button>
                    <button
                      onClick={() => handleCampaignDecision('APPROVED')}
                      className="px-6 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-white font-label-md text-sm font-bold transition-colors shadow-md flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-base">check</span>
                      Approve for Public Fundraising
                    </button>
                  </div>
                </div>

                {/* Audit Timeline */}
                <div className="pt-4 border-t border-outline-variant/30">
                  <h4 className="font-label-sm text-xs text-outline uppercase font-bold tracking-wider mb-3">
                    Session Audit Trail
                  </h4>
                  <div className="flex flex-col gap-2">
                    {timeline.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1 px-3 rounded-lg bg-surface-container-low font-mono">
                        <span className="text-on-surface">{entry.title}</span>
                        <span className="text-outline">{entry.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 text-outline">
                Select a campaign from the queue to start review.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ORGANIZATION APPLICATIONS */}
      {activeTab === 'organizations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Organization List (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-outline">
                Nonprofit Registrations ({orgQueue.length})
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-outline bg-surface-container-lowest rounded-2xl border border-outline-variant/30 flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-2xl animate-spin">progress_activity</span>
                <span>Loading organizations...</span>
              </div>
            ) : orgQueue.length === 0 ? (
              <div className="p-8 text-center text-outline bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
                No organization applications found.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {orgQueue.map((org) => (
                  <div
                    key={org.organization_id}
                    onClick={() => setSelectedOrg(org)}
                    className={`p-4 rounded-xl cursor-pointer transition-all border ${
                      selectedOrg?.organization_id === org.organization_id
                        ? 'bg-surface-container-lowest border-primary shadow-sm ring-1 ring-primary'
                        : 'bg-surface-container-lowest hover:bg-surface-container/60 border-outline-variant/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-sm text-primary line-clamp-1">
                        {org.organization_name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          org.verification_status === 'VERIFIED'
                            ? 'bg-primary-container text-white'
                            : org.verification_status === 'PENDING'
                            ? 'bg-secondary-fixed text-on-secondary-fixed'
                            : 'bg-error-container text-on-error-container'
                        }`}
                      >
                        {org.verification_status}
                      </span>
                    </div>

                    <div className="text-xs text-on-surface-variant font-mono line-clamp-1 mb-1">
                      Ref: {org.registration_ref || 'N/A'}
                    </div>

                    <div className="text-[11px] text-outline">
                      ID: #{org.organization_id} &bull; {org.created_at ? new Date(org.created_at).toLocaleDateString() : 'Seeded'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Organization Verification Detail (8 cols) */}
          <div className="lg:col-span-8">
            {selectedOrg ? (
              <div className="bg-surface-container-lowest p-6 md:p-8 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/30 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-white text-xs font-bold">
                        Org #{selectedOrg.organization_id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          selectedOrg.verification_status === 'VERIFIED'
                            ? 'bg-primary-container text-white'
                            : selectedOrg.verification_status === 'PENDING'
                            ? 'bg-secondary-fixed text-on-secondary-fixed'
                            : 'bg-error-container text-on-error-container'
                        }`}
                      >
                        {selectedOrg.verification_status}
                      </span>
                    </div>
                    <h2 className="font-headline-md text-headline-md text-primary font-bold">
                      {selectedOrg.organization_name}
                    </h2>
                  </div>
                </div>

                {/* Organization Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <span className="text-xs text-outline uppercase font-bold block mb-1">
                      Registration Reference
                    </span>
                    <span className="font-mono text-sm font-semibold text-on-surface">
                      {selectedOrg.registration_ref || 'None provided'}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <span className="text-xs text-outline uppercase font-bold block mb-1">
                      Contact Email
                    </span>
                    <span className="text-sm font-semibold text-on-surface">
                      {selectedOrg.email || 'None provided'}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <span className="text-xs text-outline uppercase font-bold block mb-1">
                      Contact Phone
                    </span>
                    <span className="text-sm font-semibold text-on-surface">
                      {selectedOrg.phone || 'None provided'}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <span className="text-xs text-outline uppercase font-bold block mb-1">
                      Applied Date
                    </span>
                    <span className="text-sm font-semibold text-on-surface">
                      {selectedOrg.created_at ? new Date(selectedOrg.created_at).toLocaleString() : 'Pre-seeded'}
                    </span>
                  </div>
                </div>

                {/* Verification Decision Status */}
                {selectedOrg.review_reason && (
                  <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/30">
                    <span className="text-xs text-outline uppercase font-bold block mb-1">
                      Reviewer Assessment Notes
                    </span>
                    <p className="text-sm text-on-surface">{selectedOrg.review_reason}</p>
                  </div>
                )}

                {/* Decision Actions */}
                <div className="pt-4 border-t border-outline-variant/30 flex flex-col gap-4">
                  <div>
                    <label className="font-label-sm text-xs text-on-surface-variant font-bold block mb-1">
                      Reviewer Verification Assessment *
                    </label>
                    <input
                      type="text"
                      value={orgActionReason}
                      onChange={(e) => setOrgActionReason(e.target.value)}
                      placeholder="e.g. Darpan registration confirmed against Ministry portal records."
                      className="w-full h-10 px-3.5 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      onClick={() => handleOrgDecision('REJECTED')}
                      className="px-5 py-2.5 rounded-xl border border-error/50 bg-surface hover:bg-error-container/30 text-error font-label-md text-sm font-bold transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                      Reject Application
                    </button>
                    <button
                      onClick={() => handleOrgDecision('VERIFIED')}
                      className="px-6 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-white font-label-md text-sm font-bold transition-colors shadow-md flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-base">verified</span>
                      Verify Organization
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/30 text-outline">
                Select an organization application to inspect details and audit.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Campaign Oversight Tab ═══ */}
      {activeTab === 'oversight' && (
        <div className="flex flex-col gap-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-outline font-semibold uppercase">Status:</span>
              {(['ALL', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'CLOSED', 'DRAFT', 'SUBMITTED', 'PENDING_CLOSURE'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setOversightFilter(f)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    oversightFilter === f
                      ? 'bg-primary text-white'
                      : 'bg-surface-container text-outline hover:bg-surface-container-high'
                  }`}
                >
                  {f.replace('_', ' ')}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={oversightSearch}
              onChange={(e) => setOversightSearch(e.target.value)}
              placeholder="Search campaign or org..."
              className="h-9 px-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[200px]"
            />
          </div>

          {loading ? (
            <div className="py-12 text-center text-outline flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-2xl animate-spin">progress_activity</span>
              Loading oversight data...
            </div>
          ) : oversightList.length === 0 ? (
            <div className="py-10 text-center text-outline bg-surface-container-lowest rounded-xl border border-outline-variant/30">
              No campaigns match the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto bg-surface-container-lowest rounded-xl border border-outline-variant/30">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container/60 text-outline uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4 rounded-l-lg">Campaign</th>
                    <th className="py-3 px-4">Organization</th>
                    <th className="py-3 px-4">Purpose</th>
                    <th className="py-3 px-4">Raised</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 rounded-r-lg text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {oversightList.map((c) => (
                    <tr key={c.campaign_id} className="hover:bg-surface-container/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-on-surface max-w-[200px] truncate">{c.campaign_name}</div>
                        <div className="text-[11px] font-mono text-outline">#{c.campaign_id}</div>
                        {c.pending_closure_request && (
                          <span className="text-[10px] font-bold text-secondary inline-flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-xs">pending</span>Closure Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-on-surface-variant">{c.organization_name}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container font-mono text-xs">{c.purpose_code}</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-primary text-sm">
                        ₹{parseFloat(c.amount_raised || '0').toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            c.campaign_status === 'ACTIVE' && c.approval_status === 'APPROVED'
                              ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                              : c.approval_status === 'SUSPENDED'
                              ? 'bg-error-container text-error'
                              : c.campaign_status === 'CLOSED'
                              ? 'bg-outline-variant/60 text-outline'
                              : c.approval_status === 'PENDING'
                              ? 'bg-secondary-fixed text-secondary'
                              : 'bg-surface-container text-outline'
                          }`}>
                            {c.approval_status === 'SUSPENDED' ? 'SUSPENDED' : c.campaign_status}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {c.campaign_status === 'ACTIVE' && c.approval_status === 'APPROVED' && (
                            <button
                              onClick={() => handleOpenActionModal('suspend', c)}
                              className="px-2 py-1 rounded-lg bg-surface-container hover:bg-error-container hover:text-error text-outline text-xs font-semibold transition-colors inline-flex items-center gap-1"
                              title="Suspend campaign"
                            >
                              <span className="material-symbols-outlined text-xs">pause_circle</span> Suspend
                            </button>
                          )}
                          {c.approval_status === 'SUSPENDED' && (
                            <button
                              onClick={() => handleOpenActionModal('reopen', c)}
                              className="px-2 py-1 rounded-lg bg-surface-container hover:bg-primary-container hover:text-white text-outline text-xs font-semibold transition-colors inline-flex items-center gap-1"
                              title="Reopen campaign"
                            >
                              <span className="material-symbols-outlined text-xs">play_circle</span> Reopen
                            </button>
                          )}
                          {c.campaign_status !== 'CLOSED' && c.campaign_status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleOpenActionModal('close', c)}
                              className="px-2 py-1 rounded-lg bg-surface-container hover:bg-error text-outline hover:text-white text-xs font-semibold transition-colors inline-flex items-center gap-1"
                              title="Permanently close campaign"
                            >
                              <span className="material-symbols-outlined text-xs">do_not_disturb_on</span> Close
                            </button>
                          )}
                          {c.campaign_status === 'CLOSED' && (
                            <span className="text-xs text-outline italic">Closed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ Closure Requests Tab ═══ */}
      {activeTab === 'closure-requests' && (
        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="py-12 text-center text-outline flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-2xl animate-spin">progress_activity</span>
              Loading closure requests...
            </div>
          ) : closureRequests.length === 0 ? (
            <div className="py-10 text-center text-outline bg-surface-container-lowest rounded-xl border border-outline-variant/30">
              No campaign closure requests submitted yet.
            </div>
          ) : (
            <div className="overflow-x-auto bg-surface-container-lowest rounded-xl border border-outline-variant/30">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container/60 text-outline uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4 rounded-l-lg">Request ID</th>
                    <th className="py-3 px-4">Campaign</th>
                    <th className="py-3 px-4">Organization</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 rounded-r-lg text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {closureRequests.map((r) => (
                    <tr key={r.request_id} className="hover:bg-surface-container/40">
                      <td className="py-3 px-4 font-mono text-xs text-outline">#{r.request_id}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-on-surface">{r.campaign_name || `Campaign #${r.campaign_id}`}</div>
                        <div className="text-[11px] font-mono text-outline">ID: #{r.campaign_id}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-on-surface-variant">{r.organization_name || `Org #${r.organization_id}`}</td>
                      <td className="py-3 px-4 text-xs text-on-surface-variant max-w-[200px] truncate" title={r.request_reason}>
                        {r.request_reason}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          r.status === 'PENDING'
                            ? 'bg-secondary-fixed text-secondary'
                            : r.status === 'APPROVED'
                            ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                            : 'bg-error-container text-error'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {r.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenClosureDecision(r, 'REJECTED')}
                              className="px-2.5 py-1 rounded-lg border border-error/40 text-error hover:bg-error-container/20 text-xs font-semibold transition-colors inline-flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-xs">close</span> Reject
                            </button>
                            <button
                              onClick={() => handleOpenClosureDecision(r, 'APPROVED')}
                              className="px-2.5 py-1 rounded-lg bg-primary-container hover:bg-primary text-white text-xs font-bold transition-colors inline-flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-xs">check</span> Approve &amp; Close
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-outline">
                            {r.reviewed_by && <div className="font-mono">{r.reviewed_by}</div>}
                            {r.review_reason && <div className="italic text-on-surface-variant">"{r.review_reason}"</div>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ Action Modal (Suspend / Reopen / Close / Closure Review) ═══ */}
      {actionModal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-6 shadow-xl border border-outline-variant/40 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-sm text-base text-primary font-bold flex items-center gap-2">
                {actionModal.type === 'suspend' && (
                  <><span className="material-symbols-outlined text-secondary text-xl">pause_circle</span>Suspend Campaign</>
                )}
                {actionModal.type === 'reopen' && (
                  <><span className="material-symbols-outlined text-primary text-xl">play_circle</span>Reopen Campaign</>
                )}
                {actionModal.type === 'close' && (
                  <><span className="material-symbols-outlined text-error text-xl">do_not_disturb_on</span>Permanently Close Campaign</>
                )}
                {actionModal.type === 'closure-review' && actionModal.decision === 'APPROVED' && (
                  <><span className="material-symbols-outlined text-primary text-xl">check_circle</span>Approve Closure Request</>
                )}
                {actionModal.type === 'closure-review' && actionModal.decision === 'REJECTED' && (
                  <><span className="material-symbols-outlined text-error text-xl">cancel</span>Reject Closure Request</>
                )}
              </h3>
              <button
                onClick={() => setActionModal({ type: null })}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-outline font-bold text-lg"
              >
                &times;
              </button>
            </div>

            {/* Context info */}
            <div className="p-3 rounded-xl bg-surface-container/70 border border-outline-variant/30 text-xs text-on-surface-variant">
              {actionModal.campaign && (
                <div>
                  <span className="font-semibold text-on-surface">{actionModal.campaign.campaign_name}</span>
                  <span className="ml-2 font-mono text-outline">#{actionModal.campaign.campaign_id}</span>
                  <div className="mt-1">Organization: {actionModal.campaign.organization_name}</div>
                </div>
              )}
              {actionModal.closureRequest && (
                <div>
                  <span className="font-semibold text-on-surface">{actionModal.closureRequest.campaign_name || `Campaign #${actionModal.closureRequest.campaign_id}`}</span>
                  <div className="mt-1">Requested by: <span className="font-mono">{actionModal.closureRequest.requested_by}</span></div>
                  <div className="mt-1">NGO Reason: <em>"{actionModal.closureRequest.request_reason}"</em></div>
                </div>
              )}
            </div>

            {actionModal.type === 'close' && (
              <div className="text-xs text-error bg-error-container/20 p-3 rounded-xl border border-error/30 flex items-start gap-2">
                <span className="material-symbols-outlined text-error text-base shrink-0">warning</span>
                <div><strong>Permanent Action:</strong> This campaign will be irrevocably closed. It will be immediately removed from public discovery. All historical donation, receipt, and ledger records are preserved.</div>
              </div>
            )}

            <form onSubmit={handleExecuteModalAction} className="flex flex-col gap-4">
              <div>
                <label className="font-label-sm text-xs text-on-surface-variant font-bold block mb-1">
                  Authorized Reason for Audit Trail *
                </label>
                <textarea
                  required
                  rows={3}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="Provide reason for this IRB action (persisted to audit log)."
                  className="w-full p-3 rounded-xl bg-surface border border-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-[11px] text-outline mt-1 block">
                  Minimum 5 characters ({modalReason.trim().length}/5)
                </span>
              </div>

              {decisionError && (
                <div className="p-3 rounded-xl bg-error-container/20 border border-error/30 text-error text-xs font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">error</span> {decisionError}
                </div>
              )}

              <div className="pt-3 border-t border-outline-variant/30 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setActionModal({ type: null }); setDecisionError(null); }}
                  className="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-sm hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting || modalReason.trim().length < 5}
                  className={`px-5 py-2 rounded-xl font-label-md text-sm font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-white ${
                    actionModal.type === 'close' || (actionModal.type === 'closure-review' && actionModal.decision === 'REJECTED')
                      ? 'bg-error hover:bg-error/90'
                      : actionModal.type === 'reopen' || (actionModal.type === 'closure-review' && actionModal.decision === 'APPROVED')
                      ? 'bg-primary hover:bg-primary/90'
                      : 'bg-secondary hover:bg-secondary/90'
                  }`}
                >
                  {modalSubmitting && (
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  )}
                  {actionModal.type === 'suspend' && 'Confirm Suspension'}
                  {actionModal.type === 'reopen' && 'Confirm Reopen'}
                  {actionModal.type === 'close' && 'Confirm Permanent Closure'}
                  {actionModal.type === 'closure-review' && actionModal.decision === 'APPROVED' && 'Approve & Close Campaign'}
                  {actionModal.type === 'closure-review' && actionModal.decision === 'REJECTED' && 'Reject Closure Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
