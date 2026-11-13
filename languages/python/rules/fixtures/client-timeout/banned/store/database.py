import asyncpg
import psycopg
from sqlalchemy import create_engine


def open_connection(dsn):
    return psycopg.connect(dsn)


async def open_pool(dsn):
    return await asyncpg.create_pool(dsn, min_size=1, max_size=10)


def open_engine():
    return create_engine("postgresql+psycopg://db/shop", pool_pre_ping=True)
