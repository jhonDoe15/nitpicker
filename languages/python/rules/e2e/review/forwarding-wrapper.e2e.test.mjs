import { afterEach, describe, expect, it } from 'vitest';
import { PRICING, createProjectScripts } from '../../test-support/project-sources.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, dataOf } = createProjectScripts();
afterEach(cleanup);

describe.skipIf(!enabled)('forwarding-wrapper', () => {
  const wrappers = (code, extra = {}) =>
    dataOf('forwarding-wrapper', { 'shop/pricing.py': PRICING, 'shop/api.py': code, ...extra });
  const IMPORT = 'from shop.pricing import compute\n\n\n';

  it.each([
    [
      'a public wrapper of an imported function',
      `${IMPORT}def total(amount: int, rate: int = 2, *, cents: bool = False) -> int:\n    """Total."""\n    return compute(amount, rate, cents=cents)\n`,
      [['total', { target: 'compute', module: 'shop.pricing', exported: true }]],
    ],
    [
      'a private wrapper through the module',
      'from shop import pricing\n\n\ndef _total(amount: int, rate: int = 2, *, cents: bool = False) -> int:\n    return pricing.compute(amount, rate, cents=cents)\n',
      [['_total', { target: 'compute', module: 'shop.pricing', exported: false }]],
    ],
    [
      'a wrapper of a function in the same module',
      'def g(*args: int, **kwargs: str) -> int:\n    return 0\n\n\ndef f(*args: int, **kwargs: str) -> int:\n    return g(*args, **kwargs)\n',
      [['f', { target: 'g', module: null, exported: true }]],
    ],
    [
      'another default',
      `${IMPORT}def total(amount: int, rate: int = 3, *, cents: bool = False) -> int:\n    return compute(amount, rate, cents=cents)\n`,
      [],
    ],
    [
      'other parameter types',
      `${IMPORT}def total(amount: float, rate: int = 2, *, cents: bool = False) -> int:\n    return compute(amount, rate, cents=cents)\n`,
      [],
    ],
    [
      'reordered arguments',
      'def g(a: int, b: int) -> int:\n    return a\n\n\ndef f(a: int, b: int) -> int:\n    return g(b, a)\n',
      [],
    ],
    ['no annotations', 'def g(a, b):\n    return a\n\n\ndef f(a, b):\n    return g(a, b)\n', []],
    [
      'more work than the call',
      'def g(a: int) -> int:\n    return a\n\n\ndef f(a: int) -> int:\n    return g(a) + 1\n',
      [],
    ],
    [
      'a decorated or async wrapper',
      'def g(a: int) -> int:\n    return a\n\n\n@cache\ndef f(a: int) -> int:\n    return g(a)\n\n\nasync def h(a: int) -> int:\n    return g(a)\n',
      [],
    ],
    [
      'a method',
      'def g(a: int) -> int:\n    return a\n\n\nclass A:\n    def f(self, a: int) -> int:\n        return g(a)\n',
      [],
    ],
    [
      'a library function',
      'from os import getenv\n\n\ndef f(key: str) -> str | None:\n    return getenv(key)\n',
      [],
    ],
  ])('%s', (_name, code, expected) => {
    expect(wrappers(code)).toEqual(expected);
  });
});
