from sqlalchemy import text
from sqlalchemy.engine import Engine


def count_orders(engine: Engine):
    with engine.connect() as connection:
        return connection.execute(text("select 1")).scalar()


def probe(url):
    import httpx

    with httpx.Client() as client:
        return client.get(url)
