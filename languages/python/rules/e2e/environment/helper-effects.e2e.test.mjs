import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts({
  hidden: ['http-without-timeout', 'swallowed-exception'],
});
afterEach(cleanup);

const lines = (...rows) => `${rows.join('\n')}\n`;

const SHARED = {
  'app/__init__.py': '',
  'app/shared/__init__.py': 'from .current_prices import fetch as fetch_price\n',
  'app/shared/http.py': lines(
    'import requests as r',
    '',
    '',
    'def get_json(url):',
    '    return r.get(url, timeout=5).json()',
  ),
  'app/shared/current_prices.py': lines(
    'import uuid',
    'from datetime import UTC, datetime',
    '',
    'import requests',
    '',
    'from .http import get_json',
    '',
    '',
    'def fetch(symbol):',
    '    return get_json(f"/prices/{symbol}")',
    '',
    '',
    'def stamp():',
    '    return datetime.now(tz=UTC)',
    '',
    '',
    'def stamp_with(clock):',
    '    return clock()',
    '',
    '',
    'def token():',
    '    return uuid.uuid4().hex',
    '',
    '',
    'def unused():',
    '    return requests.get("/unused", timeout=5)',
    '',
    '',
    'def pure(value):',
    '    return value * 2',
    '',
    '',
    'def ping(count):',
    '    return pong(count - 1) if count else requests.head("/", timeout=5)',
    '',
    '',
    'def pong(count):',
    '    return ping(count)',
    '',
    '',
    'class Client:',
    '    def __init__(self):',
    '        self.token = self.login()',
    '',
    '    def login(self):',
    '        return requests.post("/login", timeout=5)',
  ),
};

const CHAIN = 'app.shared.current_prices.fetch -> app.shared.http.get_json -> requests.get';

describe.skipIf(!enabled)('domain effects reached through project helpers', () => {
  it('reports the first domain call of each helper with the chain to the effect', () => {
    const files = {
      ...SHARED,
      'app/domain/__init__.py': '',
      'app/domain/pricing.py': lines(
        'import app.shared.current_prices as cp',
        'from app.shared import fetch_price',
        'from app.shared.current_prices import Client, ping, stamp, token',
        '',
        '',
        'def quote(symbol):',
        '    return cp.fetch(symbol)',
        '',
        '',
        'def quote_again(symbol):',
        '    return fetch_price(symbol)',
        '',
        '',
        'def when():',
        '    return stamp()',
        '',
        '',
        'def ident():',
        '    return token()',
        '',
        '',
        'def connect():',
        '    return Client()',
        '',
        '',
        'def bounce():',
        '    return ping(3)',
      ),
    };

    expect(findingsOf(files)).toEqual([
      `io-in-domain app/domain/pricing.py:7 app.shared.current_prices.fetch via quote -> ${CHAIN}`,
      `io-in-domain app/domain/pricing.py:11 app.shared.current_prices.fetch via quote_again -> ${CHAIN}`,
      'clock-now app/domain/pricing.py:15 app.shared.current_prices.stamp via when -> app.shared.current_prices.stamp -> datetime.datetime.now',
      'random-in-domain app/domain/pricing.py:19 app.shared.current_prices.token via ident -> app.shared.current_prices.token -> uuid.uuid4',
      'io-in-domain app/domain/pricing.py:23 app.shared.current_prices.Client.__init__ via connect -> app.shared.current_prices.Client.__init__ -> app.shared.current_prices.Client.login -> requests.post',
      'io-in-domain app/domain/pricing.py:27 app.shared.current_prices.ping via bounce -> app.shared.current_prices.ping -> requests.head',
    ]);
  });

  it('follows relative imports and calls at module level', () => {
    const files = {
      ...SHARED,
      'app/domain/__init__.py': '',
      'app/domain/rates.py': lines(
        'from ..shared.http import get_json',
        '',
        'RATES = get_json("/rates")',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'io-in-domain app/domain/rates.py:3 app.shared.http.get_json via app.shared.http.get_json -> requests.get',
    ]);
  });

  it('keeps helpers that take the effect as a parameter, pure helpers and unresolved calls legal', () => {
    const files = {
      ...SHARED,
      'app/domain/__init__.py': '',
      'app/domain/legal.py': lines(
        'from collections.abc import Callable',
        'from datetime import datetime',
        'from typing import TYPE_CHECKING',
        '',
        'from app.shared.current_prices import pure, stamp_with',
        '',
        'if TYPE_CHECKING:',
        '    from app.shared.current_prices import Client',
        '',
        '',
        'def when(clock: Callable[[], datetime]) -> datetime:',
        '    return stamp_with(clock)',
        '',
        '',
        'def double(value: int) -> int:',
        '    return pure(value)',
        '',
        '',
        'def through(client: "Client", gateway) -> object:',
        '    return gateway.fetch(client)',
      ),
    };

    expect(findingsOf(files)).toEqual([]);
  });

  it('reports one finding per root cause across domain files and adapters', () => {
    const files = {
      ...SHARED,
      'app/adapters/__init__.py': '',
      'app/adapters/prices.py': lines(
        'import requests',
        '',
        '',
        'def load():',
        '    return requests.get("/p", timeout=5)',
      ),
      'app/domain/__init__.py': '',
      'app/domain/inner.py': lines(
        'from app.shared.current_prices import fetch',
        '',
        '',
        'def local(symbol):',
        '    return fetch(symbol)',
        '',
        '',
        'def caller(symbol):',
        '    return local(symbol)',
      ),
      'app/domain/outer.py': lines(
        'from app.adapters.prices import load',
        'from app.domain.inner import local',
        '',
        '',
        'def total(symbol):',
        '    return local(symbol), load()',
      ),
    };

    expect(findingsOf(files)).toEqual([
      `io-in-domain app/domain/inner.py:5 app.shared.current_prices.fetch via local -> ${CHAIN}`,
      'io-in-domain app/domain/outer.py:1 app.adapters.prices',
    ]);
  });

  it('ignores tests and helper modules that are not under domain/', () => {
    const files = {
      ...SHARED,
      'app/service.py': lines(
        'from app.shared.current_prices import fetch',
        '',
        '',
        'def quote(symbol):',
        '    return fetch(symbol)',
      ),
      'tests/domain/test_pricing.py': lines(
        'from app.shared.current_prices import fetch',
        '',
        '',
        'def test_quote():',
        '    assert fetch("x") is not None',
      ),
    };

    expect(findingsOf(files)).toEqual([]);
  });
});

const PACKAGES = {
  'shop/__init__.py': '',
  'shop/shared/__init__.py': '',
  'shop/domain/__init__.py': '',
};
const GET = lines('import requests', '', '', 'def fetch(url):', '    return requests.get(url)');

describe.skipIf(!enabled)('helper resolution', () => {
  it('resolves standard-library and installed names to themselves, not to a project module', () => {
    const files = {
      ...PACKAGES,
      'shop/shared/json.py': lines('def loads(path):', '    return open(path).read()'),
      'shop/domain/pricing.py': lines(
        'import json',
        '',
        '',
        'def parse(text):',
        '    return json.loads(text)',
      ),
    };

    expect(findingsOf(files)).toEqual([]);
  });

  it('names each helper by its module so two helpers called fetch stay apart', () => {
    const files = {
      ...PACKAGES,
      'shop/shared/a.py': GET,
      'shop/shared/c.py': GET,
      'shop/domain/pricing.py': lines(
        'from shop.shared.a import fetch',
        'from shop.shared.c import fetch as fetch_other',
        '',
        '',
        'def quote(url):',
        '    return fetch(url), fetch_other(url)',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'io-in-domain shop/domain/pricing.py:6 shop.shared.a.fetch via quote -> shop.shared.a.fetch -> requests.get',
      'io-in-domain shop/domain/pricing.py:6 shop.shared.c.fetch via quote -> shop.shared.c.fetch -> requests.get',
    ]);
  });

  it('keeps module definitions over imports nested in other functions and parameters', () => {
    const files = {
      ...PACKAGES,
      'shop/shared/http.py': GET,
      'shop/domain/pricing.py': lines(
        'from shop.shared import http',
        '',
        '',
        'def legacy():',
        '    from shop.shared.http import fetch',
        '    return fetch',
        '',
        '',
        'def fetch(prices, sku):',
        '    return prices[sku]',
        '',
        '',
        'def quote(prices, sku, http):',
        '    return fetch(prices, sku), http.fetch(sku)',
      ),
    };

    expect(findingsOf(files)).toEqual([]);
  });

  it('follows decorators, definitions under if, and both sides of an ImportError fallback', () => {
    const files = {
      ...PACKAGES,
      'shop/shared/http.py': GET,
      'shop/shared/hooks.py': lines(
        'import requests',
        '',
        '',
        'def register(function):',
        '    requests.post("/hooks")',
        '    return function',
      ),
      'shop/shared/loader.py': lines(
        'import sys',
        '',
        'try:',
        '    from shop.shared.http import fetch',
        'except ImportError:',
        '    def fetch(url):',
        '        return url',
        '',
        'if sys.version_info >= (3, 11):',
        '    from shop.shared.http import fetch as platform_fetch',
        'else:',
        '    def platform_fetch(url):',
        '        return url',
      ),
      'shop/domain/pricing.py': lines(
        'from shop.shared.hooks import register',
        'from shop.shared.loader import fetch, platform_fetch',
        '',
        '',
        '@register',
        'def quote(url):',
        '    return fetch(url), platform_fetch(url)',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'io-in-domain shop/domain/pricing.py:5 shop.shared.hooks.register via shop.shared.hooks.register -> requests.post',
      'io-in-domain shop/domain/pricing.py:7 shop.shared.http.fetch via quote -> shop.shared.http.fetch -> requests.get',
    ]);
  });

  it('shows a chain that stays out of domain/ and shortens a long one', () => {
    const steps = Array.from({ length: 8 }, (_, index) =>
      lines('', '', `def step${String(index)}(url):`, `    return step${String(index + 1)}(url)`),
    );
    const files = {
      ...PACKAGES,
      'shop/domain/other.py': GET,
      'shop/shared/mixed.py': lines(
        'import requests',
        '',
        'from shop.domain.other import fetch',
        '',
        '',
        'def load(url):',
        '    fetch(url)',
        '    return requests.get(url)',
      ),
      'shop/shared/deep.py': `import requests\n${steps.join('')}\n\ndef step8(url):\n    return requests.get(url)\n`,
      'shop/domain/pricing.py': lines(
        'from shop.shared.deep import step0',
        'from shop.shared.mixed import load',
        '',
        '',
        'def quote(url):',
        '    return load(url), step0(url)',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'io-in-domain shop/domain/other.py:1 requests',
      'io-in-domain shop/domain/pricing.py:6 shop.shared.deep.step0 via quote -> shop.shared.deep.step0 -> shop.shared.deep.step1 -> shop.shared.deep.step2 -> ... -> shop.shared.deep.step8 -> requests.get',
      'io-in-domain shop/domain/pricing.py:6 shop.shared.mixed.load via quote -> shop.shared.mixed.load -> requests.get',
    ]);
  });
});
