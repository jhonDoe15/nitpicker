import asyncpg
import psycopg
from sqlalchemy import create_engine

STATEMENT_TIMEOUT = "-c statement_timeout=30000"


def open_connection(dsn):
    return psycopg.connect(dsn, options=STATEMENT_TIMEOUT)


async def open_pool(dsn):
    return await asyncpg.create_pool(dsn, min_size=1, max_size=10, command_timeout=30)


def open_engine():
    return create_engine(
        "postgresql+psycopg://db/shop",
        pool_pre_ping=True,
        connect_args={"options": STATEMENT_TIMEOUT},
    )
