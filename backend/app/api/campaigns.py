from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.campaign_repository import CampaignReader, PostgresCampaignReader, require_campaign
from app.api.common import error_responses
from app.schemas import CampaignOut, CampaignPage, StableId

router = APIRouter(prefix="/api/v1/campaigns", tags=["Campaigns"])
PurposeCode = Literal["GENERAL", "FOOD", "EDUCATION", "HEALTH", "SHELTER"]
CampaignSort = Literal["date", "target_asc", "target_desc"]


def get_campaign_reader() -> CampaignReader:
    return PostgresCampaignReader()


@router.get("", response_model=CampaignPage, responses=error_responses(422, 500, 503))
def list_campaigns(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    purpose_code: PurposeCode | None = None,
    search: str | None = None,
    sort: CampaignSort = "date",
    reader: CampaignReader = Depends(get_campaign_reader),
) -> CampaignPage:
    items, has_more = reader.list_eligible(
        limit, offset, purpose_code=purpose_code, search=search, sort=sort
    )
    next_offset = offset + limit
    return CampaignPage(
        items=[CampaignOut.model_validate(item) for item in items],
        limit=limit,
        offset=offset,
        has_more=has_more,
        next_offset=next_offset if has_more and next_offset <= 1_000_000 else None,
    )


@router.get("/{campaign_id}", response_model=CampaignOut, responses=error_responses(404, 422, 500, 503))
def get_campaign(
    campaign_id: StableId,
    reader: CampaignReader = Depends(get_campaign_reader),
) -> CampaignOut:
    row = require_campaign(reader.get_eligible(int(campaign_id)))
    return CampaignOut.model_validate(row)
