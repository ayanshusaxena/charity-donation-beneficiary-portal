from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_irb_oversight_requires_authentication():
    response = client.get("/api/v1/review/all-campaigns")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_irb_closure_requests_requires_authentication():
    response = client.get("/api/v1/review/closure-requests")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_irb_suspend_requires_authentication():
    response = client.post(
        "/api/v1/review/campaigns/1/suspend",
        json={"reason": "Audit pending investigation"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_irb_reopen_requires_authentication():
    response = client.post(
        "/api/v1/review/campaigns/1/reopen",
        json={"reason": "Audit completed satisfactorily"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_irb_close_requires_authentication():
    response = client.post(
        "/api/v1/review/campaigns/1/close",
        json={"reason": "Campaign closed by reviewer"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_closure_request_submission_requires_authentication():
    response = client.post(
        "/api/v1/campaigns/1/closure-request",
        json={"reason": "Target accomplished early"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_org_closure_requests_requires_authentication():
    response = client.get("/api/v1/organizations/1/closure-requests")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
