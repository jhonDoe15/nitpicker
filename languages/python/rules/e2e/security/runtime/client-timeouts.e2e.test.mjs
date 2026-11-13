import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const RULE = 'client-without-timeout';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(RULE))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('client-without-timeout', () => {
  it('reports PostgreSQL drivers and pools built without a statement timeout', () => {
    const [actual, expected] = outcomes([
      [
        'psycopg, psycopg2 and their pools',
        'import os\n\nimport psycopg\nimport psycopg2\nfrom psycopg2 import pool\nfrom psycopg_pool import ConnectionPool\n\nDSN = os.environ["DSN"]\n\n\ndef open_all():\n    psycopg.connect(DSN)\n    psycopg2.connect(dsn=DSN)\n    pool.ThreadedConnectionPool(1, 10, DSN)\n    return ConnectionPool(DSN, kwargs={"autocommit": True})\n',
        [
          `${RULE}:12 psycopg.connect`,
          `${RULE}:13 psycopg2.connect`,
          `${RULE}:14 psycopg2.pool.ThreadedConnectionPool`,
          `${RULE}:15 psycopg_pool.ConnectionPool`,
        ],
      ],
      [
        'asyncpg and SQLAlchemy on a PostgreSQL URL',
        'import asyncpg\nfrom sqlalchemy import URL, create_engine\nfrom sqlalchemy.ext.asyncio import create_async_engine\n\n\nasync def open_all(dsn):\n    await asyncpg.create_pool(dsn, min_size=1)\n    create_engine("postgresql+psycopg://db/app")\n    create_async_engine("postgresql+asyncpg://db/app", connect_args={"ssl": True})\n    return create_engine(URL.create("postgresql+psycopg", host="db"))\n',
        [
          `${RULE}:7 asyncpg.create_pool`,
          `${RULE}:8 sqlalchemy.create_engine`,
          `${RULE}:9 sqlalchemy.ext.asyncio.create_async_engine`,
          `${RULE}:10 sqlalchemy.create_engine`,
        ],
      ],
      [
        'a Django PostgreSQL database without OPTIONS',
        'DATABASES = {\n    "default": {\n        "ENGINE": "django.db.backends.postgresql",\n        "NAME": "app",\n    },\n    "cache": {"ENGINE": "django.db.backends.sqlite3", "NAME": "cache.db"},\n}\n',
        [`${RULE}:3 DATABASES['default']`],
      ],
      [
        'a zero timeout, asyncpg keys on psycopg, an annotated and a PostGIS Django database',
        'import psycopg\n\n\ndef open_all(dsn):\n    psycopg.connect(dsn, options="-c statement_timeout=0")\n    return psycopg.connect(dsn, command_timeout=30)\n\n\nDATABASES: dict = {\n    "default": {"ENGINE": "django.contrib.gis.db.backends.postgis", "NAME": "geo"},\n}\n',
        [
          `${RULE}:5 psycopg.connect`,
          `${RULE}:6 psycopg.connect`,
          `${RULE}:10 DATABASES['default']`,
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes a statement timeout set once for the connection, and options it cannot read', () => {
    const [actual, expected] = outcomes([
      [
        'options, command_timeout, server_settings and a DSN that carries it',
        'import asyncpg\nimport psycopg\nfrom psycopg_pool import ConnectionPool\nfrom sqlalchemy import create_engine\n\nTIMEOUT = "-c statement_timeout=30000"\n\n\nasync def open_all(dsn, **extra):\n    psycopg.connect(dsn, options=TIMEOUT)\n    psycopg.connect("postgresql://db/app?options=-c%20statement_timeout%3D30000")\n    ConnectionPool(dsn, kwargs={"options": TIMEOUT})\n    await asyncpg.create_pool(dsn, command_timeout=30)\n    await asyncpg.connect(dsn, server_settings={"statement_timeout": "30000"})\n    create_engine("postgresql+psycopg://db/app", connect_args={"options": TIMEOUT})\n    psycopg.connect(dsn, **extra)\n    create_engine(dsn)\n    return create_engine("sqlite:///app.db")\n',
        [],
      ],
      [
        'a Django database with a statement timeout in OPTIONS',
        'DATABASES = {\n    "default": {\n        "ENGINE": "django.db.backends.postgresql",\n        "OPTIONS": {"options": "-c statement_timeout=30000"},\n    }\n}\n',
        [],
      ],
      [
        'connection hooks and OPTIONS set after the DATABASES literal',
        'import asyncpg\nfrom psycopg_pool import ConnectionPool\nfrom sqlalchemy import create_engine, event\n\n\nasync def open_all(dsn, setup, configure):\n    await asyncpg.create_pool(dsn, setup=setup)\n    ConnectionPool(dsn, configure=configure)\n    engine = create_engine("postgresql+psycopg://db/app")\n    event.listen(engine, "connect", configure)\n    return engine\n\n\nDATABASES = {"default": {"ENGINE": "django.db.backends.postgresql"}}\nDATABASES["default"]["OPTIONS"] = {"options": "-c statement_timeout=30000"}\n',
        [],
      ],
      [
        'a command_timeout of None',
        'import asyncpg\n\n\nasync def open_pool(dsn):\n    return await asyncpg.create_pool(dsn, command_timeout=None)\n',
        [`${RULE}:5 asyncpg.create_pool`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
