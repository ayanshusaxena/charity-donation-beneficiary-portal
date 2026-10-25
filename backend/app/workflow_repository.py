import hashlib
import json
from decimal import Decimal
from typing import Any

from app.database import actor_read_connection, workflow_connection
from app.schemas import (
    BeneficiaryInput,
    CampaignDraftInput,
    CampaignDraftUpdate,
    CampaignReviewInput,
    CreateDonationRequest,
    DisbursementRequestInput,
)


def request_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _donation_output(row: dict[str, Any]) -> dict[str, Any]:
    result = dict(row)
    result["donation_id"] = str(result["donation_id"])
    result["campaign_id"] = str(result["campaign_id"])
    result["amount"] = Decimal(result["amount"])
    attempts = result.get("payment_attempts") or []
    for attempt in attempts:
        attempt["payment_attempt_id"] = str(attempt["payment_attempt_id"])
        attempt["status"] = attempt.pop("status")
    result["payment_attempts"] = attempts
    return result


def _owned_donation(connection, donation_id: int, guest_token_hash: str | None):
    row = connection.execute(
        "SELECT * FROM get_owned_donation(%s,%s)", (donation_id, guest_token_hash)
    ).fetchone()
    return _donation_output(row) if row is not None else None


def create_donation(
    request: CreateDonationRequest,
    actor_id: str,
    guest_token_hash: str | None,
    idempotency_key: str,
    request_id: str,
) -> tuple[dict[str, Any], bool]:
    donor = request.donor
    donor_data = donor.model_dump(mode="json") if donor is not None else None
    payload = {
        "campaign_id": request.campaign_id,
        "donor": donor_data,
        "amount": format(request.amount, ".2f"),
        "currency": request.currency,
    }
    digest = request_hash(payload)
    with workflow_connection(actor_id, request_id) as connection:
        result = connection.execute(
            """SELECT donation_id,replayed FROM create_donation_idempotent(
                   %s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                int(request.campaign_id),
                donor.display_name if donor else None,
                donor.email if donor else None,
                donor.phone if donor else None,
                request.amount,
                idempotency_key,
                digest,
                guest_token_hash,
            ),
        ).fetchone()
        donation = _owned_donation(connection, result["donation_id"], guest_token_hash)
        if donation is None:
            raise RuntimeError("The committed donation could not be read through its owner guard")
    return donation, result["replayed"]


def simulate_payment(
    donation_id: int,
    outcome: str,
    actor_id: str,
    guest_token_hash: str | None,
    idempotency_key: str,
    request_id: str,
) -> tuple[dict[str, Any], bool, str]:
    digest = request_hash({"donation_id": str(donation_id), "outcome": outcome})
    with workflow_connection(actor_id, request_id) as connection:
        result = connection.execute(
            """SELECT payment_attempt_id,replayed FROM simulate_donation_payment_idempotent(
                   %s,%s,%s,%s,%s)""",
            (donation_id, idempotency_key, digest, outcome, guest_token_hash),
        ).fetchone()
        donation = _owned_donation(connection, donation_id, guest_token_hash)
        if donation is None:
            raise RuntimeError("The committed donation could not be read through its owner guard")
        attempt_status = next(
            (a["status"] for a in donation["payment_attempts"]
             if a["payment_attempt_id"] == str(result["payment_attempt_id"])),
            "UNKNOWN",
        )
    return donation, result["replayed"], attempt_status


def get_donation(donation_id: int, actor_id: str, guest_hash: str | None, request_id: str):
    with actor_read_connection(actor_id, request_id) as connection:
        return _owned_donation(connection, donation_id, guest_hash)


def register_organization(
    name: str, reg_ref: str, email: str | None, phone: str | None,
    request_id: str,
) -> tuple[str, str]:
    import secrets
    token = "dk_app_" + secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
    actor_id = f"applicant:{token_hash}"
    with workflow_connection(actor_id, request_id) as connection:
        row = connection.execute(
            "SELECT register_organization(%s,%s,%s,%s,%s) AS resource_id",
            (name, reg_ref, email, phone, token_hash),
        ).fetchone()
    return str(row["resource_id"]), token


def review_organization(
    organization_id: int, decision: str, reason: str, actor_id: str, request_id: str,
) -> None:
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute(
            "SELECT review_organization(%s,%s,%s)",
            (organization_id, decision, reason),
        )


def create_campaign(organization_id: int, request: CampaignDraftInput, actor_id: str, request_id: str) -> str:
    with workflow_connection(actor_id, request_id) as connection:
        row = connection.execute(
            "SELECT create_campaign_draft(%s,%s,%s,%s,%s,%s,%s) AS resource_id",
            (organization_id, request.campaign_name, request.purpose, request.purpose_code,
             request.target_amount, request.start_date, request.end_date),
        ).fetchone()
    return str(row["resource_id"])


def update_campaign(campaign_id: int, request: CampaignDraftUpdate, actor_id: str, request_id: str) -> None:
    fields = request.model_dump(exclude_unset=True)
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute(
            "SELECT update_campaign_draft(%s,%s,%s,%s,%s,%s,%s)",
            (campaign_id, fields.get("campaign_name"), fields.get("purpose"),
             fields.get("purpose_code"), fields.get("target_amount"),
             fields.get("start_date"), fields.get("end_date")),
        )


def campaign_workflow(function: str, campaign_id: int, actor_id: str, request_id: str, *args):
    allowed = {"submit_campaign", "activate_campaign"}
    if function not in allowed:
        raise ValueError("Unsupported campaign workflow")
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute(f"SELECT {function}(%s)", (campaign_id,))


def review_campaign(campaign_id: int, request: CampaignReviewInput, actor_id: str, request_id: str):
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute("SELECT review_campaign(%s,%s,%s)",
                           (campaign_id, request.decision, request.reason))


def create_beneficiary(organization_id: int, request: BeneficiaryInput, actor_id: str, request_id: str) -> str:
    contact = json.dumps(request.contact_details) if request.contact_details is not None else None
    with workflow_connection(actor_id, request_id) as connection:
        row = connection.execute(
            "SELECT create_beneficiary(%s,%s,%s,%s::jsonb) AS resource_id",
            (organization_id, request.beneficiary_name, request.beneficiary_type, contact),
        ).fetchone()
    return str(row["resource_id"])


def verify_beneficiary(beneficiary_id: int, status: str, reason: str, actor_id: str, request_id: str):
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute("SELECT verify_beneficiary(%s,%s,%s)", (beneficiary_id, status, reason))


def request_disbursement(campaign_id: int, request: DisbursementRequestInput, actor_id: str, request_id: str) -> str:
    with workflow_connection(actor_id, request_id) as connection:
        row = connection.execute(
            """SELECT request_disbursement(%s,%s,%s,%s,%s,%s) AS resource_id""",
            (campaign_id, int(request.beneficiary_id),
             int(request.restriction_id) if request.restriction_id is not None else None,
             request.amount, request.approved_purpose, request.purpose_code),
        ).fetchone()
    return str(row["resource_id"])


def approve_disbursement(disbursement_id: int, decision: str, actor_id: str, request_id: str):
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute("SELECT approve_disbursement(%s,%s)", (disbursement_id, decision))


def pay_disbursement(
    disbursement_id: int, reference: str, actor_id: str,
    idempotency_key: str, request_id: str,
) -> tuple[str, bool]:
    digest = request_hash({"disbursement_id": str(disbursement_id), "payment_reference": reference})
    with workflow_connection(actor_id, request_id) as connection:
        row = connection.execute(
            "SELECT disbursement_id,replayed FROM pay_disbursement_idempotent(%s,%s,%s,%s)",
            (disbursement_id, reference, idempotency_key, digest),
        ).fetchone()
    return str(row["disbursement_id"]), row["replayed"]


def reconcile_payment_attempt(attempt_id: int, outcome: str, actor_id: str, request_id: str):
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute("SELECT reconcile_simulated_payment(%s,%s)", (attempt_id, outcome))


def refund_donation(
    donation_id: int, amount: Decimal, reason: str, actor_id: str,
    idempotency_key: str, request_id: str,
) -> tuple[str, bool]:
    refund_ref = f"SIM-REFUND-{request_hash({'donation_id':str(donation_id),'key':idempotency_key})[:32]}"
    digest = request_hash({"donation_id": str(donation_id), "amount": format(amount, ".2f"), "reason": reason})
    with workflow_connection(actor_id, request_id) as connection:
        row = connection.execute(
            """SELECT refund_id,replayed FROM post_donation_refund_idempotent(
                   %s,%s,%s,%s,%s,%s)""",
            (donation_id, amount, refund_ref, reason, idempotency_key, digest),
        ).fetchone()
    return str(row["refund_id"]), row["replayed"]


def request_campaign_closure(campaign_id: int, reason: str, actor_id: str, request_id: str) -> str:
    with workflow_connection(actor_id, request_id) as connection:
        row = connection.execute(
            "SELECT request_campaign_closure(%s, %s) AS request_id",
            (campaign_id, reason),
        ).fetchone()
    return str(row["request_id"])


def review_campaign_closure_request(request_id: int, decision: str, reason: str, actor_id: str, req_id: str):
    with workflow_connection(actor_id, req_id) as connection:
        connection.execute(
            "SELECT review_campaign_closure_request(%s, %s, %s)",
            (request_id, decision, reason),
        )


def suspend_campaign(campaign_id: int, reason: str, actor_id: str, request_id: str):
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute(
            "SELECT suspend_campaign(%s, %s)",
            (campaign_id, reason),
        )


def reopen_campaign(campaign_id: int, reason: str, actor_id: str, request_id: str):
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute(
            "SELECT reopen_campaign(%s, %s)",
            (campaign_id, reason),
        )


def close_campaign(campaign_id: int, reason: str, actor_id: str, request_id: str):
    with workflow_connection(actor_id, request_id) as connection:
        connection.execute(
            "SELECT change_campaign_status(%s, 'CLOSED', %s)",
            (campaign_id, reason),
        )


def list_irb_campaign_oversight(
    status_filter: str | None,
    search: str | None,
    limit: int,
    offset: int,
    actor_id: str,
    request_id: str,
) -> tuple[list[dict[str, Any]], bool]:
    with actor_read_connection(actor_id, request_id) as connection:
        rows = connection.execute(
            "SELECT * FROM get_irb_campaign_oversight_list(%s, %s, %s, %s)",
            (status_filter, search, limit + 1, offset),
        ).fetchall()
    has_more = len(rows) > limit
    return rows[:limit], has_more


def list_closure_requests(
    organization_id: int | None,
    actor_id: str,
    request_id: str,
) -> list[dict[str, Any]]:
    with actor_read_connection(actor_id, request_id) as connection:
        rows = connection.execute(
            "SELECT * FROM get_closure_requests(%s)",
            (organization_id,),
        ).fetchall()
    return rows
