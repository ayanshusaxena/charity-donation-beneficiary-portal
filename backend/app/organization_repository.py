from typing import Any

from app.database import actor_read_connection


def _map_ids(row: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    result = dict(row)
    for key in keys:
        if result.get(key) is not None:
            result[key] = str(result[key])
    return result


def _page(function_sql: str, params: tuple[Any, ...], actor_id: str, request_id: str,
          id_keys: tuple[str, ...]) -> tuple[list[dict[str, Any]], bool]:
    with actor_read_connection(actor_id, request_id) as connection:
        rows = connection.execute(function_sql, params).fetchall()
    limit = params[-2] if len(params) == 3 else params[0]
    page_rows = rows[:limit]
    return [_map_ids(row, id_keys) for row in page_rows], len(rows) > limit


def list_actor_organizations(actor_id: str, request_id: str) -> list[dict[str, Any]]:
    with actor_read_connection(actor_id, request_id) as connection:
        rows = connection.execute("SELECT * FROM get_actor_organizations()").fetchall()
    return [_map_ids({**row, "roles": list(row["roles"])}, ("organization_id",)) for row in rows]


def organization_dashboard(organization_id: int, actor_id: str, request_id: str) -> dict[str, Any] | None:
    with actor_read_connection(actor_id, request_id) as connection:
        return connection.execute(
            "SELECT * FROM get_organization_dashboard(%s)", (organization_id,)
        ).fetchone()


def list_organization_campaigns(
    organization_id: int, limit: int, offset: int, actor_id: str, request_id: str,
) -> tuple[list[dict[str, Any]], bool]:
    return _page(
        "SELECT * FROM get_organization_campaigns(%s,%s,%s)",
        (organization_id, limit, offset), actor_id, request_id, ("campaign_id",),
    )


def get_organization_campaign(
    organization_id: int, campaign_id: int, actor_id: str, request_id: str,
) -> dict[str, Any] | None:
    with actor_read_connection(actor_id, request_id) as connection:
        row = connection.execute(
            "SELECT * FROM get_organization_campaign(%s,%s)",
            (organization_id, campaign_id),
        ).fetchone()
    return _map_ids(row, ("campaign_id",)) if row is not None else None


def list_review_queue(
    limit: int, offset: int, actor_id: str, request_id: str,
) -> tuple[list[dict[str, Any]], bool]:
    return _page(
        "SELECT * FROM get_campaign_review_queue(%s,%s)", (limit, offset),
        actor_id, request_id, ("campaign_id", "organization_id"),
    )


def list_organization_beneficiaries(
    organization_id: int, limit: int, offset: int, actor_id: str, request_id: str,
) -> tuple[list[dict[str, Any]], bool]:
    return _page(
        "SELECT * FROM get_organization_beneficiaries(%s,%s,%s)",
        (organization_id, limit, offset), actor_id, request_id, ("beneficiary_id",),
    )


def list_registered_donation_history(
    limit: int, offset: int, actor_id: str, request_id: str,
) -> tuple[list[dict[str, Any]], bool]:
    rows, has_more = _page(
        "SELECT * FROM get_registered_donation_history(%s,%s)", (limit, offset),
        actor_id, request_id, ("donation_id", "campaign_id"),
    )
    for row in rows:
        for attempt in row["payment_attempts"] or []:
            attempt["payment_attempt_id"] = str(attempt["payment_attempt_id"])
    return rows, has_more
