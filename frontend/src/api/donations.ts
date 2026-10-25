import { request } from './client';
import {
  Donation,
  BackendDonationOut,
  BackendPaymentAttemptOut,
  BackendCreateDonationRequest,
  CreateDonationRequest,
  SimulatedPaymentRequest,
  DonationPaymentOutcome,
  PaymentAttempt,
} from '../types/api';
import { mockStore } from './mockService';

/**
 * Generates a cryptographically secure, URL-safe guest access token
 * with at least 32 bytes of entropy (yielding at least 43 characters in base64url).
 * Fails safely if window.crypto is unavailable.
 */
export function generateGuestAccessToken(): string {
  const cryptoObj =
    typeof window !== 'undefined' && window.crypto
      ? window.crypto
      : typeof globalThis !== 'undefined' && globalThis.crypto
      ? globalThis.crypto
      : null;

  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error(
      'Secure cryptographic randomness (crypto.getRandomValues) is unavailable. Cannot generate guest access token.'
    );
  }

  const bytes = new Uint8Array(32);
  cryptoObj.getRandomValues(bytes);

  // Convert to URL-safe base64 string
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  if (base64url.length < 43) {
    throw new Error(
      `Generated guest token length (${base64url.length}) is below backend minimum length of 43 characters.`
    );
  }

  return base64url;
}

/**
 * Generates an operation-scoped idempotency key.
 * Uses cryptographic randomness when available.
 */
export function generateIdempotencyKey(operation: 'don' | 'pay'): string {
  const cryptoObj =
    typeof window !== 'undefined' && window.crypto
      ? window.crypto
      : typeof globalThis !== 'undefined' && globalThis.crypto
      ? globalThis.crypto
      : null;

  let randomHex = '';
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(10);
    cryptoObj.getRandomValues(bytes);
    randomHex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    randomHex = Math.random().toString(36).substring(2, 12);
  }

  return `idemp-${operation}-${Date.now()}-${randomHex}`;
}

/**
 * Maps a single BackendPaymentAttemptOut to the frontend-internal PaymentAttempt.
 *
 * Field mapping (backend → frontend):
 *   payment_attempt_id → attempt_id
 *   started_at         → created_at (closest equivalent available)
 */
function mapBackendAttempt(a: BackendPaymentAttemptOut): PaymentAttempt {
  return {
    attempt_id: a.payment_attempt_id,
    status: a.status,
    created_at: a.started_at,
  };
}

/**
 * Maps a BackendDonationOut (live API response) to the frontend-internal Donation model.
 * This is the authoritative translation layer for Fix 2.3.
 *
 * Key mapping:
 *   payment_status    → status  ('SUCCESSFUL' → 'CLEARED' for UI consistency with sandbox)
 *   payment_attempts  → attempts (each mapped via mapBackendAttempt)
 *
 * Note: donor fields (display_name, email) are NOT present in DonationOut.
 * They are not needed post-creation; the wizard retains them in local state.
 */
export function mapBackendDonationToFrontend(dto: BackendDonationOut): Donation {
  // Map payment_status to frontend status.
  // We preserve 'SUCCESSFUL' as-is so UI code can check either 'CLEARED' (sandbox)
  // or 'SUCCESSFUL' (live) — both handled by isAuthoritativelySettled().
  const status =
    dto.payment_status === 'SUCCESSFUL'
      ? 'SUCCESSFUL'
      : dto.payment_status === 'PENDING'
      ? 'PENDING'
      : dto.payment_status === 'FAILED'
      ? 'FAILED'
      : dto.payment_status === 'CANCELLED'
      ? 'CANCELLED'
      : dto.payment_status === 'PARTIALLY_REFUNDED'
      ? 'PARTIALLY_REFUNDED'
      : 'REFUNDED';

  return {
    donation_id: dto.donation_id,
    campaign_id: dto.campaign_id,
    amount: dto.amount,
    currency: dto.currency,
    status,
    receipt_number: dto.receipt_number,
    transaction_reference: dto.transaction_reference,
    created_at: dto.created_at,
    attempts: Array.isArray(dto.payment_attempts)
      ? dto.payment_attempts.map(mapBackendAttempt)
      : [],
  };
}

/**
 * Builds the backend wire body for POST /api/v1/donations from frontend form fields.
 * Strips all fields not present in BackendCreateDonationRequest (extra="forbid").
 * For guest donors, wraps name/email in the nested donor object.
 * For registered donors, sets donor to null (backend reads from JWT claims).
 */
function buildBackendDonationBody(
  req: CreateDonationRequest
): BackendCreateDonationRequest {
  const donor: BackendCreateDonationRequest['donor'] =
    req.donor_type === 'GUEST'
      ? {
          display_name: req.donor_name,
          email: req.donor_email || null,
          phone: null,
        }
      : null; // Registered: backend extracts from JWT

  return {
    campaign_id: req.campaign_id,
    amount: req.amount,
    currency: req.currency,
    donor,
  };
}

export async function createDonation(
  body: CreateDonationRequest,
  isSandbox = true,
  token?: string,
  guestToken?: string,
  idempotencyKey?: string
): Promise<Donation> {
  const key = idempotencyKey || generateIdempotencyKey('don');

  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 80));
    return mockStore.createDonation(body, key);
  }

  const headers: Record<string, string> = {
    'Idempotency-Key': key,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (guestToken) {
    headers['Guest-Access-Token'] = guestToken;
    headers['X-Guest-Token'] = guestToken;
  }

  // Fix 2.2: Send the correctly structured backend wire body (nested donor, no extra fields).
  const wireBody = buildBackendDonationBody(body);

  const backendDto = await request<BackendDonationOut>('/api/v1/donations', {
    method: 'POST',
    headers,
    body: JSON.stringify(wireBody),
  });

  // Fix 2.3: Adapt backend response to frontend model.
  return mapBackendDonationToFrontend(backendDto);
}

export async function simulateDonationPayment(
  donationId: string,
  outcome: DonationPaymentOutcome,
  isSandbox = true,
  token?: string,
  guestToken?: string,
  idempotencyKey?: string
): Promise<Donation> {
  const key = idempotencyKey || generateIdempotencyKey('pay');

  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 120));
    return mockStore.simulatePayment(donationId, { outcome }, key);
  }

  const headers: Record<string, string> = {
    'Idempotency-Key': key,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (guestToken) {
    headers['Guest-Access-Token'] = guestToken;
    headers['X-Guest-Token'] = guestToken;
  }

  const payload: SimulatedPaymentRequest = { outcome };

  const backendDto = await request<BackendDonationOut>(
    `/api/v1/donations/${donationId}/simulated-payment`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }
  );

  return mapBackendDonationToFrontend(backendDto);
}

export async function fetchDonationById(
  donationId: string,
  isSandbox = true,
  token?: string,
  guestToken?: string
): Promise<Donation> {
  if (isSandbox) {
    await new Promise((r) => setTimeout(r, 60));
    const d = mockStore.getDonation(donationId);
    if (!d) throw new Error(`Donation ${donationId} not found`);
    return d;
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (guestToken) {
    headers['Guest-Access-Token'] = guestToken;
    headers['X-Guest-Token'] = guestToken;
  }

  const backendDto = await request<BackendDonationOut>(`/api/v1/donations/${donationId}`, {
    headers,
  });

  return mapBackendDonationToFrontend(backendDto);
}
