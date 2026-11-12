import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const ORM_RULES = ['orm-schema-sync', 'orm-query-logging'];
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

function ormOnly([actual, expected]) {
  const kept = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [
      name,
      found.filter((entry) => ORM_RULES.some((rule) => entry.startsWith(`${rule}:`))),
    ]),
  );
  return [kept, expected];
}

describe.skipIf(!enabled)('orm-schema-sync', () => {
  it('flags schema changes the ORM makes when the application starts', () => {
    const [actual, expected] = ormOnly(
      outcomes([
        [
          'SQLAlchemy create_all in a startup function',
          'from sqlalchemy import create_engine\n\nfrom app.models import Base\n\n\ndef start(url: str) -> None:\n    engine = create_engine(url)\n    Base.metadata.create_all(engine)\n',
          ['orm-schema-sync:8 Base.metadata.create_all'],
        ],
        [
          'async run_sync and drop_all',
          'from app.models import Base\n\n\nasync def start(engine) -> None:\n    async with engine.begin() as conn:\n        await conn.run_sync(Base.metadata.drop_all)\n        await conn.run_sync(Base.metadata.create_all)\n',
          [
            'orm-schema-sync:6 Base.metadata.drop_all',
            'orm-schema-sync:7 Base.metadata.create_all',
          ],
        ],
        [
          'SQLModel and an environment guard',
          'import os\n\nfrom sqlmodel import SQLModel\n\n\ndef start(engine) -> None:\n    if os.environ.get("ENV") != "production":\n        SQLModel.metadata.create_all(engine)\n',
          ['orm-schema-sync:8 SQLModel.metadata.create_all'],
        ],
        [
          'Flask-SQLAlchemy db.create_all in an app factory',
          {
            files: {
              'app/extensions.py': 'from flask_sqlalchemy import SQLAlchemy\n\ndb = SQLAlchemy()\n',
              'app/factory.py':
                'from flask import Flask\n\nfrom app.extensions import db\n\n\ndef create_app() -> Flask:\n    app = Flask(__name__)\n    db.init_app(app)\n    with app.app_context():\n        db.create_all()\n    return app\n',
            },
          },
          ['orm-schema-sync:10 db.create_all'],
        ],
        [
          'a plain metadata object',
          'from sqlalchemy import MetaData\n\nmetadata = MetaData()\n\n\ndef start(engine) -> None:\n    metadata.create_all(engine)\n',
          ['orm-schema-sync:7 metadata.create_all'],
        ],
        [
          'Tortoise generate_schemas',
          'from fastapi import FastAPI\nfrom tortoise import Tortoise\nfrom tortoise.contrib.fastapi import register_tortoise\n\napp = FastAPI()\nregister_tortoise(app, db_url="sqlite://db", modules={}, generate_schemas=True)\n\n\nasync def start() -> None:\n    await Tortoise.generate_schemas()\n',
          ['orm-schema-sync:6 register_tortoise', 'orm-schema-sync:10 Tortoise.generate_schemas'],
        ],
        [
          'Peewee create_tables',
          'from peewee import SqliteDatabase\n\nfrom app.models import User\n\n\ndef start(db: SqliteDatabase) -> None:\n    db.create_tables([User])\n',
          ['orm-schema-sync:7 db.create_tables'],
        ],
        [
          'Pony generate_mapping with create_tables',
          'from pony.orm import Database\n\n\ndef start(db: Database) -> None:\n    db.generate_mapping(create_tables=True)\n',
          ['orm-schema-sync:5 db.generate_mapping'],
        ],
      ]),
    );

    expect(actual).toEqual(expected);
  });

  it('leaves migrations, tests and look-alikes alone', () => {
    const [actual, expected] = ormOnly(
      outcomes([
        [
          'Alembic upgrade',
          'from alembic import command\nfrom alembic.config import Config\n\n\ndef migrate() -> None:\n    command.upgrade(Config("alembic.ini"), "head")\n',
          [],
        ],
        [
          'a test fixture',
          {
            file: 'tests/test_users.py',
            code: 'from app.models import Base\n\n\ndef test_users(engine) -> None:\n    Base.metadata.create_all(engine)\n    assert engine\n',
          },
          [],
        ],
        [
          'Pony and Tortoise without schema generation',
          'from tortoise.contrib.fastapi import register_tortoise\n\n\ndef start(app, db) -> None:\n    register_tortoise(app, db_url="sqlite://db", modules={}, generate_schemas=False)\n    db.generate_mapping(create_tables=False)\n',
          [],
        ],
        [
          'create_tables without peewee, create_all on a db without Flask-SQLAlchemy',
          'def start(store, db) -> None:\n    store.create_tables(["a"])\n    db.create_all()\n',
          [],
        ],
        [
          'an Alembic migration',
          'from alembic import op\n\nfrom app.models import Base\n\n\ndef upgrade() -> None:\n    Base.metadata.create_all(bind=op.get_bind())\n',
          [],
        ],
        [
          'a CLI command and a script entry point',
          'import click\n\nfrom app.models import Base\n\n\n@click.command()\ndef init_db(engine) -> None:\n    Base.metadata.create_all(engine)\n\n\ndef main(engine) -> None:\n    pass\n\n\nif __name__ == "__main__":\n    Base.metadata.drop_all(None)\n',
          [],
        ],
      ]),
    );

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('orm-query-logging', () => {
  it('flags ORM settings that log every query', () => {
    const [actual, expected] = ormOnly(
      outcomes([
        [
          'create_engine echo',
          'from sqlalchemy import create_engine\n\n\ndef engine(url: str):\n    return create_engine(url, echo=True)\n',
          ['orm-query-logging:5 create_engine(echo=...)'],
        ],
        [
          'async engine echo debug and an environment check',
          'import os\n\nfrom sqlalchemy.ext.asyncio import create_async_engine\n\n\ndef engine(url: str):\n    first = create_async_engine(url, echo="debug")\n    return first, create_async_engine(url, echo=os.environ.get("ENV") != "production")\n',
          [
            'orm-query-logging:7 create_async_engine(echo=...)',
            'orm-query-logging:8 create_async_engine(echo=...)',
          ],
        ],
        [
          'SQLModel engine',
          'from sqlmodel import create_engine\n\n\ndef engine(url: str):\n    return create_engine(url, echo=True)\n',
          ['orm-query-logging:5 create_engine(echo=...)'],
        ],
        [
          'Flask-SQLAlchemy settings',
          'class Config:\n    SQLALCHEMY_ECHO = True\n\n\ndef configure(app) -> None:\n    app.config["SQLALCHEMY_ECHO"] = True\n    app.config.update(SQLALCHEMY_ECHO=True)\n',
          [
            'orm-query-logging:2 SQLALCHEMY_ECHO',
            'orm-query-logging:6 SQLALCHEMY_ECHO',
            'orm-query-logging:7 SQLALCHEMY_ECHO',
          ],
        ],
        [
          'query loggers set to log statements',
          'import logging\nfrom logging import DEBUG\n\n\ndef configure() -> None:\n    logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)\n    logging.getLogger("peewee").setLevel("DEBUG")\n    logging.getLogger("sqlalchemy").setLevel(DEBUG)\n',
          [
            'orm-query-logging:6 sqlalchemy.engine logger',
            'orm-query-logging:7 peewee logger',
            'orm-query-logging:8 sqlalchemy logger',
          ],
        ],
        [
          'a Django LOGGING setting',
          'DEBUG = False\nLOGGING = {\n    "version": 1,\n    "loggers": {"django.db.backends": {"level": "DEBUG" if DEBUG else "INFO"}},\n}\n',
          ['orm-query-logging:4 django.db.backends logger'],
        ],
      ]),
    );

    expect(actual).toEqual(expected);
  });

  it('leaves quiet engines, warning levels and tests alone', () => {
    const [actual, expected] = ormOnly(
      outcomes([
        [
          'echo off and pool logging',
          'from sqlalchemy import create_engine\n\n\ndef engine(url: str):\n    return create_engine(url, echo=False, pool_pre_ping=True)\n',
          [],
        ],
        [
          'loggers at warning, or unrelated loggers at debug',
          'import logging\n\n\ndef configure() -> None:\n    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)\n    logging.getLogger("django.db.backends").setLevel(logging.INFO)\n    logging.getLogger("app").setLevel(logging.DEBUG)\n',
          [],
        ],
        [
          'a test engine',
          {
            file: 'tests/conftest.py',
            code: 'from sqlalchemy import create_engine\n\nENGINE = create_engine("sqlite://", echo=True)\n',
          },
          [],
        ],
        [
          'echo on a non-SQLAlchemy call',
          'def run(shell) -> None:\n    shell.create_engine("x", echo=True)\n',
          [],
        ],
      ]),
    );

    expect(actual).toEqual(expected);
  });
});
