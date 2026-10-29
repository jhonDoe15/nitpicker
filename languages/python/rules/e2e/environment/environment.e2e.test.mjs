import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
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
    'tests/test_settings.py',
  ])('allows the composition root %s', (file) => {
    const [actual, expected] = outcomes([
      ['reads', inFile(file, 'import os\n\nURL = os.environ["URL"]\n'), []],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('process-env-access in the roots of the common frameworks', () => {
  const READ = 'import os\n\nURL = os.environ["URL"]\n';
  const flagged = (file, settings) =>
    findingsOf({ [file]: READ }, settings).map((entry) => entry.split(' ')[0]);

  it.each([
    'noxfile.py',
    'tasks.py',
    'fabfile.py',
    'setup.py',
    'src/shop/config.py',
    'src/shop/app.py',
    'src/shop/cli.py',
    'src/shop/celery.py',
    'src/shop/core/config.py',
    'src/shop/gunicorn.conf.py',
    'src/shop/prod_settings.py',
    'src/shop/app_config.py',
  ])('exempts the root file %s', (file) => {
    expect(flagged(file)).toEqual([]);
  });

  it.each([
    'src/shop/domain/conf.py',
    'src/shop/domain/config.py',
    'src/shop/billing/setup.py',
    'src/shop/billing/tasks.py',
    'src/shop/billing/service.py',
  ])('still flags %s', (file) => {
    expect(flagged(file)).toEqual(['process-env-access']);
  });

  it('exempts a module that defines an application factory', () => {
    const files = {
      'flaskr/__init__.py': `${READ}\n\ndef create_app():\n    return None\n`,
      'flaskr/db.py': READ,
    };

    expect(findingsOf(files)).toEqual(['process-env-access flaskr/db.py:3 os.environ']);
  });

  it('exempts the migration environment of Alembic, which sits beside script.py.mako', () => {
    const files = { 'alembic/env.py': READ, 'alembic/script.py.mako': '', 'other/env.py': READ };

    expect(findingsOf(files)).toEqual(['process-env-access other/env.py:3 os.environ']);
  });

  it('exempts the migration environment of a folder below alembic.ini', () => {
    const files = { 'app/db/env.py': READ, 'app/alembic.ini': '', 'other/env.py': READ };

    expect(findingsOf(files)).toEqual(['process-env-access other/env.py:3 os.environ']);
  });

  it('exempts the modules the project lists as entry points', () => {
    const files = {
      'src/shop/jobs.py': READ,
      'src/shop/other.py': READ,
      'pyproject.toml': '[project.scripts]\nshop-jobs = "shop.jobs:main"\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'process-env-access src/shop/other.py:3 os.environ',
    ]);
  });

  it('exempts the files python.entryPoints names', () => {
    const files = { 'src/shop/jobs/run.py': READ, 'src/shop/other.py': READ };

    expect(
      findingsOf(files, { sourceRoots: ['src'], entryPoints: ['src/shop/jobs/*.py'] }),
    ).toEqual(['process-env-access src/shop/other.py:3 os.environ']);
  });

  it('exempts the code under a main guard and the Django settings default', () => {
    const guarded = `import os\n\n\nif __name__ == "__main__":\n    URL = os.environ["URL"]\n`;
    const django =
      'import os\n\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "shop.settings")\n';
    const other = 'import os\n\nos.environ.setdefault("OTHER", "x")\n';

    expect(findingsOf({ 'src/shop/a.py': guarded, 'src/shop/b.py': django })).toEqual([]);
    expect(findingsOf({ 'src/shop/c.py': other })).toEqual([
      'process-env-access src/shop/c.py:3 os.environ',
    ]);
  });

  it('finds the other ways to read the environment', () => {
    const [actual, expected] = outcomes([
      [
        'dotenv_values',
        'from dotenv import dotenv_values\n\nCONFIG = dotenv_values()\n',
        ['process-env-access:3 dotenv.dotenv_values'],
      ],
      [
        'posix.environ',
        'import posix\n\nURL = posix.environ["URL"]\n',
        ['process-env-access:3 posix.environ'],
      ],
      [
        'sys.modules',
        'import sys\n\nURL = sys.modules["os"].environ["URL"]\n',
        ['process-env-access:3 os.environ'],
      ],
      [
        'import_module',
        'import importlib\n\nURL = importlib.import_module("os").environ["URL"]\n',
        ['process-env-access:3 os.environ'],
      ],
      [
        'getattr',
        'import os\n\nURL = getattr(os, "environ")["URL"]\n',
        ['process-env-access:3 os.environ'],
      ],
      [
        'decouple',
        'from decouple import config\n\nURL = config("URL")\n',
        ['process-env-access:3 decouple.config'],
      ],
      [
        'a BaseSettings subclass instantiated',
        'from pydantic_settings import BaseSettings\n\n\nclass Settings(BaseSettings):\n    url: str\n\n\nSETTINGS = Settings()\n',
        ['pydantic-boundary:1 pydantic_settings', 'process-env-access:8 Settings'],
      ],
      [
        'a BaseSettings subclass only defined',
        'from pydantic_settings import BaseSettings\n\n\nclass Settings(BaseSettings):\n    url: str\n',
        ['pydantic-boundary:1 pydantic_settings'],
      ],
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
        domain(
          'from datetime import datetime, timezone\n\nSTAMP = datetime(2026, 1, 1, tzinfo=timezone.utc)\n',
        ),
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
      ['os.popen', domain('import os\n\nos.popen("ls")\n'), ['io-in-domain:3 os.popen']],
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

describe.skipIf(!enabled)('references and wrappers in domain code', () => {
  const domain = (code) => inFile('domain/pricing.py', code);

  it('finds the clock and randomness behind factories, aliases and constructors', () => {
    const [actual, expected] = outcomes([
      [
        'a default factory of the clock',
        domain(
          'from dataclasses import dataclass, field\nfrom datetime import datetime\n\n\n@dataclass(frozen=True)\nclass A:\n    at: datetime = field(default_factory=datetime.now)\n',
        ),
        ['clock-now:7 datetime.datetime.now'],
      ],
      [
        'a default factory of uuid4',
        domain(
          'import uuid\nfrom dataclasses import dataclass, field\n\n\n@dataclass(frozen=True)\nclass A:\n    ident: str = field(default_factory=uuid.uuid4)\n',
        ),
        ['random-in-domain:7 uuid.uuid4'],
      ],
      [
        'an alias of the clock',
        domain('from datetime import datetime\n\nnow = datetime.now\nSTAMP = now()\n'),
        ['clock-now:3 datetime.datetime.now', 'clock-now:4 datetime.datetime.now'],
      ],
      [
        'a partial of the clock',
        domain(
          'import functools\nfrom datetime import UTC, datetime\n\nNOW = functools.partial(datetime.now, UTC)\n',
        ),
        ['clock-now:4 datetime.datetime.now'],
      ],
      [
        'time.localtime without a time',
        domain('import time\n\nT = time.localtime()\n'),
        ['clock-now:3 time.localtime'],
      ],
      [
        'time.localtime of a time',
        domain('import time\n\ndef f(t):\n    return time.localtime(t)\n'),
        [],
      ],
      [
        'time.strftime of a time',
        domain('import time\n\ndef f(t):\n    return time.strftime("%Y", t)\n'),
        [],
      ],
      [
        'time.strftime of the clock',
        domain('import time\n\nY = time.strftime("%Y")\n'),
        ['clock-now:3 time.strftime'],
      ],
      [
        'an unseeded Random',
        domain('import random\n\nR = random.Random()\n'),
        ['random-in-domain:3 random.Random'],
      ],
      [
        'SystemRandom',
        domain('import random\n\nR = random.SystemRandom()\n'),
        ['random-in-domain:3 random.SystemRandom'],
      ],
      [
        'expovariate',
        domain('import random\n\nV = random.expovariate(1.0)\n'),
        ['random-in-domain:3 random.expovariate'],
      ],
      [
        'numpy random',
        domain('import numpy as np\n\nV = np.random.rand()\n'),
        ['random-in-domain:3 numpy.random.rand'],
      ],
      [
        'a default factory of a list',
        domain('from dataclasses import field\n\nX = field(default_factory=list)\n'),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('finds file access through pathlib, wrappers and lazy imports', () => {
    const [actual, expected] = outcomes([
      [
        'a Path read',
        domain('from pathlib import Path\n\n\ndef f(name):\n    return Path(name).read_text()\n'),
        ['io-in-domain:5 Path.read_text'],
      ],
      [
        'a Path variable',
        domain(
          'from pathlib import Path\n\n\ndef f(name):\n    path = Path("x") / "y"\n    return path.exists()\n',
        ),
        ['io-in-domain:6 Path.exists'],
      ],
      [
        'a Path parameter',
        domain('from pathlib import Path\n\n\ndef f(path: Path):\n    return path.read_bytes()\n'),
        ['io-in-domain:5 Path.read_bytes'],
      ],
      [
        'os.listdir',
        domain('import os\n\nNAMES = os.listdir(".")\n'),
        ['io-in-domain:3 os.listdir'],
      ],
      [
        'an import of an adapter',
        domain('from shop.adapters.http import fetch_json\n'),
        ['io-in-domain:1 shop.adapters.http'],
      ],
      [
        'a relative import of an adapter',
        domain('from ..adapters import http\n'),
        ['io-in-domain:1 adapters'],
      ],
      [
        'a lazy import of requests',
        domain('import importlib\n\nR = importlib.import_module("requests")\n'),
        ['io-in-domain:3 requests'],
      ],
      [
        'a lazy import of json',
        domain('import importlib\n\nR = importlib.import_module("json")\n'),
        [],
      ],
      [
        'a path value that is never read',
        domain('from pathlib import PurePath\n\nP = PurePath("a") / "b"\n'),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
