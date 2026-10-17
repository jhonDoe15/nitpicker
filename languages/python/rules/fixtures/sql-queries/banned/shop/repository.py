import sqlalchemy as sa
from psycopg import sql
from sqlalchemy import literal_column as raw_column

from shop.db import run
from shop.filters import order_clause


def by_name(cursor, name):
    clause = "WHERE name = '" + name + "'"
    cursor.execute("SELECT * FROM users " + clause)


def sorted_users(cursor, column):
    cursor.execute("SELECT * FROM users " + order_clause(column))


def search(term):
    return run(f"SELECT * FROM products WHERE title LIKE '%{term}%'")


def filtered(session, filters):
    conditions = [f"{key} = '{value}'" for key, value in filters.items()]
    query = "SELECT * FROM orders WHERE " + " AND ".join(conditions)
    return session.execute(sa.text(query))


def score(column):
    return raw_column(f"{column} * 2")


def table_rows(cursor, table):
    cursor.execute(sql.SQL("SELECT * FROM {}").format(sql.SQL(table)))


def page(cursor, limit):
    statement = "SELECT * FROM events"
    statement += " LIMIT %s" % limit
    cursor.execute(statement)
