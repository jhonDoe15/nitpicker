import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['http-without-timeout', 'shell-command', 'module-level-mutable-state'],
});
afterEach(cleanup);

const lines = (...rows) => `${rows.join('\n')}\n`;
const RULE = 'import-time-effect';

describe.skipIf(!enabled)('import-time-effect sources and resolution', () => {
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
});
