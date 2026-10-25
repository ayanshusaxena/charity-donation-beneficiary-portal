# Local simulated donation demo

This guide configures only the local simulated donation path. It does not enable real payments, refunds, reconciliation, campaign management, beneficiary changes, or disbursements.

## Required flags and guards

| Setting | Code default | Demo value | What it gates |
|---|---:|---:|---|
| CHARITY_WORKFLOWS_ENABLED | false | false | Campaign and beneficiary mutations, refunds, payment reconciliation, disbursement requests/approval/payment |
| CHARITY_DONATION_WRITES_ENABLED | false | true | Named guest or registered donation creation |
| CHARITY_SIMULATED_PAYMENTS_ENABLED | false | true | The development/test simulated payment outcome endpoint |

All flags remain false in ordinary application configuration. Simulated donation writes require CHARITY_ENVIRONMENT=test (or development), an explicit database URL with a loopback host and database name, a non-superuser application login that is a member of charity_portal_runtime and not charity_portal_owner, and the existing transaction/authorization guards. Startup rejects any enabled financial-write flag in staging or production, rejects an enabled write configuration without a loopback database URL, and rejects the two protected project database names. The application does not accept a caller-provided app.actor_id as identity.

With the demo values above, donation creation and simulation are enabled. Owned donation status and receipt reads remain read-only and require a verified identity or the matching guest capability. The general workflow flag stays false, so refund, reconciliation, campaign, beneficiary and disbursement write routes return the existing unavailable response. The demo uses a named guest donation capability; anonymous donations are not supported.

## Prepare an isolated local database

Use a uniquely named database on 127.0.0.1. Confirm that the exact database name does not already exist before creating it. Never use charity_portal_test, charity_portal_financial_review, or another pre-existing database as the demo target. Apply database/schema.sql, database/workflows.sql and database/runtime-roles.sql only to the newly created database. They are initializers, not migrations or reset scripts.

Provision a dedicated LOGIN role with only membership in charity_portal_runtime. Do not grant it owner membership, superuser, direct table DML, CREATEDB or CREATEROLE. Store the database password in a local protected pgpass file or secret store; do not put it in a repository file or shell command history. The application checks role membership when it opens a connection.

A demo campaign must already be approved, active and within its campaign dates. Use existing synthetic data or create it through the authorized campaign workflow before running the donation demo. Do not turn on CHARITY_WORKFLOWS_ENABLED just to prepare a campaign.

## Start the API in a temporary PowerShell environment

Run these commands from backend/ in the same PowerShell window. Replace the database name and runtime role with the exact local database and login you provisioned. Keep the database host at 127.0.0.1. PGPASSWORD is read without echo and exists only in this shell process while the server runs.

~~~powershell
$demoDb = 'charity_demo_local_<unique_suffix>'
$demoUser = '<runtime_login>'
$securePassword = Read-Host 'Local demo database password' -AsSecureString
$secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$passwordValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)
$variables = @(
  'PGPASSWORD',
  'CHARITY_ENVIRONMENT',
  'CHARITY_DATABASE_URL',
  'CHARITY_WORKFLOWS_ENABLED',
  'CHARITY_DONATION_WRITES_ENABLED',
  'CHARITY_SIMULATED_PAYMENTS_ENABLED'
)
$priorValues = @{}
foreach ($name in $variables) { $priorValues[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  $env:PGPASSWORD = $passwordValue
  $env:CHARITY_ENVIRONMENT = 'test'
  $env:CHARITY_DATABASE_URL = "host=127.0.0.1 port=5432 dbname=$demoDb user=$demoUser"
  $env:CHARITY_WORKFLOWS_ENABLED = 'false'
  $env:CHARITY_DONATION_WRITES_ENABLED = 'true'
  $env:CHARITY_SIMULATED_PAYMENTS_ENABLED = 'true'
  python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
} finally {
  foreach ($name in $variables) {
    [Environment]::SetEnvironmentVariable($name, $priorValues[$name], 'Process')
  }
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)
  $passwordValue = $null
  $securePassword.Dispose()
}
~~~

The app itself validates the environment, explicit local database host, and database name at startup/configuration load. Keep this server bound to loopback for the PBL demo. The commands above set no OIDC provider and use the named guest-capability flow; configure a trusted OIDC issuer/audience/JWKS separately if demonstrating registered donors.

## Demonstrate simulated donation outcomes

Use a named guest donor and a cryptographically random URL-safe capability of at least 32 random bytes. Keep the capability private and send it only in the Guest-Access-Token header. Use distinct Idempotency-Key values for donation creation and payment.

1. Create a donation against an eligible campaign through POST /api/v1/donations.
2. For a successful demonstration, call POST /api/v1/donations/{donation_id}/simulated-payment with outcome SUCCEEDED. The backend persists the attempt and clearing workflow before returning a receipt.
3. For a failure demonstration, create a separate donation and submit outcome FAILED. The donation remains pending and no receipt is issued.
4. Read each donation through GET /api/v1/donations/{donation_id} with the same guest capability. Do not show a receipt unless the persisted API response returns a non-null receipt_number.

TIMEOUT is an unknown result and requires authorized reconciliation. The local donation-only configuration intentionally leaves reconciliation disabled; do not use TIMEOUT in the demo unless a separately authorized operator workflow is configured.

## Safety boundary and verification

No Razorpay, Stripe, UPI, card, bank-transfer, external refund, webhook, or payment-provider client exists in the backend payment path. Simulated payment records an outcome through PostgreSQL workflows; it does not contact a real payment service. OIDC JWKS lookup is for token verification only.

Before using the demo, run the focused configuration tests and the opt-in PostgreSQL acceptance case on a newly created disposable database. The PostgreSQL case verifies that donation creation, simulated success/failure, and owned status reads work with CHARITY_WORKFLOWS_ENABLED=false, while campaign mutation, refund, and disbursement routes remain unavailable. The feature flags are set only for the current PowerShell process and are restored when Uvicorn exits. Do not commit a real .env file, a database password, or an enabled shared configuration.
