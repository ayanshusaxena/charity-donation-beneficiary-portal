from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response

from app.api.common import AUTHENTICATED_SECURITY, error_responses, OWNED_RESOURCE_SECURITY
from app.auth import (
    Principal,
    optional_principal,
    resolve_actor,
    settings_allow_donation_writes,
    settings_allow_simulation,
    settings_allow_workflows,
)
from app.errors import ApiError
from app.schemas import (
    CreateDonationRequest,
    DonationOut,
    DonationHistoryOut,
    DonationHistoryPage,
    DonorInput,
    PaymentReconciliationInput,
    RefundInput,
    SimulatedPaymentRequest,
    StableId,
    WorkflowResult,
)
from app.workflow_repository import (
    create_donation as create_donation_record,
    get_donation as get_donation_record,
    reconcile_payment_attempt,
    refund_donation,
    simulate_payment,
)
from app.organization_repository import list_registered_donation_history


router = APIRouter(prefix="/api/v1/donations", tags=["Donations"])
IdempotencyHeader = Annotated[str, Header(alias="Idempotency-Key", min_length=16, max_length=200)]
GuestTokenHeader = Annotated[str | None, Header(alias="Guest-Access-Token", min_length=43, max_length=128)]


@router.post("", response_model=DonationOut, status_code=201,
             responses={**error_responses(400, 401, 403, 404, 409, 422, 500, 503),
                        200: {"model": DonationOut, "description": "Identical idempotency replay returns the persisted donation"}},
             openapi_extra={"security": OWNED_RESOURCE_SECURITY})
def create_donation(
    request: Request,
    response: Response,
    body: CreateDonationRequest,
    idempotency_key: IdempotencyHeader,
    guest_access_token: GuestTokenHeader = None,
    principal: Principal | None = Depends(optional_principal),
) -> DonationOut:
    settings_allow_donation_writes()
    actor_id, guest_hash = resolve_actor(principal, guest_access_token)
    if guest_hash is not None and body.donor is None:
        raise ApiError(422, "VALIDATION_ERROR", "Guest donations require donor contact details")
    if principal is not None and body.donor is None:
        name = principal.claims.get("name")
        token_email = principal.claims.get("email")
        email = token_email if principal.claims.get("email_verified") is True and isinstance(token_email, str) else None
        if isinstance(name, str) and name.strip():
            body = body.model_copy(update={
                "donor": DonorInput(display_name=name.strip(), email=email)
            })
    row, replayed = create_donation_record(
        body, actor_id, guest_hash, idempotency_key, request.state.request_id
    )
    response.status_code = 200 if replayed else 201
    response.headers["Idempotency-Replayed"] = str(replayed).lower()
    return DonationOut.model_validate(row)


@router.post("/{donation_id}/simulated-payment", response_model=DonationOut,
             responses={**error_responses(400, 401, 403, 404, 409, 422, 500, 503),
                        202: {"model": DonationOut, "description": "Payment outcome remains unknown and requires reconciliation"}},
             openapi_extra={"security": OWNED_RESOURCE_SECURITY})
def simulate_payment_endpoint(
    donation_id: Annotated[StableId, Path()],
    body: SimulatedPaymentRequest,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyHeader,
    guest_access_token: GuestTokenHeader = None,
    principal: Principal | None = Depends(optional_principal),
) -> DonationOut:
    settings_allow_simulation()
    actor_id, guest_hash = resolve_actor(principal, guest_access_token)
    row, replayed, attempt_status = simulate_payment(
        int(donation_id), body.outcome, actor_id, guest_hash,
        idempotency_key, request.state.request_id,
    )
    response.status_code = 202 if attempt_status == "UNKNOWN" else 200
    response.headers["Idempotency-Replayed"] = str(replayed).lower()
    return DonationOut.model_validate(row)


@router.get("/history", response_model=DonationHistoryPage,
            responses=error_responses(401, 422, 500, 503),
            openapi_extra={"security": AUTHENTICATED_SECURITY})
def get_registered_donation_history(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    principal: Principal | None = Depends(optional_principal),
) -> DonationHistoryPage:
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Registered donor authentication is required")
    rows, has_more = list_registered_donation_history(
        limit, offset, principal.actor_id, request.state.request_id
    )
    next_offset = offset + limit
    return DonationHistoryPage(
        items=[DonationHistoryOut.model_validate(row) for row in rows],
        limit=limit,
        offset=offset,
        has_more=has_more,
        next_offset=next_offset if has_more and next_offset <= 1_000_000 else None,
    )


@router.get("/{donation_id}", response_model=DonationOut,
            responses=error_responses(400, 401, 404, 422, 500, 503),
            openapi_extra={"security": OWNED_RESOURCE_SECURITY})
def get_donation(
    donation_id: Annotated[StableId, Path()],
    request: Request,
    guest_access_token: GuestTokenHeader = None,
    principal: Principal | None = Depends(optional_principal),
) -> DonationOut:
    actor_id, guest_hash = resolve_actor(principal, guest_access_token)
    row = get_donation_record(int(donation_id), actor_id, guest_hash, request.state.request_id)
    if row is None:
        raise ApiError(404, "NOT_FOUND", "Donation not found")
    return DonationOut.model_validate(row)


@router.post("/{donation_id}/refunds", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def refund_donation_endpoint(
    donation_id: Annotated[StableId, Path()],
    body: RefundInput,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyHeader,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    settings_allow_workflows()
    refund_id, replayed = refund_donation(
        int(donation_id), body.amount, body.reason, principal.actor_id,
        idempotency_key, request.state.request_id,
    )
    response.headers["Idempotency-Replayed"] = str(replayed).lower()
    return WorkflowResult(resource_id=refund_id, status="POSTED")


@router.post("/payment-attempts/{attempt_id}/reconciliation", response_model=WorkflowResult,
             responses=error_responses(401, 403, 404, 409, 422, 500, 503),
             openapi_extra={"security": AUTHENTICATED_SECURITY})
def reconcile_payment_attempt_endpoint(
    attempt_id: Annotated[StableId, Path()],
    body: PaymentReconciliationInput,
    request: Request,
    principal: Principal | None = Depends(optional_principal),
) -> WorkflowResult:
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    settings_allow_workflows()
    reconcile_payment_attempt(int(attempt_id), body.outcome, principal.actor_id, request.state.request_id)
    return WorkflowResult(resource_id=attempt_id, status=body.outcome)
