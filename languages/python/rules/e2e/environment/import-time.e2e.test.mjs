import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts({
  hidden: ['http-without-timeout', 'shell-command', 'module-level-mutable-state'],
});
afterEach(cleanup);

const lines = (...rows) => `${rows.join('\n')}\n`;
const RULE = 'import-time-effect';

describe.skipIf(!enabled)('import-time-effect', () => {
  it('reports external effects in top-level statements', () => {
    const [actual, expected] = outcomes([
      ['open', 'DATA = open("data.json").read()\n', [`${RULE}:1 open`]],
      [
        'Path.read_text',
        lines(
          'from pathlib import Path',
          '',
          'DATA = Path(__file__).with_name("a.txt").read_text()',
        ),
        [`${RULE}:3 Path.read_text`],
      ],
      [
        'an aliased HTTP call',
        lines('import requests as r', '', 'CONFIG = r.get("https://x", timeout=5).json()'),
        [`${RULE}:3 requests.get`],
      ],
      [
        'a from import with an alias',
        lines('from subprocess import run as sh', '', 'sh(["make"], check=True)'),
        [`${RULE}:3 subprocess.run`],
      ],
      [
        'a socket',
        lines('import socket', '', 'CONN = socket.create_connection(("db", 5432))'),
        [`${RULE}:3 socket.create_connection`],
      ],
      [
        'a database connect',
        lines('import sqlite3', '', 'DB = sqlite3.connect("app.db")'),
        [`${RULE}:3 sqlite3.connect`],
      ],
      [
        'a started thread',
        lines('import threading', '', 'threading.Thread(target=print).start()'),
        [`${RULE}:3 threading.Thread(...).start`],
      ],
      [
        'a thread bound to a name',
        lines(
          'from threading import Thread',
          '',
          'WORKER = Thread(target=print)',
          'WORKER.start()',
        ),
        [`${RULE}:4 WORKER.start`],
      ],
      [
        'an executor job',
        lines(
          'from concurrent.futures import ThreadPoolExecutor',
          '',
          'POOL = ThreadPoolExecutor()',
          'POOL.submit(print)',
        ),
        [`${RULE}:4 POOL.submit`],
      ],
      [
        'a scheduler',
        lines(
          'from apscheduler.schedulers.background import BackgroundScheduler',
          '',
          'SCHEDULER = BackgroundScheduler()',
          'SCHEDULER.start()',
        ),
        [`${RULE}:4 SCHEDULER.start`],
      ],
      [
        'an event loop',
        lines('import asyncio', '', 'asyncio.run(asyncio.sleep(0))'),
        [`${RULE}:3 asyncio.run`, `${RULE}:3 asyncio.sleep`],
      ],
      [
        'a log file',
        lines('import logging', '', 'HANDLER = logging.FileHandler("app.log")'),
        [`${RULE}:3 logging.FileHandler`],
      ],
      [
        'a mail server',
        lines('import smtplib', '', 'MAIL = smtplib.SMTP("mail.example.com")'),
        [`${RULE}:3 smtplib.SMTP`],
      ],
      [
        'a connection from an engine',
        lines(
          'from sqlalchemy import create_engine',
          '',
          'ENGINE = create_engine("sqlite://")',
          'CONNECTION = ENGINE.connect()',
        ),
        [`${RULE}:4 ENGINE.connect`],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('reports what class bodies, defaults, decorators and top-level blocks evaluate', () => {
    const [actual, expected] = outcomes([
      [
        'a class body',
        lines('class Config:', '    DATA = open("config.json").read()'),
        [`${RULE}:2 open`],
      ],
      [
        'a class body reading a path',
        lines(
          'from pathlib import Path',
          '',
          '',
          'class Config:',
          '    TEXT = Path("a.txt").read_text()',
        ),
        [`${RULE}:5 Path.read_text`],
      ],
      [
        'a default argument',
        lines('def load(data=open("seed.json").read()):', '    return data'),
        [`${RULE}:1 open`],
      ],
      [
        'a decorator argument',
        lines(
          'import functools',
          '',
          '',
          '@functools.lru_cache(maxsize=len(open("sizes").read()))',
          'def size():',
          '    return 1',
        ),
        [`${RULE}:4 open`],
      ],
      [
        'the else of a main guard, a try and a loop',
        lines(
          'import os',
          '',
          'if __name__ == "__main__":',
          '    pass',
          'else:',
          '    os.makedirs("logs")',
          'try:',
          '    os.remove("stale.lock")',
          'finally:',
          '    LOCKED = False',
          'for name in ("a", "b"):',
          '    os.mkdir(name)',
        ),
        [`${RULE}:6 os.makedirs`, `${RULE}:8 os.remove`, `${RULE}:12 os.mkdir`],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('reports registrations, data readers and calls on module-level clients', () => {
    const [actual, expected] = outcomes([
      [
        'atexit',
        lines('import atexit', '', 'atexit.register(print)'),
        [`${RULE}:3 atexit.register`],
      ],
      [
        'signal',
        lines('import signal', '', 'signal.signal(2, print)'),
        [`${RULE}:3 signal.signal`],
      ],
      [
        'a timer and a scheduler',
        lines(
          'import sched',
          'import threading',
          '',
          'threading.Timer(5, print).start()',
          'sched.scheduler().run()',
        ),
        [`${RULE}:4 threading.Timer(...).start`, `${RULE}:5 sched.scheduler(...).run`],
      ],
      [
        'file logging setup',
        lines(
          'import logging',
          '',
          'logging.basicConfig(filename="app.log")',
          'logging.basicConfig(level=10)',
        ),
        [`${RULE}:3 logging.basicConfig`],
      ],
      [
        'package data and data files',
        lines(
          'import importlib.resources as resources',
          'import pkgutil',
          '',
          'import nltk',
          'import numpy as np',
          'import pandas as pd',
          '',
          'TEXT = resources.files("shop").joinpath("a.txt").read_text()',
          'RAW = pkgutil.get_data("shop", "a.bin")',
          'FRAME = pd.read_csv("a.csv")',
          'ARRAY = np.load("a.npy")',
          'nltk.download("punkt")',
        ),
        [
          `${RULE}:8 Path.read_text`,
          `${RULE}:9 pkgutil.get_data`,
          `${RULE}:10 pandas.read_csv`,
          `${RULE}:11 numpy.load`,
          `${RULE}:12 nltk.download`,
        ],
      ],
      [
        'module-level clients and tables',
        lines(
          'import boto3',
          'import redis',
          'from sqlalchemy.orm import declarative_base',
          '',
          'Base = declarative_base()',
          'S3: object = boto3.client("s3")',
          'CACHE = redis.Redis()',
          'S3.download_file("b", "k", "f")',
          'CACHE.ping()',
          'PIPE = CACHE.pipeline()',
          'Base.metadata.create_all(bind=None)',
        ),
        [`${RULE}:8 S3.download_file`, `${RULE}:9 CACHE.ping`, `${RULE}:11 metadata.create_all`],
      ],
      [
        'a class body binding and a path constant read by a helper',
        lines(
          'import threading',
          'from pathlib import Path',
          '',
          'CONFIG = Path("config.toml")',
          '',
          '',
          'def load():',
          '    return CONFIG.read_text()',
          '',
          '',
          'class Worker:',
          '    THREAD = threading.Thread(target=print)',
          '    THREAD.start()',
          '    TEXT = load()',
        ),
        [`${RULE}:13 THREAD.start`, `${RULE}:14 k6.mod.load via k6.mod.load -> Path.read_text`],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('skips every main guard form and type-only blocks, and respects rebinding', () => {
    const [actual, expected] = outcomes([
      ['reversed', lines('if "__main__" == __name__:', '    open("x")'), []],
      [
        'combined',
        lines('import sys', '', 'if __name__ == "__main__" and sys.argv:', '    open("x")'),
        [],
      ],
      [
        'type checking',
        lines(
          'import typing as t',
          '',
          'if t.TYPE_CHECKING:',
          '    open("x")',
          'else:',
          '    open("y")',
        ),
        [`${RULE}:6 open`],
      ],
      [
        'a rebound import and a function-scoped import',
        {
          files: {
            'w.py': lines(
              'import subprocess',
              '',
              '',
              'def run():',
              '    return subprocess.run(["x"])',
            ),
            'mod.py': lines(
              'from w import run',
              '',
              'run = lambda: 1',
              'FIRST = run()',
              '',
              '',
              'def helper():',
              '    from w import run',
              '    return run',
              '',
              '',
              'def main():',
              '    return 1',
              '',
              '',
              'SECOND = main()',
            ),
          },
        },
        [],
      ],
      [
        'standard-library and installed names beside project modules of the same name',
        {
          files: {
            'svc/email.py': lines(
              'import smtplib',
              '',
              '',
              'def message_from_string(text):',
              '    return smtplib.SMTP("h")',
            ),
            'svc/redis.py': lines(
              'import requests',
              '',
              '',
              'def from_url(url):',
              '    return requests.get(url)',
            ),
            'svc/other.py': lines(
              'import email',
              'import redis',
              '',
              'MESSAGE = email.message_from_string("x")',
              'CLIENT = redis.from_url("redis://x")',
            ),
          },
        },
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows definitions, pure constants, lazy clients and code under a main guard', () => {
    const [actual, expected] = outcomes([
      [
        'pure module setup',
        lines(
          'import enum',
          'import logging',
          'import re',
          'from dataclasses import dataclass',
          'from pathlib import Path',
          'from typing import TypeVar',
          '',
          'LOGGER = logging.getLogger(__name__)',
          'HERE = Path(__file__).resolve().parent',
          'TEMPLATES = HERE / "templates"',
          'WORD = re.compile(r"\\w+")',
          'T = TypeVar("T")',
          '',
          '',
          'class Color(enum.Enum):',
          '    RED = "red"',
          '',
          '',
          '@dataclass(frozen=True)',
          'class Point:',
          '    x: int',
        ),
        [],
      ],
      [
        'lazy clients',
        lines(
          'import logging',
          'import smtplib',
          '',
          'import requests',
          'from sqlalchemy import create_engine',
          '',
          'SESSION = requests.Session()',
          'ENGINE = create_engine("sqlite://")',
          'MAIL = smtplib.SMTP()',
          'HANDLER = logging.FileHandler("app.log", delay=True)',
        ),
        [],
      ],
      [
        'functions and lambdas that run later',
        lines(
          'import requests',
          '',
          '',
          'def fetch():',
          '    return requests.get("https://x", timeout=5)',
          '',
          '',
          'LATER = lambda: requests.get("https://x", timeout=5)',
        ),
        [],
      ],
      [
        'a main guard',
        lines(
          'import requests',
          '',
          'if __name__ == "__main__":',
          '    requests.get("https://x", timeout=5)',
        ),
        [],
      ],
      [
        'the environment, which process-env-access reports',
        lines('import os', '', 'URL = os.environ["URL"]'),
        ['process-env-access:3 os.environ'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('follows calls into project helpers and decorators that run at import', () => {
    const files = {
      'shop/__init__.py': '',
      'shop/db.py': lines(
        'import psycopg2',
        '',
        '',
        'def connect_to_database():',
        '    return open_connection("db")',
        '',
        '',
        'def open_connection(host):',
        '    return psycopg2.connect(host=host)',
        '',
        '',
        'def register(function):',
        '    connect_to_database()',
        '    return function',
        '',
        '',
        'def make_client(clock):',
        '    return clock()',
      ),
      'shop/service.py': lines(
        'from shop import db',
        'from shop.db import register',
        '',
        'CLIENT = db.connect_to_database()',
        'LATER = db.make_client(object)',
        '',
        '',
        '@register',
        'def handler():',
        '    return CLIENT',
        '',
        '',
        'def lazy():',
        '    return db.connect_to_database()',
      ),
    };

    expect(findingsOf(files)).toEqual([
      `${RULE} shop/service.py:4 shop.db.connect_to_database via shop.db.connect_to_database -> shop.db.open_connection -> psycopg2.connect`,
      `${RULE} shop/service.py:8 shop.db.register via shop.db.register -> shop.db.connect_to_database -> shop.db.open_connection -> psycopg2.connect`,
    ]);
  });

  it('leaves composition roots, bootstrap modules and tests alone', () => {
    const EFFECT = lines('import sqlite3', '', 'DB = sqlite3.connect("app.db")');
    const files = {
      'shop/main.py': EFFECT,
      'shop/settings.py': EFFECT,
      'shop/wsgi.py': EFFECT,
      'shop/factory.py': `${EFFECT}\n\ndef create_app():\n    return DB\n`,
      'shop/jobs/nightly.py': EFFECT,
      'tests/test_db.py': EFFECT,
      'tests/conftest.py': EFFECT,
      'shop/store.py': EFFECT,
    };

    expect(findingsOf(files, { entryPoints: ['shop/jobs/*.py'] })).toEqual([
      `${RULE} shop/store.py:3 sqlite3.connect`,
    ]);
  });

  it('leaves input and output in domain modules to io-in-domain', () => {
    const files = {
      'shop/domain/orders.py': lines(
        'import threading',
        '',
        'DATA = open("orders.json").read()',
        'threading.Thread(target=print).start()',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'io-in-domain shop/domain/orders.py:3 open',
      `${RULE} shop/domain/orders.py:4 threading.Thread(...).start`,
    ]);
  });
});
