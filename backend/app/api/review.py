from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.common import AUTHENTICATED_SECURITY, error_responses
from app.auth import Principal, optional_principal
from app.errors import ApiError
from app.organization_repository import list_review_queue
from app.schemas import ReviewCampaignOut, ReviewQueuePage


router = APIRouter(prefix="/api/v1/review", tags=["Campaign review"])


@router.get("/campaigns", response_model=ReviewQueuePage,
            responses=error_responses(401, 403, 422, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_campaign_review_queue(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    principal: Principal | None = Depends(optional_principal),
) -> ReviewQueuePage:
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    rows, has_more = list_review_queue(
        limit, offset, principal.actor_id, request.state.request_id
    )
    next_offset = offset + limit
    return ReviewQueuePage(
        items=[ReviewCampaignOut.model_validate(row) for row in rows],
        limit=limit,
        offset=offset,
        has_more=has_more,
        next_offset=next_offset if has_more and next_offset <= 1_000_000 else None,
    )
