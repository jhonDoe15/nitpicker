import { afterEach, describe, expect, it } from 'vitest';
import { STATUS, createProjectScripts } from '../../test-support/project-sources.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, dataOf, only } = createProjectScripts();
afterEach(cleanup);

describe.skipIf(!enabled)('exhaustive-enum-predicate', () => {
  const predicates = (code, extra = {}) =>
    dataOf('exhaustive-enum-predicate', { 'shop/status.py': STATUS + code, ...extra });

  it.each([
    [
      'a returned or-chain of some members',
      'def is_open(s: Status) -> bool:\n    return s == Status.NEW or s == Status.PAID\n',
      [['is_open Status', { union: 'Status' }]],
    ],
    [
      'an and-chain of is not, assigned',
      'def f(s: Status) -> None:\n    closed = s is not Status.NEW and s is not Status.PAID\n',
      [['f Status', { union: 'Status' }]],
    ],
    [
      'a membership test of every member',
      'def known(s: Status) -> bool:\n    return s in (Status.NEW, Status.PAID, Status.SHIPPED)\n',
      [],
    ],
    [
      'every member but an alias',
      'class Mode(enum.Enum):\n    A = 1\n    B = 2\n    C = 3\n    DEFAULT = A\n    OTHER = 2\n\n\ndef f(m: Mode) -> bool:\n    return m in (Mode.A, Mode.B, Mode.C)\n',
      [],
    ],
    [
      'some members next to an alias',
      'class Mode(enum.Enum):\n    A = 1\n    B = 2\n    C = 3\n    DEFAULT = A\n\n\ndef f(m: Mode) -> bool:\n    return m in (Mode.A, Mode.DEFAULT)\n',
      [],
    ],
    [
      'a negated list of every member',
      'def f(s: Status) -> bool:\n    return s != Status.NEW and s != Status.PAID and s != Status.SHIPPED\n',
      [],
    ],
    [
      'a predicate inside not and a conditional',
      'def f(s: Status, x: bool) -> bool:\n    return not (s == Status.NEW or s == Status.PAID) if x else x\n',
      [['f Status', { union: 'Status' }]],
    ],
    [
      'a lambda body',
      'OPEN = lambda s: s in {Status.NEW, Status.PAID}\n',
      [['Status', { union: 'Status' }]],
    ],
    [
      'a Literal alias parameter',
      'from typing import Literal\nKind = Literal["a", "b", "c"]\ndef f(k: Kind | None) -> bool:\n    return k == "a" or k == "b"\n',
      [['f Kind', { union: 'Kind' }]],
    ],
    [
      'an augmented assignment',
      'def f(s: Status, ok: bool) -> bool:\n    ok |= s == Status.NEW or s == Status.PAID\n    return ok\n',
      [['f Status', { union: 'Status' }]],
    ],
    [
      'a nested enum',
      'class Order:\n    class Kind(enum.Enum):\n        A = 1\n        B = 2\n        C = 3\n\n\ndef f(k: Order.Kind) -> bool:\n    return k in (Order.Kind.A, Order.Kind.B)\n',
      [['f Kind', { union: 'Kind' }]],
    ],
    [
      'an enum deriving from a project enum base',
      'class Base(enum.Enum):\n    pass\n\n\nclass Color(Base):\n    RED = 1\n    GREEN = 2\n    BLUE = 3\n\n\ndef f(c: Color) -> bool:\n    return c is Color.RED or c is Color.BLUE\n',
      [['f Color', { union: 'Color' }]],
    ],
    [
      'a Flag, also through a project base',
      'class Perm(enum.Flag):\n    R = 1\n    W = 2\n    X = 4\n\n\nclass Base(enum.IntFlag):\n    pass\n\n\nclass Bits(Base):\n    A = 1\n    B = 2\n    C = 4\n\n\ndef f(p: Perm, b: Bits) -> bool:\n    return (p == Perm.R or p == Perm.W) and (b == Bits.A or b == Bits.B)\n',
      [],
    ],
    [
      'a predicate method of the enum itself',
      'class Stage(enum.Enum):\n    A = 1\n    B = 2\n    C = 3\n\n    def is_early(self) -> bool:\n        return self in (Stage.A, Stage.B)\n\n    def is_open(self, s: Status) -> bool:\n        return s in (Status.NEW, Status.PAID)\n',
      [['Stage.is_open Status', { union: 'Status' }]],
    ],
    [
      'an Annotated or string Literal annotation',
      'from typing import Annotated, Literal\nKind = Literal["a", "b", "c"]\ndef f(k: Annotated[Kind, "doc"], m: "Kind") -> bool:\n    one = k == "a" or k == "b"\n    two = m == "a" or m == "c"\n    return one and two\n',
      [
        ['f Kind', { union: 'Kind' }],
        ['f Kind', { union: 'Kind' }],
      ],
    ],
    [
      'an if condition',
      'def f(s: Status) -> int:\n    if s == Status.NEW or s == Status.PAID:\n        return 1\n    return 0\n',
      [],
    ],
    ['a single membership value', 'def f(s: Status) -> bool:\n    return s in (Status.NEW,)\n', []],
    [
      'one member compared twice',
      'def f(s: Status) -> bool:\n    return s == Status.NEW or s == Status.NEW\n',
      [],
    ],
    [
      'two different subjects',
      'def f(s: Status, t: Status) -> bool:\n    return s == Status.NEW or t == Status.PAID\n',
      [],
    ],
    [
      'a type guard',
      'def f(s: object) -> TypeGuard[Status]:\n    return s == Status.NEW or s == Status.PAID\n',
      [],
    ],
    [
      'a library enum',
      'from http import HTTPStatus\ndef f(s: HTTPStatus) -> bool:\n    return s == HTTPStatus.OK or s == HTTPStatus.CREATED\n',
      [],
    ],
  ])('%s', (_name, code, expected) => {
    expect(predicates(code)).toEqual(expected);
  });

  it('skips an enum of two members', () => {
    const two = 'import enum\nclass Side(enum.Enum):\n    LEFT = 1\n    RIGHT = 2\n';
    expect(
      predicates('', {
        'shop/side.py': `${two}def f(s: Side) -> bool:\n    return s == Side.LEFT or s == Side.RIGHT\n`,
      }),
    ).toEqual([]);
  });

  it('finds an enum imported from another project module', () => {
    expect(
      only('exhaustive-enum-predicate', {
        'shop/__init__.py': '',
        'shop/status.py': STATUS,
        'shop/orders.py':
          'from shop import status\nfrom .status import Status\n\n\ndef f(s: Status) -> bool:\n    return s is status.Status.NEW or s is Status.PAID\n',
      }),
    ).toEqual(['exhaustive-enum-predicate shop/orders.py:6 f Status']);
  });

  it('follows a Literal alias through a module attribute and re-exports', () => {
    expect(
      dataOf('exhaustive-enum-predicate', {
        'shop/__init__.py': '',
        'shop/kinds.py': 'from typing import Literal\nMode = Literal["a", "b", "c"]\n',
        'shop/types.py': 'from shop.kinds import Mode\n',
        'shop/api.py':
          'from shop import types as st\nfrom shop.types import Mode\n\n\ndef f(m: st.Mode, n: Mode) -> bool:\n    one = m == "a" or m == "b"\n    two = n == "a" or n == "c"\n    return one and two\n',
      }),
    ).toEqual([
      ['f Mode', { union: 'Mode' }],
      ['f Mode', { union: 'Mode' }],
    ]);
  });
});
