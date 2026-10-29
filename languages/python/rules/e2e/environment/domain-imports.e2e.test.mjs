import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts({ hidden: ['pydantic-boundary'] });
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
  '    def add(self, item):',
  '        self.items.append(item)',
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
      'module-level-mutable-state shop/shared/cache.py:17 PRICES in remember',
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
      'module-level-mutable-state shop/shared/cache.py:17 PRICES in remember',
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

const PACKAGES = {
  'shop/__init__.py': '',
  'shop/shared/__init__.py': '',
  'shop/domain/__init__.py': '',
};
const REGISTRY = lines(
  'handlers = {}',
  '',
  '',
  'def register(key, value):',
  '    handlers[key] = value',
);

describe.skipIf(!enabled)('domain imports, reviewed cases', () => {
  it('reports project logging modules by absolute and relative import', () => {
    const files = {
      ...PACKAGES,
      'shop/logging.py': 'X = 1\n',
      'shop/shared/log.py': lines(
        'import logging',
        '',
        '',
        'def get_logger():',
        '    return logging.getLogger("x")',
      ),
      'shop/domain/logger.py': 'X = 1\n',
      'shop/domain/pricing.py': lines(
        'from shop.logging import X',
        'from shop.shared.log import get_logger',
        '',
        'from . import logger',
        'from .logger import X as Y',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'logger-in-domain shop/domain/pricing.py:1 shop.logging',
      'logger-in-domain shop/domain/pricing.py:2 shop.shared.log',
      'logger-in-domain shop/domain/pricing.py:4 shop.domain.logger',
      'logger-in-domain shop/domain/pricing.py:5 shop.domain.logger',
    ]);
  });

  it('leaves type-only imports of id, random and input-output libraries alone', () => {
    const files = {
      'shop/domain/pricing.py': lines(
        'import typing as t',
        '',
        'if t.TYPE_CHECKING:',
        '    import requests',
        '    from faker import Faker',
        '',
        '',
        'def name(fake: "Faker", session: "requests.Session") -> str:',
        '    return fake.name()',
      ),
    };

    expect(findingsOf(files)).toEqual([]);
  });

  it('follows only imported modules, not parameters, locals or attributes named like them', () => {
    const files = {
      ...PACKAGES,
      'shop/shared/registry.py': REGISTRY,
      'shop/shared/time.py': lines('timers = {}', '', '', 'def start(key):', '    timers[key] = 1'),
      'shop/domain/pricing.py': lines(
        'import time',
        '',
        'from shop.shared import registry',
        '',
        '',
        'def apply(order, consts):',
        '    registry = order.registry',
        '    return registry.handlers, consts.handlers, order.registry.handlers, time.timers',
        '',
        '',
        'class Service:',
        '    def run(self):',
        '        return self.registry.handlers',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'module-level-mutable-state shop/shared/registry.py:5 handlers in register',
      'module-level-mutable-state shop/shared/time.py:5 timers in start',
    ]);
  });

  it('reports a mutated instance, not frozen values or instances that nothing mutates', () => {
    const files = {
      ...PACKAGES,
      'shop/shared/values.py': lines(
        'import enum',
        'from typing import NamedTuple',
        '',
        'import attr',
        'import attrs',
        'from pydantic import BaseModel, ConfigDict',
        '',
        '',
        'class Money(BaseModel):',
        '    model_config = ConfigDict(frozen=True)',
        '    amount: int',
        '',
        '',
        'class LegacyMoney(BaseModel):',
        '    amount: int',
        '',
        '    class Config:',
        '        allow_mutation = False',
        '',
        '',
        '@attrs.frozen',
        'class Rate:',
        '    value: int',
        '',
        '',
        '@attr.s(frozen=True)',
        'class Limit:',
        '    value = attr.ib()',
        '',
        '',
        'class Pair(NamedTuple):',
        '    left: int',
        '',
        '',
        'class Kind(enum.Enum):',
        '    A = 1',
        '',
        '',
        'class Policy:',
        '    def __init__(self, rate):',
        '        self.rate = rate',
        '',
        '    def apply(self, value):',
        '        return value * self.rate',
        '',
        '',
        'class Tally:',
        '    count = 0',
        '',
        '',
        'ZERO = Money(amount=0)',
        'LEGACY = LegacyMoney(amount=0)',
        'RATE = Rate(1)',
        'LIMIT = Limit(2)',
        'PAIR = Pair(1)',
        'POLICY = Policy(0.2)',
        'COUNTER = Tally()',
        '',
        '',
        'def touch():',
        '    ZERO.amount = LEGACY.amount = RATE.value = LIMIT.value = COUNTER.count = 1',
      ),
      'shop/domain/pricing.py': lines(
        'from shop.shared.values import COUNTER, LEGACY, LIMIT, PAIR, POLICY, RATE, ZERO, Kind',
        '',
        '',
        'def total(value):',
        '    return POLICY.apply(value), ZERO, LEGACY, RATE, LIMIT, PAIR, Kind.A, COUNTER',
      ),
    };

    expect(findingsOf(files)).toEqual([
      'module-state-in-domain shop/domain/pricing.py:1 shop.shared.values.COUNTER',
      'module-level-mutable-state shop/shared/values.py:61 COUNTER in touch',
    ]);
  });
});
