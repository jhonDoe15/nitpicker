import { describe, expect, it } from 'vitest';
import { pythonUsable } from '../../metrics/python-helpers.mjs';
import { designFacts, factsById } from './test-support/design-harness.mjs';

const CART = 'app/core/cart.py#Cart';
const REPO = 'app/core/repo.py';
const SERVICES = 'app/services.py';

const MODEL = 'app/model.py';

function session(member, line, extra = {}) {
  return { target: `${MODEL}#Session.${member}`, line, receiver: 'session', ...extra };
}

function callsOf(byId, id) {
  return byId.callable(id).calls;
}

describe.skipIf(!pythonUsable())('the Python design producer call resolution', () => {
  const byId = factsById(designFacts('resolution'));

  it('resolves receivers by annotation, instantiation, import alias, class and inheritance', () => {
    expect(callsOf(byId, `${SERVICES}#Service.run`)).toEqual([
      { target: `${REPO}#Repo.save`, line: 22, receiver: 'self.repo' },
      { target: `${REPO}#SqlRepo.save`, line: 24, receiver: 'self.sql' },
      { target: `${REPO}#Repo.load`, line: 25, receiver: 'self.store' },
      { target: `${SERVICES}#Service.helper`, line: 26, receiver: 'self' },
      { target: `${CART}.create`, line: 27 },
      { target: `${CART}.blank`, line: 28 },
      { target: `${CART}.add`, line: 29, receiver: 'self.cart' },
      { target: `${CART}.size`, line: 30, receiver: 'self.cart' },
      { target: `${CART}.named`, line: 31, receiver: 'self.cart' },
      { target: `${CART}.add`, line: 31 },
      { target: `${CART}.__init__`, line: 32 },
      { target: `${CART}.add`, line: 33, receiver: 'local' },
      { target: 'app/helpers.py#total', line: 34 },
      { target: 'app/helpers.py#total', line: 35 },
      { target: `${REPO}#Repo.load`, line: 36 },
    ]);
  });

  it('keys an alias of a field by the field and records the property read', () => {
    const run = byId.callable(`${SERVICES}#Service.run`);

    expect(run.reads).toEqual([{ type: CART, fields: ['size'], line: 30 }]);
    expect(run.ownFields).toEqual(['cart', 'repo', 'untyped', 'sql', 'store']);
  });

  it('follows Optional and quoted annotations and awaited coroutines', () => {
    expect(callsOf(byId, `${SERVICES}#Service.maybe`)).toEqual([
      { target: `${CART}.add`, line: 42, receiver: 'cart' },
      { target: `${CART}.add`, line: 43, receiver: 'text' },
    ]);
    expect(callsOf(byId, `${SERVICES}#use`)).toEqual([
      { target: `${SERVICES}#Service.fetch`, line: 50, receiver: 'service' },
      { target: `${CART}.add`, line: 51, receiver: 'cart' },
      { target: `${SERVICES}#Service.fetch`, line: 52, receiver: 'service' },
    ]);
  });

  it('resolves super() to the base method and a local import to its binding', () => {
    expect(callsOf(byId, `${REPO}#Child.start`)).toEqual([
      { target: `${REPO}#Base.start`, line: 21, receiver: 'self' },
    ]);
    expect(callsOf(byId, `${SERVICES}#lazy`)).toEqual([{ target: `${REPO}#Repo.save`, line: 72 }]);
  });

  it('resolves a class method and a static method through the class and its constructor calls', () => {
    expect(callsOf(byId, `${CART}.create`)).toEqual([{ target: `${CART}.__init__`, line: 10 }]);
    expect(callsOf(byId, `${CART}.blank`)).toEqual([{ target: `${CART}.__init__`, line: 14 }]);
  });

  it('resolves a variable only while all its assignments agree on one type', () => {
    expect(callsOf(byId, `${SERVICES}#reassigned`)).toEqual([
      { target: `${CART}.__init__`, line: 57 },
    ]);
    expect(callsOf(byId, `${SERVICES}#repeated`)).toEqual([
      { target: `${CART}.__init__`, line: 64 },
      { target: `${CART}.__init__`, line: 65 },
      { target: `${CART}.add`, line: 66, receiver: 'value' },
    ]);
  });

  it.each([
    ['an unannotated attribute', `${SERVICES}#Service.run`, 23],
    ['a loop variable', `${SERVICES}#unknown_calls`, 77],
    ['a name that no import binds', 'app/lonely.py#lonely', 2],
  ])('leaves out a call on %s', (_label, id, line) => {
    expect(callsOf(byId, id).filter((call) => call.line === line)).toEqual([]);
  });

  it('resolves a plain module function call and the last of two definitions', () => {
    expect(callsOf(byId, `${SERVICES}#unknown_calls`)).toEqual([
      { target: 'app/helpers.py#caller', line: 78 },
    ]);
    expect(callsOf(byId, 'app/helpers.py#caller')).toEqual([]);
  });
});

describe.skipIf(!pythonUsable())('the Python design producer cleanup calls', () => {
  const byId = factsById(designFacts('lifecycle'));
  const SESSION = 'db/session.py';
  const USAGE = 'db/usage.py';

  function step(target, line, receiver) {
    return { target: `${SESSION}#${target}`, line, receiver };
  }

  function cleanup(target, line, receiver) {
    return { ...step(target, line, receiver), cleanup: true };
  }

  it.each([
    [
      'finally',
      'manual',
      [
        { target: `${SESSION}#Session.begin`, line: 7, receiver: 'session' },
        { target: `${SESSION}#Session.write`, line: 9, receiver: 'session' },
        cleanup('Session.close', 11, 'session'),
      ],
    ],
    [
      'nested finally',
      'nested_finally',
      [
        { target: `${SESSION}#Session.begin`, line: 16, receiver: 'session' },
        cleanup('Session.rollback', 19, 'session'),
        cleanup('Session.close', 21, 'session'),
      ],
    ],
    [
      'except and else',
      'not_cleanup',
      [
        { target: `${SESSION}#Session.begin`, line: 26, receiver: 'session' },
        { target: `${SESSION}#Session.rollback`, line: 28, receiver: 'session' },
        { target: `${SESSION}#Session.commit`, line: 30, receiver: 'session' },
      ],
    ],
  ])('marks calls in %s blocks as cleanup only inside finally', (_label, name, expected) => {
    expect(callsOf(byId, `${USAGE}#${name}`)).toEqual(expected);
  });

  it.each([
    [
      'a with block on a project context manager',
      'with_own_value',
      [
        step('Session.begin', 34, 'session'),
        { target: `${SESSION}#Session.write`, line: 35, receiver: 'session' },
        cleanup('Session.commit', 34, 'session'),
        cleanup('Session.close', 34, 'session'),
      ],
    ],
    [
      'a with block on a parameter',
      'with_parameter',
      [
        step('Session.begin', 39, 'session'),
        { target: `${SESSION}#Session.write`, line: 40, receiver: 'session' },
        cleanup('Session.commit', 39, 'session'),
        cleanup('Session.close', 39, 'session'),
      ],
    ],
    [
      'a with block on a field',
      'Holder.run',
      [
        step('Session.begin', 54, 'self.session'),
        { target: `${SESSION}#Session.write`, line: 55, receiver: 'self.session' },
        cleanup('Session.commit', 54, 'self.session'),
        cleanup('Session.close', 54, 'self.session'),
      ],
    ],
    [
      'an async with block, for the manager and the value it returns',
      'Holder.run_async',
      [
        { target: `${SESSION}#Session.write`, line: 59, receiver: 'opened' },
        cleanup('Session.close', 58, 'self.pool'),
        cleanup('Session.close', 58, 'opened'),
      ],
    ],
    [
      'a with block whose exit closes only on one branch',
      'conditional_exit',
      [
        { target: `${SESSION}#Session.write`, line: 64, receiver: 'session' },
        cleanup('Session.close', 63, 'session'),
      ],
    ],
    ['contextlib.closing', 'closing_resource', [cleanup('Resource.close', 73, 'resource')]],
  ])('adds the enter and the exit of %s, the exit as cleanup calls', (_label, name, expected) => {
    expect(callsOf(byId, `${USAGE}#${name}`)).toEqual(expected);
  });

  it.each([
    ['Managed.__enter__', 21, ['Session.commit', 'Session.close']],
    ['AsyncManaged.__aenter__', 31, ['Session.close']],
  ])('lets %s own the close its exit makes', (name, line, closes) => {
    const ownCalls = name === 'Managed.__enter__' ? [step('Session.begin', 20, 'self')] : [];

    expect(callsOf(byId, `${SESSION}#${name}`)).toEqual([
      ...ownCalls,
      ...closes.map((target) => cleanup(target, line, 'self')),
    ]);
  });

  it.each(['opaque_value', 'external_context'])(
    'adds no exit when the context manager of %s is not a project type',
    (name) => {
      expect(callsOf(byId, `${USAGE}#${name}`)).toEqual([]);
    },
  );
});

describe.skipIf(!pythonUsable())('the Python design producer mutation marks', () => {
  const byId = factsById(designFacts('mutation'));
  const LINES = 'inventory.py#Inventory.lines';

  it.each([
    ['direct', { target: LINES, line: 5, receiver: 'inv', mutation: 'append' }],
    ['aliased', { target: LINES, line: 9, receiver: 'inv', mutation: 'extend' }],
    ['first_change_wins', { target: LINES, line: 16, receiver: 'inv', mutation: 'sort' }],
    [
      'subscript_assignment',
      { target: 'inventory.py#Inventory.index', line: 22, receiver: 'inv', mutation: 'assign' },
    ],
    ['attribute_assignment', { target: LINES, line: 27, receiver: 'inv', mutation: 'assign' }],
    [
      'property_mutation',
      { target: 'inventory.py#Inventory.view', line: 47, receiver: 'inv', mutation: 'append' },
    ],
    [
      'awaited',
      { target: 'inventory.py#Inventory.fetch', line: 56, receiver: 'inv', mutation: 'append' },
    ],
  ])('marks the call in %s with the mutation of its result', (name, expected) => {
    expect(callsOf(byId, `client.py#${name}`)).toEqual([expected]);
  });

  it.each([
    ['reassigned', 31],
    ['copied', 37],
    ['read_only', 42],
    ['not_awaited', 61],
  ])('does not mark the call in %s', (name, line) => {
    expect(callsOf(byId, `client.py#${name}`)).toEqual([
      {
        target: name === 'not_awaited' ? 'inventory.py#Inventory.fetch' : LINES,
        line,
        receiver: 'inv',
      },
    ]);
  });

  it('does not mark a call whose result is passed to a project method', () => {
    expect(callsOf(byId, 'client.py#project_method')).toEqual([
      { target: 'inventory.py#Inventory.add', line: 51, receiver: 'inv' },
      { target: 'inventory.py#Inventory.text', line: 52, receiver: 'inv' },
    ]);
  });

  it.each([
    ['Inventory.lines', '_lines'],
    ['Inventory.index', '_index'],
    ['Inventory.view', '_lines'],
    ['Inventory.text', 'label'],
    ['Inventory.fetch', '_lines'],
  ])('records that %s returns the field %s', (name, field) => {
    expect(byId.callable(`inventory.py#${name}`).returnsField).toBe(field);
  });
});

describe.skipIf(!pythonUsable())('the Python design producer closures', () => {
  const byId = factsById(designFacts('closures'));
  it('folds the calls, uses, decisions and reads of nested functions and lambdas into the function', () => {
    const { calls, paramUses, decisions, reads, returns } = byId.callable('app/usage.py#settle');
    expect({ calls, paramUses, decisions, reads, returns }).toEqual({
      calls: [
        { target: `${MODEL}#Order.lines`, line: 12, receiver: 'order', mutation: 'append' },
        session('begin', 13),
        session('close', 18, { cleanup: true }),
      ],
      paramUses: [
        { param: 0, fields: ['status', 'lines', 'total'], forwards: [] },
        { param: 1, fields: ['begin', 'close'], forwards: [] },
      ],
      decisions: [{ subject: `${MODEL}#Status`, groups: [['OPEN'], ['PAID']], line: 6 }],
      reads: [
        { type: `${MODEL}#Order`, fields: ['status', 'total'], line: 6, decided: ['status'] },
      ],
      returns: 'int',
    });
  });

  it('does not count a close inside a lambda as cleanup, even when the lambda sits in a finally', () => {
    expect(callsOf(byId, 'app/usage.py#deferred')).toEqual([
      session('begin', 22),
      session('close', 26),
    ]);
  });

  it('leaves a name untyped when a lambda parameter reuses it', () => {
    const { calls, paramUses } = byId.callable('app/usage.py#shadowing');
    expect({ calls, paramUses }).toEqual({
      calls: [],
      paramUses: [{ param: 0, fields: ['begin'], forwards: [], opaque: true }],
    });
  });
});
