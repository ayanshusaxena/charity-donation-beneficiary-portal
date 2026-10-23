"""Opt-in PostgreSQL acceptance path for a newly created disposable DB.

Run only with CHARITY_RUN_POSTGRES_ACCEPTANCE=1, a runtime-role DSN in
CHARITY_DATABASE_URL, and a disposable-database administrator DSN in
CHARITY_TEST_ADMIN_DATABASE_URL. The test commits synthetic fixtures; drop
only the disposable database after reviewing the run evidence.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import secrets
import threading
import time
from uuid import uuid4

import jwt
import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.auth import _jwks_client
from app.config import get_settings
from app.main import app


pytestmark = pytest.mark.skipif(
    os.getenv("CHARITY_RUN_POSTGRES_ACCEPTANCE") != "1",
    reason="requires explicitly configured disposable PostgreSQL acceptance database",
)


def test_postgres_backed_lifecycle_identity_donation_and_disbursement():
    admin_dsn = os.environ["CHARITY_TEST_ADMIN_DATABASE_URL"]
    run_id = uuid4().hex[:12]
    issuer = "https://donatekaro-acceptance.invalid"
    actor = lambda subject: f"{issuer}|{subject}-{run_id}"

    with psycopg.connect(admin_dsn) as admin:
        org_a = admin.execute(
            "INSERT INTO organization(organization_name) VALUES (%s) RETURNING organization_id",
            (f"Acceptance NGO A {run_id}",),
        ).fetchone()[0]
        org_b = admin.execute(
            "INSERT INTO organization(organization_name) VALUES (%s) RETURNING organization_id",
            (f"Acceptance NGO B {run_id}",),
        ).fetchone()[0]
        admin.cursor().executemany(
            "INSERT INTO organization_membership(organization_id,actor_id,membership_role) VALUES (%s,%s,%s)",
            [
                (org_a, actor("ngo-a"), "CAMPAIGN_EDITOR"),
                (org_a, actor("ngo-a"), "BENEFICIARY_MANAGER"),
                (org_a, actor("ngo-a"), "DISBURSEMENT_REQUESTER"),
                (org_b, actor("ngo-b"), "CAMPAIGN_EDITOR"),
                (org_b, actor("ngo-b"), "BENEFICIARY_MANAGER"),
            ],
        )
        admin.cursor().executemany(
            "INSERT INTO platform_role(actor_id,platform_role) VALUES (%s,%s)",
            [
                (actor("ngo-a"), "PAYOUT_APPROVER"),  # separation-of-duties negative case
                (actor("reviewer"), "CAMPAIGN_REVIEWER"),
                (actor("verifier"), "BENEFICIARY_VERIFIER"),
                (actor("reconciler"), "PAYMENT_RECONCILER"),
                (actor("refund-operator"), "REFUND_OPERATOR"),
                (actor("payout-approver"), "PAYOUT_APPROVER"),
                (actor("payout-operator"), "PAYOUT_OPERATOR"),
            ],
        )

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public_jwk.update({"kid": "acceptance-key", "use": "sig", "alg": "RS256"})

    class JwksHandler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            body = json.dumps({"keys": [public_jwk]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format, *_args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), JwksHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    get_settings.cache_clear()
    _jwks_client.cache_clear()

    def token(subject: str, *, name: str | None = None) -> str:
        now = datetime.now(timezone.utc)
        claims = {
            "iss": issuer,
            "sub": f"{subject}-{run_id}",
            "aud": "donatekaro-acceptance",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        }
        if name:
            claims.update({"name": name, "email": f"{subject}@example.com", "email_verified": True})
        return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": "acceptance-key"})

    def auth(subject: str, *, name: str | None = None) -> dict[str, str]:
        return {"Authorization": f"Bearer {token(subject, name=name)}"}

    def post(client, path, *, subject=None, json_body=None, headers=None):
        request_headers = dict(headers or {})
        if subject is not None:
            request_headers.update(auth(subject))
        return client.post(path, json=json_body, headers=request_headers)

    try:
        # Settings are enabled only inside this test process and only for the disposable DB.
        os.environ["CHARITY_ENVIRONMENT"] = "test"
        os.environ["CHARITY_WORKFLOWS_ENABLED"] = "true"
        os.environ["CHARITY_DONATION_WRITES_ENABLED"] = "true"
        os.environ["CHARITY_SIMULATED_PAYMENTS_ENABLED"] = "true"
        os.environ["CHARITY_AUTH_ISSUER"] = issuer
        os.environ["CHARITY_AUTH_AUDIENCE"] = "donatekaro-acceptance"
        os.environ["CHARITY_AUTH_JWKS_URL"] = f"http://127.0.0.1:{server.server_port}/jwks.json"
        get_settings.cache_clear()

        today = date.today()
        campaign_body = {
            "campaign_name": f"Acceptance campaign {run_id}",
            "purpose": "Synthetic acceptance verification",
            "purpose_code": "GENERAL",
            "target_amount": "1000.00",
            "currency": "INR",
            "start_date": str(today - timedelta(days=1)),
            "end_date": str(today + timedelta(days=10)),
        }
        with TestClient(app) as client:
            unauthenticated = client.post(
                f"/api/v1/organizations/{org_a}/campaigns", json=campaign_body
            )
            assert unauthenticated.status_code == 401

            created = post(
                client, f"/api/v1/organizations/{org_a}/campaigns",
                subject="ngo-a", json_body=campaign_body,
            )
            assert created.status_code == 201, created.text
            campaign_id = created.json()["resource_id"]

            my_orgs = client.get("/api/v1/me/organizations", headers=auth("ngo-a"))
            assert my_orgs.status_code == 200, my_orgs.text
            assert [item["organization_id"] for item in my_orgs.json()["items"]] == [str(org_a)]
            org_dashboard = client.get(
                f"/api/v1/organizations/{org_a}/dashboard", headers=auth("ngo-a")
            )
            assert org_dashboard.status_code == 200, org_dashboard.text
            assert org_dashboard.json()["campaign_count"] == 1
            assert org_dashboard.json()["draft_campaign_count"] == 1
            owned_campaigns = client.get(
                f"/api/v1/organizations/{org_a}/campaigns", headers=auth("ngo-a")
            )
            assert owned_campaigns.status_code == 200, owned_campaigns.text
            assert owned_campaigns.json()["items"][0]["campaign_id"] == campaign_id
            assert owned_campaigns.json()["items"][0]["approval_status"] == "PENDING"
            owned_campaign = client.get(
                f"/api/v1/organizations/{org_a}/campaigns/{campaign_id}", headers=auth("ngo-a")
            )
            assert owned_campaign.status_code == 200, owned_campaign.text
            cross_org_campaigns = client.get(
                f"/api/v1/organizations/{org_b}/campaigns", headers=auth("ngo-a")
            )
            assert cross_org_campaigns.status_code == 403
            cross_org_dashboard = client.get(
                f"/api/v1/organizations/{org_b}/dashboard", headers=auth("ngo-a")
            )
            assert cross_org_dashboard.status_code == 403

            cross_org_edit = client.patch(
                f"/api/v1/campaigns/{campaign_id}",
                headers=auth("ngo-b"), json={"campaign_name": "Unauthorized edit"},
            )
            assert cross_org_edit.status_code == 403
            submitted = post(
                client, f"/api/v1/campaigns/{campaign_id}/submission", subject="ngo-a"
            )
            assert submitted.status_code == 200, submitted.text
            review_queue = client.get("/api/v1/review/campaigns", headers=auth("reviewer"))
            assert review_queue.status_code == 200, review_queue.text
            assert campaign_id in {item["campaign_id"] for item in review_queue.json()["items"]}
            forbidden_review_queue = client.get(
                "/api/v1/review/campaigns", headers=auth("ngo-a")
            )
            assert forbidden_review_queue.status_code == 403
            pending_public = client.get(f"/api/v1/campaigns/{campaign_id}")
            assert pending_public.status_code == 404
            approved = post(
                client, f"/api/v1/campaigns/{campaign_id}/review", subject="reviewer",
                json_body={"decision": "APPROVED", "reason": "Synthetic acceptance approval"},
            )
            assert approved.status_code == 200, approved.text
            public_detail = client.get(f"/api/v1/campaigns/{campaign_id}")
            assert public_detail.status_code == 200, public_detail.text
            assert public_detail.json()["eligibility"] == "ACCEPTING_DONATIONS"
            assert public_detail.json()["amount_raised"] == "0.00"
            public_list = client.get("/api/v1/campaigns", params={"search": run_id})
            assert public_list.status_code == 200
            assert campaign_id in {item["campaign_id"] for item in public_list.json()["items"]}

            # Local demo configuration: donation create/payment/status work while
            # broad management, refund, reconciliation and payout writes stay off.
            os.environ["CHARITY_WORKFLOWS_ENABLED"] = "false"
            get_settings.cache_clear()
            demo_success_token = secrets.token_urlsafe(32)
            demo_success = client.post(
                "/api/v1/donations",
                headers={"Guest-Access-Token": demo_success_token,
                         "Idempotency-Key": f"demo-success-{run_id}-0001"},
                json={"campaign_id": campaign_id,
                      "donor": {"display_name": "Synthetic demo success"},
                      "amount": "6.00", "currency": "INR"},
            )
            assert demo_success.status_code == 201, demo_success.text
            demo_success_payment = client.post(
                f"/api/v1/donations/{demo_success.json()['donation_id']}/simulated-payment",
                headers={"Guest-Access-Token": demo_success_token,
                         "Idempotency-Key": f"demo-success-payment-{run_id}-0001"},
                json={"outcome": "SUCCEEDED"},
            )
            assert demo_success_payment.status_code == 200, demo_success_payment.text
            demo_success_status = client.get(
                f"/api/v1/donations/{demo_success.json()['donation_id']}",
                headers={"Guest-Access-Token": demo_success_token},
            )
            assert demo_success_status.status_code == 200
            assert demo_success_status.json()["payment_status"] == "SUCCESSFUL"
            assert demo_success_status.json()["receipt_number"]
            progressed_detail = client.get(f"/api/v1/campaigns/{campaign_id}")
            assert progressed_detail.status_code == 200
            assert progressed_detail.json()["amount_raised"] == "6.00"

            demo_failure_token = secrets.token_urlsafe(32)
            demo_failure = client.post(
                "/api/v1/donations",
                headers={"Guest-Access-Token": demo_failure_token,
                         "Idempotency-Key": f"demo-failure-{run_id}-0001"},
                json={"campaign_id": campaign_id,
                      "donor": {"display_name": "Synthetic demo failure"},
                      "amount": "7.00", "currency": "INR"},
            )
            assert demo_failure.status_code == 201, demo_failure.text
            demo_failure_payment = client.post(
                f"/api/v1/donations/{demo_failure.json()['donation_id']}/simulated-payment",
                headers={"Guest-Access-Token": demo_failure_token,
                         "Idempotency-Key": f"demo-failure-payment-{run_id}-0001"},
                json={"outcome": "FAILED"},
            )
            assert demo_failure_payment.status_code == 200, demo_failure_payment.text
            demo_failure_status = client.get(
                f"/api/v1/donations/{demo_failure.json()['donation_id']}",
                headers={"Guest-Access-Token": demo_failure_token},
            )
            assert demo_failure_status.status_code == 200
            assert demo_failure_status.json()["payment_status"] == "PENDING"
            assert demo_failure_status.json()["receipt_number"] is None
            demo_failure_attempt_id = demo_failure_payment.json()["payment_attempts"][0]["payment_attempt_id"]
            disabled_reconciliation = post(
                client,
                f"/api/v1/donations/payment-attempts/{demo_failure_attempt_id}/reconciliation",
                subject="reconciler",
                json_body={"outcome": "SUCCEEDED"},
            )
            assert disabled_reconciliation.status_code == 503

            broad_workflow_request = client.patch(
                f"/api/v1/campaigns/{campaign_id}", headers=auth("ngo-a"),
                json={"campaign_name": "Demo must not change campaigns"},
            )
            assert broad_workflow_request.status_code == 503
            disabled_refund = client.post(
                f"/api/v1/donations/{demo_success.json()['donation_id']}/refunds",
                headers={**auth("refund-operator"),
                         "Idempotency-Key": f"demo-refund-disabled-{run_id}-0001"},
                json={"amount": "1.00", "currency": "INR", "reason": "Should remain gated"},
            )
            assert disabled_refund.status_code == 503
            disabled_payout = client.post(
                f"/api/v1/campaigns/{campaign_id}/disbursements",
                headers=auth("ngo-a"),
                json={"beneficiary_id": "1", "restriction_id": None, "amount": "1.00",
                      "currency": "INR", "approved_purpose": "Should remain gated",
                      "purpose_code": "GENERAL"},
            )
            assert disabled_payout.status_code == 503
            os.environ["CHARITY_WORKFLOWS_ENABLED"] = "true"
            get_settings.cache_clear()

            guest_token = secrets.token_urlsafe(32)
            guest_headers = {
                "Guest-Access-Token": guest_token,
                "Idempotency-Key": f"create-race-{run_id}-0001",
            }
            guest_body = {
                "campaign_id": campaign_id,
                "donor": {"display_name": "Synthetic acceptance guest"},
                "amount": "25.00",
                "currency": "INR",
            }

            def concurrent_guest_create():
                with TestClient(app) as concurrent_client:
                    guest_start.wait(timeout=10)
                    return concurrent_client.post(
                        "/api/v1/donations", json=guest_body, headers=guest_headers
                    )

            guest_start = threading.Barrier(2)
            with ThreadPoolExecutor(max_workers=2) as pool:
                create_results = list(pool.map(lambda _n: concurrent_guest_create(), range(2)))
            assert sorted(response.status_code for response in create_results) == [200, 201], [
                response.text for response in create_results
            ]
            donation_ids = {response.json()["donation_id"] for response in create_results}
            assert len(donation_ids) == 1
            donation_id = donation_ids.pop()
            assert create_results[0].json()["receipt_number"] is None
            conflict = client.post(
                "/api/v1/donations", headers=guest_headers,
                json={**guest_body, "amount": "26.00"},
            )
            assert conflict.status_code == 409
            hidden = client.get(f"/api/v1/donations/{donation_id}")
            assert hidden.status_code == 401
            wrong_guest = client.get(
                f"/api/v1/donations/{donation_id}",
                headers={"Guest-Access-Token": secrets.token_urlsafe(32)},
            )
            assert wrong_guest.status_code == 404

            payment_headers = {
                "Guest-Access-Token": guest_token,
                "Idempotency-Key": f"payment-timeout-{run_id}-0001",
            }
            timed_out = client.post(
                f"/api/v1/donations/{donation_id}/simulated-payment",
                headers=payment_headers, json={"outcome": "TIMEOUT"},
            )
            assert timed_out.status_code == 202, timed_out.text
            assert timed_out.json()["receipt_number"] is None
            timeout_replay = client.post(
                f"/api/v1/donations/{donation_id}/simulated-payment",
                headers=payment_headers, json={"outcome": "TIMEOUT"},
            )
            assert timeout_replay.status_code == 202
            assert timeout_replay.headers["Idempotency-Replayed"] == "true"
            timeout_conflict = client.post(
                f"/api/v1/donations/{donation_id}/simulated-payment",
                headers=payment_headers, json={"outcome": "SUCCEEDED"},
            )
            assert timeout_conflict.status_code == 409
            blocked_retry = client.post(
                f"/api/v1/donations/{donation_id}/simulated-payment",
                headers={**payment_headers, "Idempotency-Key": f"payment-new-{run_id}-0001"},
                json={"outcome": "SUCCEEDED"},
            )
            assert blocked_retry.status_code == 409
            attempt_id = timed_out.json()["payment_attempts"][0]["payment_attempt_id"]
            reconciled = post(
                client, f"/api/v1/donations/payment-attempts/{attempt_id}/reconciliation",
                subject="reconciler", json_body={"outcome": "SUCCEEDED"},
            )
            assert reconciled.status_code == 200, reconciled.text
            owned = client.get(
                f"/api/v1/donations/{donation_id}",
                headers={"Guest-Access-Token": guest_token},
            )
            assert owned.status_code == 200
            assert owned.json()["receipt_number"]
            assert owned.json()["transaction_reference"]

            refund = post(
                client, f"/api/v1/donations/{donation_id}/refunds",
                subject="refund-operator",
                headers={"Idempotency-Key": f"refund-{run_id}-0001"},
                json_body={"amount": "5.00", "currency": "INR", "reason": "Synthetic acceptance refund"},
            )
            assert refund.status_code == 200, refund.text
            refund_replay = post(
                client, f"/api/v1/donations/{donation_id}/refunds",
                subject="refund-operator",
                headers={"Idempotency-Key": f"refund-{run_id}-0001"},
                json_body={"amount": "5.00", "currency": "INR", "reason": "Synthetic acceptance refund"},
            )
            assert refund_replay.status_code == 200
            assert refund_replay.json()["resource_id"] == refund.json()["resource_id"]
            assert refund_replay.headers["Idempotency-Replayed"] == "true"

            registered = client.post(
                "/api/v1/donations",
                headers={**auth("registered-donor", name="Synthetic Registered Donor"),
                         "Idempotency-Key": f"registered-{run_id}-0001"},
                json={"campaign_id": campaign_id, "donor": None, "amount": "10.00", "currency": "INR"},
            )
            assert registered.status_code == 201, registered.text
            donor_history = client.get(
                "/api/v1/donations/history", headers=auth("registered-donor")
            )
            assert donor_history.status_code == 200, donor_history.text
            assert [item["donation_id"] for item in donor_history.json()["items"]] == [
                registered.json()["donation_id"]
            ]
            assert donor_history.json()["items"][0]["amount"] == "10.00"
            assert client.get("/api/v1/donations/history").status_code == 401

            retry_guest = secrets.token_urlsafe(32)
            retry_donation = client.post(
                "/api/v1/donations",
                headers={"Guest-Access-Token": retry_guest, "Idempotency-Key": f"retry-create-{run_id}-0001"},
                json={"campaign_id": campaign_id, "donor": {"display_name": "Synthetic retry guest"},
                      "amount": "5.00", "currency": "INR"},
            )
            assert retry_donation.status_code == 201, retry_donation.text
            failed_payment = client.post(
                f"/api/v1/donations/{retry_donation.json()['donation_id']}/simulated-payment",
                headers={"Guest-Access-Token": retry_guest, "Idempotency-Key": f"retry-fail-{run_id}-0001"},
                json={"outcome": "FAILED"},
            )
            assert failed_payment.status_code == 200, failed_payment.text
            assert failed_payment.json()["payment_attempts"][0]["status"] == "FAILED"
            assert failed_payment.json()["receipt_number"] is None
            successful_retry = client.post(
                f"/api/v1/donations/{retry_donation.json()['donation_id']}/simulated-payment",
                headers={"Guest-Access-Token": retry_guest, "Idempotency-Key": f"retry-succeed-{run_id}-0001"},
                json={"outcome": "SUCCEEDED"},
            )
            assert successful_retry.status_code == 200, successful_retry.text
            assert successful_retry.json()["receipt_number"]

            beneficiary = post(
                client, f"/api/v1/organizations/{org_a}/beneficiaries", subject="ngo-a",
                json_body={"beneficiary_name": f"Synthetic beneficiary {run_id}", "beneficiary_type": "GROUP"},
            )
            assert beneficiary.status_code == 201, beneficiary.text
            beneficiary_id = beneficiary.json()["resource_id"]
            beneficiary_list = client.get(
                f"/api/v1/organizations/{org_a}/beneficiaries", headers=auth("ngo-a")
            )
            assert beneficiary_list.status_code == 200, beneficiary_list.text
            assert beneficiary_id in {item["beneficiary_id"] for item in beneficiary_list.json()["items"]}
            assert "contact_details" not in beneficiary_list.json()["items"][0]
            cross_org_beneficiaries = client.get(
                f"/api/v1/organizations/{org_b}/beneficiaries", headers=auth("ngo-a")
            )
            assert cross_org_beneficiaries.status_code == 403
            verified = post(
                client, f"/api/v1/beneficiaries/{beneficiary_id}/verification", subject="verifier",
                json_body={"verification_status": "VERIFIED", "reason": "Synthetic identity review"},
            )
            assert verified.status_code == 200, verified.text

            other_beneficiary = post(
                client, f"/api/v1/organizations/{org_b}/beneficiaries", subject="ngo-b",
                json_body={"beneficiary_name": f"Other NGO beneficiary {run_id}", "beneficiary_type": "GROUP"},
            )
            assert other_beneficiary.status_code == 201, other_beneficiary.text
            cross_org_request = post(
                client, f"/api/v1/campaigns/{campaign_id}/disbursements", subject="ngo-a",
                json_body={
                    "beneficiary_id": other_beneficiary.json()["resource_id"],
                    "restriction_id": None, "amount": "1.00", "currency": "INR",
                    "approved_purpose": "Synthetic cross-org test", "purpose_code": "GENERAL",
                },
            )
            assert cross_org_request.status_code == 409

            unverified = post(
                client, f"/api/v1/organizations/{org_a}/beneficiaries", subject="ngo-a",
                json_body={"beneficiary_name": f"Unverified beneficiary {run_id}", "beneficiary_type": "GROUP"},
            )
            assert unverified.status_code == 201
            unverified_request = post(
                client, f"/api/v1/campaigns/{campaign_id}/disbursements", subject="ngo-a",
                json_body={"beneficiary_id": unverified.json()["resource_id"], "restriction_id": None,
                           "amount": "1.00", "currency": "INR", "approved_purpose": "Synthetic test",
                           "purpose_code": "GENERAL"},
            )
            assert unverified_request.status_code == 201
            unverified_approval = post(
                client, f"/api/v1/disbursements/{unverified_request.json()['resource_id']}/approval",
                subject="payout-approver", json_body={"decision": "APPROVED"},
            )
            assert unverified_approval.status_code == 200
            rejected_payment = post(
                client, f"/api/v1/disbursements/{unverified_request.json()['resource_id']}/payment",
                subject="payout-operator", headers={"Idempotency-Key": f"unverified-pay-{run_id}-0001"},
                json_body={"payment_reference": f"unverified-reference-{run_id}"},
            )
            assert rejected_payment.status_code == 409

            # Create and clear enough funds for a two-session payout race.
            funding_token = secrets.token_urlsafe(32)
            funding = client.post(
                "/api/v1/donations",
                headers={"Guest-Access-Token": funding_token, "Idempotency-Key": f"fund-{run_id}-0001"},
                json={"campaign_id": campaign_id, "donor": {"display_name": "Synthetic funder"},
                      "amount": "80.00", "currency": "INR"},
            )
            assert funding.status_code == 201, funding.text
            funded = client.post(
                f"/api/v1/donations/{funding.json()['donation_id']}/simulated-payment",
                headers={"Guest-Access-Token": funding_token, "Idempotency-Key": f"fund-pay-{run_id}-0001"},
                json={"outcome": "SUCCEEDED"},
            )
            assert funded.status_code == 200, funded.text

            def make_disbursement():
                return post(
                    client, f"/api/v1/campaigns/{campaign_id}/disbursements", subject="ngo-a",
                    json_body={"beneficiary_id": beneficiary_id, "restriction_id": None,
                               "amount": "70.00", "currency": "INR",
                               "approved_purpose": "Synthetic competing disbursement",
                               "purpose_code": "GENERAL"},
                )

            payout_ids = []
            for _ in range(2):
                requested = make_disbursement()
                assert requested.status_code == 201, requested.text
                payout_ids.append(requested.json()["resource_id"])
                # Requester is also provisioned as approver for the negative separation test.
                if len(payout_ids) == 1:
                    same_actor_approval = post(
                        client, f"/api/v1/disbursements/{payout_ids[0]}/approval", subject="ngo-a",
                        json_body={"decision": "APPROVED"},
                    )
                    assert same_actor_approval.status_code == 403
                approved_payout = post(
                    client, f"/api/v1/disbursements/{payout_ids[-1]}/approval", subject="payout-approver",
                    json_body={"decision": "APPROVED"},
                )
                assert approved_payout.status_code == 200, approved_payout.text

            def concurrent_pay(payout_id: str, n: int):
                with TestClient(app) as concurrent_client:
                    payout_start.wait(timeout=10)
                    return concurrent_client.post(
                        f"/api/v1/disbursements/{payout_id}/payment",
                        headers={**auth("payout-operator"), "Idempotency-Key": f"payout-race-{run_id}-{n:04d}"},
                        json={"payment_reference": f"synthetic-api-race-{run_id}-{n}"},
                    )

            payout_start = threading.Barrier(2)
            with ThreadPoolExecutor(max_workers=2) as pool:
                pay_results = list(pool.map(lambda item: concurrent_pay(*item), zip(payout_ids, (1, 2))))
            assert sorted(response.status_code for response in pay_results) == [200, 409]

            # F27: two real PostgreSQL sessions clear donations that each fit a
            # pledge individually but exceed it together. Session B starts only
            # after A has taken the pledge lock and waits behind A's transaction.
            with psycopg.connect(admin_dsn) as admin:
                donor_id = admin.execute(
                    "SELECT donor_id FROM donor WHERE actor_id=%s", (actor("registered-donor"),)
                ).fetchone()[0]
                pledge_id = admin.execute(
                    "INSERT INTO pledge(donor_id,campaign_id,pledged_amount) VALUES (%s,%s,60) RETURNING pledge_id",
                    (donor_id, int(campaign_id)),
                ).fetchone()[0]
                donation_a = admin.execute(
                    """INSERT INTO donation(donor_id,campaign_id,pledge_id,donation_amount,payment_method,
                           transaction_reference,receipt_number)
                       VALUES (%s,%s,%s,40,'ONLINE',%s,%s) RETURNING donation_id""",
                    (donor_id, int(campaign_id), pledge_id, f"pledge-a-{run_id}", f"receipt-a-{run_id}"),
                ).fetchone()[0]
                donation_b = admin.execute(
                    """INSERT INTO donation(donor_id,campaign_id,pledge_id,donation_amount,payment_method,
                           transaction_reference,receipt_number)
                       VALUES (%s,%s,%s,40,'ONLINE',%s,%s) RETURNING donation_id""",
                    (donor_id, int(campaign_id), pledge_id, f"pledge-b-{run_id}", f"receipt-b-{run_id}"),
                ).fetchone()[0]

            a_locked = threading.Event()
            b_started = threading.Event()
            b_finished = threading.Event()
            race_outcomes: dict[str, str] = {}
            b_pid: dict[str, int] = {}

            def clear_first():
                try:
                    with psycopg.connect(admin_dsn) as connection:
                        with connection.transaction():
                            connection.execute("SELECT set_config('app.actor_id',%s,TRUE)", (f"clear-a-{run_id}",))
                            connection.execute("SELECT clear_donation(%s)", (donation_a,))
                            a_locked.set()
                            connection.execute("SELECT pg_sleep(1.5)")
                    race_outcomes["A"] = "COMMITTED"
                except Exception as exc:  # preserve the observed failure for assertion output
                    race_outcomes["A"] = f"ERROR:{getattr(exc, 'sqlstate', None)}:{exc}"
                    a_locked.set()

            def clear_competing():
                try:
                    if not a_locked.wait(timeout=10):
                        race_outcomes["B"] = "ERROR:timeout waiting for A lock"
                        return
                    with psycopg.connect(admin_dsn) as connection:
                        with connection.transaction():
                            connection.execute("SELECT set_config('app.actor_id',%s,TRUE)", (f"clear-b-{run_id}",))
                            b_pid["pid"] = connection.execute("SELECT pg_backend_pid()").fetchone()[0]
                            b_started.set()
                            connection.execute("SELECT clear_donation(%s)", (donation_b,))
                    race_outcomes["B"] = "COMMITTED"
                except psycopg.Error as exc:
                    race_outcomes["B"] = f"SQLSTATE:{exc.sqlstate}"
                finally:
                    b_finished.set()

            first_thread = threading.Thread(target=clear_first)
            second_thread = threading.Thread(target=clear_competing)
            first_thread.start()
            second_thread.start()
            lock_wait_observed = False
            wait_deadline = time.monotonic() + 5
            while time.monotonic() < wait_deadline and not b_finished.is_set():
                if b_started.is_set() and "pid" in b_pid:
                    with psycopg.connect(admin_dsn) as observer:
                        wait_row = observer.execute(
                            "SELECT wait_event_type FROM pg_stat_activity WHERE pid=%s", (b_pid["pid"],)
                        ).fetchone()
                    if wait_row and wait_row[0] == "Lock":
                        lock_wait_observed = True
                time.sleep(0.05)
            first_thread.join(timeout=10)
            second_thread.join(timeout=10)
            assert not first_thread.is_alive() and not second_thread.is_alive()
            assert race_outcomes == {"A": "COMMITTED", "B": "SQLSTATE:P0001"}, race_outcomes
            assert lock_wait_observed
            with psycopg.connect(admin_dsn) as admin:
                pledge_state = admin.execute(
                    "SELECT pledge_status FROM pledge WHERE pledge_id=%s", (pledge_id,)
                ).fetchone()[0]
                donation_states = admin.execute(
                    "SELECT donation_id,payment_status FROM donation WHERE donation_id IN (%s,%s) ORDER BY donation_id",
                    (donation_a, donation_b),
                ).fetchall()
                clearing_rows = admin.execute(
                    "SELECT donation_id,amount_delta FROM fund_ledger_entry WHERE donation_id IN (%s,%s) AND entry_type='DONATION_CLEARING' ORDER BY donation_id",
                    (donation_a, donation_b),
                ).fetchall()
            assert pledge_state == "PARTIALLY_FULFILLED"
            assert donation_states == [(donation_a, "SUCCESSFUL"), (donation_b, "PENDING")]
            assert clearing_rows == [(donation_a, 40)]

        # Independently inspect persisted state with the administrator connection.
        with psycopg.connect(admin_dsn) as admin:
            donation_count = admin.execute(
                "SELECT COUNT(*) FROM donation d JOIN campaign c USING(campaign_id) WHERE c.campaign_id=%s",
                (int(campaign_id),),
            ).fetchone()[0]
            clearing_count = admin.execute(
                "SELECT COUNT(*) FROM fund_ledger_entry WHERE campaign_id=%s AND entry_type='DONATION_CLEARING'",
                (int(campaign_id),),
            ).fetchone()[0]
            payout_rows = admin.execute(
                "SELECT COUNT(*),COALESCE(SUM(disbursement_amount),0) FROM disbursement WHERE campaign_id=%s AND disbursement_status='PAID'",
                (int(campaign_id),),
            ).fetchone()
            payout_ledger = admin.execute(
                "SELECT COALESCE(SUM(amount_delta),0) FROM fund_ledger_entry WHERE campaign_id=%s AND entry_type='DISBURSEMENT'",
                (int(campaign_id),),
            ).fetchone()[0]
            # Includes the two linked F27 pledge donations and one successful
            # clearing from that race (the competing donation stays pending).
            assert donation_count == 8
            assert clearing_count == 5
            assert payout_rows == (1, 70)
            assert payout_ledger == -70
    finally:
        server.shutdown()
        server.server_close()
        get_settings.cache_clear()
        _jwks_client.cache_clear()
