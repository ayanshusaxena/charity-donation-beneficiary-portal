from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Request, Response

from app.api.common import AUTHENTICATED_SECURITY, error_responses
from app.auth import Principal, optional_principal, settings_allow_workflows
from app.errors import ApiError
from app.schemas import (
    BeneficiaryInput,
    BeneficiaryVerificationInput,
    CampaignDraftInput,
    CampaignDraftUpdate,
    CampaignReviewInput,
    DisbursementDecisionInput,
    DisbursementPaymentInput,
    DisbursementRequestInput,
    ReasonInput,
    StableId,
    WorkflowResult,
)
from app.workflow_repository import (
    approve_disbursement,
    campaign_workflow,
    create_beneficiary,
    create_campaign,
    pay_disbursement,
    request_campaign_closure,
    request_disbursement,
    review_campaign,
    update_campaign,
    verify_beneficiary,
)


router = APIRouter(prefix="/api/v1", tags=["Organization and finance workflows"])
IdempotencyHeader = Annotated[str, Header(alias="Idempotency-Key", min_length=16, max_length=200)]


def _actor(principal: Principal | None) -> str:
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    return principal.actor_id


@router.post("/organizations/{organization_id}/campaigns", response_model=WorkflowResult, status_code=201,
             responses=error_responses(401, 403, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def create_campaign_endpoint(
    organization_id: Annotated[StableId, Path()], body: CampaignDraftInput,
    request: Request, principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    campaign_id = create_campaign(int(organization_id), body, actor_id, request.state.request_id)
    return WorkflowResult(resource_id=campaign_id, status="DRAFT")


@router.patch("/campaigns/{campaign_id}", response_model=WorkflowResult,
              responses=error_responses(401, 403, 404, 409, 422, 500, 503),
              openapi_extra={"security": AUTHENTICATED_SECURITY})
def update_campaign_endpoint(
    campaign_id: Annotated[StableId, Path()], body: CampaignDraftUpdate,
    request: Request, principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    if not body.model_fields_set:
        raise ApiError(422, "VALIDATION_ERROR", "At least one campaign field must be supplied")
    update_campaign(int(campaign_id), body, actor_id, request.state.request_id)
    return WorkflowResult(resource_id=campaign_id, status="DRAFT_UPDATED")


@router.post("/campaigns/{campaign_id}/submission", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def submit_campaign_endpoint(
    campaign_id: Annotated[StableId, Path()], request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    campaign_workflow("submit_campaign", int(campaign_id), actor_id, request.state.request_id)
    return WorkflowResult(resource_id=campaign_id, status="SUBMITTED")


@router.post("/campaigns/{campaign_id}/review", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def review_campaign_endpoint(
    campaign_id: Annotated[StableId, Path()], body: CampaignReviewInput,
    request: Request, principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    review_campaign(int(campaign_id), body, actor_id, request.state.request_id)
    return WorkflowResult(resource_id=campaign_id, status=body.decision)


@router.post("/campaigns/{campaign_id}/activation", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def activate_campaign_endpoint(
    campaign_id: Annotated[StableId, Path()], request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    campaign_workflow("activate_campaign", int(campaign_id), actor_id, request.state.request_id)
    return WorkflowResult(resource_id=campaign_id, status="ACTIVE")


@router.post("/campaigns/{campaign_id}/closure-request", response_model=WorkflowResult, status_code=201,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def request_campaign_closure_endpoint(
    campaign_id: Annotated[StableId, Path()],
    body: ReasonInput,
    request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    """Submit an organization closure request for an active or paused campaign."""
    actor_id = _actor(principal)
    settings_allow_workflows()
    req_id = request_campaign_closure(int(campaign_id), body.reason, actor_id, request.state.request_id)
    return WorkflowResult(resource_id=req_id, status="PENDING")


@router.post("/organizations/{organization_id}/beneficiaries", response_model=WorkflowResult, status_code=201,
             responses=error_responses(401, 403, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def create_beneficiary_endpoint(
    organization_id: Annotated[StableId, Path()], body: BeneficiaryInput,
    request: Request, principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    beneficiary_id = create_beneficiary(
        int(organization_id), body, actor_id, request.state.request_id
    )
    return WorkflowResult(resource_id=beneficiary_id, status="PENDING_VERIFICATION")


@router.post("/beneficiaries/{beneficiary_id}/verification", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def verify_beneficiary_endpoint(
    beneficiary_id: Annotated[StableId, Path()], body: BeneficiaryVerificationInput,
    request: Request, principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    verify_beneficiary(
        int(beneficiary_id), body.verification_status, body.reason,
        actor_id, request.state.request_id,
    )
    return WorkflowResult(resource_id=beneficiary_id, status=body.verification_status)


@router.post("/campaigns/{campaign_id}/disbursements", response_model=WorkflowResult, status_code=201,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def request_disbursement_endpoint(
    campaign_id: Annotated[StableId, Path()], body: DisbursementRequestInput,
    request: Request, principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    disbursement_id = request_disbursement(
        int(campaign_id), body, actor_id, request.state.request_id
    )
    return WorkflowResult(resource_id=disbursement_id, status="PENDING_APPROVAL")


@router.post("/disbursements/{disbursement_id}/approval", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def approve_disbursement_endpoint(
    disbursement_id: Annotated[StableId, Path()], body: DisbursementDecisionInput,
    request: Request, principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    approve_disbursement(
        int(disbursement_id), body.decision, actor_id, request.state.request_id
    )
    return WorkflowResult(resource_id=disbursement_id, status=body.decision)


@router.post("/disbursements/{disbursement_id}/payment", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def pay_disbursement_endpoint(
    disbursement_id: Annotated[StableId, Path()], body: DisbursementPaymentInput,
    request: Request, response: Response, idempotency_key: IdempotencyHeader,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    actor_id = _actor(principal)
    settings_allow_workflows()
    result_id, replayed = pay_disbursement(
        int(disbursement_id), body.payment_reference, actor_id,
        idempotency_key, request.state.request_id,
    )
    response.headers["Idempotency-Replayed"] = str(replayed).lower()
    return WorkflowResult(resource_id=result_id, status="PAID")
