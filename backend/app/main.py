import re
from uuid import uuid4

from fastapi import FastAPI, Request

from app.api.campaigns import router as campaigns_router
from app.api.donations import router as donations_router
from app.api.management import router as management_router
from app.api.organizations import router as organizations_router
from app.api.review import router as review_router
from app.errors import register_error_handlers

app = FastAPI(
    title="Charity Donation & Beneficiary Portal API",
    version="0.1.0-provisional",
    description="Database-backed DonateKaro API. Financial writes remain disabled by default until operational controls are configured.",
)
register_error_handlers(app)


@app.middleware("http")
async def request_context(request: Request, call_next):
    candidate = request.headers.get("X-Request-ID", "")
    request_id = candidate if re.fullmatch(r"[A-Za-z0-9._-]{1,120}", candidate) else uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


app.include_router(campaigns_router)
app.include_router(donations_router)
app.include_router(management_router)
app.include_router(organizations_router)
app.include_router(review_router)
