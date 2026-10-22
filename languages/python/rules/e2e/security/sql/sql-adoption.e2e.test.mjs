import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const SQL = 'sql-string-formatting';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(SQL))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('sql-string-formatting: names from the schema', () => {
  it('passes table names held by the class', () => {
    const [actual, expected] = outcomes([
      [
        'self.table, cls.TABLE, type(self).table and an __init__ constant',
        'class Repo:\n    table = "users"\n    TABLE = "users"\n\n    def __init__(self, cur):\n        self.cur = cur\n        self.schema = "public"\n\n    def all(self):\n        self.cur.execute(f"SELECT * FROM {self.schema}.{self.table}")\n        self.cur.execute(f"SELECT * FROM {type(self).table}")\n\n    @classmethod\n    def count(cls, cur):\n        cur.execute(f"SELECT count(*) FROM {cls.TABLE}")\n\n\nclass AppUsers(Repo):\n    table = "app_users"\n',
        [],
      ],
      [
        'a subclass that sets the table from a parameter',
        'class Repo:\n    table = "users"\n\n    def all(self, cur):\n        cur.execute(f"SELECT * FROM {self.table}")\n\n\nclass Dynamic(Repo):\n    def __init__(self, table):\n        self.table = table\n',
        [`${SQL}:5 cur.execute`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes SQLAlchemy metadata and Django _meta columns', () => {
    const [actual, expected] = outcomes([
      [
        'SQLAlchemy Table, columns, sorted_tables and inspect',
        'from sqlalchemy import Column, Integer, MetaData, String, Table, inspect, text\n\nmetadata = MetaData()\nusers = Table("users", metadata, Column("id", Integer), Column("name", String))\n\n\ndef f(conn, session, Base, Model, uid):\n    conn.execute(text(f"SELECT * FROM {users.name} WHERE id = :id"), {"id": uid})\n    conn.execute(text(f"SELECT {users.c.name.name} FROM {users.fullname}"))\n    cols = ", ".join(c.name for c in users.columns)\n    conn.execute(text(f"SELECT {cols} FROM users"))\n    for table in reversed(Base.metadata.sorted_tables):\n        session.execute(text(f"DELETE FROM {table.name}"))\n    for name in Base.metadata.tables:\n        session.execute(text(f"TRUNCATE {name}"))\n    names = ", ".join(c.key for c in inspect(Model).columns)\n    session.execute(text(f"SELECT {names}, {Model.__table__.c.email.name} FROM t"))\n',
        [],
      ],
      [
        'Django get_field and concrete_fields',
        'def f(cur, model):\n    column = model._meta.get_field("name").column\n    cur.execute(f"SELECT {column} FROM {model._meta.db_table}")\n    cols = ", ".join(f.column for f in model._meta.concrete_fields)\n    cur.execute(f"SELECT {cols} FROM {model._meta.db_table}")\n',
        [],
      ],
      [
        'a Table named from a parameter',
        'from sqlalchemy import MetaData, Table, text\n\n\ndef f(conn, name):\n    events = Table(name, MetaData())\n    conn.execute(text(f"SELECT * FROM {events.name}"))\n',
        [`${SQL}:6 sqlalchemy.text`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('sql-string-formatting: checked and constant names', () => {
  it('passes a name checked against a constant allowlist', () => {
    const [actual, expected] = outcomes([
      [
        'a guard that raises or returns',
        'ALLOWED = {"name", "created_at"}\nORDER = ("asc", "desc")\n\n\ndef f(cur, column, order):\n    if column not in ALLOWED:\n        raise ValueError(column)\n    if order not in ORDER:\n        return None\n    cur.execute(f"SELECT * FROM users ORDER BY {column} {order}")\n',
        [],
      ],
      [
        'an if block and a comprehension filter',
        'ALLOWED = frozenset({"name", "email"})\n\n\ndef f(cur, column, values):\n    if column in ALLOWED:\n        cur.execute(f"SELECT {column} FROM users")\n    sets = ", ".join(f"{k} = %s" for k in values if k in ALLOWED)\n    cur.execute(f"UPDATE users SET {sets}", list(values.values()))\n',
        [],
      ],
      [
        'a guard that does not stop, or checks another collection',
        'ALLOWED = {"name"}\n\n\ndef f(cur, column, allowed):\n    if column not in ALLOWED:\n        print(column)\n    cur.execute(f"SELECT * FROM users ORDER BY {column}")\n    if column in allowed:\n        cur.execute(f"SELECT {column} FROM users")\n',
        [`${SQL}:7 cur.execute`, `${SQL}:9 cur.execute`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes constant dicts, numbered placeholders, quoting, typed fields and mogrify rows', () => {
    const [actual, expected] = outcomes([
      [
        'iterating a dict of constant keys',
        'COLUMNS = {"name": "name", "email": "email"}\nTYPES = {"a": int, "b": str}\n\n\ndef f(cur, row):\n    sets = ", ".join(f"{c} = %({c})s" for c in COLUMNS)\n    cur.execute(f"UPDATE users SET {sets} WHERE id = %(id)s", row)\n    cur.execute(f"SELECT {\', \'.join(sorted(COLUMNS))} FROM t")\n    cur.execute(f"SELECT {\', \'.join(TYPES)} FROM t")\n    for key, value in COLUMNS.items():\n        cur.execute(f"SELECT {key}, {value} FROM t")\n',
        [],
      ],
      [
        'enumerate-numbered asyncpg placeholders',
        'async def f(conn, values):\n    marks = ", ".join(f"${n}" for n, _ in enumerate(values, start=1))\n    return await conn.fetch(f"SELECT * FROM users WHERE id IN ({marks})", *values)\n',
        [],
      ],
      [
        'SQLAlchemy identifier_preparer quoting',
        'from sqlalchemy import text\n\n\ndef f(conn, engine, name):\n    q = engine.dialect.identifier_preparer.quote(name)\n    conn.execute(text(f"SELECT * FROM {q}"))\n',
        [],
      ],
      [
        'int fields of a pydantic model and a frozen dataclass',
        'from dataclasses import dataclass\n\nfrom pydantic import BaseModel\n\n\nclass Page(BaseModel):\n    size: int\n    offset: int\n\n\n@dataclass(frozen=True)\nclass Window:\n    days: int\n    label: str\n\n\ndef paged(cur, page: Page, window: Window):\n    cur.execute(f"SELECT * FROM users LIMIT {page.size} OFFSET {page.offset}")\n    cur.execute(f"SELECT * FROM t WHERE age < {window.days}")\n    cur.execute(f"SELECT * FROM t WHERE label = \'{window.label}\'")\n',
        [`${SQL}:20 cur.execute`],
      ],
      [
        'psycopg2 mogrify rows',
        'def f(cur, rows):\n    args = ",".join(cur.mogrify("(%s,%s)", r).decode() for r in rows)\n    cur.execute("INSERT INTO t (a, b) VALUES " + args)\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads only SQL-shaped text as SQL', () => {
    const [actual, expected] = outcomes([
      [
        'a search query with AND',
        'def f(client, term):\n    client.query(f"name:{term} AND status:open")\n    return client.query(f"title:{term} OR body:{term} IN inbox ON mobile")\n',
        [],
      ],
      [
        'a clause fragment with a comparison',
        'def f(client, name):\n    return client.query(f"where name = \'{name}\'")\n',
        [`${SQL}:2 client.query`],
      ],
      [
        'a URL with limit and offset',
        'def f(client, limit, offset):\n    return client.fetch(f"/items?limit={limit}&offset={offset}&order=desc")\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
