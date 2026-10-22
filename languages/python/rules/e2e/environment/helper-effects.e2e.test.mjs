import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts({ hidden: ['http-without-timeout'] });
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
      `io-in-domain app/domain/pricing.py:7 fetch via quote -> ${CHAIN}`,
      `io-in-domain app/domain/pricing.py:11 fetch via quote_again -> ${CHAIN}`,
      'clock-now app/domain/pricing.py:15 stamp via when -> app.shared.current_prices.stamp -> datetime.datetime.now',
      'random-in-domain app/domain/pricing.py:19 token via ident -> app.shared.current_prices.token -> uuid.uuid4',
      'io-in-domain app/domain/pricing.py:23 Client.__init__ via connect -> app.shared.current_prices.Client.__init__ -> app.shared.current_prices.Client.login -> requests.post',
      'io-in-domain app/domain/pricing.py:27 ping via bounce -> app.shared.current_prices.ping -> requests.head',
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
      'io-in-domain app/domain/rates.py:3 get_json via app.shared.http.get_json -> requests.get',
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
      `io-in-domain app/domain/inner.py:5 fetch via local -> ${CHAIN}`,
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
