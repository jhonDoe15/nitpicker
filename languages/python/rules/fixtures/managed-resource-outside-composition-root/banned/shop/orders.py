from sqlalchemy import create_engine, text


def count_orders():
    engine = create_engine("sqlite://")
    with engine.connect() as connection:
        return connection.execute(text("select 1")).scalar()
