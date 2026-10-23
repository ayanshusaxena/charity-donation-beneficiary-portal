from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request

from app.api.common import AUTHENTICATED_SECURITY, error_responses
from app.auth import Principal, optional_principal
from app.errors import ApiError
from app.organization_repository import (
    get_organization_campaign,
    list_actor_organizations,
    list_organization_beneficiaries,
    list_organization_campaigns,
    organization_dashboard,
)
from app.schemas import (
    BeneficiaryOut,
    BeneficiaryPage,
    OrganizationCampaignOut,
    OrganizationCampaignPage,
    OrganizationDashboardOut,
    OrganizationListOut,
    StableId,
)


router = APIRouter(prefix="/api/v1", tags=["Organization reads"])


def _actor(principal: Principal | None) -> str:
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    return principal.actor_id


def _page(items, has_more: bool, limit: int, offset: int, page_type):
    next_offset = offset + limit
    return page_type(
        items=items,
        limit=limit,
        offset=offset,
        has_more=has_more,
        next_offset=next_offset if has_more and next_offset <= 1_000_000 else None,
    )


@router.get("/me/organizations", response_model=OrganizationListOut,
            responses=error_responses(401, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_my_organizations(
    request: Request, principal: Principal | None = Depends(optional_principal),
) -> OrganizationListOut:
    actor_id = _actor(principal)
    items = list_actor_organizations(actor_id, request.state.request_id)
    return OrganizationListOut(items=items)


@router.get("/organizations/{organization_id}/dashboard", response_model=OrganizationDashboardOut,
            responses=error_responses(401, 403, 404, 422, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_organization_dashboard(
    organization_id: Annotated[StableId, Path()], request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> OrganizationDashboardOut:
    row = organization_dashboard(int(organization_id), _actor(principal), request.state.request_id)
    if row is None:
        raise ApiError(404, "NOT_FOUND", "Organization dashboard not found")
    return OrganizationDashboardOut.model_validate(row)


@router.get("/organizations/{organization_id}/campaigns", response_model=OrganizationCampaignPage,
            responses=error_responses(401, 403, 422, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_organization_campaigns(
    organization_id: Annotated[StableId, Path()], request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    principal: Principal | None = Depends(optional_principal),
) -> OrganizationCampaignPage:
    rows, has_more = list_organization_campaigns(
        int(organization_id), limit, offset, _actor(principal), request.state.request_id
    )
    items = [OrganizationCampaignOut.model_validate(row) for row in rows]
    return _page(items, has_more, limit, offset, OrganizationCampaignPage)


@router.get("/organizations/{organization_id}/campaigns/{campaign_id}",
            response_model=OrganizationCampaignOut,
            responses=error_responses(401, 403, 404, 422, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_owned_campaign(
    organization_id: Annotated[StableId, Path()], campaign_id: Annotated[StableId, Path()],
    request: Request, principal: Principal | None = Depends(optional_principal),
) -> OrganizationCampaignOut:
    row = get_organization_campaign(
        int(organization_id), int(campaign_id), _actor(principal), request.state.request_id
    )
    if row is None:
        raise ApiError(404, "NOT_FOUND", "Campaign not found for this organization")
    return OrganizationCampaignOut.model_validate(row)


@router.get("/organizations/{organization_id}/beneficiaries", response_model=BeneficiaryPage,
            responses=error_responses(401, 403, 422, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_organization_beneficiaries(
    organization_id: Annotated[StableId, Path()], request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    principal: Principal | None = Depends(optional_principal),
) -> BeneficiaryPage:
    rows, has_more = list_organization_beneficiaries(
        int(organization_id), limit, offset, _actor(principal), request.state.request_id
    )
    return _page([BeneficiaryOut.model_validate(row) for row in rows],
                 has_more, limit, offset, BeneficiaryPage)
