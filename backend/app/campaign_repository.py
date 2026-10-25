from typing import Any, Protocol

from app.database import readonly_connection
from app.errors import ApiError


SORT_ORDERS = {
    "date": "end_date ASC, campaign_id ASC",
    "target_asc": "target_amount ASC, campaign_id ASC",
    "target_desc": "target_amount DESC, campaign_id ASC",
}

CAMPAIGN_SELECT = """SELECT campaign_id::text AS campaign_id,
       organization_name, campaign_name, purpose, purpose_code,
       target_amount, amount_raised, currency::text AS currency,
       start_date, end_date, eligibility
FROM public_campaign_discovery
WHERE TRUE"""


class CampaignReader(Protocol):
    def list_eligible(
        self,
        limit: int,
        offset: int,
        purpose_code: str | None = None,
        search: str | None = None,
        sort: str = "date",
    ) -> tuple[list[dict[str, Any]], bool]: ...

    def get_eligible(self, campaign_id: int) -> dict[str, Any] | None: ...


class PostgresCampaignReader:
    def list_eligible(
        self,
        limit: int,
        offset: int,
        purpose_code: str | None = None,
        search: str | None = None,
        sort: str = "date",
    ) -> tuple[list[dict[str, Any]], bool]:
        if sort not in SORT_ORDERS:
            raise ValueError("Unsupported campaign sort")

        query = CAMPAIGN_SELECT
        params: list[Any] = []
        if purpose_code is not None:
            query += " AND purpose_code = %s"
            params.append(purpose_code)

        normalized_search = search.strip() if search is not None else ""
        if normalized_search:
            escaped_search = (
                normalized_search.replace("!", "!!").replace("%", "!%").replace("_", "!_")
            )
            query += (
                " AND (campaign_name ILIKE %s ESCAPE '!' "
                "OR organization_name ILIKE %s ESCAPE '!' "
                "OR purpose ILIKE %s ESCAPE '!')"
            )
            search_pattern = f"%{escaped_search}%"
            params.extend([search_pattern] * 3)

        query += f" ORDER BY {SORT_ORDERS[sort]} LIMIT %s OFFSET %s"
        params.extend([limit + 1, offset])

        with readonly_connection() as connection:
            rows = connection.execute(query, params).fetchall()
        has_more = len(rows) > limit
        return rows[:limit], has_more

    def get_eligible(self, campaign_id: int) -> dict[str, Any] | None:
        with readonly_connection() as connection:
            row = connection.execute(
                CAMPAIGN_SELECT + " AND campaign_id = %s",
                (campaign_id,),
            ).fetchone()
        return row


def require_campaign(row: dict[str, Any] | None) -> dict[str, Any]:
    if row is None:
        raise ApiError(404, "NOT_FOUND", "Campaign not found or not accepting donations")
    return row
