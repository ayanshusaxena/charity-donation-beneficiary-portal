import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    WithJsonSchema,
    field_serializer,
)


STABLE_ID_PATTERN = r"^(?:[1-9][0-9]{0,17}|[1-8][0-9]{18}|9[0-1][0-9]{17}|92[0-1][0-9]{16}|922[0-2][0-9]{15}|9223[0-2][0-9]{14}|92233[0-6][0-9]{13}|922337[0-1][0-9]{12}|92233720[0-2][0-9]{10}|922337203[0-5][0-9]{9}|9223372036[0-7][0-9]{8}|92233720368[0-4][0-9]{7}|922337203685[0-3][0-9]{6}|9223372036854[0-6][0-9]{5}|92233720368547[0-6][0-9]{4}|922337203685477[0-4][0-9]{3}|9223372036854775[0-7][0-9]{2}|922337203685477580[0-6]|9223372036854775807)$"
MONEY_PATTERN = r"^(?:0\.(?:0[1-9]|[1-9][0-9])|[1-9][0-9]{0,11}\.[0-9]{2})$"
PURPOSE_CODES = ("GENERAL", "FOOD", "EDUCATION", "HEALTH", "SHELTER")
ApiErrorCode = Literal[
    "VALIDATION_ERROR", "NOT_FOUND", "CAMPAIGN_UNAVAILABLE", "IDEMPOTENCY_KEY_REUSED",
    "CONFLICT", "WRITE_WORKFLOW_UNAVAILABLE", "SIMULATION_UNAVAILABLE",
    "AUTHENTICATION_UNAVAILABLE", "UNAUTHENTICATED", "INVALID_CREDENTIALS",
    "FORBIDDEN", "DATABASE_UNAVAILABLE", "INTERNAL_ERROR",
]


def coerce_stable_id(value: object) -> object:
    if isinstance(value, int):
        return str(value)
    return value


def validate_stable_id(value: str) -> str:
    numeric_id = int(value)
    if numeric_id < 1 or numeric_id > 9_223_372_036_854_775_807:
        raise ValueError("ID must fit a positive PostgreSQL BIGINT")
    return value


StableId = Annotated[
    str,
    BeforeValidator(coerce_stable_id),
    Field(pattern=STABLE_ID_PATTERN, max_length=19),
    AfterValidator(validate_stable_id),
    WithJsonSchema({"type": "string", "pattern": STABLE_ID_PATTERN, "maxLength": 19}, mode="serialization"),
]
Money = Annotated[
    Decimal,
    Field(gt=0, max_digits=14, decimal_places=2),
    WithJsonSchema({"type": "string", "pattern": MONEY_PATTERN}, mode="serialization"),
]
NonNegativeMoney = Annotated[
    Decimal,
    Field(ge=0, max_digits=30, decimal_places=2),
    WithJsonSchema({"type": "string", "pattern": r"^(?:0|[1-9][0-9]*)(?:\.[0-9]{2})$"}, mode="serialization"),
]


def parse_wire_money(value: object) -> Decimal:
    if not isinstance(value, str) or re.fullmatch(MONEY_PATTERN, value) is None:
        raise ValueError("Money must be a decimal string with exactly two fractional digits")
    try:
        return Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("Money is not a valid decimal amount") from exc


WireMoney = Annotated[
    Decimal,
    BeforeValidator(parse_wire_money),
    Field(gt=0, max_digits=14, decimal_places=2),
    WithJsonSchema({"type": "string", "pattern": MONEY_PATTERN}, mode="validation"),
]


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    campaign_id: StableId
    organization_name: str
    campaign_name: str
    purpose: str
    purpose_code: Literal["GENERAL", "FOOD", "EDUCATION", "HEALTH", "SHELTER"]
    target_amount: Money
    amount_raised: NonNegativeMoney = Field(
        description="Net cleared donation inflows less posted refunds; excludes disbursements."
    )
    currency: Literal["INR"]
    start_date: date
    end_date: date
    eligibility: Literal["ACCEPTING_DONATIONS"]

    @field_serializer("target_amount", "amount_raised")
    def serialize_target_amount(self, value: Decimal) -> str:
        return format(value, ".2f")


class CampaignPage(BaseModel):
    items: list[CampaignOut]
    limit: int
    offset: Annotated[int, Field(ge=0, le=1_000_000)]
    has_more: bool
    next_offset: Annotated[int | None, Field(ge=0, le=1_000_000)]


class OrganizationMembershipOut(BaseModel):
    organization_id: StableId
    organization_name: str
    roles: list[Literal["CAMPAIGN_EDITOR", "BENEFICIARY_MANAGER", "DISBURSEMENT_REQUESTER"]]
    verification_status: Literal["PENDING", "VERIFIED", "REJECTED"] = "VERIFIED"
    review_reason: str | None = None


class OrganizationListOut(BaseModel):
    items: list[OrganizationMembershipOut]


class OrganizationDashboardOut(BaseModel):
    campaign_count: int = Field(ge=0)
    draft_campaign_count: int = Field(ge=0)
    submitted_campaign_count: int = Field(ge=0)
    active_campaign_count: int = Field(ge=0)
    rejected_campaign_count: int = Field(ge=0)
    beneficiary_count: int = Field(ge=0)
    pending_beneficiary_count: int = Field(ge=0)
    pending_disbursement_count: int = Field(ge=0)


class OrganizationCampaignOut(BaseModel):
    campaign_id: StableId
    campaign_name: str
    purpose: str | None = None
    purpose_code: Literal["GENERAL", "FOOD", "EDUCATION", "HEALTH", "SHELTER"] | None = None
    target_amount: Money | None = None
    amount_raised: NonNegativeMoney = Field(
        description="Net cleared donation inflows less posted refunds; excludes disbursements."
    )
    currency: Literal["INR"]
    start_date: date | None = None
    end_date: date | None = None
    approval_status: Literal["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]
    campaign_status: Literal["DRAFT", "ACTIVE", "PAUSED", "CLOSED", "CANCELLED"]
    submitted_at: datetime | None
    review_reason: str | None

    @field_serializer("target_amount")
    def serialize_target_amount(self, value: Decimal | None) -> str | None:
        return format(value, ".2f") if value is not None else None

    @field_serializer("amount_raised")
    def serialize_raised_amount(self, value: Decimal) -> str:
        return format(value, ".2f")


class OrganizationCampaignPage(BaseModel):
    items: list[OrganizationCampaignOut]
    limit: int
    offset: Annotated[int, Field(ge=0, le=1_000_000)]
    has_more: bool
    next_offset: Annotated[int | None, Field(ge=0, le=1_000_000)]


class ReviewCampaignOut(OrganizationCampaignOut):
    organization_id: StableId
    organization_name: str


class ReviewQueuePage(BaseModel):
    items: list[ReviewCampaignOut]
    limit: int
    offset: Annotated[int, Field(ge=0, le=1_000_000)]
    has_more: bool
    next_offset: Annotated[int | None, Field(ge=0, le=1_000_000)]


class BeneficiaryOut(BaseModel):
    beneficiary_id: StableId
    beneficiary_name: str
    beneficiary_type: Literal["INDIVIDUAL", "GROUP", "ORGANIZATION"]
    verification_status: Literal["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"]
    created_at: datetime


class BeneficiaryPage(BaseModel):
    items: list[BeneficiaryOut]
    limit: int
    offset: Annotated[int, Field(ge=0, le=1_000_000)]
    has_more: bool
    next_offset: Annotated[int | None, Field(ge=0, le=1_000_000)]


class DonorInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=160)
    email: EmailStr | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=30)


class CreateDonationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_id: StableId
    donor: DonorInput | None = None
    amount: WireMoney
    currency: Literal["INR"]


class SimulatedPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Literal["SUCCEEDED", "FAILED", "TIMEOUT"]


class PaymentAttemptOut(BaseModel):
    payment_attempt_id: StableId
    status: Literal["PENDING", "SUCCEEDED", "FAILED", "UNKNOWN"]
    requested_outcome: Literal["SUCCEEDED", "FAILED", "TIMEOUT"] | None
    started_at: datetime
    completed_at: datetime | None


class DonationHistoryOut(BaseModel):
    donation_id: StableId
    campaign_id: StableId
    campaign_name: str
    amount: Money
    currency: Literal["INR"]
    payment_status: Literal["PENDING", "SUCCESSFUL", "FAILED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED"]
    created_at: datetime
    transaction_reference: str | None
    receipt_number: str | None
    payment_attempts: list[PaymentAttemptOut]

    @field_serializer("amount")
    def serialize_history_amount(self, value: Decimal) -> str:
        return format(value, ".2f")


class DonationHistoryPage(BaseModel):
    items: list[DonationHistoryOut]
    limit: int
    offset: Annotated[int, Field(ge=0, le=1_000_000)]
    has_more: bool
    next_offset: Annotated[int | None, Field(ge=0, le=1_000_000)]


class DonationOut(BaseModel):
    donation_id: StableId
    campaign_id: StableId
    amount: Money
    currency: Literal["INR"]
    payment_status: Literal["PENDING", "SUCCESSFUL", "FAILED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED"]
    created_at: datetime
    transaction_reference: str | None
    receipt_number: str | None
    payment_attempts: list[PaymentAttemptOut]

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return format(value, ".2f")


class CampaignDraftInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_name: str = Field(min_length=1, max_length=180)
    purpose: str | None = None
    purpose_code: Literal["GENERAL", "FOOD", "EDUCATION", "HEALTH", "SHELTER"] | None = None
    target_amount: WireMoney | None = None
    currency: Literal["INR"] = "INR"
    start_date: date | None = None
    end_date: date | None = None


class CampaignDraftUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_name: str | None = Field(default=None, min_length=1, max_length=180)
    purpose: str | None = Field(default=None, min_length=1)
    purpose_code: Literal["GENERAL", "FOOD", "EDUCATION", "HEALTH", "SHELTER"] | None = None
    target_amount: WireMoney | None = None
    start_date: date | None = None
    end_date: date | None = None


class CampaignReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["APPROVED", "REJECTED"]
    reason: str = Field(min_length=1, max_length=4000)


class WorkflowResult(BaseModel):
    resource_id: StableId
    status: str


class BeneficiaryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    beneficiary_name: str = Field(min_length=1, max_length=180)
    beneficiary_type: Literal["INDIVIDUAL", "GROUP", "ORGANIZATION"]
    contact_details: dict[str, str] | None = None


class BeneficiaryVerificationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verification_status: Literal["VERIFIED", "REJECTED", "SUSPENDED", "PENDING"]
    reason: str = Field(min_length=1, max_length=4000)


class DisbursementRequestInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    beneficiary_id: StableId
    restriction_id: StableId | None = None
    amount: WireMoney
    currency: Literal["INR"]
    approved_purpose: str = Field(min_length=1, max_length=4000)
    purpose_code: Literal["GENERAL", "FOOD", "EDUCATION", "HEALTH", "SHELTER"]


class DisbursementDecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["APPROVED", "REJECTED"]


class DisbursementPaymentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_reference: str = Field(min_length=1, max_length=160)


class RefundInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: WireMoney
    currency: Literal["INR"]
    reason: str = Field(min_length=1, max_length=4000)


class PaymentReconciliationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Literal["SUCCEEDED", "FAILED"]


class ErrorDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: ApiErrorCode
    message: str


class ErrorEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: ErrorDetail


class OrganizationRegisterInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_name: str = Field(min_length=1, max_length=160)
    registration_ref: str = Field(min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = None


class OrganizationRegisterOut(BaseModel):
    organization_id: StableId
    organization_name: str
    verification_status: Literal["PENDING", "VERIFIED", "REJECTED"]
    applicant_access_token: str


class OrganizationReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["VERIFIED", "REJECTED"]
    reason: str = Field(min_length=1, max_length=4000)


class OrganizationReviewItemOut(BaseModel):
    organization_id: StableId
    organization_name: str
    registration_ref: str | None = None
    email: str | None = None
    phone: str | None = None
    verification_status: Literal["PENDING", "VERIFIED", "REJECTED"]
    review_reason: str | None = None
    created_at: datetime


class OrganizationReviewQueuePage(BaseModel):
    items: list[OrganizationReviewItemOut]
    limit: int
    offset: Annotated[int, Field(ge=0, le=1_000_000)]
    has_more: bool
    next_offset: Annotated[int | None, Field(ge=0, le=1_000_000)]


class ReasonInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=1, max_length=4000)


class ClosureDecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["APPROVED", "REJECTED"]
    reason: str = Field(min_length=1, max_length=4000)


class ClosureRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    request_id: StableId
    campaign_id: StableId
    campaign_name: str | None = None
    organization_id: StableId
    organization_name: str | None = None
    requested_by: str
    request_reason: str
    status: Literal["PENDING", "APPROVED", "REJECTED"]
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    review_reason: str | None = None
    created_at: datetime


class ClosureRequestPage(BaseModel):
    items: list[ClosureRequestOut]


class IrbCampaignOversightItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    campaign_id: StableId
    organization_id: StableId
    organization_name: str
    campaign_name: str
    purpose_code: str
    target_amount: Money | None = None
    amount_raised: NonNegativeMoney = Field(default=Decimal("0.00"))
    start_date: date | None = None
    end_date: date | None = None
    approval_status: str
    campaign_status: str
    pending_closure_request: bool = False
    created_at: datetime

    @field_serializer("target_amount", "amount_raised")
    def serialize_money(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, ".2f")


class IrbCampaignOversightPage(BaseModel):
    items: list[IrbCampaignOversightItem]
    limit: int
    offset: Annotated[int, Field(ge=0, le=1_000_000)]
    has_more: bool
    next_offset: Annotated[int | None, Field(ge=0, le=1_000_000)]
