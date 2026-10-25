from functools import lru_cache
from typing import Literal

from psycopg.conninfo import conninfo_to_dict
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str | None = None
    environment: Literal["development", "test", "staging", "production"] = "development"
    workflows_enabled: bool = False
    donation_writes_enabled: bool = False
    simulated_payments_enabled: bool = False
    auth_issuer: str | None = None
    auth_audience: str | None = None
    auth_jwks_url: str | None = None
    runtime_database_role: str = "charity_portal_runtime"
    owner_database_role: str = "charity_portal_owner"

    model_config = SettingsConfigDict(env_prefix="CHARITY_", env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_financial_write_configuration(self):
        write_features = (
            self.workflows_enabled
            or self.donation_writes_enabled
            or self.simulated_payments_enabled
        )
        if not write_features:
            return self

        if self.environment not in {"development", "test"}:
            raise ValueError("Financial writes may only be enabled in development or test")

        if not self.database_url:
            raise ValueError("Financial writes require an explicit local PostgreSQL database URL")
        try:
            connection = conninfo_to_dict(self.database_url)
        except Exception as exc:
            raise ValueError("Financial writes require an explicit local PostgreSQL database URL") from exc

        host = (connection.get("host") or "").strip().lower()
        database = (connection.get("dbname") or "").strip()
        hostaddr = (connection.get("hostaddr") or "").strip()
        if host not in {"localhost", "127.0.0.1", "::1"} or not database:
            raise ValueError("Financial writes require an explicit loopback host and database name")
        if database.lower() in {"charity_portal_test", "charity_portal_financial_review"}:
            raise ValueError("Financial writes are forbidden for protected project databases")
        if hostaddr and hostaddr not in {"127.0.0.1", "::1"}:
            raise ValueError("Financial writes require a loopback PostgreSQL address")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
