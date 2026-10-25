# DonateKaro — Local Development Setup Guide

> **Prototype notice:** This is an academic PBL prototype. Authentication uses sandboxed mock tokens. Payments are simulated. No production KYC, real OIDC, or live payment gateways are integrated.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **PostgreSQL** | 14 or later | Primary database |
| **psql** | (bundled with PostgreSQL) | DB administration |
| **Python** | 3.12+ (CPython) | FastAPI backend |
| **Node.js** | 18 or later | React/Vite frontend |
| **npm** | 9 or later | Frontend package manager |

---

## Directory Structure

```
charity-donation-beneficiary-portal/
├── backend/               FastAPI Python backend
│   ├── app/               Application code
│   ├── tests/             Pytest test suite
│   └── .venv-cpython314/  Python virtual environment
├── database/
│   ├── schema.sql         Core schema (tables, constraints, indexes)
│   ├── workflows.sql      PL/pgSQL stored functions and triggers
│   ├── runtime-roles.sql  Least-privilege DB role grants
│   ├── seed/              Seed data scripts
│   └── migrations/        Incremental schema migrations
│       ├── m001_ngo_lifecycle.sql    NGO lifecycle columns
│       ├── m002_functions_only.sql   Updated DB functions
│       └── m003_campaign_closure_and_oversight.sql  Closure requests & IRB oversight
├── frontend/              React + Vite frontend
│   └── src/
│       ├── api/           API client modules (real + mock)
│       ├── context/       SandboxContext (Live API / Sandbox toggle)
│       └── features/      NGO, Reviewer, Donation, Home pages
├── contracts/
│   └── openapi.yaml       OpenAPI 3.1 contract
└── LOCAL_SETUP.md         ← this file
```

---

## 1. Database Setup (One-Time)

### 1a. Create the database and runtime role

```sql
-- Run as postgres superuser
CREATE DATABASE charity_portal_dev;
CREATE USER charity_runtime_dev WITH PASSWORD 'devruntime123';
```

### 1b. Apply schema in order

```powershell
$env:PGPASSWORD = "your_postgres_password"
$DB = "charity_portal_dev"

# Core schema
psql -h 127.0.0.1 -U postgres -d $DB -f database/schema.sql

# Stored functions and triggers
psql -h 127.0.0.1 -U postgres -d $DB -f database/workflows.sql

# Least-privilege role grants
psql -h 127.0.0.1 -U postgres -d $DB -f database/runtime-roles.sql
```

### 1c. Apply migrations

```powershell
psql -h 127.0.0.1 -U postgres -d $DB -f database/migrations/m001_ngo_lifecycle.sql
psql -h 127.0.0.1 -U postgres -d $DB -f database/migrations/m002_functions_only.sql
psql -h 127.0.0.1 -U postgres -d $DB -f database/migrations/m003_campaign_closure_and_oversight.sql
```

> **Migration m003** adds the `campaign_closure_request` table, stored procedures for NGO closure requests, and IRB oversight actions (suspend, reopen, close). Apply in order after m001 and m002.

### 1d. Seed realistic demo data (organizations, campaigns, reviewer queue, cleared ledger donations)

```powershell
# Applies realistic seed data for public discovery, reviewer queue, and double-entry ledger entries:
psql -h 127.0.0.1 -U postgres -d $DB -f database/seed/demo_data.sql
```

> **Note:** `database/seed/demo_data.sql` sets up 4 organizations (including pending applicant Org 4 for the reviewer queue), 7 campaigns (5 active across all 5 purpose codes, 1 submitted draft in reviewer audit queue, 1 incomplete draft), 6 double-entry ledger cleared donations with payment attempts, and the required platform reviewer and campaign editor memberships. Run this seed script to establish the full representative dataset.

---

## 2. Backend Setup

### 2a. Install Python dependencies

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt   # or: pip install -e ".[test]"
```

### 2b. Environment variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `CHARITY_DATABASE_URL` | ✅ | `host=127.0.0.1 port=5432 dbname=charity_portal_dev user=charity_runtime` | PostgreSQL connection string |
| `CHARITY_ENVIRONMENT` | ✅ | `test` | Must be `test` to enable mock token auth and financial demo flags |
| `CHARITY_WORKFLOWS_ENABLED` | ✅ | `true` | Enables campaign lifecycle write endpoints |
| `CHARITY_DONATION_WRITES_ENABLED` | ✅ | `true` | Enables donation creation |
| `CHARITY_SIMULATED_PAYMENTS_ENABLED` | ✅ | `true` | Enables simulated payment processing |

> **Security:** `CHARITY_WORKFLOWS_ENABLED`, `CHARITY_DONATION_WRITES_ENABLED`, and `CHARITY_SIMULATED_PAYMENTS_ENABLED` are **rejected** in `staging` or `production` environments. They are only accepted when `CHARITY_ENVIRONMENT=test` and the database host resolves to a loopback address (`127.0.0.1` or `localhost`).

### 2c. Start the backend

```powershell
# From the repo root (PowerShell)
$env:CHARITY_ENVIRONMENT = 'test'
$env:CHARITY_DATABASE_URL = 'host=127.0.0.1 port=5432 dbname=charity_portal_dev user=charity_runtime'
$env:CHARITY_WORKFLOWS_ENABLED = 'true'
$env:CHARITY_DONATION_WRITES_ENABLED = 'true'
$env:CHARITY_SIMULATED_PAYMENTS_ENABLED = 'true'

.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

Backend will be available at: **http://127.0.0.1:8000**
Interactive API docs: **http://127.0.0.1:8000/docs**

---

## 3. Frontend Setup

### 3a. Install dependencies

```powershell
cd frontend
npm install
```

### 3b. Start the dev server

```powershell
cd frontend
npm run dev
```

Frontend will be available at: **http://localhost:5173**

The Vite dev server automatically proxies `/api` requests to `http://localhost:8000` (configured in `vite.config.ts`).

---

## 4. Using the Application

### Sandbox Mode vs. Live API Mode

The header contains a dynamic status indicator and toggle: **"Live API Mode"** / **"Sandbox: Active"**

| Mode | Data source | Status / Trigger |
|------|-------------|------------------|
| **Live API Mode (Default)** | FastAPI + PostgreSQL backend | Automatically active when backend REST API is reachable |
| **Sandbox (Fallback / Demo)** | In-memory mock store (`src/api/mockService.ts`) | Active if backend is offline or explicitly selected via header toggle |

User preference is persisted in browser `localStorage` (`donatekaro_mode`). You can freely toggle between Live API Mode and Sandbox Mode using the button in the top academic notification bar.

### NGO Portal — Live API Mode

Default demo token used: `mock-ngo-editor`
→ Maps to actor `mock:bal-vikas-editor` with `CAMPAIGN_EDITOR` role on org 2.

**Register a new NGO:**
1. Go to **NGO Portal** → "Register New NGO"
2. Fill in organization name and registration reference
3. Save the **Applicant Capability Token** shown in the success banner
4. Use "Resume with Token" on future visits to restore your workspace

**Submit a campaign:**
1. Your org must be `VERIFIED` by a reviewer first
2. Create a campaign draft (title is the only required field for saving)
3. Complete all fields (title, purpose, target amount, dates, description)
4. Click **Submit** — the backend validates completeness

**Request campaign closure:**
1. In the campaign table, active or paused campaigns show a **"Request Closure"** button
2. Provide a reason (minimum 5 characters) — the request is persisted with timestamp and requester
3. The IRB reviews the request in the **Closure Requests** tab; only one PENDING request per campaign is allowed
4. On approval, the campaign is permanently closed; its public visibility ends immediately
5. View your org's closure request history in the **Closure Requests History** section of the workspace

### Reviewer Workspace — Live API Mode

Default mock token: `mock-irb-reviewer`
→ Maps to actor `mock:irb-faculty-reviewer` with `CAMPAIGN_REVIEWER` platform role.

The reviewer workspace automatically uses this token in Live API Mode. It has **four tabs**:

| Tab | Description |
|-----|-------------|
| **Campaign Review Queue** | Review SUBMITTED campaign drafts — approve or reject with reason |
| **Organization Applications** | Review PENDING organization applications — verify or reject |
| **Campaign Oversight** | View all campaigns across lifecycle states; filter by status; suspend active campaigns, reopen suspended ones, or permanently close campaigns (requires reason, logged to audit trail) |
| **Closure Requests** | Review NGO-initiated closure requests — approve (closes campaign) or reject |

> **Campaign status transitions via IRB:**
> - `ACTIVE` → `PAUSED` (suspended) via Suspend — campaign disappears from public discovery immediately
> - `PAUSED` → `ACTIVE` (reopened) via Reopen — within eligibility window and if org is verified
> - `ACTIVE`/`PAUSED` → `CLOSED` (permanent) via Close or Approve Closure Request — terminal, preserves all financial history

---

## 5. Mock Token Reference

| Token | Actor ID | Role | Access |
|-------|----------|------|--------|
| `mock-ngo-editor` | `mock:bal-vikas-editor` | `CAMPAIGN_EDITOR` on Org 2 | Create/submit campaigns for Org 2 |
| `mock-irb-reviewer` | `mock:irb-faculty-reviewer` | `CAMPAIGN_REVIEWER` (platform) | Review queue, approve/reject campaigns and orgs |
| `dk_app_<hash>` | `applicant:<sha256>` | Scoped to registered org | NGO applicant lifecycle access |

Pass tokens as `Authorization: Bearer <token>` headers.

> **Mock tokens are only accepted when `CHARITY_ENVIRONMENT=test`.** They are never valid in staging or production environments.

---

## 6. Running Tests

### Frontend (Vitest)

```powershell
cd frontend
npm test -- --run          # Run all tests once
npm run typecheck          # TypeScript type check
npm run build              # Production build check
```

**Expected:** 95 tests in 10 test files — all pass.

### Backend (Pytest)

```powershell
# From backend/ with activated venv:
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest -v

# Or from repo root directly:
.\backend\.venv\Scripts\python.exe -m pytest backend/tests -v
```

**Expected:** 58 passed, 1 skipped (postgres acceptance test requires explicit env var).

### PostgreSQL Acceptance Test (optional)

```powershell
$env:CHARITY_ACCEPTANCE_DATABASE_URL = 'host=127.0.0.1 port=5432 dbname=charity_portal_dev user=charity_runtime'
cd backend
.venv\Scripts\python.exe -m pytest tests/test_postgres_acceptance.py -v -s
```

---

## 7. Applicant Token Lifecycle

```
Register NGO  →  Receive dk_app_<token>  →  Save token
       ↓
Resume Workspace  →  Enter token  →  Org restored
       ↓
Reviewer verifies org  →  Status: VERIFIED
       ↓
Create draft  →  Edit draft  →  Submit for review
       ↓
Reviewer approves  →  Campaign goes ACTIVE  →  Public discovery
       ↓
(Optional) NGO requests closure  →  IRB reviews  →  Campaign CLOSED
(Optional) IRB suspends  →  Campaign PAUSED (hidden from public)
(Optional) IRB reopens   →  Campaign ACTIVE again
```

The applicant token is stored in browser `localStorage` under key `donatekaro_applicant_token`.
It is tied to the organization via the `applicant_access` table in PostgreSQL.

> **Prototype limitation:** Applicant tokens are 32-byte random hex strings with no expiry. They are a sandbox-only mechanism. Anyone who holds the token can act as that organization's applicant. Do not use for production.

---

## 8. Canonical Startup Sequence (Quick Reference)

```powershell
# Terminal 1 — Backend
$env:CHARITY_ENVIRONMENT = 'test'
$env:CHARITY_DATABASE_URL = 'host=127.0.0.1 port=5432 dbname=charity_portal_dev user=charity_runtime'
$env:CHARITY_WORKFLOWS_ENABLED = 'true'
$env:CHARITY_DONATION_WRITES_ENABLED = 'true'
$env:CHARITY_SIMULATED_PAYMENTS_ENABLED = 'true'
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev

# Browser
# http://localhost:5173   →  Application UI
# http://127.0.0.1:8000/docs  →  API documentation
```

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Frontend shows "Sandbox: Active" and uses mock data | Default sandbox mode | Click toggle in header to switch to Live API Mode |
| `ORGANIZATION_NOT_VERIFIED` on campaign activation | Campaign dates outside active window | Ensure `start_date ≤ today ≤ end_date` |
| `WRITE_WORKFLOW_UNAVAILABLE` | Workflow flags not set | Set `CHARITY_WORKFLOWS_ENABLED=true` |
| `UNAUTHENTICATED` on NGO/reviewer routes | No Bearer token | Add `Authorization: Bearer mock-ngo-editor` header |
| Backend fails to start: "protected database" | DB name in protected list | Use a database name not in the reserved list (see `backend/app/config.py`) |
| Frontend can't reach backend | Proxy not working | Ensure backend runs on port 8000; check `vite.config.ts` |
| IRB Oversight / Closure Requests tab is empty | m003 migration not applied | Run `psql ... -f database/migrations/m003_campaign_closure_and_oversight.sql` |
| "Request Closure" button disabled | Pending closure request already exists | One PENDING request per campaign; wait for IRB decision before re-requesting |

---

## 10. New API Endpoints (m003)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/review/all-campaigns` | IRB reviewer | All campaigns across all lifecycle states with filter support |
| `GET` | `/api/v1/review/closure-requests` | IRB reviewer | All closure requests (pending and decided) |
| `POST` | `/api/v1/review/closure-requests/{id}/decision` | IRB reviewer | Approve or reject a closure request |
| `POST` | `/api/v1/review/campaigns/{id}/suspend` | IRB reviewer | Temporarily suspend an active campaign (ACTIVE → PAUSED) |
| `POST` | `/api/v1/review/campaigns/{id}/reopen` | IRB reviewer | Reopen a suspended campaign (PAUSED → ACTIVE) |
| `POST` | `/api/v1/review/campaigns/{id}/close` | IRB reviewer | Permanently close a campaign (terminal action) |
| `POST` | `/api/v1/campaigns/{id}/closure-request` | NGO editor/applicant | Submit a closure request for own campaign |
| `GET` | `/api/v1/organizations/{org_id}/closure-requests` | NGO editor/applicant | List closure requests for own organization |

All write endpoints require a `reason` body field (minimum 5 characters). IRB actions are persisted with actor, timestamp, and reason in the audit trail.

---

## 11. Known Prototype Limitations

- **Authentication:** Sandboxed mock tokens only. No real OIDC, OAuth2, or session management.
- **Payments:** Fully simulated. No real payment gateway integration.
- **KYC/Verification:** Reviewer manually approves via UI. No government registry or document verification.
- **Email notifications:** Not implemented.
- **Beneficiary management UI:** Schema and DB functions exist; management UI is outside this PBL slice.
- **Disbursement UI:** Backend functions and DB safeguards exist; full disbursement workflow UI is outside this slice.
- **Campaign statuses:** `ACTIVE`, `PAUSED` (suspended by IRB), `CLOSED` (permanent), and `DRAFT`/`SUBMITTED` (lifecycle). `PAUSED` and `CLOSED` campaigns are hidden from public discovery and cannot accept new donations.
- **Closure requests:** One PENDING closure request per campaign at a time. Permanent closure (`CLOSED`) is irreversible; financial history, receipts, and ledger entries are preserved.
