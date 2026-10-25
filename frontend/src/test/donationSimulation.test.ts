import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  createDonation,
  simulateDonationPayment,
  generateGuestAccessToken,
  generateIdempotencyKey,
} from '../api/donations';
import { DonationWizard } from '../features/donation/DonationWizard';
import { SandboxProvider } from '../context/SandboxContext';
import { Campaign, Donation } from '../types/api';
import * as donationsApi from '../api/donations';

const mockCampaign: Campaign = {
  campaign_id: '101',
  organization_id: 'org_001',
  organization_name: 'Annapurna Trust',
  title: 'Mid-Day Nutrition for Rural Schools',
  purpose_code: 'FOOD',
  description: 'Providing mid-day meals.',
  target_amount: '500000.00',
  amount_raised: '0.00',
  currency: 'INR',
  start_date: '2025-01-01',
  end_date: '2025-12-31',
  status: 'ACTIVE',
};

function renderWizard(campaign: Campaign = mockCampaign, onBack = () => {}) {
  return render(
    React.createElement(
      SandboxProvider,
      null,
      React.createElement(DonationWizard, { campaign, onBack })
    )
  );
}

describe('Donation & Payment Simulation Workflow Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Authoritative payment with valid receipt and transaction fields renders receipt presentation
  it('1. A successful authoritative payment with valid receipt and transaction fields renders the completed receipt presentation', async () => {
    const donation = await createDonation(
      {
        campaign_id: '101',
        amount: '500.00',
        currency: 'INR',
        donor_type: 'GUEST',
        donor_name: 'Test Donor',
        donor_email: 'test@example.org',
      },
      true
    );

    const cleared = await simulateDonationPayment(donation.donation_id, 'SUCCEEDED', true);
    expect(cleared.status).toBe('CLEARED');
    expect(cleared.receipt_number).toBeTruthy();
    expect(cleared.transaction_reference).toBeTruthy();
    expect(cleared.receipt_number).toContain('REC-SIM');

    // UI rendering test
    renderWizard();

    // Click proceed to payment
    const proceedBtn = screen.getByRole('button', { name: /Proceed to Payment Sandbox/i });
    fireEvent.click(proceedBtn);

    // Wait for stage 2 to show
    await waitFor(() => {
      expect(screen.getByText(/Simulate Gateway Outcome/i)).toBeInTheDocument();
    });

    // Click Simulate Success
    const successBtn = screen.getByRole('button', { name: /Simulate Success/i });
    fireEvent.click(successBtn);

    // Must reach completed receipt stage
    await waitFor(() => {
      expect(
        screen.getByText(/Contribution Acknowledgment & Settlement Receipt/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/CLEARED & SETTLED/i)).toBeInTheDocument();
    });
  });

  // 2. Successful-looking user selection without authoritative success does NOT render completed receipt
  it('2. A successful-looking user selection without authoritative success does NOT render the completed receipt presentation', async () => {
    // Mock simulateDonationPayment to return FAILED even if user clicked success
    vi.spyOn(donationsApi, 'simulateDonationPayment').mockResolvedValueOnce({
      donation_id: '999',
      campaign_id: '101',
      donor_id: 'gst_mock',
      amount: '1000.00',
      currency: 'INR',
      status: 'FAILED',
      receipt_number: null,
      transaction_reference: null,
      created_at: new Date().toISOString(),
      attempts: [{ attempt_id: 'att_1', amount: '1000.00', status: 'FAILED', created_at: new Date().toISOString() }],
    } as unknown as Donation);

    renderWizard();

    const proceedBtn = screen.getByRole('button', { name: /Proceed to Payment Sandbox/i });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(screen.getByText(/Simulate Gateway Outcome/i)).toBeInTheDocument();
    });

    const successBtn = screen.getByRole('button', { name: /Simulate Success/i });
    fireEvent.click(successBtn);

    // Receipt header must NOT be rendered
    await waitFor(() => {
      expect(
        screen.queryByText(/Contribution Acknowledgment & Settlement Receipt/i)
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/Simulated payment was marked as FAILED by issuer/i)
      ).toBeInTheDocument();
    });
  });

  // 3. Missing receipt number or transaction reference from backend never triggers fabricated fallback values
  it('3. Missing receipt number or transaction reference from the backend never triggers fabricated fallback values', async () => {
    // Mock simulateDonationPayment to return CLEARED but missing receipt_number and transaction_reference
    vi.spyOn(donationsApi, 'simulateDonationPayment').mockResolvedValueOnce({
      donation_id: '999',
      campaign_id: '101',
      donor_id: 'gst_mock',
      amount: '1000.00',
      currency: 'INR',
      status: 'CLEARED',
      receipt_number: null,
      transaction_reference: null,
      created_at: new Date().toISOString(),
      attempts: [],
    } as unknown as Donation);

    renderWizard();

    const proceedBtn = screen.getByRole('button', { name: /Proceed to Payment Sandbox/i });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(screen.getByText(/Simulate Gateway Outcome/i)).toBeInTheDocument();
    });

    const successBtn = screen.getByRole('button', { name: /Simulate Success/i });
    fireEvent.click(successBtn);

    // Verify unresolved error is displayed and fake fallback values are never shown
    await waitFor(() => {
      expect(
        screen.getByText(/official receipt number or transaction reference was omitted by the response/i)
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/REC-2025-001/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/TXN-SIM-2025094/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Contribution Acknowledgment & Settlement Receipt/i)
    ).not.toBeInTheDocument();
  });

  // 4. Unknown/timeout outcomes remain in an unresolved reconciliation state and do not show completed receipt
  it('4. Unknown/timeout outcomes remain in an unresolved reconciliation state and do not show a completed receipt', async () => {
    const donation = await createDonation(
      {
        campaign_id: '103',
        amount: '1200.00',
        currency: 'INR',
        donor_type: 'GUEST',
        donor_name: 'Test Timeout',
        donor_email: 'timeout@example.org',
      },
      true
    );

    const unknown = await simulateDonationPayment(donation.donation_id, 'TIMEOUT', true);
    expect(unknown.status).toBe('UNKNOWN');
    expect(unknown.receipt_number).toBeNull();
    expect(unknown.transaction_reference).toBeNull();

    // UI test for timeout
    renderWizard();

    const proceedBtn = screen.getByRole('button', { name: /Proceed to Payment Sandbox/i });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(screen.getByText(/Simulate Gateway Outcome/i)).toBeInTheDocument();
    });

    const timeoutBtn = screen.getByRole('button', { name: /Simulate Timeout/i });
    fireEvent.click(timeoutBtn);

    await waitFor(() => {
      expect(screen.getByText(/Payment State is Unresolved \(UNKNOWN\)/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Recheck Status \/ Reconcile/i })).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/Contribution Acknowledgment & Settlement Receipt/i)
    ).not.toBeInTheDocument();
  });

  // 5. Guest token meets required length and character-set constraints and is passed to calls
  it('5. The guest token meets the required length and character-set constraints and is passed to the expected client calls', async () => {
    const token1 = generateGuestAccessToken();
    const token2 = generateGuestAccessToken();

    // Must be at least 43 characters (base64url for 32 bytes)
    expect(token1.length).toBeGreaterThanOrEqual(43);
    expect(token2.length).toBeGreaterThanOrEqual(43);

    // Must consist only of URL-safe characters: [A-Za-z0-9_-]
    const urlSafeRegex = /^[A-Za-z0-9_-]+$/;
    expect(urlSafeRegex.test(token1)).toBe(true);
    expect(urlSafeRegex.test(token2)).toBe(true);

    // Uniqueness
    expect(token1).not.toBe(token2);

    // Verify token passing in live client calls
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        donation_id: 'don_test_token',
        campaign_id: '101',
        amount: '100.00',
        currency: 'INR',
        payment_status: 'PENDING',
        created_at: new Date().toISOString(),
        transaction_reference: null,
        receipt_number: null,
        payment_attempts: [],
      }),
    } as Response);

    await createDonation(
      {
        campaign_id: '101',
        amount: '100.00',
        currency: 'INR',
        donor_type: 'GUEST',
        donor_name: 'Guest User',
        donor_email: 'guest@example.org',
      },
      false, // live mode
      undefined,
      token1,
      'idemp-don-token-test-12345'
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [callUrl, callOptions] = fetchSpy.mock.calls[0];
    expect(callUrl).toBe('/api/v1/donations');

    const headers = callOptions?.headers as Record<string, string> | Headers | undefined;
    // Support Headers instance or plain object
    const guestTokenHeader = headers instanceof Headers ? headers.get('X-Guest-Token') : (headers as Record<string, string>)?.['X-Guest-Token'];
    const idempotencyHeader = headers instanceof Headers ? headers.get('Idempotency-Key') : (headers as Record<string, string>)?.['Idempotency-Key'];
    expect(guestTokenHeader).toBe(token1);
    expect(idempotencyHeader).toBe('idemp-don-token-test-12345');
  });

  // 6. Donation creation retries with same idempotency key return replayed donation without duplicate
  it('6. Donation creation retries with the same idempotency key return the replayed donation without creating a duplicate', async () => {
    const key = `idemp-don-test-replay-${Date.now()}`;
    const payload: import('../types/api').CreateDonationRequest = {
      campaign_id: '101',
      amount: '750.00',
      currency: 'INR',
      donor_type: 'GUEST',
      donor_name: 'Idempotent Donor',
      donor_email: 'idemp@example.org',
    };

    const first = await createDonation(payload, true, undefined, undefined, key);
    const retry = await createDonation(payload, true, undefined, undefined, key);

    expect(first.donation_id).toBe(retry.donation_id);
    expect(first.created_at).toBe(retry.created_at);
    expect(first.amount).toBe(retry.amount);
  });

  // 7. Payment retries for the same operation reuse their key
  it('7. Payment retries for the same operation reuse their key', async () => {
    const donation = await createDonation(
      {
        campaign_id: '101',
        amount: '300.00',
        currency: 'INR',
        donor_type: 'GUEST',
        donor_name: 'Payment Retry Donor',
        donor_email: 'payretry@example.org',
      },
      true
    );

    const paymentKey = `idemp-pay-test-${Date.now()}`;

    const firstAttempt = await simulateDonationPayment(
      donation.donation_id,
      'SUCCEEDED',
      true,
      undefined,
      undefined,
      paymentKey
    );

    const replayAttempt = await simulateDonationPayment(
      donation.donation_id,
      'SUCCEEDED',
      true,
      undefined,
      undefined,
      paymentKey
    );

    expect(firstAttempt.donation_id).toBe(replayAttempt.donation_id);
    expect(firstAttempt.receipt_number).toBe(replayAttempt.receipt_number);
    expect(firstAttempt.transaction_reference).toBe(replayAttempt.transaction_reference);
    // Attempts length should be 1 because it replayed rather than appending a new one
    expect(replayAttempt.attempts?.length).toBe(1);
  });

  // 8. Donation creation and payment use distinct keys with expected prefixes
  it('8. Donation creation and payment use distinct keys with the expected prefixes', () => {
    const creationKey = generateIdempotencyKey('don');
    const paymentKey = generateIdempotencyKey('pay');

    expect(creationKey.startsWith('idemp-don-')).toBe(true);
    expect(paymentKey.startsWith('idemp-pay-')).toBe(true);
    expect(creationKey).not.toBe(paymentKey);

    // Check backend min_length requirement (>= 16 chars)
    expect(creationKey.length).toBeGreaterThanOrEqual(16);
    expect(paymentKey.length).toBeGreaterThanOrEqual(16);
  });

  // 9. Ambiguous timeout outcome does not trigger an automatic or unconfirmed new payment attempt
  it('9. An ambiguous timeout outcome does not trigger an automatic or unconfirmed new payment attempt', async () => {
    renderWizard();

    const proceedBtn = screen.getByRole('button', { name: /Proceed to Payment Sandbox/i });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(screen.getByText(/Simulate Gateway Outcome/i)).toBeInTheDocument();
    });

    const timeoutBtn = screen.getByRole('button', { name: /Simulate Timeout/i });
    fireEvent.click(timeoutBtn);

    await waitFor(() => {
      expect(screen.getByText(/Payment State is Unresolved \(UNKNOWN\)/i)).toBeInTheDocument();
    });

    // When status is UNKNOWN, new outcome buttons must be disabled
    const successBtn = screen.getByRole('button', { name: /Simulate Success/i });
    const failureBtn = screen.getByRole('button', { name: /Simulate Failure/i });
    const retryTimeoutBtn = screen.getByRole('button', { name: /Simulate Timeout/i });

    expect(successBtn).toBeDisabled();
    expect(failureBtn).toBeDisabled();
    expect(retryTimeoutBtn).toBeDisabled();

    // Recheck status button must be available
    const reconcileBtn = screen.getByRole('button', { name: /Recheck Status \/ Reconcile/i });
    expect(reconcileBtn).not.toBeDisabled();
  });

  // 10. Sandbox synthetic receipts are clearly distinguishable from live API results
  it('10. Sandbox synthetic receipts are clearly distinguishable from live API results', async () => {
    const donation = await createDonation(
      {
        campaign_id: '101',
        amount: '800.00',
        currency: 'INR',
        donor_type: 'GUEST',
        donor_name: 'Distinguishable Donor',
        donor_email: 'distinguish@example.org',
      },
      true
    );

    const cleared = await simulateDonationPayment(donation.donation_id, 'SUCCEEDED', true);

    // Sandbox simulated receipts must be clearly prefixed as synthetic
    expect(cleared.receipt_number).toMatch(/^REC-SIM-/);
    expect(cleared.transaction_reference).toMatch(/^TXN-SIM-/);

    // In UI, when rendered, sandbox badge must be present
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: /Proceed to Payment Sandbox/i }));

    await waitFor(() => {
      expect(screen.getByText(/Simulate Gateway Outcome/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Simulate Success/i }));

    await waitFor(() => {
      expect(screen.getByText(/SIMULATED SANDBOX RECEIPT/i)).toBeInTheDocument();
    });
  });
});
