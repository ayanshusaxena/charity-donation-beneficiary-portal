from fastapi.testclient import TestClient
from decimal import Decimal
import secrets

from app.api import management
from app.auth import Principal, optional_principal
from app.main import app
from app.schemas import ErrorEnvelope


def test_private_read_endpoints_require_a_verified_principal():
    app.dependency_overrides[optional_principal] = lambda: None
    try:
        client = TestClient(app)
        paths = (
            "/api/v1/me/organizations",
            "/api/v1/organizations/1/dashboard",
            "/api/v1/organizations/1/campaigns",
            "/api/v1/organizations/1/beneficiaries",
            "/api/v1/review/campaigns",
            "/api/v1/donations/history",
        )
        for path in paths:
            response = client.get(path)
            assert response.status_code == 401, (path, response.text)
            assert response.json()["error"]["code"] == "UNAUTHENTICATED"
    finally:
        app.dependency_overrides.clear()


def test_unauthenticated_management_write_fails_before_disabled_workflow_gate(monkeypatch):
    monkeypatch.setattr(
        management,
        "settings_allow_workflows",
        lambda: (_ for _ in ()).throw(AssertionError("workflow gate ran before authentication")),
    )
    response = TestClient(app).post(
        "/api/v1/organizations/1/campaigns",
        json={
            "campaign_name": "Synthetic draft",
            "purpose": "Synthetic purpose",
            "purpose_code": "GENERAL",
            "target_amount": "100.00",
            "currency": "INR",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_private_read_pagination_rejects_offset_above_limit():
    app.dependency_overrides[optional_principal] = lambda: None
    try:
        response = TestClient(app).get(
            "/api/v1/organizations/1/campaigns?offset=1000001"
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_registered_donation_history_route_returns_typed_money_and_receipt(monkeypatch):
    import app.api.donations as donations

    monkeypatch.setattr(
        donations,
        "list_registered_donation_history",
        lambda limit, offset, actor_id, request_id: ([{
            "donation_id": "7",
            "campaign_id": "9",
            "campaign_name": "Synthetic cause",
            "amount": "25.00",
            "currency": "INR",
            "payment_status": "SUCCESSFUL",
            "created_at": "2026-10-01T00:00:00Z",
            "transaction_reference": "SIM-REF-7",
            "receipt_number": "DK-7",
            "payment_attempts": [{
                "payment_attempt_id": "11",
                "status": "SUCCEEDED",
                "requested_outcome": "SUCCEEDED",
                "started_at": "2026-10-01T00:00:00Z",
                "completed_at": "2026-10-01T00:00:01Z",
            }],
        }], False),
    )
    app.dependency_overrides[optional_principal] = lambda: Principal(
        actor_id="https://issuer.invalid|donor", claims={}
    )
    try:
        response = TestClient(app).get("/api/v1/donations/history")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["items"][0]["amount"] == "25.00"
    assert response.json()["items"][0]["receipt_number"] == "DK-7"
    assert response.json()["items"][0]["payment_attempts"][0]["payment_attempt_id"] == "11"


def test_guest_capability_cannot_enumerate_donation_history():
    response = TestClient(app).get(
        "/api/v1/donations/history",
        headers={"Guest-Access-Token": secrets.token_urlsafe(32)},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_owned_donation_status_read_is_available_when_write_flags_are_off(monkeypatch):
    import app.api.donations as donations

    monkeypatch.setattr(
        donations,
        "get_donation_record",
        lambda donation_id, actor_id, guest_hash, request_id: {
            "donation_id": str(donation_id),
            "campaign_id": "9",
            "amount": Decimal("25.00"),
            "currency": "INR",
            "payment_status": "SUCCESSFUL",
            "created_at": "2026-10-01T00:00:00Z",
            "transaction_reference": "SIM-REF-7",
            "receipt_number": "DK-7",
            "payment_attempts": [],
        },
    )
    response = TestClient(app).get(
        "/api/v1/donations/7",
        headers={"Guest-Access-Token": secrets.token_urlsafe(32)},
    )

    assert response.status_code == 200
    assert response.json()["receipt_number"] == "DK-7"


def test_error_schema_enumerates_only_codes_emitted_by_backend():
    schema = ErrorEnvelope.model_json_schema()
    code_enum = schema["$defs"]["ErrorDetail"]["properties"]["code"]["enum"]
    assert set(code_enum) == {
        "VALIDATION_ERROR", "NOT_FOUND", "CAMPAIGN_UNAVAILABLE",
        "IDEMPOTENCY_KEY_REUSED", "CONFLICT", "WRITE_WORKFLOW_UNAVAILABLE",
        "SIMULATION_UNAVAILABLE", "AUTHENTICATION_UNAVAILABLE", "UNAUTHENTICATED",
        "INVALID_CREDENTIALS", "FORBIDDEN", "DATABASE_UNAVAILABLE", "INTERNAL_ERROR",
    }
