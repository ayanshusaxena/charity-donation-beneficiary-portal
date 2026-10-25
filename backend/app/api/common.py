from app.schemas import ErrorEnvelope


ERROR_RESPONSES = {
    status: {"model": ErrorEnvelope, "description": description}
    for status, description in {
        400: "Malformed or conflicting credentials",
        401: "Authentication is required or invalid",
        403: "The authenticated actor is not authorized",
        404: "The resource is not found or not visible to this actor",
        409: "A persisted state or idempotency conflict occurred",
        422: "Request validation failed",
        500: "An unexpected server error occurred",
        503: "Authentication service, database or workflow is unavailable",
    }.items()
}


def error_responses(*statuses: int) -> dict[int, dict[str, object]]:
    """Document only the shared error statuses that a route can actually emit."""
    return {status: ERROR_RESPONSES[status] for status in statuses}


OWNED_RESOURCE_SECURITY = [{"BearerAuth": []}, {"GuestAccessToken": []}]
AUTHENTICATED_SECURITY = [{"BearerAuth": []}]
