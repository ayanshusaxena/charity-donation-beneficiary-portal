from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request

from app.api.common import AUTHENTICATED_SECURITY, error_responses
from app.auth import Principal, optional_principal, settings_allow_workflows
from app.errors import ApiError
from app.organization_repository import list_organization_review_queue, list_review_queue
from app.schemas import (
    ClosureDecisionInput,
    ClosureRequestOut,
    ClosureRequestPage,
    IrbCampaignOversightItem,
    IrbCampaignOversightPage,
    OrganizationReviewInput,
    OrganizationReviewItemOut,
    OrganizationReviewQueuePage,
    ReasonInput,
    ReviewCampaignOut,
    ReviewQueuePage,
    StableId,
    WorkflowResult,
)
from app.workflow_repository import (
    close_campaign as _close_camp,
    list_closure_requests,
    list_irb_campaign_oversight,
    reopen_campaign as _reopen_camp,
    review_campaign_closure_request as _review_closure,
    review_organization as _review_org,
    suspend_campaign as _suspend_camp,
)


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


@router.get("/organizations", response_model=OrganizationReviewQueuePage,
            responses=error_responses(401, 403, 422, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_organization_review_queue(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    principal: Principal | None = Depends(optional_principal),
) -> OrganizationReviewQueuePage:
    """List organizations pending verification. Requires CAMPAIGN_REVIEWER role."""
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    rows, has_more = list_organization_review_queue(
        limit, offset, principal.actor_id, request.state.request_id
    )
    next_offset = offset + limit
    return OrganizationReviewQueuePage(
        items=[OrganizationReviewItemOut.model_validate(row) for row in rows],
        limit=limit,
        offset=offset,
        has_more=has_more,
        next_offset=next_offset if has_more and next_offset <= 1_000_000 else None,
    )


@router.post("/organizations/{organization_id}", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def review_organization_endpoint(
    organization_id: Annotated[StableId, Path()],
    body: OrganizationReviewInput,
    request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    """Approve or reject an organization application. Requires CAMPAIGN_REVIEWER role."""
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    settings_allow_workflows()
    _review_org(
        int(organization_id), body.decision, body.reason or "",
        principal.actor_id, request.state.request_id,
    )
    return WorkflowResult(resource_id=organization_id, status=body.decision)


@router.get("/all-campaigns", response_model=IrbCampaignOversightPage,
            responses=error_responses(401, 403, 422, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_all_campaigns_oversight(
    request: Request,
    status: str | None = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    principal: Principal | None = Depends(optional_principal),
) -> IrbCampaignOversightPage:
    """View all campaigns across lifecycle states. Requires CAMPAIGN_REVIEWER role."""
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    rows, has_more = list_irb_campaign_oversight(
        status, search, limit, offset, principal.actor_id, request.state.request_id
    )
    next_offset = offset + limit
    return IrbCampaignOversightPage(
        items=[IrbCampaignOversightItem.model_validate(row) for row in rows],
        limit=limit,
        offset=offset,
        has_more=has_more,
        next_offset=next_offset if has_more and next_offset <= 1_000_000 else None,
    )


@router.get("/closure-requests", response_model=ClosureRequestPage,
            responses=error_responses(401, 403, 422, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_closure_requests_queue(
    request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> ClosureRequestPage:
    """List pending organization closure requests. Requires CAMPAIGN_REVIEWER role."""
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    rows = list_closure_requests(None, principal.actor_id, request.state.request_id)
    return ClosureRequestPage(
        items=[ClosureRequestOut.model_validate(row) for row in rows]
    )


@router.post("/closure-requests/{request_id}/decision", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def review_closure_request_endpoint(
    request_id: Annotated[StableId, Path()],
    body: ClosureDecisionInput,
    request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    """Approve or reject a campaign closure request. Requires CAMPAIGN_REVIEWER role."""
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    settings_allow_workflows()
    _review_closure(
        int(request_id), body.decision, body.reason,
        principal.actor_id, request.state.request_id
    )
    return WorkflowResult(resource_id=request_id, status=body.decision)


@router.post("/campaigns/{campaign_id}/suspend", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def suspend_campaign_endpoint(
    campaign_id: Annotated[StableId, Path()],
    body: ReasonInput,
    request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    """Temporarily suspend an active campaign. Requires CAMPAIGN_REVIEWER role."""
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    settings_allow_workflows()
    _suspend_camp(
        int(campaign_id), body.reason,
        principal.actor_id, request.state.request_id
    )
    return WorkflowResult(resource_id=campaign_id, status="SUSPENDED")


@router.post("/campaigns/{campaign_id}/reopen", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def reopen_campaign_endpoint(
    campaign_id: Annotated[StableId, Path()],
    body: ReasonInput,
    request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    """Reopen a suspended campaign within its date window. Requires CAMPAIGN_REVIEWER role."""
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    settings_allow_workflows()
    _reopen_camp(
        int(campaign_id), body.reason,
        principal.actor_id, request.state.request_id
    )
    return WorkflowResult(resource_id=campaign_id, status="ACTIVE")


@router.post("/campaigns/{campaign_id}/close", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def close_campaign_endpoint(
    campaign_id: Annotated[StableId, Path()],
    body: ReasonInput,
    request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    """Permanently close a campaign. Requires CAMPAIGN_REVIEWER role."""
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    settings_allow_workflows()
    _close_camp(
        int(campaign_id), body.reason,
        principal.actor_id, request.state.request_id
    )
    return WorkflowResult(resource_id=campaign_id, status="CLOSED")
