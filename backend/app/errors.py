from dataclasses import dataclass

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@dataclass
class ApiError(Exception):
    status_code: int
    code: str
    message: str


class DatabaseUnavailable(Exception):
    pass


class DatabaseRuleError(Exception):
    def __init__(self, sqlstate: str, message: str):
        self.sqlstate = sqlstate
        self.message = message
        super().__init__(message)


def database_error_response(exc: DatabaseRuleError) -> ApiError:
    if exc.sqlstate == "P1001":
        return ApiError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was used with a different request")
    if exc.sqlstate == "P1002":
        return ApiError(403, "FORBIDDEN", "The authenticated actor is not authorized for this operation")
    if exc.sqlstate == "P1003":
        if exc.message == "CAMPAIGN_UNAVAILABLE":
            return ApiError(409, "CAMPAIGN_UNAVAILABLE", "The campaign is not accepting donations")
        if exc.message.endswith("NOT_FOUND"):
            return ApiError(404, "NOT_FOUND", "The requested resource was not found")
        return ApiError(404, "NOT_FOUND", "The requested resource is unavailable")
    if exc.sqlstate == "P1005":
        return ApiError(422, "VALIDATION_ERROR", "The request does not meet the database workflow rules")
    if exc.sqlstate.startswith("23"):
        return ApiError(409, "CONFLICT", "The request conflicts with persisted integrity rules")
    if exc.sqlstate.startswith("P10") or exc.sqlstate.startswith("P0001"):
        return ApiError(409, "CONFLICT", "The persisted workflow state does not allow this operation")
    return ApiError(503, "DATABASE_UNAVAILABLE", "The database workflow is unavailable")


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed"}},
        )

    @app.exception_handler(DatabaseUnavailable)
    async def handle_database_unavailable(_request: Request, _exc: DatabaseUnavailable) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={"error": {"code": "DATABASE_UNAVAILABLE", "message": "The database is unavailable"}},
        )

    @app.exception_handler(DatabaseRuleError)
    async def handle_database_rule_error(_request: Request, exc: DatabaseRuleError) -> JSONResponse:
        api_error = database_error_response(exc)
        return JSONResponse(
            status_code=api_error.status_code,
            content={"error": {"code": api_error.code, "message": api_error.message}},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, _exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected server error occurred"}},
        )
