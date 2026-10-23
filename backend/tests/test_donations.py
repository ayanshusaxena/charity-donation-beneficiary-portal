import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from app.api.donations import CreateDonationRequest
from app.main import app
from app.schemas import MONEY_PATTERN


def valid_create_request(amount: object) -> dict:
    return {
        "campaign_id": "7",
        "donor": {"display_name": "A. Donor"},
        "amount": amount,
        "currency": "INR",
    }


def test_donation_amount_requires_decimal_string():
    parsed = CreateDonationRequest.model_validate(valid_create_request("25.40"))
    assert str(parsed.amount) == "25.40"

    with pytest.raises(ValidationError):
        CreateDonationRequest.model_validate(valid_create_request(25.40))

    with pytest.raises(ValidationError):
        CreateDonationRequest.model_validate(valid_create_request("0.00"))


def test_donation_request_json_schema_documents_positive_decimal_string():
    amount_schema = CreateDonationRequest.model_json_schema(mode="validation")["properties"]["amount"]

    assert amount_schema["type"] == "string"
    assert amount_schema["pattern"] == MONEY_PATTERN


def test_donation_create_fails_closed_until_idempotency_persistence_exists():
    response = TestClient(app).post(
        "/api/v1/donations",
        headers={"Idempotency-Key": "creation-key-000001"},
        json=valid_create_request("25.40"),
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "WRITE_WORKFLOW_UNAVAILABLE"
