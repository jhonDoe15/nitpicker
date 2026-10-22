import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const SQL = 'sql-string-formatting';

describe.skipIf(!enabled)('sql-string-formatting', () => {
  it('flags a formatted query that reaches an execute call', () => {
    const [actual, expected] = outcomes([
      [
        'an f-string',
        'def f(cursor, table):\n    cursor.execute(f"SELECT * FROM {table}")\n',
        ['sql-string-formatting:2 cursor.execute'],
      ],
      [
        'concatenation',
        'def f(cursor, ident):\n    cursor.execute("SELECT * FROM users WHERE id = " + ident)\n',
        ['sql-string-formatting:2 cursor.execute'],
      ],
      [
        'percent formatting',
        'def f(cursor, ident):\n    cursor.execute("SELECT * FROM users WHERE id = %s" % ident)\n',
        ['sql-string-formatting:2 cursor.execute'],
      ],
      [
        'format',
        'def f(cursor, ident):\n    cursor.execute("DELETE FROM users WHERE id = {}".format(ident))\n',
        ['sql-string-formatting:2 cursor.execute'],
      ],
      [
        'a name bound to the query',
        'def f(cursor, ident):\n    query = f"UPDATE users SET name = {ident} WHERE 1"\n    cursor.execute(query)\n',
        ['sql-string-formatting:3 cursor.execute'],
      ],
      [
        'SQLAlchemy text',
        'from sqlalchemy import text\n\n\ndef f(session, ident):\n    session.execute(text(f"SELECT * FROM users WHERE id = {ident}"))\n',
        ['sql-string-formatting:5 sqlalchemy.text'],
      ],
      [
        'a Django raw query',
        'def f(model, ident):\n    return model.objects.raw("SELECT * FROM t WHERE id = %s" % ident)\n',
        ['sql-string-formatting:2 model.objects.raw'],
      ],
      [
        'parameters',
        'def f(cursor, ident):\n    cursor.execute("SELECT * FROM users WHERE id = %s", (ident,))\n',
        [],
      ],
      ['a fixed query', 'def f(cursor):\n    cursor.execute("SELECT * FROM users")\n', []],
      [
        'prose that mentions select and from',
        'def f(choices, name):\n    raise ValueError(f"Please select one option from {choices}, not {name}")\n',
        [],
      ],
      [
        'prose bound to a name that is not executed',
        'def f(name):\n    message = f"Update the settings to set {name} as default"\n    return message\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('sql-string-formatting: fragments, builders and helpers', () => {
  it('flags clause fragments built into a query, and the raw builders of query libraries', () => {
    const [actual, expected] = outcomes([
      [
        'a WHERE fragment joined into the query',
        'def f(cursor, ident):\n    clause = "WHERE id = " + ident\n    cursor.execute("SELECT * FROM t " + clause)\n',
        [`${SQL}:3 cursor.execute`],
      ],
      [
        'an ORDER BY fragment in an f-string',
        'def f(cursor, column):\n    order = f"ORDER BY {column}"\n    cursor.execute("SELECT * FROM t " + order)\n',
        [`${SQL}:3 cursor.execute`],
      ],
      [
        'a fragment added with +=',
        'def f(cursor, name):\n    q = "SELECT * FROM t"\n    q += " AND name = \'%s\'" % name\n    cursor.execute(q)\n',
        [`${SQL}:4 cursor.execute`],
      ],
      [
        'a format into a clause',
        'def f(cursor, n):\n    cursor.execute("SELECT * FROM t LIMIT {}".format(n))\n',
        [`${SQL}:2 cursor.execute`],
      ],
      [
        'conditions built from the keys of the input',
        'def f(cursor, filters):\n    where = [f"{k} = %s" for k in filters]\n    cursor.execute("SELECT * FROM t WHERE " + " AND ".join(where), list(filters.values()))\n',
        [`${SQL}:3 cursor.execute`],
      ],
      [
        'SQLAlchemy text through an alias',
        'import sqlalchemy as sa\n\n\ndef f(session, name):\n    return session.execute(sa.text(f"name = \'{name}\'"))\n',
        [`${SQL}:5 sqlalchemy.text`],
      ],
      [
        'SQLAlchemy literal_column and a where clause',
        'from sqlalchemy import literal_column, select, text\n\n\ndef f(table, column, name):\n    select(literal_column(f"{column} + 1"))\n    return select(table).where(text(f"name = \'{name}\'"))\n',
        [`${SQL}:5 sqlalchemy.literal_column`, `${SQL}:6 sqlalchemy.text`],
      ],
      [
        'peewee SQL',
        'from peewee import SQL\n\n\ndef f(query, column):\n    return query.order_by(SQL(f"{column} DESC"))\n',
        [`${SQL}:5 peewee.SQL`],
      ],
      [
        'psycopg sql.SQL with a formatted string or a raw part',
        'from psycopg import sql\n\n\ndef f(cursor, table):\n    cursor.execute(sql.SQL(f"SELECT * FROM {table}"))\n    cursor.execute(sql.SQL("SELECT * FROM {}").format(sql.SQL(table)))\n',
        [`${SQL}:5 psycopg.sql.SQL`, `${SQL}:6 psycopg.sql.SQL`],
      ],
      [
        'asyncpg fetch and SQLAlchemy exec_driver_sql',
        'async def f(conn, engine, name):\n    await conn.fetch(f"SELECT * FROM t WHERE name = \'{name}\'")\n    engine.exec_driver_sql(f"DELETE FROM t WHERE name = \'{name}\'")\n',
        [`${SQL}:2 conn.fetch`, `${SQL}:3 engine.exec_driver_sql`],
      ],
      [
        'a helper in another module that builds the clause',
        {
          files: {
            'shop/clauses.py': 'def where_id(ident):\n    return f"WHERE id = {ident}"\n',
            'shop/repo.py':
              'from shop.clauses import where_id\n\n\ndef f(cursor, ident):\n    cursor.execute("SELECT * FROM t " + where_id(ident))\n',
          },
        },
        [`${SQL}:5 cursor.execute`],
      ],
      [
        'a wrapper in another module that runs the query',
        {
          files: {
            'shop/db.py': 'def run(statement):\n    return CONNECTION.execute(statement)\n',
            'shop/repo.py':
              'from shop import db\n\n\ndef f(name):\n    return db.run(f"SELECT * FROM t WHERE name = \'{name}\'")\n',
          },
        },
        [`${SQL}:5 shop.db.run`],
      ],
      [
        'a method that wraps the cursor',
        'class Repo:\n    def run(self, statement):\n        return self.cursor.execute(statement)\n\n    def find(self, name):\n        return self.run(f"SELECT * FROM t WHERE name = \'{name}\'")\n',
        [`${SQL}:6 self.run`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes parameters, placeholder lists and fixed names', () => {
    const [actual, expected] = outcomes([
      [
        'a placeholder list',
        'def f(cursor, ids):\n    marks = ", ".join(["%s"] * len(ids))\n    cursor.execute(f"SELECT * FROM t WHERE id IN ({marks})", ids)\n',
        [],
      ],
      [
        'placeholders from a generator, a string and a percent format',
        'def f(cursor, ids):\n    cursor.execute("SELECT * FROM t WHERE id IN (%s)" % ",".join("?" for _ in ids), ids)\n    cursor.execute(f"DELETE FROM t WHERE id IN ({\',\'.join(\'?\' * len(ids))})", ids)\n',
        [],
      ],
      [
        'rows of placeholders',
        'def f(cursor, rows):\n    values = ", ".join("(%s, %s)" for _ in rows)\n    cursor.execute(f"INSERT INTO t (a, b) VALUES {values}", [v for row in rows for v in row])\n',
        [],
      ],
      [
        'optional filters appended as placeholders',
        'def f(cursor, name, age):\n    conditions = []\n    params = []\n    if name:\n        conditions.append("name = %s")\n        params.append(name)\n    if age:\n        conditions.append("age = %s")\n        params.append(age)\n    sql = "SELECT * FROM t"\n    if conditions:\n        sql += " WHERE " + " AND ".join(conditions)\n    cursor.execute(sql, params)\n',
        [],
      ],
      [
        'a placeholder helper in another module',
        {
          files: {
            'shop/marks.py': 'def marks(count):\n    return ", ".join(["%s"] * count)\n',
            'shop/repo.py':
              'from shop.marks import marks\n\n\ndef f(cursor, ids):\n    cursor.execute(f"SELECT * FROM t WHERE id IN ({marks(len(ids))})", ids)\n',
          },
        },
        [],
      ],
      [
        'a column from a constant lookup',
        'COLUMNS = {"name": "name", "newest": "created_at"}\n\n\ndef f(cursor, key):\n    cursor.execute(f"SELECT * FROM t ORDER BY {COLUMNS[key]}")\n    cursor.execute(f"SELECT * FROM t ORDER BY {COLUMNS.get(key, \'name\')}")\n',
        [],
      ],
      [
        'a Literal and an Enum',
        'from enum import StrEnum\nfrom typing import Literal\n\n\nclass Sort(StrEnum):\n    NAME = "name"\n\n\ndef f(cursor, sort: Sort, order: Literal["asc", "desc"]):\n    cursor.execute(f"SELECT * FROM t ORDER BY {sort} {order}, {Sort.NAME.value}")\n',
        [],
      ],
      [
        'a table from a constant tuple, a model table and a number',
        'TABLES = ("users", "orders")\n\n\ndef f(cursor, model, limit):\n    statements = [f"VACUUM {table}" for table in TABLES]\n    cursor.executescript("; ".join(statements))\n    cursor.execute(f"SELECT * FROM {model._meta.db_table} LIMIT {int(limit)}")\n',
        [],
      ],
      [
        'psycopg sql.Identifier and sql.Literal',
        'from psycopg import sql\n\n\ndef f(cursor, table, value):\n    cursor.execute(sql.SQL("SELECT * FROM {} WHERE a = {}").format(sql.Identifier(table), sql.Literal(value)))\n',
        [],
      ],
      [
        'SQLAlchemy text with bound parameters',
        'from sqlalchemy import text\n\n\ndef f(session, name):\n    return session.execute(text("SELECT * FROM t WHERE name = :name"), {"name": name})\n',
        [],
      ],
      [
        'log and exception text with SQL words',
        'def f(logger, table, name):\n    logger.info(f"SELECT from {table} failed WHERE name = {name}")\n    raise ValueError(f"Update the order by {name} and set it again")\n',
        [],
      ],
      [
        'a text that is not SQL passed to an execute method',
        'def f(executor, job):\n    executor.execute(f"job {job} started")\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
