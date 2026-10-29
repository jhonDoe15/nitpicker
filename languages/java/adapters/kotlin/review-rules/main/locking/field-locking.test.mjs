import { describe, expect, it } from 'vitest';
import { file, klass, parameter, property, run, summary } from '../../test-support/facts.mjs';
import { FIELD_LOCKING_RULE } from '../../../../../messages/locking/lock-evidence.mjs';
import { fieldLockingFindings } from './field-locking.mjs';

const CLASS_SCOPE = {
  k: 'class',
  name: 'Counter',
  qualified: 'Counter',
  supers: [],
  visibility: 'public',
};
const locked = (lock = 'lock') => ({
  k: 'lambda',
  host: 'synchronized',
  argument: lock,
  qualifier: null,
});
const write = (line, member, outer = [], overrides = {}) => ({
  line,
  target: 'count',
  viaThis: false,
  operator: '+=',
  readsTarget: false,
  synchronizedFunction: false,
  locals: [],
  scopes: [...outer, { k: 'fun', name: member }, CLASS_SCOPE],
  ...overrides,
});
const counter = (fieldWrites, overrides = {}) =>
  file({
    classes: [
      klass('Counter', { primaryParameters: [parameter('size', 'Int', { property: 'var' })] }),
    ],
    properties: [
      property('lock', 'Counter', { type: null, initializer: 'Any' }),
      property('count', 'Counter', { type: 'Int', var: true }),
      property('hits', 'Counter', { type: 'Int', var: true, annotations: ['Volatile'] }),
      property('atomic', 'Counter', { type: null, var: true, initializer: 'AtomicLong' }),
      property('map', 'Counter', { type: 'ConcurrentHashMap<String, Int>', var: true }),
      property('lazy', 'Counter', { type: 'Int', var: true, delegated: true }),
    ],
    fieldWrites,
    ...overrides,
  });
const findingsFor = (files) => run(fieldLockingFindings, files);

describe('inconsistently locked properties in Kotlin', () => {
  it('reports an unlocked write of a property another function writes under a lock', () => {
    const findings = findingsFor([
      counter([write(4, 'increment', [locked()]), write(8, 'reset', [], { operator: '=' })]),
    ]);

    expect(summary(findings)).toEqual([`${FIELD_LOCKING_RULE} Counter.count in reset 8`]);
    expect(findings[0].message).toBe(
      '`reset` writes `count` without a lock, while `increment` writes it holding `lock`: a thread that ' +
        'writes here races with the locked writer, so an update is lost or another thread sees a stale ' +
        'value. Hold the same lock for every write of the property (`synchronized(lock) { }`, ' +
        '`lock.withLock { }` or `@Synchronized`), or make it an atomic or concurrent type (`AtomicLong`, ' +
        '`LongAdder`, `ConcurrentHashMap`). If this is intended, add {"rule":"pmd/InconsistentFieldLocking",' +
        '"paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('counts withLock, @Synchronized, this. writes, constructor vars and volatile read-modify-writes', () => {
    const findings = findingsFor([
      counter([
        write(4, 'add', [
          { k: 'lambda', host: 'withLock', qualifier: 'this.lock', argument: null },
        ]),
        write(6, 'bump', [], { viaThis: true, operator: '++', readsTarget: true }),
        write(8, 'name', [], { target: 'size', synchronizedFunction: true }),
        write(10, 'resize', [{ k: 'loop' }], { target: 'size', operator: '=' }),
        write(12, 'hit', [locked()], { target: 'hits' }),
        write(14, 'miss', [], { target: 'hits', operator: '=', readsTarget: true }),
      ]),
    ]);

    expect(summary(findings)).toEqual([
      `${FIELD_LOCKING_RULE} Counter.count in bump 6`,
      `${FIELD_LOCKING_RULE} Counter.size in resize 10`,
      `${FIELD_LOCKING_RULE} Counter.hits in miss 14`,
    ]);
    expect(findings.map(({ message }) => message.slice(0, message.indexOf(': ')))).toEqual([
      '`bump` writes `count` without a lock, while `add` writes it holding `lock`',
      '`resize` writes `size` without a lock, while `name` writes it holding `this`',
      '`miss` writes `hits` without a lock, while `hit` writes it holding `lock`',
    ]);
  });

  it.each([
    ['all writes locked', [write(4, 'a', [locked()]), write(6, 'b', [locked('this.lock')])]],
    ['all writes unlocked', [write(4, 'a'), write(6, 'b')]],
    ['a lock that is a local or a parameter', [write(4, 'a', [locked('other')]), write(6, 'b')]],
    [
      'constructor and init writes',
      [
        write(4, 'a', [locked()]),
        write(6, '<init>'),
        { ...write(8, 'x'), scopes: [{ k: 'init' }, CLASS_SCOPE] },
      ],
    ],
    [
      'an atomic, a concurrent map and a delegated property',
      [
        write(4, 'a', [locked()], { target: 'atomic' }),
        write(6, 'b', [], { target: 'atomic', operator: '=' }),
        write(8, 'a', [locked()], { target: 'map' }),
        write(10, 'b', [], { target: 'map', operator: '=' }),
        write(12, 'a', [locked()], { target: 'lazy' }),
        write(14, 'b', [], { target: 'lazy' }),
      ],
    ],
    [
      'a single write of a volatile property',
      [
        write(4, 'a', [locked()], { target: 'hits' }),
        write(6, 'stop', [], { target: 'hits', operator: '=' }),
      ],
    ],
    [
      'a local of the same name',
      [write(4, 'a', [locked()]), write(6, 'b', [], { locals: ['count'] })],
    ],
    [
      'a write in a lambda that may run later',
      [
        write(4, 'a', [locked()]),
        write(6, 'b', [{ k: 'lambda', host: 'add', qualifier: 'tasks' }]),
      ],
    ],
  ])('spares %s', (_name, writes) => {
    expect(findingsFor([counter(writes)])).toEqual([]);
  });

  it('spares a function the class calls while it holds a lock', () => {
    const helper = counter([write(4, 'a', [locked()]), write(6, 'helped')], {
      lockedCalls: [{ name: 'helped', scopes: [locked(), { k: 'fun', name: 'a' }, CLASS_SCOPE] }],
    });
    const elsewhere = counter([write(4, 'a', [locked()]), write(6, 'helped')], {
      lockedCalls: [
        {
          name: 'helped',
          scopes: [
            locked(),
            { k: 'fun', name: 'a' },
            { ...CLASS_SCOPE, name: 'Other', qualified: 'Other' },
          ],
        },
      ],
    });

    expect(findingsFor([helper])).toEqual([]);
    expect(summary(findingsFor([elsewhere]))).toEqual([
      `${FIELD_LOCKING_RULE} Counter.count in helped 6`,
    ]);
  });
});
