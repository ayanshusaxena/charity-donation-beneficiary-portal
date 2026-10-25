from dataclasses import dataclass
from functools import lru_cache
import hashlib
import re

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientError

from app.config import Settings, get_settings
from app.errors import ApiError


bearer_scheme = HTTPBearer(auto_error=False, scheme_name="BearerAuth")
GUEST_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43,128}$")
APPLICANT_TOKEN_PATTERN = re.compile(r"^dk_app_[A-Za-z0-9_-]{32,128}$")
MOCK_TOKEN_PATTERN = re.compile(r"^mock-(?:oidc-)?[A-Za-z0-9_-]+$")


@dataclass(frozen=True)
class Principal:
    actor_id: str
    claims: dict


@lru_cache(maxsize=8)
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, cache_jwk_set=True, lifespan=300, timeout=5)


def optional_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Principal | None:
    if credentials is None:
        return None
    if credentials.scheme.lower() != "bearer":
        raise ApiError(401, "UNAUTHENTICATED", "A bearer access token is required")

    settings = get_settings()

    # 1. Applicant Capability-Token authentication
    if APPLICANT_TOKEN_PATTERN.match(credentials.credentials):
        token_hash = hashlib.sha256(credentials.credentials.encode("ascii")).hexdigest()
        return Principal(actor_id=f"applicant:{token_hash}", claims={"role": "applicant", "token_hash": token_hash})

    # 2. Sandbox/Development synthetic mock tokens
    if settings.environment in {"development", "test"} and MOCK_TOKEN_PATTERN.match(credentials.credentials):
        token_name = credentials.credentials
        if "ngo" in token_name:
            actor_id = "mock:bal-vikas-editor"
        elif "reviewer" in token_name:
            actor_id = "mock:irb-faculty-reviewer"
        else:
            actor_id = f"mock:{token_name}"
        return Principal(actor_id=actor_id, claims={"role": "mock", "sub": token_name})

    if not settings.auth_issuer or not settings.auth_audience or not settings.auth_jwks_url:
        raise ApiError(503, "AUTHENTICATION_UNAVAILABLE", "Trusted token verification is not configured")
    try:
        signing_key = _jwks_client(settings.auth_jwks_url).get_signing_key_from_jwt(credentials.credentials)
        claims = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.auth_audience,
            issuer=settings.auth_issuer,
            options={"require": ["exp", "iat", "sub", "iss"]},
        )
    except PyJWKClientError as exc:
        raise ApiError(503, "AUTHENTICATION_UNAVAILABLE", "Trusted token keys are unavailable") from exc
    except InvalidTokenError as exc:
        raise ApiError(401, "UNAUTHENTICATED", "The access token is invalid or expired") from exc

    subject = claims.get("sub")
    issuer = claims.get("iss")
    if not isinstance(subject, str) or not subject.strip() or not isinstance(issuer, str):
        raise ApiError(401, "UNAUTHENTICATED", "The access token has no stable principal")
    actor_id = f"{issuer}|{subject}"
    if len(actor_id) > 512:
        raise ApiError(401, "UNAUTHENTICATED", "The access token principal is too long")
    return Principal(actor_id=actor_id, claims=claims)


def require_principal(principal: Principal | None = Depends(optional_principal)) -> Principal:
    if principal is None:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required")
    return principal


def resolve_actor(
    principal: Principal | None,
    guest_access_token: str | None,
) -> tuple[str, str | None]:
    if principal is not None:
        if guest_access_token is not None:
            raise ApiError(400, "INVALID_CREDENTIALS", "Use either a registered account or guest access")
        return principal.actor_id, None
    if guest_access_token is None or GUEST_TOKEN_PATTERN.fullmatch(guest_access_token) is None:
        raise ApiError(401, "UNAUTHENTICATED", "A registered account or valid guest access token is required")
    token_hash = hashlib.sha256(guest_access_token.encode("ascii")).hexdigest()
    return f"guest:{token_hash}", token_hash


def settings_allow_workflows(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    if not settings.workflows_enabled:
        raise ApiError(503, "WRITE_WORKFLOW_UNAVAILABLE", "Database workflows are not enabled")


def settings_allow_donation_writes(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    if settings.environment not in {"development", "test"} or not settings.donation_writes_enabled:
        raise ApiError(503, "WRITE_WORKFLOW_UNAVAILABLE", "Donation writes are not enabled")


def settings_allow_simulation(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    settings_allow_donation_writes(settings)
    if settings.environment not in {"development", "test"} or not settings.simulated_payments_enabled:
        raise ApiError(503, "SIMULATION_UNAVAILABLE", "Simulated payment is disabled outside an enabled development/test environment")
