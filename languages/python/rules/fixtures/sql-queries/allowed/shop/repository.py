from enum import StrEnum
from typing import Literal

from psycopg import sql
from sqlalchemy import text

from shop.sql_parts import placeholders

SORT_COLUMNS = {"name": "name", "newest": "created_at"}
TABLES = ("users", "orders")


class Direction(StrEnum):
    ASC = "asc"
    DESC = "desc"


def by_ids(cursor: object, ids: list[int]) -> None:
    cursor.execute(f"SELECT * FROM users WHERE id IN ({placeholders(len(ids))})", ids)
    marks = ", ".join("%s" for _ in ids)
    cursor.execute("DELETE FROM carts WHERE user_id IN (%s)" % marks, ids)


def sorted_users(cursor: object, key: str, direction: Direction) -> None:
    column = SORT_COLUMNS.get(key, "name")
    cursor.execute(f"SELECT * FROM users ORDER BY {column} {direction.value}")


def ranked(cursor: object, order: Literal["asc", "desc"]) -> None:
    cursor.execute(f"SELECT * FROM scores ORDER BY points {order}")


def find(session: object, name: str | None, age: int | None) -> object:
    conditions: list[str] = []
    params: dict[str, object] = {}
    if name:
        conditions.append("name = :name")
        params["name"] = name
    if age:
        conditions.append("age = :age")
        params["age"] = age
    statement = "SELECT * FROM people"
    if conditions:
        statement += " WHERE " + " AND ".join(conditions)
    return session.execute(text(statement), params)


def lock_tables(cursor: object) -> None:
    statements = [f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY" for table in TABLES]
    cursor.executescript("; ".join(statements))


def table_rows(cursor: object, table: str, owner: int) -> None:
    query = sql.SQL("SELECT * FROM {} WHERE owner = %s").format(sql.Identifier(table))
    cursor.execute(query, (owner,))


def page(cursor: object, limit: int) -> None:
    cursor.execute(f"SELECT * FROM events LIMIT {int(limit)}")


def reject(name: str) -> None:
    message = f"Select a column from the list, not {name}"
    raise ValueError(message)
