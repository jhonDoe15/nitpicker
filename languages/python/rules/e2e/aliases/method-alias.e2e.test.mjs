import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { ingestRulesReport } from '../../../ingest/rules-report.mjs';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const SUM = 'def _sum(self, items: list[int]) -> int:\n        return sum(items)\n';
const ALIAS = 'def total(self, items: list[int]) -> int:\n        return self._sum(items)\n';
const cart = (body, head = 'class Cart:') => `${head}\n    ${body}`;
const members = (...parts) =>
  parts
    .map((part) => `    ${part}`)
    .join('\n')
    .trimStart();
const withSum = (alias, head) => cart(`${SUM}\n    ${alias}`, head);
const FLAGGED = 'forwarding-method-alias:5 Cart.total -> _sum';

describe.skipIf(!enabled)('forwarding-method-alias', () => {
  it('flags a method that only passes its parameters to another method of its class', () => {
    const [actual, expected] = outcomes([
      ['a plain alias', withSum(ALIAS), [FLAGGED]],
      [
        'a docstring and the call',
        withSum(
          'def total(self, items: list[int]) -> int:\n        """Sum."""\n        return self._sum(items)\n',
        ),
        [FLAGGED],
      ],
      [
        'keyword-only parameters, a spread and a statement call',
        'class Mailer:\n    def _send(self, to: str, *, urgent: bool = False, **extra: str) -> None:\n        pass\n\n    def send(self, to: str, *, urgent: bool = False, **extra: str) -> None:\n        self._send(to, urgent=urgent, **extra)\n',
        ['forwarding-method-alias:5 Mailer.send -> _send'],
      ],
      [
        'a star parameter',
        'class Cart:\n    def _run(self, *args: int) -> int:\n        return sum(args)\n\n    def run(self, *args: int) -> int:\n        return self._run(*args)\n',
        ['forwarding-method-alias:5 Cart.run -> _run'],
      ],
      [
        'an awaited call in an async method',
        'class Loader:\n    async def _load(self, key: str) -> int:\n        return 1\n\n    async def load(self, key: str) -> int:\n        return await self._load(key)\n',
        ['forwarding-method-alias:5 Loader.load -> _load'],
      ],
      [
        'a nested class',
        `class Outer:\n    class Cart:\n        ${SUM.replaceAll('\n    ', '\n        ')}\n        ${ALIAS.replaceAll('\n    ', '\n        ')}`,
        ['forwarding-method-alias:6 Outer.Cart.total -> _sum'],
      ],
      [
        'a base class that does not define the name',
        `class Base:\n    def other(self) -> None:\n        pass\n\n\n${withSum(ALIAS, 'class Cart(Base):').replace('forwarding', 'forwarding')}`,
        ['forwarding-method-alias:10 Cart.total -> _sum'],
      ],
      [
        'an exception subclass',
        withSum(ALIAS, 'class CartError(Exception):'),
        [FLAGGED.replace('Cart.', 'CartError.')],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows a method that changes, adds or reorders anything', () => {
    const [actual, expected] = outcomes([
      ['a changed argument', withSum(ALIAS.replace('(items)', '(items[1:])')), []],
      [
        'a different order',
        'class Cart:\n    def _add(self, a: int, b: int) -> int:\n        return a + b\n\n    def add(self, a: int, b: int) -> int:\n        return self._add(b, a)\n',
        [],
      ],
      ['an extra argument', withSum(ALIAS.replace('(items)', '(items, 1)')), []],
      [
        'more statements',
        withSum(
          'def total(self, items: list[int]) -> int:\n        print(items)\n        return self._sum(items)\n',
        ),
        [],
      ],
      [
        'a transformed result',
        withSum(ALIAS.replace('self._sum(items)', 'self._sum(items) + 1')),
        [],
      ],
      ['another object', withSum(ALIAS.replace('self._sum', 'self.other._sum')), []],
      [
        'a module function',
        'def _sum(items: list[int]) -> int:\n    return sum(items)\n\n\nclass Cart:\n    def total(self, items: list[int]) -> int:\n        return _sum(items)\n',
        [],
      ],
      [
        'a call to itself',
        cart('def total(self, items: list[int]) -> int:\n        return self.total(items)\n'),
        [],
      ],
      [
        'no parameters besides self',
        cart(
          'def _sum(self) -> int:\n        return 1\n\n    def total(self) -> int:\n        return self._sum()\n',
        ),
        [],
      ],
      [
        'a statement call with a value return type',
        withSum('def total(self, items: list[int]) -> int:\n        self._sum(items)\n'),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows differing signatures, missing annotations and overloaded names', () => {
    const [actual, expected] = outcomes([
      [
        'another parameter type',
        cart(`${SUM.replace('list[int]', 'Sequence[int]')}\n    ${ALIAS}`),
        [],
      ],
      ['another return type', cart(`${SUM}\n    ${ALIAS.replace('-> int', '-> float')}`), []],
      [
        'another default',
        'class Cart:\n    def _sum(self, items: list[int], base: int = 0) -> int:\n        return base\n\n    def total(self, items: list[int], base: int = 1) -> int:\n        return self._sum(items, base)\n',
        [],
      ],
      [
        'another parameter name',
        'class Cart:\n    def _sum(self, items: list[int]) -> int:\n        return 0\n\n    def total(self, values: list[int]) -> int:\n        return self._sum(values)\n',
        [],
      ],
      [
        'no annotations',
        'class Cart:\n    def _sum(self, items):\n        return 0\n\n    def total(self, items):\n        return self._sum(items)\n',
        [],
      ],
      [
        'an async alias of a plain method',
        'class Cart:\n    def _sum(self, items: list[int]) -> int:\n        return 0\n\n    async def total(self, items: list[int]) -> int:\n        return self._sum(items)\n',
        [],
      ],
      ['two definitions of the alias', withSum(`${ALIAS}\n    ${ALIAS}`), []],
      ['two definitions of the target', cart(`${SUM}\n    ${SUM}\n    ${ALIAS}`), []],
      [
        'a property target',
        cart(
          `@property\n    ${SUM.replace('(self, items: list[int])', '(self)').replace('sum(items)', '1')}\n    def total(self) -> int:\n        return self._sum\n`,
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows decorators, protocol methods, published names, overrides and tests', () => {
    const [actual, expected] = outcomes([
      ['a decorated alias', withSum(`@staticmethod\n    ${ALIAS.replace('self, ', '')}`), []],
      ['a decorated alias with self', withSum(`@functools.cache\n    ${ALIAS}`), []],
      ['an overload', withSum(`@typing.overload\n    ${ALIAS}`), []],
      ['a decorated target', cart(`@functools.cache\n    ${SUM}\n    ${ALIAS}`), []],
      [
        'a dunder method',
        cart(
          `${SUM}\n    def __len__(self, items: list[int]) -> int:\n        return self._sum(items)\n`,
        ),
        [],
      ],
      ['a method named of', withSum(ALIAS.replace('total', 'of')), []],
      ['a method named from_', withSum(ALIAS.replace('total', 'from_')), []],
      [
        'an override of a base in the project',
        `class Base:\n    def total(self, items: list[int]) -> int:\n        return 0\n\n\n${withSum(ALIAS, 'class Cart(Base):')}`,
        [],
      ],
      [
        'a base from another package',
        `from lib import Base\n\n\n${withSum(ALIAS, 'class Cart(Base):')}`,
        [],
      ],
      [
        'a protocol base',
        `from typing import Protocol\n\n\n${withSum(ALIAS, 'class Cart(Protocol):')}`,
        [],
      ],
      ['a class keyword', withSum(ALIAS, 'class Cart(flag=True):'), []],
    ]);

    expect(actual).toEqual(expected);
    expect(findingsOf({ 'tests/test_cart.py': withSum(ALIAS) })).toEqual([]);
  });

  it('keeps the identity when lines move and reports a second alias as new', () => {
    const identities = (code) =>
      ingestRulesReport(
        JSON.stringify(
          findingsOf({ 'src/cart.py': code }).map((entry) => {
            const [rule, location, ...subject] = entry.split(' ');
            const [path, line] = location.split(':');
            return { rule, path, line: Number(line), subject: subject.join(' ') };
          }),
        ),
      );
    const base = identities(withSum(ALIAS));
    const moved = identities(`import os\n\n\nVALUE = os.sep\n\n\n${withSum(ALIAS)}`);
    const second = identities(withSum(`${ALIAS}\n    ${ALIAS.replace('total', 'size')}`));
    const same = compareFindings({ baseFindings: base, headFindings: moved });
    const added = compareFindings({ baseFindings: base, headFindings: second });

    expect([same.newFindings, same.unchangedFindings.length]).toEqual([[], 1]);
    expect(added.newFindings.map(({ subject }) => subject)).toEqual(['Cart.size -> _sum']);
  });

  it('leaves generated files alone', () => {
    const header = '# Generated by the protocol buffer compiler.  DO NOT EDIT!\n';

    expect(
      findingsOf({
        'src/cart.py': withSum(ALIAS),
        'src/cart_generated.py': `${header}${withSum(ALIAS)}`,
        'src/orders_pb2.py': withSum(ALIAS),
        'src/models.py': `${header}${withSum(ALIAS)}`,
      }),
    ).toEqual(['forwarding-method-alias src/cart.py:5 Cart.total -> _sum']);
  });
});
