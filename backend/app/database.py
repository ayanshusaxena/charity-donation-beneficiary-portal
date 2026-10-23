from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from pydantic import ValidationError
from psycopg.rows import dict_row
from psycopg import sql

from app.config import get_settings
from app.errors import DatabaseRuleError, DatabaseUnavailable


def _assume_runtime_role(connection: psycopg.Connection) -> None:
    settings = get_settings()
    if not settings.runtime_database_role.isidentifier() or not settings.owner_database_role.isidentifier():
        raise DatabaseUnavailable("Database role names are invalid")
    role_state = connection.execute(
        """SELECT session_role.rolsuper,
                  runtime_role.oid IS NOT NULL
                    AND pg_has_role(session_role.oid, runtime_role.oid, 'MEMBER') AS is_runtime_member,
                  owner_role.oid IS NOT NULL
                    AND pg_has_role(session_role.oid, owner_role.oid, 'MEMBER') AS is_owner_member
           FROM pg_roles AS session_role
           CROSS JOIN (SELECT to_regrole(%s) AS oid) AS runtime_role
           CROSS JOIN (SELECT to_regrole(%s) AS oid) AS owner_role
           WHERE session_role.rolname = session_user""",
        (settings.runtime_database_role, settings.owner_database_role),
    ).fetchone()
    if role_state is None or role_state["rolsuper"] or not role_state["is_runtime_member"] or role_state["is_owner_member"]:
        raise DatabaseUnavailable("Database login is not a non-privileged runtime-role member")
    connection.execute(
        sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(settings.runtime_database_role))
    )


@contextmanager
def readonly_connection() -> Iterator[psycopg.Connection]:
    """Open one read-only transaction for a campaign query."""
    try:
        database_url = get_settings().database_url
        if not database_url:
            raise DatabaseUnavailable("Database URL is not configured")
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            with connection.transaction():
                connection.execute("SET TRANSACTION READ ONLY")
                _assume_runtime_role(connection)
                yield connection
    except DatabaseUnavailable:
        raise
    except (psycopg.Error, ValidationError, ValueError) as exc:
        raise DatabaseUnavailable from exc


@contextmanager
def workflow_connection(actor_id: str, request_id: str) -> Iterator[psycopg.Connection]:
    """Run one controlled workflow in a role-checked transaction."""
    try:
        database_url = get_settings().database_url
        if not database_url:
            raise DatabaseUnavailable("Database URL is not configured")
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            with connection.transaction():
                _assume_runtime_role(connection)
                connection.execute("SELECT set_config('app.actor_id', %s, TRUE)", (actor_id,))
                connection.execute("SELECT set_config('app.request_id', %s, TRUE)", (request_id,))
                yield connection
    except (psycopg.Error, ValidationError, ValueError) as exc:
        if isinstance(exc, psycopg.Error) and exc.sqlstate and (
            exc.sqlstate.startswith("P10") or exc.sqlstate.startswith("P0001")
            or exc.sqlstate.startswith("23")
        ):
            raise DatabaseRuleError(exc.sqlstate, exc.diag.message_primary or "Database workflow rejected the request") from exc
        raise DatabaseUnavailable from exc
    except DatabaseUnavailable:
        raise


@contextmanager
def actor_read_connection(actor_id: str, request_id: str) -> Iterator[psycopg.Connection]:
    """Open a read-only transaction carrying a verified actor context."""
    try:
        database_url = get_settings().database_url
        if not database_url:
            raise DatabaseUnavailable("Database URL is not configured")
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            with connection.transaction():
                connection.execute("SET TRANSACTION READ ONLY")
                _assume_runtime_role(connection)
                connection.execute("SELECT set_config('app.actor_id', %s, TRUE)", (actor_id,))
                connection.execute("SELECT set_config('app.request_id', %s, TRUE)", (request_id,))
                yield connection
    except DatabaseUnavailable:
        raise
    except (psycopg.Error, ValidationError, ValueError) as exc:
        if isinstance(exc, psycopg.Error) and exc.sqlstate and (
            exc.sqlstate.startswith("P10") or exc.sqlstate.startswith("23")
        ):
            raise DatabaseRuleError(exc.sqlstate, exc.diag.message_primary or "Database workflow rejected the request") from exc
        raise DatabaseUnavailable from exc
