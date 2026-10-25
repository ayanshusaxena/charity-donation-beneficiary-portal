import React, { useState } from 'react';
import { Campaign, Donation, DonationPaymentOutcome } from '../../types/api';
import {
  createDonation,
  simulateDonationPayment,
  fetchDonationById,
  generateGuestAccessToken,
  generateIdempotencyKey,
} from '../../api/donations';
import { useSandbox } from '../../context/SandboxContext';

interface DonationWizardProps {
  campaign: Campaign;
  onBack: () => void;
}

type WizardStage = 'checkout' | 'processing' | 'completed';

export const DonationWizard: React.FC<DonationWizardProps> = ({ campaign, onBack }) => {
  const { isSandbox } = useSandbox();

  // Wizard state
  const [stage, setStage] = useState<WizardStage>('checkout');
  const [amount, setAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [donorType, setDonorType] = useState<'GUEST' | 'REGISTERED'>('GUEST');
  const [donorName, setDonorName] = useState<string>('Priya Sharma');
  const [donorEmail, setDonorEmail] = useState<string>('priya.sharma@example.org');
  const [panNumber, setPanNumber] = useState<string>('ABCDE1234F');
  const [address, setAddress] = useState<string>('Bengaluru, Karnataka');

  // Operation lifecycle state: guest capability & operation-scoped idempotency keys
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [creationIdempotencyKey, setCreationIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey('don')
  );
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey('pay')
  );

  // Network / Persistence state
  const [loading, setLoading] = useState<boolean>(false);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [currentDonation, setCurrentDonation] = useState<Donation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showJsonDrawer, setShowJsonDrawer] = useState<boolean>(false);

  const presets = [
    { value: 500, desc: 'Provides 10 fortified school meal kits for 2 weeks' },
    { value: 1000, desc: 'Provides 20 hot mid-day meal plates & micro-nutrients' },
    { value: 2500, desc: 'Funds clean drinking water supply & 50 meal kits' },
  ];

  const handleSelectPreset = (val: number) => {
    setAmount(val);
    setCustomAmount('');
    // New payload intent: refresh creation idempotency key
    setCreationIdempotencyKey(generateIdempotencyKey('don'));
  };

  const handleCustomAmountChange = (val: string) => {
    setCustomAmount(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
      setCreationIdempotencyKey(generateIdempotencyKey('don'));
    }
  };

  // Step 1: Create Donation (Reuses stable creationIdempotencyKey for retries of same operation)
  const handleProceedToPayment = async () => {
    if (amount <= 0) {
      setErrorMessage('Please select or enter a valid donation amount.');
      return;
    }
    if (!donorName.trim() || !donorEmail.trim()) {
      setErrorMessage('Please provide your full name and email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      // Secure guest token generation and lifecycle retention
      let activeGuestToken = guestToken;
      if (donorType === 'GUEST') {
        if (!activeGuestToken) {
          activeGuestToken = generateGuestAccessToken();
          setGuestToken(activeGuestToken);
        }
      } else {
        activeGuestToken = null;
        setGuestToken(null);
      }

      const res = await createDonation(
        {
          campaign_id: campaign.campaign_id,
          amount: amount.toFixed(2),
          currency: 'INR',
          donor_type: donorType,
          donor_name: donorName.trim(),
          donor_email: donorEmail.trim(),
          pan_number: panNumber.trim() || undefined,
          address: address.trim() || undefined,
        },
        isSandbox,
        undefined,
        activeGuestToken || undefined,
        creationIdempotencyKey
      );

      setCurrentDonation(res);
      setStage('processing');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create donation';
      setErrorMessage(`Donation creation failed: ${msg}. You can safely retry without double-charging.`);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Trigger Simulated Payment Outcome (authoritative verification; no inferred success)
  const handleTriggerSimulatedOutcome = async (outcome: DonationPaymentOutcome) => {
    if (!currentDonation) return;

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const updated = await simulateDonationPayment(
        currentDonation.donation_id,
        outcome,
        isSandbox,
        undefined,
        guestToken || undefined,
        paymentIdempotencyKey
      );
      setCurrentDonation(updated);

      // Rule: UI must never infer success from requested outcome. Verify authoritative response!
      // Accepts 'CLEARED' (sandbox) and 'SUCCESSFUL' (live backend) as equivalent settled states.
      const isSettled =
        (updated.status === 'CLEARED' || updated.status === 'SUCCESSFUL') &&
        Boolean(updated.receipt_number && updated.receipt_number.trim()) &&
        Boolean(updated.transaction_reference && updated.transaction_reference.trim());

      if (isSettled) {
        setStage('completed');
      } else if (
        (updated.status === 'CLEARED' || updated.status === 'SUCCESSFUL') &&
        (!updated.receipt_number || !updated.transaction_reference)
      ) {
        // Missing required receipt data despite status
        setErrorMessage(
          'Payment status was recorded as cleared, but official receipt number or transaction reference was omitted by the response. State remains unresolved.'
        );
      } else if (updated.status === 'FAILED') {
        setErrorMessage(
          'Simulated payment was marked as FAILED by issuer. The donation remains pending so a new attempt can be retried.'
        );
        // Prepare a new payment key for a distinct future attempt
        setPaymentIdempotencyKey(generateIdempotencyKey('pay'));
      } else {
        // UNKNOWN / TIMEOUT
        setInfoMessage(
          'Simulated gateway TIMEOUT (HTTP 202 Accepted / UNKNOWN). Payment attempt recorded as UNKNOWN. Do not issue a new payment attempt with a new key; use the status reconciliation check below.'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Simulated payment failed';
      setErrorMessage(
        `Payment request failed: ${msg}. Payment outcome is ambiguous. Please use "Recheck Status / Reconcile" before attempting any retry.`
      );
    } finally {
      setLoading(false);
    }
  };

  // Reconcile / check authoritative persisted status
  const handleRecheckStatus = async () => {
    if (!currentDonation) return;
    setIsReconciling(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const authoritative = await fetchDonationById(
        currentDonation.donation_id,
        isSandbox,
        undefined,
        guestToken || undefined
      );
      setCurrentDonation(authoritative);

      const isSettled =
        (authoritative.status === 'CLEARED' || authoritative.status === 'SUCCESSFUL') &&
        Boolean(authoritative.receipt_number && authoritative.receipt_number.trim()) &&
        Boolean(authoritative.transaction_reference && authoritative.transaction_reference.trim());

      if (isSettled) {
        setInfoMessage('Reconciliation confirmed clearing! Opening official receipt.');
        setStage('completed');
      } else if (authoritative.status === 'FAILED') {
        setErrorMessage('Reconciliation confirmed that the previous payment attempt failed. You may now retry payment.');
        setPaymentIdempotencyKey(generateIdempotencyKey('pay'));
      } else {
        setInfoMessage(`Reconciliation completed: status is currently "${authoritative.status}". Awaiting settlement.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status query failed';
      setErrorMessage(`Could not reconcile status: ${msg}.`);
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <div className="w-full">
      {/* Top Academic Sandbox Notice */}
      <div className="w-full bg-secondary-container/15 text-on-surface py-2.5 px-margin-mobile md:px-margin shadow-sm mb-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-space-sm font-label-sm text-label-sm">
          <div className="flex items-center gap-space-sm">
            <span
              className="material-symbols-outlined text-secondary text-base shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              terminal
            </span>
            <span className="font-bold text-secondary">PBL Sandbox Flow:</span>
            <span className="text-on-surface-variant hidden sm:inline">
              Simulated donations only. No real bank accounts or credentials collected. State backed by PostgreSQL contract.
            </span>
            <span className="text-on-surface-variant sm:hidden">Simulated Payment Sandbox</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-mono text-xs">
            /api/v1/donations
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-margin-mobile md:px-margin py-4">
        {/* Breadcrumb & Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-space-md mb-6">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <button
              onClick={onBack}
              className="hover:text-primary transition-colors flex items-center gap-1 font-semibold"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Campaigns
            </button>
            <span>/</span>
            <span className="text-on-surface font-bold">Checkout Sandbox</span>
            <span className="text-outline">#CMP-{campaign.campaign_id}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowJsonDrawer(!showJsonDrawer)}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-sm text-label-sm transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">data_object</span>
              {showJsonDrawer ? 'Hide JSON Spec' : 'Inspect API Contract'}
            </button>
          </div>
        </div>

        {/* JSON Spec Drawer */}
        {showJsonDrawer && (
          <div className="mb-6 rounded-xl bg-inverse-surface text-inverse-on-surface p-4 font-mono text-xs overflow-x-auto shadow-inner">
            <div className="flex items-center justify-between mb-2 text-primary-fixed">
              <span>POST /api/v1/donations Request Preview</span>
              <span className="text-secondary-fixed font-semibold">Idempotency-Key: {creationIdempotencyKey}</span>
            </div>
            <pre>
              {JSON.stringify(
                {
                  campaign_id: campaign.campaign_id,
                  amount: amount.toFixed(2),
                  currency: 'INR',
                  donor_type: donorType,
                  donor_name: donorName,
                  donor_email: donorEmail,
                  pan_number: panNumber || undefined,
                  address: address || undefined,
                  guest_capability: donorType === 'GUEST' ? '[REDACTED_SECURE_CAPABILITY]' : undefined,
                  idempotency_key: creationIdempotencyKey,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}

        {/* 12-Col Layout: 8 cols Wizard / 4 cols Sticky Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Checkout Wizard (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Stage Showcase Tabs */}
            <div className="bg-surface-container-lowest rounded-xl p-2 shadow-sm border border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2 px-2">
                <span className="material-symbols-outlined text-primary text-sm">tune</span>
                <span className="font-label-sm text-label-sm text-on-surface font-bold uppercase tracking-wider">
                  Pipeline Stage:
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 w-full sm:w-auto bg-surface-container p-1 rounded-lg">
                <button
                  onClick={() => setStage('checkout')}
                  className={`px-3 py-1.5 rounded-md font-label-sm text-label-sm font-bold transition-all text-center ${
                    stage === 'checkout'
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  1. Input Form
                </button>
                <button
                  onClick={() => currentDonation && setStage('processing')}
                  disabled={!currentDonation}
                  className={`px-3 py-1.5 rounded-md font-label-sm text-label-sm font-bold transition-all text-center ${
                    stage === 'processing'
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface disabled:opacity-40'
                  }`}
                >
                  2. Processing Lock
                </button>
                <button
                  onClick={() =>
                    currentDonation?.status === 'CLEARED' &&
                    Boolean(currentDonation.receipt_number) &&
                    Boolean(currentDonation.transaction_reference) &&
                    setStage('completed')
                  }
                  disabled={
                    currentDonation?.status !== 'CLEARED' ||
                    !currentDonation?.receipt_number ||
                    !currentDonation?.transaction_reference
                  }
                  className={`px-3 py-1.5 rounded-md font-label-sm text-label-sm font-bold transition-all text-center ${
                    stage === 'completed'
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface disabled:opacity-40'
                  }`}
                >
                  3. Settlement Receipt
                </button>
              </div>
            </div>

            {/* Error & Info Alerts */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-error-container text-on-error-container text-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-error">error</span>
                <span className="flex-1">{errorMessage}</span>
              </div>
            )}
            {infoMessage && (
              <div className="p-4 rounded-xl bg-secondary-fixed text-on-secondary-fixed text-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-secondary">info</span>
                <span className="flex-1">{infoMessage}</span>
              </div>
            )}

            {/* VIEW 1: ACTIVE DONATION INPUT FORM */}
            {stage === 'checkout' && (
              <div className="flex flex-col gap-6">
                {/* Amount Selector */}
                <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/30">
                  <div className="flex items-center justify-between gap-space-md mb-4">
                    <div className="flex items-center gap-space-sm">
                      <span className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-sm text-label-sm font-bold">
                        1
                      </span>
                      <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
                        Select Contribution Amount
                      </h2>
                    </div>
                    <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wide">
                      INR Currency
                    </span>
                  </div>

                  {/* Preset Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    {presets.map((p) => {
                      const isSelected = amount === p.value && !customAmount;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => handleSelectPreset(p.value)}
                          className={`text-left p-4 rounded-xl transition-all border ${
                            isSelected
                              ? 'bg-primary-container text-on-primary border-primary shadow-md'
                              : 'bg-surface hover:bg-surface-container text-on-surface border-outline-variant/30'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-metric-md text-metric-md font-bold">
                              ₹{p.value.toLocaleString('en-IN')}
                            </span>
                            <span
                              className={`material-symbols-outlined text-lg ${
                                isSelected ? 'text-primary-fixed' : 'text-outline'
                              }`}
                              style={{ fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0" }}
                            >
                              check_circle
                            </span>
                          </div>
                          <p
                            className={`font-body-sm text-body-sm text-xs ${
                              isSelected ? 'text-on-primary-container' : 'text-on-surface-variant'
                            }`}
                          >
                            {p.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Amount */}
                  <div className="relative mt-2">
                    <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                      Or Enter Custom Amount (INR)
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-outline font-bold">₹</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 5000"
                        value={customAmount}
                        onChange={(e) => handleCustomAmountChange(e.target.value)}
                        className="w-full h-11 pl-8 pr-4 rounded-xl bg-surface border border-outline-variant/50 font-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </section>

                {/* Donor Details */}
                <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/30">
                  <div className="flex items-center justify-between gap-space-md mb-4">
                    <div className="flex items-center gap-space-sm">
                      <span className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-sm text-label-sm font-bold">
                        2
                      </span>
                      <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
                        Donor Identification
                      </h2>
                    </div>
                    {/* Guest vs Registered */}
                    <div className="inline-flex rounded-lg bg-surface-container p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setDonorType('GUEST')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          donorType === 'GUEST'
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        Guest Donor
                      </button>
                      <button
                        type="button"
                        onClick={() => setDonorType('REGISTERED')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          donorType === 'REGISTERED'
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        Registered Donor
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={donorName}
                        onChange={(e) => setDonorName(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl bg-surface border border-outline-variant/50 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                        Email Address (for Receipt) *
                      </label>
                      <input
                        type="email"
                        value={donorEmail}
                        onChange={(e) => setDonorEmail(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl bg-surface border border-outline-variant/50 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                        PAN / Tax ID (Optional)
                      </label>
                      <input
                        type="text"
                        value={panNumber}
                        onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                        placeholder="ABCDE1234F"
                        className="w-full h-11 px-3.5 rounded-xl bg-surface border border-outline-variant/50 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-1">
                        City & State
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl bg-surface border border-outline-variant/50 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-outline-variant/30 flex justify-end">
                    <button
                      type="button"
                      onClick={handleProceedToPayment}
                      disabled={loading}
                      className="px-6 py-3.5 rounded-xl bg-secondary-container hover:bg-secondary text-white font-label-md text-label-md font-bold transition-all shadow-md flex items-center gap-2"
                    >
                      {loading ? 'Submitting to API...' : 'Proceed to Payment Sandbox'}
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* VIEW 2: PROCESSING LOCK / PAYMENT SIMULATOR */}
            {stage === 'processing' && currentDonation && (
              <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
                  <div>
                    <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
                      Stage 2 • Processing Lock & Gateway Simulation
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-primary font-bold mt-1">
                      Simulate Gateway Outcome
                    </h2>
                  </div>
                  <div className="text-right">
                    <span className="font-metric-md text-metric-md text-primary font-bold">
                      ₹{parseFloat(currentDonation.amount).toLocaleString('en-IN')}
                    </span>
                    <div className="text-xs text-outline">Donation ID: #{currentDonation.donation_id}</div>
                  </div>
                </div>

                <div className="rounded-xl bg-surface-container-low p-4 border border-outline-variant/40 flex flex-col gap-2 font-mono text-xs">
                  <div className="flex items-center justify-between text-on-surface">
                    <span className="font-bold">Database State:</span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        currentDonation.status === 'CLEARED'
                          ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                          : currentDonation.status === 'FAILED'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-secondary-fixed text-on-secondary-fixed'
                      }`}
                    >
                      {currentDonation.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-outline">
                    <span>Target Route:</span>
                    <span>POST /api/v1/donations/{currentDonation.donation_id}/simulated-payment</span>
                  </div>
                  <div className="flex items-center justify-between text-outline">
                    <span>Idempotency-Key:</span>
                    <span className="font-semibold text-secondary-container">{paymentIdempotencyKey}</span>
                  </div>
                </div>

                {/* State: UNKNOWN / Reconciliation Needed Box */}
                {currentDonation.status === 'UNKNOWN' && (
                  <div className="p-4 rounded-xl bg-secondary-fixed text-on-secondary-fixed border border-secondary/30 flex flex-col gap-3">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-secondary">hourglass_top</span>
                      <div>
                        <h4 className="font-bold text-sm">Payment State is Unresolved (UNKNOWN)</h4>
                        <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                          The transaction was recorded as unknown or timed out. In accordance with database safety rules, we will not issue a fresh payment attempt with a new key. Please reconcile status against the persisted record.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2 border-t border-secondary/20">
                      <button
                        type="button"
                        onClick={handleRecheckStatus}
                        disabled={isReconciling}
                        className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary-container text-white font-label-sm text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <span className={`material-symbols-outlined text-sm ${isReconciling ? 'animate-spin' : ''}`}>
                          sync
                        </span>
                        {isReconciling ? 'Reconciling...' : 'Recheck Status / Reconcile'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTriggerSimulatedOutcome('SUCCEEDED')}
                        disabled={loading || isReconciling}
                        className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-xs font-semibold transition-colors"
                      >
                        Replay Same Payment Attempt
                      </button>
                    </div>
                  </div>
                )}

                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Select an explicit payment simulator outcome to verify database workflows and receipt generation:
                </p>

                {/* Simulated Outcome Triggers */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Success */}
                  <button
                    type="button"
                    onClick={() => handleTriggerSimulatedOutcome('SUCCEEDED')}
                    disabled={loading || currentDonation.status === 'UNKNOWN'}
                    className={`p-4 rounded-xl border border-tertiary/40 bg-surface hover:bg-tertiary-fixed/20 transition-all text-left flex flex-col justify-between group shadow-xs ${
                      currentDonation.status === 'UNKNOWN' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-label-md text-label-md font-bold text-primary">
                          Simulate Success
                        </span>
                        <span className="material-symbols-outlined text-tertiary group-hover:scale-110 transition-transform">
                          check_circle
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        Commits clearing to ledger, issues settlement receipt, and increments raised total.
                      </p>
                    </div>
                    <span className="mt-4 font-mono text-[11px] text-primary font-bold">
                      Status → 200 OK
                    </span>
                  </button>

                  {/* Failure */}
                  <button
                    type="button"
                    onClick={() => handleTriggerSimulatedOutcome('FAILED')}
                    disabled={loading || currentDonation.status === 'UNKNOWN'}
                    className={`p-4 rounded-xl border border-error/40 bg-surface hover:bg-error-container/30 transition-all text-left flex flex-col justify-between group shadow-xs ${
                      currentDonation.status === 'UNKNOWN' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-label-md text-label-md font-bold text-error">
                          Simulate Failure
                        </span>
                        <span className="material-symbols-outlined text-error group-hover:scale-110 transition-transform">
                          cancel
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        Simulates card/UPI decline. Attempt marked failed; donation remains open for retry.
                      </p>
                    </div>
                    <span className="mt-4 font-mono text-[11px] text-error font-bold">
                      Status → FAILED Attempt
                    </span>
                  </button>

                  {/* Timeout */}
                  <button
                    type="button"
                    onClick={() => handleTriggerSimulatedOutcome('TIMEOUT')}
                    disabled={loading || currentDonation.status === 'UNKNOWN'}
                    className={`p-4 rounded-xl border border-secondary/40 bg-surface hover:bg-secondary-fixed/30 transition-all text-left flex flex-col justify-between group shadow-xs ${
                      currentDonation.status === 'UNKNOWN' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-label-md text-label-md font-bold text-secondary">
                          Simulate Timeout
                        </span>
                        <span className="material-symbols-outlined text-secondary group-hover:scale-110 transition-transform">
                          hourglass_empty
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        Gateway timeout. Status set to UNKNOWN pending manual auditor reconciliation.
                      </p>
                    </div>
                    <span className="mt-4 font-mono text-[11px] text-secondary font-bold">
                      Status → 202 UNKNOWN
                    </span>
                  </button>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setStage('checkout')}
                    className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors"
                  >
                    ← Edit Information
                  </button>
                  {currentDonation.status === 'UNKNOWN' && (
                    <button
                      type="button"
                      onClick={handleRecheckStatus}
                      disabled={isReconciling}
                      className="px-4 py-2 rounded-lg bg-secondary text-white font-label-sm text-label-sm font-bold flex items-center gap-1.5"
                    >
                      <span className={`material-symbols-outlined text-sm ${isReconciling ? 'animate-spin' : ''}`}>
                        sync
                      </span>
                      Check Status
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* VIEW 3: SETTLEMENT RECEIPT (Rendered ONLY on authoritative confirmed success) */}
            {stage === 'completed' && currentDonation && (
              <section className="bg-surface-container-lowest rounded-2xl p-8 shadow-md border border-outline-variant/40 flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/40 pb-6">
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-xl bg-tertiary-container text-white flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        verified
                      </span>
                    </span>
                    <div>
                      <h2 className="font-headline-sm text-headline-sm text-primary font-bold">
                        Contribution Acknowledgment & Settlement Receipt
                      </h2>
                      <span className="font-mono text-xs text-outline">
                        Receipt No: {currentDonation.receipt_number}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:items-end gap-1">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm font-bold self-start sm:self-auto">
                      CLEARED & SETTLED
                    </span>
                    {(isSandbox || currentDonation.receipt_number?.startsWith('REC-SIM')) && (
                      <span className="px-2.5 py-0.5 rounded-full bg-secondary-container/20 text-on-secondary-container font-mono text-[11px] font-semibold border border-secondary-container/40">
                        SIMULATED SANDBOX RECEIPT
                      </span>
                    )}
                  </div>
                </div>

                {/* Receipt Grid */}
                {!currentDonation.receipt_number || !currentDonation.transaction_reference ? (
                  <div className="p-4 rounded-xl bg-error-container text-on-error-container text-sm">
                    Receipt data is incomplete or has not been issued by the database ledger.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-surface-container-low text-xs border border-outline-variant/30">
                    <div>
                      <span className="text-outline uppercase font-semibold block mb-0.5">Amount</span>
                      <span className="font-bold text-sm text-primary">
                        ₹{parseFloat(currentDonation.amount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-outline uppercase font-semibold block mb-0.5">Txn Reference</span>
                      <span className="font-mono font-bold text-on-surface truncate block">
                        {currentDonation.transaction_reference}
                      </span>
                    </div>
                    <div>
                      <span className="text-outline uppercase font-semibold block mb-0.5">Date & Time</span>
                      <span className="font-semibold text-on-surface">
                        {new Date(currentDonation.created_at || Date.now()).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-outline uppercase font-semibold block mb-0.5">Donor Name</span>
                      <span className="font-bold text-on-surface">{donorName}</span>
                    </div>
                  </div>
                )}

                {/* Allocation Details */}
                <div className="flex flex-col gap-2 border-t border-b border-outline-variant/30 py-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Allocated Cause:</span>
                    <span className="font-bold text-on-surface">{campaign.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Purpose Classification:</span>
                    <span className="font-mono font-bold text-primary">{campaign.purpose_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Recipient Organization:</span>
                    <span className="font-semibold text-on-surface">{campaign.organization_name}</span>
                  </div>
                </div>

                {/* Notice */}
                <div className="rounded-xl bg-surface-container p-4 text-xs text-on-surface-variant leading-relaxed">
                  <span className="font-bold text-primary block mb-1">Separation of Duties Notice:</span>
                  This receipt proves donation clearing on the double-entry fund ledger. In accordance with platform governance, disbursement to beneficiaries is an independent, subsequent workflow requiring verified onboarding and multi-party approval.
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onBack}
                    className="px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors"
                  >
                    ← Return to Campaigns
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-5 py-2.5 rounded-xl bg-primary-container text-on-primary hover:bg-primary font-label-md text-label-md transition-colors shadow-sm flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">print</span>
                      Print Receipt
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Sticky Context (4 cols) */}
          <div className="lg:col-span-4 sticky top-28 flex flex-col gap-6">
            <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
              <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
                Contribution Target
              </span>

              {campaign.image_url && (
                <img
                  src={campaign.image_url}
                  alt={campaign.title}
                  className="w-full h-36 rounded-xl object-cover"
                />
              )}

              <div>
                <span className="px-2 py-0.5 rounded-full bg-primary-container text-white font-label-sm text-xs font-bold uppercase">
                  {campaign.purpose_code}
                </span>
                <h4 className="font-headline-sm text-headline-sm text-on-surface font-bold mt-2">
                  {campaign.title}
                </h4>
                <span className="text-xs text-on-surface-variant block mt-1">
                  Organized by <strong>{campaign.organization_name}</strong>
                </span>
              </div>

              <div className="border-t border-outline-variant/30 pt-3 flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Selected Contribution:</span>
                  <span className="font-bold text-primary">₹{amount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Platform Processing Fee:</span>
                  <span className="text-tertiary font-bold">₹0 (Zero Fee PBL Demo)</span>
                </div>
                <div className="flex justify-between border-t border-outline-variant/20 pt-2 font-bold text-base">
                  <span>Total Amount:</span>
                  <span className="text-secondary">₹{amount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
