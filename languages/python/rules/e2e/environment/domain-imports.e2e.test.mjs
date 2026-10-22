import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const lines = (...rows) => `${rows.join('\n')}\n`;

const CACHE = lines(
  'PRICES = {}',
  'LIMITS = {"default": 10}',
  '',
  '',
  'class Store:',
  '    def __init__(self):',
  '        self.items = []',
  '',
  '',
  'STORE = Store()',
  '',
  '',
  'def remember(symbol, price):',
  '    PRICES[symbol] = price',
);

describe.skipIf(!enabled)('logger-in-domain', () => {
  it('reports the logging libraries a domain module imports, not type-only imports', () => {
    const files = {
      'shop/domain/orders.py': lines(
        'import logging',
        'import structlog.stdlib',
        'from typing import TYPE_CHECKING',
        '',
        'from loguru import logger',
        '',
        'if TYPE_CHECKING:',
        '    from logging import Logger',
      ),
      'shop/adapters/orders.py': 'import logging\n',
    };

    expect(findingsOf(files)).toEqual([
      'logger-in-domain shop/domain/orders.py:1 logging',
      'logger-in-domain shop/domain/orders.py:2 structlog.stdlib',
      'logger-in-domain shop/domain/orders.py:5 loguru',
    ]);
  });
});

describe.skipIf(!enabled)('module-state-in-domain', () => {
  it('reports mutated collections and mutable instances a domain module uses, once each', () => {
    const files = {
      'shop/__init__.py': '',
      'shop/shared/__init__.py': 'from .cache import PRICES as ALL_PRICES\n',
      'shop/shared/cache.py': CACHE,
      'shop/domain/pricing.py': lines(
        'from shop.shared import ALL_PRICES, cache',
        'from shop.shared.cache import LIMITS',
        '',
        '',
        'def quote(symbol):',
        '    return ALL_PRICES[symbol] + LIMITS["default"] + len(cache.STORE.items)',
        '',
        '',
        'def again(symbol):',
        '    return cache.PRICES[symbol]',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'module-state-in-domain shop/domain/pricing.py:1 shop.shared.cache.PRICES',
      'module-state-in-domain shop/domain/pricing.py:6 shop.shared.cache.STORE',
      'module-level-mutable-state shop/shared/cache.py:14 PRICES in remember',
    ]);
  });

  it('leaves constants, frozen values and code outside domain/ alone', () => {
    const files = {
      'shop/shared/limits.py': lines(
        'from dataclasses import dataclass',
        '',
        'LIMITS = {"default": 10}',
        '',
        '',
        '@dataclass(frozen=True)',
        'class Policy:',
        '    limit: int',
        '',
        '',
        'DEFAULT = Policy(10)',
      ),
      'shop/domain/pricing.py': lines(
        'from shop.shared.limits import DEFAULT, LIMITS',
        '',
        '',
        'def cap(price):',
        '    return min(price, LIMITS["default"], DEFAULT.limit)',
      ),
      'shop/service.py': lines('from shop.shared.cache import PRICES', '', 'TOTAL = len(PRICES)'),
      'shop/shared/cache.py': CACHE,
    };

    expect(findingsOf(files)).toEqual([
      'module-level-mutable-state shop/shared/cache.py:14 PRICES in remember',
    ]);
  });
});

describe.skipIf(!enabled)('id and random-data libraries in domain code', () => {
  it('reports generator libraries and new ids, not parsing an id', () => {
    const files = {
      'shop/domain/ids.py': lines(
        'import nanoid',
        'from faker import Faker',
        'from ulid import ULID',
        '',
        '',
        'def parse(text):',
        '    return ULID.from_str(text)',
        '',
        '',
        'def fresh():',
        '    return ULID()',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'random-in-domain shop/domain/ids.py:1 import nanoid',
      'random-in-domain shop/domain/ids.py:2 import faker',
      'random-in-domain shop/domain/ids.py:11 ulid.ULID',
    ]);
  });
});
