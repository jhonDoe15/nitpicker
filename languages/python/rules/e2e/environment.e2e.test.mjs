import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });

describe.skipIf(!enabled)('process-env-access', () => {
  it('flags every way to reach the process environment outside the composition root', () => {
    const [actual, expected] = outcomes([
      ['os.environ', 'import os\n\nURL = os.environ["URL"]\n', ['process-env-access:3 os.environ']],
      ['os.getenv', 'import os\n\nURL = os.getenv("URL")\n', ['process-env-access:3 os.getenv']],
      [
        'os.environ.get',
        'import os\n\nURL = os.environ.get("URL", "x")\n',
        ['process-env-access:3 os.environ'],
      ],
      [
        'an import alias',
        'import os as system\n\nURL = system.getenv("URL")\n',
        ['process-env-access:3 os.getenv'],
      ],
      [
        'a from import',
        'from os import environ\n\nURL = environ["URL"]\n',
        ['process-env-access:3 os.environ'],
      ],
      [
        'a from import with an alias',
        'from os import getenv as read\n\nURL = read("URL")\n',
        ['process-env-access:3 os.getenv'],
      ],
      ['os.putenv', 'import os\n\nos.putenv("A", "b")\n', ['process-env-access:3 os.putenv']],
      [
        'inside a function',
        'import os\n\n\ndef url():\n    return os.getenv("URL")\n',
        ['process-env-access:5 os.getenv'],
      ],
      ['another module named os', 'import osx\n\nURL = osx.environ["URL"]\n', []],
      ['a local variable called environ', 'def f(environ):\n    return environ["URL"]\n', []],
    ]);
    expect(actual).toEqual(expected);
  });

  it.each([
    'main.py',
    'src/app/main.py',
    'src/app/__main__.py',
    'src/app/settings.py',
    'src/app/server.py',
    'src/app/composition_root.py',
    'src/app/composition_root/wiring.py',
    'src/app/settings/base.py',
    'manage.py',
    'wsgi.py',
    'conf.py',
    'noxfile.py',
    'tests/test_settings.py',
  ])('allows the composition root %s', (file) => {
    const [actual, expected] = outcomes([
      ['reads', inFile(file, 'import os\n\nURL = os.environ["URL"]\n'), []],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('clock, randomness and input or output in domain code', () => {
  const domain = (code) => inFile('domain/pricing.py', code);

  it('flags reading the clock', () => {
    const [actual, expected] = outcomes([
      [
        'datetime.now',
        domain('from datetime import datetime\n\nSTAMP = datetime.now()\n'),
        ['clock-now:3 datetime.datetime.now'],
      ],
      [
        'datetime.datetime.utcnow',
        domain('import datetime\n\nSTAMP = datetime.datetime.utcnow()\n'),
        ['clock-now:3 datetime.datetime.utcnow'],
      ],
      [
        'date.today',
        domain('from datetime import date\n\nTODAY = date.today()\n'),
        ['clock-now:3 datetime.date.today'],
      ],
      ['time.time', domain('import time\n\nSTAMP = time.time()\n'), ['clock-now:3 time.time']],
      [
        'time.perf_counter',
        domain('import time as t\n\nSTAMP = t.perf_counter()\n'),
        ['clock-now:3 time.perf_counter'],
      ],
      ['a clock passed in', domain('def stamp(now):\n    return now()\n'), []],
      [
        'a fixed datetime',
        domain('from datetime import datetime\n\nSTAMP = datetime(2026, 1, 1)\n'),
        [],
      ],
      [
        'outside the domain',
        inFile('src/app/pricing.py', 'import time\n\nSTAMP = time.time()\n'),
        [],
      ],
      [
        'a test of the domain only trips the test rule',
        inFile('tests/domain/test_pricing.py', 'import time\n\nSTAMP = time.time()\n'),
        ['real-clock-in-test:3 time.time'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags drawing randomness', () => {
    const [actual, expected] = outcomes([
      [
        'random.random',
        domain('import random\n\nVALUE = random.random()\n'),
        ['random-in-domain:3 random.random'],
      ],
      [
        'random.choice',
        domain('from random import choice\n\nVALUE = choice([1])\n'),
        ['random-in-domain:3 random.choice'],
      ],
      ['uuid4', domain('import uuid\n\nIDENT = uuid.uuid4()\n'), ['random-in-domain:3 uuid.uuid4']],
      [
        'secrets.token_hex',
        domain('import secrets\n\nTOKEN = secrets.token_hex()\n'),
        ['random-in-domain:3 secrets.token_hex'],
      ],
      ['a generator passed in', domain('def draw(rng):\n    return rng.random()\n'), []],
      ['a seeded generator object', domain('import random\n\nRNG = random.Random(1)\n'), []],
      [
        'outside the domain',
        inFile('src/app/draw.py', 'import random\n\nV = random.random()\n'),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags files, processes, the network and sleeping', () => {
    const [actual, expected] = outcomes([
      ['open', domain('def f(p):\n    return open(p)\n'), ['io-in-domain:2 open']],
      ['input', domain('NAME = input()\n'), ['io-in-domain:1 input']],
      ['time.sleep', domain('import time\n\ntime.sleep(1)\n'), ['io-in-domain:3 time.sleep']],
      ['os.system', domain('import os\n\nos.system("ls")\n'), ['io-in-domain:3 os.system']],
      ['import subprocess', domain('import subprocess\n'), ['io-in-domain:1 subprocess']],
      [
        'from requests import get',
        domain('from requests import get\n'),
        ['io-in-domain:1 requests'],
      ],
      [
        'import urllib.request',
        domain('import urllib.request\n'),
        ['io-in-domain:1 urllib.request'],
      ],
      [
        'import sqlalchemy.orm',
        domain('import sqlalchemy.orm\n'),
        ['io-in-domain:1 sqlalchemy.orm'],
      ],
      ['import json', domain('import json\n'), []],
      ['import urllib.parse', domain('import urllib.parse\n'), []],
      ['import requestsfoo', domain('import requestsfoo\n'), []],
      ['outside the domain', inFile('src/app/store.py', 'import subprocess\n'), []],
      ['an adapter', inFile('adapters/store.py', 'import subprocess\n'), []],
    ]);
    expect(actual).toEqual(expected);
  });
});
