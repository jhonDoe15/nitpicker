import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const SQL = 'sql-string-formatting';

describe.skipIf(!enabled)('sql-string-formatting: statements and query calls', () => {
  it('reads DDL and MERGE text as SQL', () => {
    const [actual, expected] = outcomes([
      [
        'TRUNCATE on asyncpg',
        'async def f(pool, table):\n    async with pool.acquire() as conn:\n        await conn.execute(f"TRUNCATE {table}")\n',
        [`${SQL}:3 conn.execute`],
      ],
      [
        'a lower-case DROP TABLE',
        'def f(cursor, table):\n    cursor.execute(f"drop table {table}")\n',
        [`${SQL}:2 cursor.execute`],
      ],
      [
        'ALTER, CREATE INDEX and MERGE',
        'def f(cursor, table, column):\n    cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")\n    cursor.execute(f"create unique index ix on {table} ({column})")\n    cursor.execute(f"merge into {table} t using s on t.id = s.id")\n',
        [`${SQL}:2 cursor.execute`, `${SQL}:3 cursor.execute`, `${SQL}:4 cursor.execute`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('matches query calls by name, like the TypeScript rule', () => {
    const [actual, expected] = outcomes([
      [
        'Spark, DuckDB and peewee',
        'import duckdb\n\n\ndef f(spark, db, day):\n    spark.sql(f"SELECT * FROM events WHERE day = \'{day}\'")\n    duckdb.sql(f"SELECT * FROM events WHERE day = \'{day}\'")\n    return db.execute_sql(f"SELECT * FROM events WHERE day = \'{day}\'")\n',
        [`${SQL}:5 spark.sql`, `${SQL}:6 duckdb.sql`, `${SQL}:7 db.execute_sql`],
      ],
      [
        'helpers, prepared statements and warehouse clients',
        'async def f(warehouse, conn, client, name):\n    warehouse.run_sql(f"SELECT * FROM t WHERE name = \'{name}\'")\n    await conn.prepare(f"SELECT * FROM t WHERE name = \'{name}\'")\n    client.query_df(f"SELECT * FROM t WHERE name = \'{name}\'")\n    return conn.execute_string(f"SELECT * FROM t WHERE name = \'{name}\'")\n',
        [
          `${SQL}:2 warehouse.run_sql`,
          `${SQL}:3 conn.prepare`,
          `${SQL}:4 client.query_df`,
          `${SQL}:5 conn.execute_string`,
        ],
      ],
      [
        'psycopg2 execute_values and mogrify with a formatted query',
        'from psycopg2.extras import execute_values\n\n\ndef f(cursor, table, rows, name):\n    execute_values(cursor, f"INSERT INTO {table} (a, b) VALUES %s", rows)\n    return cursor.mogrify(f"SELECT * FROM t WHERE name = \'{name}\'")\n',
        [`${SQL}:5 psycopg2.extras.execute_values`, `${SQL}:6 cursor.mogrify`],
      ],
      [
        'a redis command is not a query call',
        'def f(redis, key, value):\n    return redis.execute_command(f"SET {key} {value}")\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows aliases, getattr, partial and wrappers', () => {
    const [actual, expected] = outcomes([
      [
        'an import alias of pandas read_sql_query',
        'from pandas import read_sql_query as rsq\n\n\ndef f(conn, name):\n    return rsq(f"SELECT * FROM t WHERE name = \'{name}\'", conn)\n',
        [`${SQL}:5 pandas.read_sql_query`],
      ],
      [
        'a bound method, getattr and functools.partial',
        'import functools\n\n\ndef f(cursor, name):\n    run = cursor.execute\n    run(f"SELECT * FROM t WHERE name = \'{name}\'")\n\n\ndef g(cursor, name):\n    run = getattr(cursor, "execute")\n    run(f"SELECT * FROM t WHERE name = \'{name}\'")\n\n\ndef h(cursor, name):\n    run = functools.partial(cursor.execute)\n    run(f"SELECT * FROM t WHERE name = \'{name}\'")\n',
        [`${SQL}:6 cursor.execute`, `${SQL}:11 cursor.execute`, `${SQL}:16 cursor.execute`],
      ],
      [
        'a wrapper with a keyword-only query parameter',
        {
          files: {
            'kwwrap/db.py': 'def run_query(cursor, *, sql_text):\n    cursor.execute(sql_text)\n',
            'kwwrap/a.py':
              'from kwwrap.db import run_query\n\n\ndef f(cursor, name):\n    run_query(cursor, sql_text=f"SELECT * FROM t WHERE name = \'{name}\'")\n',
          },
        },
        [`${SQL}:5 kwwrap.db.run_query`],
      ],
      [
        'a method wrapper on an annotated or constructed project class',
        {
          files: {
            'methwrap/db.py':
              'class Database:\n    def __init__(self, cursor):\n        self.cursor = cursor\n\n    def run(self, statement):\n        self.cursor.execute(statement)\n',
            'methwrap/a.py':
              'from methwrap.db import Database\n\n\ndef f(db: Database, name):\n    db.run(f"SELECT * FROM t WHERE name = \'{name}\'")\n\n\ndef g(cursor, name):\n    Database(cursor).run(f"SELECT * FROM t WHERE name = \'{name}\'")\n',
          },
        },
        [`${SQL}:5 db.run`, `${SQL}:9 run`],
      ],
      [
        'a query built by a method of another class',
        {
          files: {
            'builder/queries.py':
              'class QueryBuilder:\n    def by_name(self, name):\n        return f"SELECT * FROM t WHERE name = \'{name}\'"\n',
            'builder/a.py':
              'from builder.queries import QueryBuilder\n\n\ndef f(cursor, name):\n    cursor.execute(QueryBuilder().by_name(name))\n',
          },
        },
        [`${SQL}:5 cursor.execute`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('sql-string-formatting: values the query is built from', () => {
  it('follows class attributes, self attributes and module attributes', () => {
    const [actual, expected] = outcomes([
      [
        'a class attribute template',
        'class Queries:\n    BY_NAME = "SELECT * FROM t WHERE name = \'{}\'"\n\n\ndef f(cursor, name):\n    cursor.execute(Queries.BY_NAME.format(name))\n',
        [`${SQL}:6 cursor.execute`],
      ],
      [
        'a query built in __init__ and run as self.query',
        'class Repo:\n    def __init__(self, cursor, table):\n        self.cursor = cursor\n        self.query = f"SELECT * FROM {table}"\n\n    def all(self):\n        self.cursor.execute(self.query)\n',
        [`${SQL}:7 self.cursor.execute`],
      ],
      [
        'a template read as a module attribute',
        {
          files: {
            'modattr/queries.py': 'BY_NAME = "SELECT * FROM t WHERE name = \'{name}\'"\n',
            'modattr/a.py':
              'from modattr import queries\n\n\ndef f(cursor, name):\n    cursor.execute(queries.BY_NAME.format(name=name))\n',
          },
        },
        [`${SQL}:5 cursor.execute`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows format_map, string.Template, text(text=...) and long concatenations', () => {
    const [actual, expected] = outcomes([
      [
        'format_map and Template.substitute',
        'from string import Template\n\n\ndef f(cursor, name):\n    cursor.execute("SELECT * FROM t WHERE name = \'{name}\'".format_map({"name": name}))\n    cursor.execute(Template("SELECT * FROM t WHERE name = \'$name\'").substitute(name=name))\n',
        [`${SQL}:5 cursor.execute`, `${SQL}:6 cursor.execute`],
      ],
      [
        'SQLAlchemy text with the keyword argument',
        'from sqlalchemy import text\n\n\ndef f(session, name):\n    return session.execute(text(text=f"SELECT * FROM t WHERE name = \'{name}\'"))\n',
        [`${SQL}:5 sqlalchemy.text`],
      ],
      [
        'a long lower-case concatenation',
        'def f(cursor, a, b, c, d, e, g):\n    cursor.execute(\n        "select * from users where a = \'" + a\n        + "\' and b = \'" + b\n        + "\' and c = \'" + c\n        + "\' and d = \'" + d\n        + "\' and e = \'" + e\n        + "\' and g = \'" + g + "\'"\n    )\n',
        [`${SQL}:2 cursor.execute`],
      ],
      [
        'a chain of nine names',
        'def f(cursor, a):\n    q0 = "select * from users where a = \'"\n    q1 = q0 + a\n    q2 = q1 + "\'"\n    q3 = q2 + " "\n    q4 = q3 + ""\n    q5 = q4 + ""\n    q6 = q5 + ""\n    q7 = q6 + ""\n    q8 = q7 + ""\n    cursor.execute(q8)\n',
        [`${SQL}:11 cursor.execute`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('counts a union type as safe only when every member is safe', () => {
    const [actual, expected] = outcomes([
      [
        'int | str, Union and Annotated[str, ...]',
        'from typing import Annotated, Literal, Optional, Union\n\n\ndef f(cursor, a: int | str, b: Union[int, str], c: Annotated[str, Literal["x"]], d: Literal["x"] | str):\n    cursor.execute(f"SELECT * FROM t WHERE a = {a}")\n    cursor.execute(f"SELECT * FROM t WHERE b = {b}")\n    cursor.execute(f"SELECT * FROM t ORDER BY {c}")\n    cursor.execute(f"SELECT * FROM t ORDER BY {d}")\n',
        [
          `${SQL}:5 cursor.execute`,
          `${SQL}:6 cursor.execute`,
          `${SQL}:7 cursor.execute`,
          `${SQL}:8 cursor.execute`,
        ],
      ],
      [
        'int | None, Optional[int] and Annotated[int, ...]',
        'from typing import Annotated, Optional\n\n\ndef f(cursor, a: int | None, b: Optional[int], c: Annotated[int, "id"]):\n    cursor.execute(f"SELECT * FROM t WHERE a = {a} AND b = {b} AND c = {c}")\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports a raw builder called with keywords inside format instead of crashing', () => {
    const [actual, expected] = outcomes([
      [
        'sql.SQL(string=...) inside format',
        'from psycopg2 import sql\n\n\ndef f(cursor, col):\n    cursor.execute(sql.SQL("SELECT {} FROM t").format(sql.SQL(string=col)))\n',
        [`${SQL}:5 psycopg2.sql.SQL`],
      ],
      [
        'a builder with no argument inside format',
        'from psycopg2 import sql\n\n\ndef f(cursor):\n    cursor.execute(sql.SQL("SELECT {} FROM t").format(sql.SQL()))\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
