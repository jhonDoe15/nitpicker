import { describe, expect, it } from 'vitest';
import { file, fn, klass, parameter, property, run, summary } from '../../test-support/facts.mjs';
import { SUSPENDED_UPDATE_RULE, suspendedUpdateFindings } from './suspended-updates.mjs';

const suspendFun = (name, owner = 'Ledger', overrides = {}) =>
  fn(name, { owner, modifiers: ['suspend'], ...overrides });
const plainFun = (name, owner = 'Ledger') => fn(name, { owner });
const call = (name, receiver = { kind: 'none' }) => ({ k: 'call', name, receiver });
const read = (name, viaThis = false) => ({ k: 'read', name, viaThis });
const scopes = (extra = [], supers = []) => [
  { k: 'fun', name: 'add' },
  { k: 'class', name: 'Ledger', qualified: 'Ledger', supers, visibility: 'public' },
  ...extra,
];
const update = (value, overrides = {}) => ({
  line: 9,
  operator: '+=',
  target: 'total',
  viaThis: false,
  value,
  branching: false,
  locals: [],
  scopes: scopes(),
  ...overrides,
});
const ledger = (overrides = {}) =>
  file({
    classes: [
      klass('Ledger', {
        primaryParameters: [parameter('repository', 'Repository', { property: 'val' })],
      }),
    ],
    properties: [property('total', 'Ledger', { var: true })],
    functions: [suspendFun('add'), suspendFun('load')],
    updates: [update([call('load')])],
    topLevelProperties: [],
    ...overrides,
  });
const findingsFor = (files, declaredIn = files) =>
  run(suspendedUpdateFindings, files, { declaredIn });

describe('updates across a suspension in Kotlin', () => {
  it('reports a property updated from a suspend function of its class, with the exception route', () => {
    const findings = findingsFor([ledger()]);

    expect(summary(findings)).toEqual([`${SUSPENDED_UPDATE_RULE} Ledger.total in add 9`]);
    expect(findings[0].tool).toBe('pmd');
    expect(findings[0].message).toBe(
      '`total` is updated from a value read before `load()` suspends: another coroutine can change it ' +
        'meanwhile, and this write then overwrites that change. Call `load()` into a local first ' +
        '(`val delta = load()`, then update `total`), or hold one Mutex around the whole read-modify-write ' +
        '(`mutex.withLock { ... }`). If this is intended, add {"rule":"pmd/NonAtomicUpdateAcrossSuspension",' +
        '"paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    ['this calls', update([call('load', { kind: 'this' })], { viaThis: true })],
    ['a minus assignment', update([call('load')], { operator: '-=' })],
    ['a rewritten read', update([read('total'), call('load')], { operator: '=' })],
    ['a read through this', update([read('total', true), call('load')], { operator: '=' })],
  ])('reports %s', (_name, entry) => {
    expect(findingsFor([ledger({ updates: [entry] })])).toHaveLength(1);
  });

  it('reports a constructor var, a var of an object and a same-file top level var', () => {
    const constructorVar = ledger({
      classes: [
        klass('Ledger', { primaryParameters: [parameter('total', 'Int', { property: 'var' })] }),
      ],
      properties: [],
    });
    const topLevel = ledger({
      properties: [],
      topLevelProperties: [{ name: 'total', var: true, delegated: false }],
    });

    expect(findingsFor([constructorVar])).toHaveLength(1);
    expect(summary(findingsFor([topLevel]))).toEqual([`${SUSPENDED_UPDATE_RULE} total in add 9`]);
  });

  it('follows a receiver by its declared type', () => {
    const repository = fn('fetch', { owner: 'Repository', modifiers: ['suspend'] });
    const entry = update([read('repository'), call('fetch', { kind: 'name', name: 'repository' })]);
    const files = [
      ledger({ updates: [entry], functions: [suspendFun('add')] }),
      file({
        file: 'src/main/kotlin/demo/Repository.kt',
        classes: [klass('Repository')],
        functions: [repository],
      }),
    ];

    expect(findingsFor(files)).toHaveLength(1);
  });

  it('follows a parameter declared as Deferred and an inline async', () => {
    const imports = [{ path: 'kotlinx.coroutines.Deferred', alias: null, all: false }];
    const entry = update([call('await', { kind: 'name', name: 'deferred' })]);
    const withParameter = ledger({
      imports,
      updates: [entry],
      functions: [
        suspendFun('add', 'Ledger', { parameters: [parameter('deferred', 'Deferred<Int>')] }),
      ],
    });
    const inline = ledger({
      imports: [{ path: 'kotlinx.coroutines.async', alias: null, all: false }],
      updates: [update([call('await', { kind: 'async' })])],
    });

    expect(findingsFor([withParameter])).toHaveLength(1);
    expect(findingsFor([inline])).toHaveLength(1);
  });

  it('follows kotlinx suspend functions only when they are imported', () => {
    const entry = update([call('withContext')]);
    const imported = ledger({
      updates: [entry],
      imports: [{ path: 'kotlinx.coroutines.withContext', alias: null, all: false }],
    });
    const star = ledger({
      updates: [entry],
      imports: [{ path: 'kotlinx.coroutines', alias: null, all: true }],
    });

    expect(findingsFor([imported])).toHaveLength(1);
    expect(findingsFor([star])).toHaveLength(1);
    expect(findingsFor([ledger({ updates: [entry] })])).toEqual([]);
  });

  it.each([
    ['the value awaited into a local first', update([read('delta')])],
    ['the read after the suspension', update([call('load'), read('total')], { operator: '=' })],
    [
      'a branching assignment',
      update([read('total'), call('load')], { operator: '=', branching: true }),
    ],
    ['a local with the property name', update([call('load')], { locals: ['total'] })],
    [
      'a Mutex around the update',
      update([call('load')], {
        scopes: scopes([{ k: 'lambda', host: 'withLock', qualifier: 'mutex' }]),
      }),
    ],
    ['a call that is not a suspend function', update([call('blocking')])],
    ['a call on an unknown receiver', update([call('value', { kind: 'name', name: 'other' })])],
    ['a call on a complex receiver', update([call('load', { kind: 'other' })])],
  ])('allows %s', (_name, entry) => {
    expect(findingsFor([ledger({ updates: [entry] })])).toEqual([]);
  });

  it.each([
    ['a val property', { properties: [property('total', 'Ledger', { var: false })] }],
    [
      'a delegated property',
      { properties: [property('total', 'Ledger', { var: true, delegated: true })] },
    ],
    ['a function that is not suspend', { functions: [suspendFun('add'), plainFun('load')] }],
    [
      'an overload that is not suspend',
      { functions: [suspendFun('add'), suspendFun('load'), plainFun('load')] },
    ],
    ['an unknown property', { properties: [] }],
  ])('allows %s', (_name, overrides) => {
    expect(findingsFor([ledger(overrides)])).toEqual([]);
  });

  it('leaves a call to a top level suspend function to classes without supertypes', () => {
    const top = suspendFun('loadTotal', '');
    const entry = update([call('loadTotal')]);
    const open = ledger({
      updates: [{ ...entry, scopes: scopes([], ['ViewModel']) }],
      functions: [suspendFun('add'), top],
    });
    const closed = ledger({ updates: [entry], functions: [suspendFun('add'), top] });

    expect(findingsFor([open])).toEqual([]);
    expect(findingsFor([closed])).toHaveLength(1);
  });

  it('allows withPermit only on a semaphore of the class built with one permit', () => {
    const gate = (initializer, argument, overrides = {}) =>
      property('gate', 'Ledger', { var: false, initializer, argument, ...overrides });
    const permitted = (qualifier = 'gate') =>
      update([call('load')], {
        scopes: scopes([{ k: 'lambda', host: 'withPermit', qualifier }]),
      });
    const withGate = (declared, entry = permitted()) =>
      ledger({
        properties: [property('total', 'Ledger', { var: true }), declared],
        updates: [entry],
      });
    const reported = (files) => findingsFor(files).map(({ symbol }) => symbol);

    expect(reported([withGate(gate('Semaphore', '1'))])).toEqual([]);
    expect(reported([withGate(gate('Semaphore', '1'), permitted('this.gate'))])).toEqual([]);
    expect(reported([withGate(gate('Semaphore', '2'))])).toEqual(['Ledger.total in add']);
    expect(reported([withGate(gate('Semaphore', 'permits'))])).toEqual(['Ledger.total in add']);
    expect(reported([withGate(gate('Semaphore', '1', { var: true }))])).toEqual([
      'Ledger.total in add',
    ]);
    expect(reported([withGate(gate('Semaphore', '1'), permitted('other'))])).toEqual([
      'Ledger.total in add',
    ]);
  });

  describe('a read saved in a local', () => {
    const local = (name, value, writes = []) => ({ local: name, value, writes });
    const assign = (name, operator, value) => ({ assign: name, operator, value, writes: [] });
    const statement = (value, writes = []) => ({ value, writes });
    const saved = (steps, value = [read('current'), read('delta')], overrides = {}) =>
      update(value, {
        operator: '=',
        locals: ['current', 'delta'],
        properties: ['current', 'delta'],
        steps,
        ...overrides,
      });
    const reported = (entry) =>
      findingsFor([ledger({ updates: [entry] })]).map(({ symbol, message }) => [
        symbol,
        message.slice(0, message.indexOf(' suspends')),
      ]);
    const stale = [['Ledger.total in add', '`total` is updated from a value read before `load()`']];

    it.each([
      [
        'a val saved before the call',
        [local('current', [read('total')]), local('delta', [call('load')])],
      ],
      [
        'a var accumulated with the call',
        [local('current', [read('total')]), assign('current', '+=', [call('load')])],
      ],
      [
        'a local derived from the saved one',
        [
          local('previous', [read('total', true)]),
          local('current', [read('previous')]),
          statement([call('load')]),
        ],
      ],
    ])('reports %s', (_name, steps) => {
      expect(
        reported(saved(steps, [read('current')], { properties: ['previous', 'current'] })),
      ).toEqual(stale);
    });

    it('reports a read saved before the lock is taken', () => {
      const entry = saved(
        [local('current', [read('total')]), { lock: 'withLock' }],
        [read('current')],
        {
          scopes: scopes([{ k: 'lambda', host: 'withLock', qualifier: 'mutex' }]),
        },
      );
      expect(reported(entry)).toEqual([
        ['Ledger.total in add', '`total` is updated from a value read before `withLock()`'],
      ]);
    });

    it.each([
      [
        'the call before the read',
        [local('delta', [call('load')]), local('current', [read('total')])],
      ],
      ['no suspension between', [local('current', [read('total')]), statement([call('blocking')])]],
      [
        'the local replaced by the call',
        [local('current', [read('total')]), assign('current', '=', [call('load')])],
      ],
      [
        'the local overwritten in a nested statement',
        [local('current', [read('total')]), statement([call('load')], ['current'])],
      ],
      [
        'a saved read of another property',
        [local('current', [read('count')]), statement([call('load')])],
      ],
    ])('allows %s', (_name, steps) => {
      expect(reported(saved(steps, [read('current')]))).toEqual([]);
    });

    it('allows a read saved inside the lock that is still held', () => {
      const entry = saved(
        [{ lock: 'withLock' }, local('current', [read('total')]), local('delta', [call('load')])],
        undefined,
        { scopes: scopes([{ k: 'lambda', host: 'withLock', qualifier: 'mutex' }]) },
      );
      expect(reported(entry)).toEqual([]);
    });
  });

  it('does not let a launched coroutine inherit the lock around it', () => {
    const launched = update([call('load')], {
      scopes: scopes([
        { k: 'lambda', host: 'launch', qualifier: 'scope' },
        { k: 'lambda', host: 'withLock', qualifier: 'mutex' },
      ]),
    });
    expect(findingsFor([ledger({ updates: [launched] })])).toHaveLength(1);
  });

  it('does not count a Mutex built in the function', () => {
    const local = update([call('load')], {
      properties: ['mutex'],
      scopes: scopes([{ k: 'lambda', host: 'withLock', qualifier: 'mutex' }]),
    });
    expect(findingsFor([ledger({ updates: [local] })])).toHaveLength(1);
  });

  it('accepts a one-permit semaphore of the companion object or the file', () => {
    const permitted = update([call('load')], {
      scopes: scopes([{ k: 'lambda', host: 'withPermit', qualifier: 'gate' }]),
    });
    const gate = { name: 'gate', var: false, initializer: 'Semaphore', argument: '1' };
    const companion = ledger({
      classes: [klass('Ledger'), klass('Ledger.Companion', { kind: 'companion' })],
      properties: [
        property('total', 'Ledger', { var: true }),
        property('gate', 'Ledger.Companion', gate),
      ],
      updates: [permitted],
    });
    const topLevel = ledger({ updates: [permitted], topLevelProperties: [gate] });
    const wide = ledger({
      updates: [permitted],
      topLevelProperties: [{ ...gate, argument: '2' }],
    });

    expect(findingsFor([companion])).toEqual([]);
    expect(findingsFor([topLevel])).toEqual([]);
    expect(findingsFor([wide])).toHaveLength(1);
  });
});
