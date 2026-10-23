import pytest
from pydantic import ValidationError

from app.auth import settings_allow_donation_writes, settings_allow_simulation, settings_allow_workflows
from app.config import Settings
from app.errors import ApiError


LOCAL_TEST_DSN = "host=127.0.0.1 port=5432 dbname=charity_demo_local user=demo_runtime"


def test_financial_write_flags_are_disabled_by_default():
    settings = Settings()

    assert settings.workflows_enabled is False
    assert settings.donation_writes_enabled is False
    assert settings.simulated_payments_enabled is False


def test_local_donation_demo_enables_only_donation_create_and_simulation():
    settings = Settings(
        environment="test",
        database_url=LOCAL_TEST_DSN,
        workflows_enabled=False,
        donation_writes_enabled=True,
        simulated_payments_enabled=True,
    )

    settings_allow_donation_writes(settings)
    settings_allow_simulation(settings)
    with pytest.raises(ApiError) as error:
        settings_allow_workflows(settings)
    assert error.value.status_code == 503


@pytest.mark.parametrize("environment", ["staging", "production"])
@pytest.mark.parametrize(
    "flag",
    ["workflows_enabled", "donation_writes_enabled", "simulated_payments_enabled"],
)
def test_financial_write_flags_are_rejected_outside_local_test_environments(environment, flag):
    with pytest.raises(ValidationError):
        Settings(
            environment=environment,
            database_url=LOCAL_TEST_DSN,
            **{flag: True},
        )


@pytest.mark.parametrize(
    "database_url",
    [
        "host=db.example.invalid port=5432 dbname=charity_demo_local user=demo_runtime",
        "host=127.0.0.1 port=5432 user=demo_runtime",
        "host=127.0.0.1,db.example.invalid port=5432 dbname=charity_demo_local user=demo_runtime",
    ],
)
def test_financial_write_flags_require_explicit_loopback_database_and_name(database_url):
    with pytest.raises(ValidationError):
        Settings(
            environment="test",
            database_url=database_url,
            donation_writes_enabled=True,
        )


@pytest.mark.parametrize("database", ["charity_portal_test", "charity_portal_financial_review"])
def test_financial_write_flags_reject_protected_project_databases(database):
    with pytest.raises(ValidationError):
        Settings(
            environment="test",
            database_url=f"host=127.0.0.1 port=5432 dbname={database} user=demo_runtime",
            donation_writes_enabled=True,
        )


def test_simulated_payment_flag_cannot_be_enabled_for_staging():
    with pytest.raises(ValidationError):
        Settings(
            environment="staging",
            database_url=LOCAL_TEST_DSN,
            donation_writes_enabled=True,
            simulated_payments_enabled=True,
        )
