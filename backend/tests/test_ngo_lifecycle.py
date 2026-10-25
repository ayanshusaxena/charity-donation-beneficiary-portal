from datetime import datetime, timezone
from fastapi.testclient import TestClient
import pytest

from app.auth import Principal, optional_principal
from app.errors import DatabaseRuleError
from app.main import app
import app.api.organizations as organizations_api
import app.api.review as review_api
import app.api.management as management_api


@pytest.fixture
def client():
    return TestClient(app)


def test_register_organization_endpoint_success(monkeypatch, client):
    monkeypatch.setattr(organizations_api, "settings_allow_workflows", lambda: None)
    monkeypatch.setattr(
        organizations_api,
        "_register_org",
        lambda name, reg, email, phone, req_id: ("42", "dk_app_secret1234567890abcdef1234567890"),
    )

    response = client.post(
        "/api/v1/organizations/register",
        json={
            "organization_name": "Bal Vikas Trust",
            "registration_ref": "REG-TEST-101",
            "email": "bal@example.com",
            "phone": "+919876543210",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["organization_id"] == "42"
    assert data["organization_name"] == "Bal Vikas Trust"
    assert data["verification_status"] == "PENDING"
    assert data["applicant_access_token"] == "dk_app_secret1234567890abcdef1234567890"


def test_register_organization_validation_error(client):
    # Missing required registration_ref
    response = client.post(
        "/api/v1/organizations/register",
        json={
            "organization_name": "Bal Vikas Trust",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_campaign_draft_incomplete_creation_success(monkeypatch, client):
    monkeypatch.setattr(management_api, "settings_allow_workflows", lambda: None)
    monkeypatch.setattr(
        management_api,
        "create_campaign",
        lambda org_id, body, actor_id, req_id: "88",
    )

    app.dependency_overrides[optional_principal] = lambda: Principal(
        actor_id="applicant:abc123hash",
        claims={"role": "applicant"},
    )
    try:
        # Only campaign_name is required for incomplete drafts
        response = client.post(
            "/api/v1/organizations/42/campaigns",
            json={"campaign_name": "Incomplete Initial Title Only"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["resource_id"] == "88"
        assert data["status"] == "DRAFT"
    finally:
        app.dependency_overrides.clear()


def test_campaign_submission_fails_when_organization_not_verified(monkeypatch, client):
    monkeypatch.setattr(management_api, "settings_allow_workflows", lambda: None)

    def mock_submit(action, campaign_id, actor_id, req_id):
        raise DatabaseRuleError("P1004", "ORGANIZATION_NOT_VERIFIED")

    monkeypatch.setattr(management_api, "campaign_workflow", mock_submit)

    app.dependency_overrides[optional_principal] = lambda: Principal(
        actor_id="applicant:abc123hash",
        claims={"role": "applicant"},
    )
    try:
        response = client.post("/api/v1/campaigns/88/submission")
        assert response.status_code == 403
        data = response.json()
        assert data["error"]["code"] == "ORGANIZATION_NOT_VERIFIED"
    finally:
        app.dependency_overrides.clear()


def test_campaign_submission_fails_when_draft_incomplete(monkeypatch, client):
    monkeypatch.setattr(management_api, "settings_allow_workflows", lambda: None)

    def mock_submit(action, campaign_id, actor_id, req_id):
        raise DatabaseRuleError("P1005", "INCOMPLETE_CAMPAIGN_DRAFT")

    monkeypatch.setattr(management_api, "campaign_workflow", mock_submit)

    app.dependency_overrides[optional_principal] = lambda: Principal(
        actor_id="applicant:abc123hash",
        claims={"role": "applicant"},
    )
    try:
        response = client.post("/api/v1/campaigns/88/submission")
        assert response.status_code == 422
        data = response.json()
        assert data["error"]["code"] == "INCOMPLETE_CAMPAIGN_DRAFT"
    finally:
        app.dependency_overrides.clear()


def test_organization_review_queue_requires_auth(client):
    app.dependency_overrides[optional_principal] = lambda: None
    try:
        response = client.get("/api/v1/review/organizations")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHENTICATED"
    finally:
        app.dependency_overrides.clear()


def test_organization_review_queue_returns_items(monkeypatch, client):
    monkeypatch.setattr(
        review_api,
        "list_organization_review_queue",
        lambda limit, offset, actor_id, req_id: ([
            {
                "organization_id": "42",
                "organization_name": "Bal Vikas Trust",
                "registration_ref": "REG-TEST-101",
                "email": "bal@example.com",
                "phone": "+919876543210",
                "verification_status": "PENDING",
                "review_reason": None,
                "created_at": datetime(2026, 10, 24, 0, 0, 0, tzinfo=timezone.utc),
            }
        ], False),
    )

    app.dependency_overrides[optional_principal] = lambda: Principal(
        actor_id="mock:irb-faculty-reviewer",
        claims={"role": "mock"},
    )
    try:
        response = client.get("/api/v1/review/organizations")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["organization_name"] == "Bal Vikas Trust"
        assert data["items"][0]["verification_status"] == "PENDING"
    finally:
        app.dependency_overrides.clear()


def test_organization_review_decision_endpoint(monkeypatch, client):
    monkeypatch.setattr(review_api, "settings_allow_workflows", lambda: None)
    monkeypatch.setattr(
        review_api,
        "_review_org",
        lambda org_id, decision, reason, actor_id, req_id: None,
    )

    app.dependency_overrides[optional_principal] = lambda: Principal(
        actor_id="mock:irb-faculty-reviewer",
        claims={"role": "mock"},
    )
    try:
        response = client.post(
            "/api/v1/review/organizations/42",
            json={
                "decision": "VERIFIED",
                "reason": "Darpan verification record confirmed.",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["resource_id"] == "42"
        assert data["status"] == "VERIFIED"
    finally:
        app.dependency_overrides.clear()
