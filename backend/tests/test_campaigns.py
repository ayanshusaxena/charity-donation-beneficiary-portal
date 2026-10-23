from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.api.campaigns import get_campaign_reader
from app.main import app
from app.schemas import CampaignOut, CampaignPage, MONEY_PATTERN, STABLE_ID_PATTERN


class FakeCampaignReader:
    def __init__(self, rows: list[dict], has_more: bool = False):
        self.rows = rows
        self.has_more = has_more
        self.requested_id: int | None = None
        self.list_arguments: tuple | None = None

    def list_eligible(
        self,
        limit: int,
        offset: int,
        purpose_code: str | None = None,
        search: str | None = None,
        sort: str = "date",
    ):
        assert limit > 0 and offset >= 0
        self.list_arguments = (limit, offset, purpose_code, search, sort)
        return self.rows, self.has_more

    def get_eligible(self, campaign_id: int):
        self.requested_id = campaign_id
        return next((row for row in self.rows if int(row["campaign_id"]) == campaign_id), None)


def campaign_row(campaign_id: str = "23") -> dict:
    return {
        "campaign_id": campaign_id,
        "organization_name": "Sample Organization",
        "campaign_name": "Learning Kits",
        "purpose": "School learning materials",
        "purpose_code": "EDUCATION",
        "target_amount": Decimal("12000.00"),
        "amount_raised": Decimal("0.00"),
        "currency": "INR",
        "start_date": date(2026, 1, 1),
        "end_date": date(2026, 12, 31),
        "eligibility": "ACCEPTING_DONATIONS",
    }


def test_campaign_list_paginates_and_serializes_money_as_string():
    reader = FakeCampaignReader([campaign_row()], has_more=True)
    app.dependency_overrides[get_campaign_reader] = lambda: reader
    try:
        response = TestClient(app).get("/api/v1/campaigns?limit=1&offset=4")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["next_offset"] == 5
    assert response.json()["items"][0]["target_amount"] == "12000.00"
    assert response.json()["items"][0]["campaign_id"] == "23"


def test_campaign_list_defaults_and_response_envelope():
    reader = FakeCampaignReader([campaign_row()])
    app.dependency_overrides[get_campaign_reader] = lambda: reader
    try:
        response = TestClient(app).get("/api/v1/campaigns")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert reader.list_arguments == (20, 0, None, None, "date")
    assert set(response.json()) == {"items", "limit", "offset", "has_more", "next_offset"}
    assert "total_count" not in response.json()


def test_campaign_list_accepts_filters_and_sort():
    reader = FakeCampaignReader([campaign_row()])
    app.dependency_overrides[get_campaign_reader] = lambda: reader
    try:
        response = TestClient(app).get(
            "/api/v1/campaigns?purpose_code=EDUCATION&search=%20School%20&sort=target_desc"
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert reader.list_arguments == (20, 0, "EDUCATION", " School ", "target_desc")


def test_campaign_list_accepts_each_schema_purpose_code():
    for code in ("GENERAL", "FOOD", "EDUCATION", "HEALTH", "SHELTER"):
        reader = FakeCampaignReader([campaign_row()])

        def override_reader():
            return reader

        app.dependency_overrides[get_campaign_reader] = override_reader
        try:
            response = TestClient(app).get(f"/api/v1/campaigns?purpose_code={code}")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert reader.list_arguments[2] == code


def test_campaign_list_rejects_invalid_purpose_and_sort():
    for query in ("purpose_code=EDU", "sort=unknown"):
        app.dependency_overrides[get_campaign_reader] = lambda: FakeCampaignReader([])
        try:
            response = TestClient(app).get(f"/api/v1/campaigns?{query}")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_campaign_detail_uses_not_found_for_unavailable_campaign():
    app.dependency_overrides[get_campaign_reader] = lambda: FakeCampaignReader([])
    try:
        response = TestClient(app).get("/api/v1/campaigns/23")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_campaign_id_rejects_zero():
    app.dependency_overrides[get_campaign_reader] = lambda: FakeCampaignReader([])
    try:
        response = TestClient(app).get("/api/v1/campaigns/0")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_campaign_id_rejects_value_above_postgres_bigint():
    app.dependency_overrides[get_campaign_reader] = lambda: FakeCampaignReader([])
    try:
        response = TestClient(app).get("/api/v1/campaigns/9223372036854775808")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_campaign_list_rejects_offset_above_maximum():
    app.dependency_overrides[get_campaign_reader] = lambda: FakeCampaignReader([])
    try:
        response = TestClient(app).get("/api/v1/campaigns?offset=1000001")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_campaign_list_accepts_maximum_offset():
    app.dependency_overrides[get_campaign_reader] = lambda: FakeCampaignReader([], has_more=True)
    try:
        response = TestClient(app).get("/api/v1/campaigns?offset=1000000")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["offset"] == 1_000_000
    assert response.json()["has_more"] is True
    assert response.json()["next_offset"] is None


def test_campaign_list_accepts_zero_offset_boundary():
    reader = FakeCampaignReader([])
    app.dependency_overrides[get_campaign_reader] = lambda: reader
    try:
        response = TestClient(app).get("/api/v1/campaigns?offset=0")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert reader.list_arguments[1] == 0


def test_campaign_response_json_schema_matches_money_id_currency_and_offset_contract():
    campaign_schema = CampaignOut.model_json_schema(mode="serialization")["properties"]
    page_schema = CampaignPage.model_json_schema(mode="serialization")["properties"]

    assert campaign_schema["target_amount"]["type"] == "string"
    assert campaign_schema["target_amount"]["pattern"] == MONEY_PATTERN
    assert campaign_schema["amount_raised"]["type"] == "string"
    assert campaign_schema["amount_raised"]["pattern"] == r"^(?:0|[1-9][0-9]*)(?:\.[0-9]{2})$"
    assert campaign_schema["campaign_id"]["pattern"] == STABLE_ID_PATTERN
    assert campaign_schema["campaign_id"]["maxLength"] == 19
    assert campaign_schema["currency"]["const"] == "INR"
    assert page_schema["offset"]["maximum"] == 1_000_000
    next_offset_integer = next(
        schema for schema in page_schema["next_offset"]["anyOf"] if schema["type"] == "integer"
    )
    assert next_offset_integer["maximum"] == 1_000_000


def test_unexpected_campaign_reader_error_uses_contract_error_shape():
    class BrokenReader(FakeCampaignReader):
        def list_eligible(self, limit: int, offset: int, purpose_code=None, search=None, sort="date"):
            raise RuntimeError("private diagnostic")

    app.dependency_overrides[get_campaign_reader] = lambda: BrokenReader([])
    try:
        response = TestClient(app, raise_server_exceptions=False).get("/api/v1/campaigns")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "An unexpected server error occurred"}
    }
