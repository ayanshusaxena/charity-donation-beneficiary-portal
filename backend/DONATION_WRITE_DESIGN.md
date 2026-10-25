# DonateKaro identity and write workflow

This document describes the current source implementation. It is not evidence that a database was initialized or that these workflows were executed. The API write flags default to disabled.

## Identity and ownership

- Registered donor identity is the verified OIDC principal `issuer|subject`, stored uniquely in `donor.actor_id`. A caller-supplied `app.actor_id` is not authentication; the backend derives it only after validating issuer, audience, signature, expiration, and subject.
- Guest giving is named and capability-authorized. The client must generate a cryptographically random URL-safe token of at least 32 random bytes, retain it securely, and send it as `Guest-Access-Token`. PostgreSQL stores only its SHA-256 digest in `donation_guest_access`. The token must never appear in logs. Anonymous donor records are not used by this API.
- `beneficiary.organization_id` is nullable for unresolved existing records. No name-based ownership backfill is provided. Administrators must supply an authoritative mapping before backfill; unresolved records cannot be paid, and request/payment workflows enforce organization ownership.

## Durable requests and payment outcomes

- `api_idempotency_request` separates `DONATION_CREATE`, `SIMULATED_PAYMENT`, `DONATION_REFUND`, and `DISBURSEMENT_PAYMENT`. The principal, operation, and opaque key are unique. Canonical request hashes reject same-key/different-payload retries. Transaction advisory locks serialize same-key requests.
- Donation creation atomically persists the donor link, pending donation, guest-token digest when applicable, creation idempotency result, and audit event.
- Simulated payment atomically persists the payment attempt, operation key, audit event, and successful clearing ledger/audit. A success creates unique transaction and receipt references before calling `clear_donation`, in the same transaction. Failed attempts leave the donation pending and may be retried under a new key.
- `TIMEOUT` is an unknown payment outcome. The attempt is persisted as `UNKNOWN`, further attempts are blocked, and only an authorized reconciliation operation can resolve it. Replaying the same key returns the saved attempt; reading the owned donation does not invent a terminal result.
- The status endpoint exposes transaction and receipt values only after the donation has a cleared/refunded status. No separate receipt table is added; the unique receipt number is stored on the donation.

## Financial workflow controls

- Campaign creation, editing, submission, review, activation, beneficiary verification, refund, and disbursement functions check role tables and write related audit events in their transaction.
- Payout request/approval/execution are separate steps. The requester, approver, and operator must be different actors. Beneficiary verification and same-organization ownership are checked at request and payment; purpose codes and available scoped funds are rechecked at payment.
- Existing clearing, pledge, allocation, refund, scoped ledger, and balance-lock behavior remains in the database workflows. The campaign row lock serializes relevant clearing and payout balance mutations; the regression suite must still be run against the current scripts before claiming verified behavior.

## Deployment boundary and known risks

- `database/schema.sql`, `database/workflows.sql`, and `database/runtime-roles.sql` are development-stage initializers. They are not migrations. No live database has been migrated by this work. Existing databases require a separately reviewed upgrade plan before using this backend.
- Runtime role setup revokes public table/sequence/function access, removes public schema CREATE, and grants only discovery-view SELECT and approved workflow function execution. Provision a separate non-superuser LOGIN role as a member of `charity_portal_runtime`; never grant `charity_portal_owner` to the application login. Do not give runtime direct DML.
- Database role tables must be provisioned only from trusted administrative processes. `app.actor_id` remains a caller-set PostgreSQL setting, so a database login allowed to connect directly can spoof it. The supported boundary is the authenticated API service plus restricted database credentials; PostgreSQL owners/superusers remain privileged.
- Configure `CHARITY_DATABASE_URL`, `CHARITY_AUTH_ISSUER`, `CHARITY_AUTH_AUDIENCE`, and `CHARITY_AUTH_JWKS_URL`. Keep `CHARITY_WORKFLOWS_ENABLED`, `CHARITY_DONATION_WRITES_ENABLED`, and `CHARITY_SIMULATED_PAYMENTS_ENABLED` false until isolated PostgreSQL tests, authorization provisioning, beneficiary ownership review, and operational recovery are complete.
- Simulation is development/test only and is not evidence of a real payment provider settlement. Provider integration, production reconciliation evidence, key rotation, rate limits, token delivery/recovery UX, backup/restore, and monitoring remain operational work.
