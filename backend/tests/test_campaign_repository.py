from app.campaign_repository import PostgresCampaignReader, SORT_ORDERS


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, rows):
        self.rows = rows
        self.query = None
        self.params = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, query, params):
        self.query = query
        self.params = params
        return FakeCursor(self.rows)


def run_reader(monkeypatch, rows, **kwargs):
    import app.campaign_repository as repository

    connection = FakeConnection(rows)
    monkeypatch.setattr(repository, "readonly_connection", lambda: connection)
    page, has_more = PostgresCampaignReader().list_eligible(2, 0, **kwargs)
    return connection, page, has_more


def test_blank_and_whitespace_only_search_do_not_add_search_filter(monkeypatch):
    for search in ("", "   \t "):
        connection, _, _ = run_reader(monkeypatch, [], search=search)
        assert "ILIKE" not in connection.query
        assert connection.params == [3, 0]


def test_search_is_case_insensitive_literal_and_checks_all_searchable_fields(monkeypatch):
    connection, _, _ = run_reader(
        monkeypatch, [], search="  100%_! Ready  ", purpose_code="FOOD"
    )

    assert connection.query.count("ILIKE %s ESCAPE '!'") == 3
    assert "campaign_name ILIKE" in connection.query
    assert "organization_name ILIKE" in connection.query
    assert "purpose ILIKE" in connection.query
    assert connection.params == ["FOOD", "%100!%!_!! Ready%", "%100!%!_!! Ready%", "%100!%!_!! Ready%", 3, 0]


def test_filters_precede_sort_and_pagination_and_values_are_bound(monkeypatch):
    connection, _, _ = run_reader(
        monkeypatch,
        [],
        purpose_code="EDUCATION",
        search="kits",
        sort="date",
    )

    assert connection.query.index("purpose_code = %s") < connection.query.index("ORDER BY")
    assert connection.query.index("campaign_name ILIKE") < connection.query.index("ORDER BY")
    assert connection.query.index("ORDER BY") < connection.query.index("LIMIT %s OFFSET %s")
    assert "EDUCATION" not in connection.query
    assert "kits" not in connection.query
    assert connection.params == ["EDUCATION", "%kits%", "%kits%", "%kits%", 3, 0]


def test_all_sort_modes_have_stable_campaign_id_tie_breaker(monkeypatch):
    for sort, order in SORT_ORDERS.items():
        connection, _, _ = run_reader(monkeypatch, [], sort=sort)
        assert order in connection.query
        assert order.endswith("campaign_id ASC")

    assert SORT_ORDERS == {
        "date": "end_date ASC, campaign_id ASC",
        "target_asc": "target_amount ASC, campaign_id ASC",
        "target_desc": "target_amount DESC, campaign_id ASC",
    }


def test_filters_apply_before_page_and_limit_uses_lookahead_row(monkeypatch):
    rows = [{"campaign_id": str(value)} for value in range(1, 4)]
    connection, page, has_more = run_reader(
        monkeypatch, rows, purpose_code="HEALTH", search="aid"
    )

    assert "WHERE" in connection.query
    assert connection.query.index("WHERE") < connection.query.index("ORDER BY")
    assert connection.query.index("ORDER BY") < connection.query.index("LIMIT")
    assert [row["campaign_id"] for row in page] == ["1", "2"]
    assert has_more is True


def test_unsupported_sort_never_becomes_sql(monkeypatch):
    import pytest

    import app.campaign_repository as repository

    def unexpected_connection():
        pytest.fail("No database connection should be opened for an invalid sort")

    monkeypatch.setattr(repository, "readonly_connection", unexpected_connection)
    with pytest.raises(ValueError, match="Unsupported campaign sort"):
        PostgresCampaignReader().list_eligible(2, 0, sort="date; DROP TABLE campaign")
