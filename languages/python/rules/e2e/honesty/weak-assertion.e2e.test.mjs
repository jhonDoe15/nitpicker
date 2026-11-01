import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['test-without-assertion'] });
afterEach(cleanup);

const indent = (lines, spaces) => lines.map((line) => `${' '.repeat(spaces)}${line}\n`).join('');
const inTests = (code) => ({ file: 'tests/test_a.py', code });
const fn = (...lines) => inTests(`def test_a(x, m):\n${indent(lines, 4)}`);
const fnWith = (header, ...lines) =>
  inTests(`${header}\n\n\ndef test_a(x, m):\n${indent(lines, 4)}`);
const method = (...lines) =>
  inTests(
    `import unittest\n\n\nclass T(unittest.TestCase):\n    def test_a(self):\n${indent(lines, 8)}`,
  );
const flagged = (subject, line = 2) => [`weak-assertion:${String(line)} ${subject}`];

describe.skipIf(!enabled)('weak-assertion: presence only', () => {
  it('flags a presence check on a name, attribute or subscript', () => {
    const [actual, expected] = outcomes([
      ['assert a name', fn('assert x'), flagged('assert x')],
      ['assert an attribute', fn('assert x.value'), flagged('assert x.value')],
      ['assert a subscript', fn('assert x["a"]'), flagged("assert x['a']")],
      ['assert not', fn('assert not x'), flagged('assert not x')],
      ['assert not, even when used later', fn('assert not x', 'x.run()'), flagged('assert not x')],
      ['is not None', fn('assert x is not None'), flagged('assert x is not None')],
      ['!= None', fn('assert x != None'), flagged('assert x != None')],
      ['assertTrue', method('self.assertTrue(self.x)'), flagged('self.assertTrue(self.x)', 6)],
      ['assertFalse', method('self.assertFalse(self.x)'), flagged('self.assertFalse(self.x)', 6)],
      [
        'assertIsNotNone',
        method('self.assertIsNotNone(self.x)'),
        flagged('self.assertIsNotNone(self.x)', 6),
      ],
      ['an unrelated name used later', fn('assert x', 'y = m.a'), flagged('assert x')],
      ['a use before the assert', fn('x.run()', 'assert x'), flagged('assert x', 3)],
      ['an assignment later', fn('assert x', 'x = 1'), flagged('assert x')],
      [
        'a long check, shortened',
        fn('assert x.first_customer.shipping_address.postal_code_prefix.value'),
        flagged('assert x.first_customer.shipping_address.postal_code_prefix....'),
      ],
      [
        'a guard used in another function',
        inTests('def test_a(x):\n    assert x\n\n\ndef test_b(x):\n    x.run()\n'),
        flagged('assert x'),
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('allows an exact check, a predicate call and a narrowing guard', () => {
    const [actual, expected] = outcomes([
      ['an exact value', fn('assert x == 3'), []],
      ['an identity with a boolean', fn('assert x.paid is True'), []],
      ['a predicate call', fn('assert x.exists()'), []],
      ['a call result', fn('assert not x.items()'), []],
      ['an is None check', fn('assert x is None'), []],
      ['a comparison with a name', fn('assert x != y'), []],
      ['a guard before an attribute access', fn('assert x', 'assert x.value == 3'), []],
      ['a use in a nested function', fn('assert x', 'def helper():', '    return x.run()'), []],
      ['a narrowed optional', fn('assert x is not None', 'return x.value'), []],
      ['a != None guard', fn('assert x != None', 'y = x[0]'), []],
      ['an attribute used later', fn('assert x.a', 'assert x.a.b == 1'), []],
      [
        'assertTrue guarding a later use',
        method('self.assertTrue(self.x)', 'self.assertEqual(self.x.value, 3)'),
        [],
      ],
      [
        'assertIsNotNone guarding a later use',
        method('self.assertIsNotNone(self.x)', 'self.assertEqual(self.x.value, 3)'),
        [],
      ],
      ['a call argument', method('self.assertTrue(self.ready())'), []],
      ['production code', { file: 'src/mod.py', code: 'def run(x):\n    assert x\n' }, []],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('weak-assertion: non-empty only', () => {
  it('flags a size check that only asks for more than nothing', () => {
    const [actual, expected] = outcomes([
      ['len > 0', fn('assert len(x) > 0'), flagged('assert len(x) > 0')],
      ['len >= 1', fn('assert len(x) >= 1'), flagged('assert len(x) >= 1')],
      ['len != 0', fn('assert len(x) != 0'), flagged('assert len(x) != 0')],
      ['0 < len', fn('assert 0 < len(x)'), flagged('assert 0 < len(x)')],
      ['1 <= len', fn('assert 1 <= len(x)'), flagged('assert 1 <= len(x)')],
      ['0 != len', fn('assert 0 != len(x)'), flagged('assert 0 != len(x)')],
      ['a bare len', fn('assert len(x)'), flagged('assert len(x)')],
      ['!= empty list', fn('assert x != []'), flagged('assert x != []')],
      ['!= empty dict', fn('assert x.rows != {}'), flagged('assert x.rows != {}')],
      ['!= empty string', fn('assert x != ""'), flagged("assert x != ''")],
      ['!= empty tuple', fn('assert x != ()'), flagged('assert x != ()')],
      [
        'assertGreater',
        method('self.assertGreater(len(self.x), 0)'),
        flagged('self.assertGreater(len(self.x), 0)', 6),
      ],
      [
        'assertGreaterEqual',
        method('self.assertGreaterEqual(len(self.x), 1)'),
        flagged('self.assertGreaterEqual(len(self.x), 1)', 6),
      ],
      [
        'assertNotEqual',
        method('self.assertNotEqual(len(self.x), 0)'),
        flagged('self.assertNotEqual(len(self.x), 0)', 6),
      ],
      [
        'assertNotEqual, reversed',
        method('self.assertNotEqual(0, len(self.x))'),
        flagged('self.assertNotEqual(0, len(self.x))', 6),
      ],
      [
        'assertTrue(len > 0)',
        method('self.assertTrue(len(self.x) > 0)'),
        flagged('self.assertTrue(len(self.x) > 0)', 6),
      ],
      [
        'assertTrue(len)',
        method('self.assertTrue(len(self.x))'),
        flagged('self.assertTrue(len(self.x))', 6),
      ],
      ['no narrowing for a size', fn('assert len(x) > 0', 'x.run()'), flagged('assert len(x) > 0')],
    ]);
    expect(actual).toEqual(expected);
  });

  it('allows an exact size and what tautological-assert already reports', () => {
    const [actual, expected] = outcomes([
      ['an exact length', fn('assert len(x) == 3'), []],
      ['a minimum above one', fn('assert len(x) > 1'), []],
      ['an empty check', fn('assert len(x) == 0'), []],
      ['not len', fn('assert not len(x)'), []],
      ['a non-empty literal', fn('assert x != [1]'), []],
      ['assertGreater against two', method('self.assertGreater(len(self.x), 2)'), []],
      ['assertEqual of the length', method('self.assertEqual(len(self.x), 3)'), []],
      [
        'len >= 0 stays with tautological-assert',
        fn('assert len(x) >= 0'),
        ['tautological-assert:2 assert'],
      ],
      [
        'assertGreaterEqual against 0 stays with tautological-assert',
        method('self.assertGreaterEqual(len(self.x), 0)'),
        ['tautological-assert:6 assertGreaterEqual'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('weak-assertion: called only', () => {
  const anyFrom = 'from unittest.mock import ANY';

  it('flags a call check that pins no arguments', () => {
    const [actual, expected] = outcomes([
      ['called', fn('assert m.called'), flagged('assert m.called')],
      ['awaited', fn('assert m.awaited'), flagged('assert m.awaited')],
      ['call_count > 0', fn('assert m.call_count > 0'), flagged('assert m.call_count > 0')],
      ['call_count >= 1', fn('assert m.call_count >= 1'), flagged('assert m.call_count >= 1')],
      ['call_count != 0', fn('assert m.call_count != 0'), flagged('assert m.call_count != 0')],
      ['a bare call_count', fn('assert m.call_count'), flagged('assert m.call_count')],
      ['a bare await_count', fn('assert m.await_count'), flagged('assert m.await_count')],
      [
        'assertTrue(called)',
        method('self.assertTrue(self.m.called)'),
        flagged('self.assertTrue(self.m.called)', 6),
      ],
      ['assert_called', fn('m.assert_called()'), flagged('m.assert_called()')],
      ['assert_awaited', fn('m.assert_awaited()'), flagged('m.assert_awaited()')],
      [
        'assert_called_with of only ANY',
        fnWith(anyFrom, 'm.assert_called_with(ANY, ANY)'),
        flagged('m.assert_called_with(ANY, ANY)', 5),
      ],
      [
        'assert_called_once_with of keyword ANY',
        fnWith(anyFrom, 'm.assert_called_once_with(a=ANY, b=ANY)'),
        flagged('m.assert_called_once_with(a=ANY, b=ANY)', 5),
      ],
      [
        'assert_any_call of mock.ANY',
        fnWith('from unittest import mock', 'm.assert_any_call(mock.ANY)'),
        flagged('m.assert_any_call(mock.ANY)', 5),
      ],
      [
        'assert_awaited_with of unittest.mock.ANY',
        fnWith('import unittest.mock', 'm.assert_awaited_with(unittest.mock.ANY)'),
        flagged('m.assert_awaited_with(unittest.mock.ANY)', 5),
      ],
      [
        'assert_awaited_once_with of an aliased ANY',
        fnWith('from unittest.mock import ANY as anything', 'm.assert_awaited_once_with(anything)'),
        flagged('m.assert_awaited_once_with(anything)', 5),
      ],
      [
        'assert_any_await of the mock backport',
        fnWith('from mock import ANY', 'm.assert_any_await(ANY)'),
        flagged('m.assert_any_await(ANY)', 5),
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('allows a pinned count, pinned arguments and a negative check', () => {
    const [actual, expected] = outcomes([
      ['assert_called_once', fn('m.assert_called_once()'), []],
      ['assert not called', fn('assert not m.called'), []],
      ['assertFalse(called)', method('self.assertFalse(self.m.called)'), []],
      ['call_count == 2', fn('assert m.call_count == 2'), []],
      ['call_count > 1', fn('assert m.call_count > 1'), []],
      ['assert_called_once_with a value', fn('m.assert_called_once_with(3)'), []],
      ['one real argument beside ANY', fnWith(anyFrom, 'm.assert_called_with(ANY, 3)'), []],
      ['a real keyword beside ANY', fnWith(anyFrom, 'm.assert_called_with(ANY, key=3)'), []],
      ['no arguments', fn('m.assert_called_with()'), []],
      [
        'an ANY defined in the project',
        fnWith('from helpers import ANY', 'm.assert_called_with(ANY)'),
        [],
      ],
      ['a starred argument', fnWith(anyFrom, 'm.assert_called_with(*ANY)'), []],
    ]);
    expect(actual).toEqual(expected);
  });
});
