import { describe, expect, it } from 'vitest';
import { file, klass, parameter, property, run, summary } from '../../test-support/facts.mjs';
import { LOCK_ORDER_RULE } from '../../../../../messages/locking/lock-evidence.mjs';
import { lockOrderFindings } from './lock-order.mjs';

const CLASS_SCOPE = {
  k: 'class',
  name: 'Ledger',
  qualified: 'Ledger',
  supers: [],
  visibility: 'public',
};
const fun = (name) => ({ k: 'fun', name });
const lambda = (host, lock) =>
  host === 'synchronized'
    ? { k: 'lambda', host, argument: lock, qualifier: null }
    : { k: 'lambda', host, qualifier: lock, argument: null };
const take = (line, host, lock, outer = [], overrides = {}) => ({
  line,
  host,
  lock,
  synchronizedFunction: false,
  locals: [],
  scopes: [...outer, fun(overrides.member ?? 'transfer'), CLASS_SCOPE],
  ...overrides,
});
const ledger = (lockAcquisitions, overrides = {}) =>
  file({
    classes: [
      klass('Ledger', { primaryParameters: [parameter('audit', 'Any', { property: 'val' })] }),
    ],
    properties: [property('accounts', 'Ledger'), property('LOCK', 'Ledger.Companion')],
    lockAcquisitions,
    ...overrides,
  });
const findingsFor = (files) => run(lockOrderFindings, files);

describe('lock-order inversions in Kotlin', () => {
  it('reports both nestings of two locks taken in opposite orders, named in the message', () => {
    const findings = findingsFor([
      ledger([
        take(3, 'synchronized', 'accounts'),
        take(4, 'synchronized', 'audit', [lambda('synchronized', 'accounts')]),
        take(8, 'synchronized', 'this.audit', [], { member: 'report' }),
        take(9, 'synchronized', 'accounts', [lambda('synchronized', 'this.audit')], {
          member: 'report',
        }),
      ]),
    ]);

    expect(summary(findings)).toEqual([
      `${LOCK_ORDER_RULE} Ledger.transfer: accounts -> audit 4`,
      `${LOCK_ORDER_RULE} Ledger.report: audit -> accounts 9`,
    ]);
    expect(findings[0].message).toBe(
      '`transfer` takes `audit` while it holds `accounts`, and `report` takes `accounts` while it holds ' +
        '`audit`: two threads that run both can each hold one lock and wait forever for the other, a ' +
        'deadlock that no test reliably shows. Take nested locks in one order everywhere in the class (if ' +
        'any path takes a and then b, no path takes b and then a), or guard the state with one lock ' +
        '(`synchronized(lock) { }` or `lock.withLock { }`). If this is intended, add ' +
        '{"rule":"pmd/LockOrderInversion","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to ' +
        '"exceptions" in nitpicker.config.json.',
    );
  });

  it('pairs withLock, a @Synchronized function, a companion lock and another nesting of one method', () => {
    const findings = findingsFor([
      ledger([
        take(3, 'withLock', 'accounts', [], { synchronizedFunction: true }),
        take(5, 'synchronized', 'this', [lambda('withLock', 'accounts')], { member: 'inspect' }),
        take(7, 'withLock', 'LOCK', [lambda('synchronized', 'Ledger.audit')], { member: 'swap' }),
        take(8, 'synchronized', 'audit', [lambda('withLock', 'Ledger.LOCK')], { member: 'swap' }),
      ]),
    ]);

    expect(summary(findings)).toEqual([
      `${LOCK_ORDER_RULE} Ledger.transfer: this -> accounts 3`,
      `${LOCK_ORDER_RULE} Ledger.inspect: accounts -> this 5`,
      `${LOCK_ORDER_RULE} Ledger.swap: audit -> LOCK 7`,
      `${LOCK_ORDER_RULE} Ledger.swap: LOCK -> audit 8`,
    ]);
    expect(findings.map(({ message }) => message.slice(0, message.indexOf(': ')))).toEqual([
      '`transfer` takes `accounts` while it holds `this`, and `inspect` takes `this` while it holds `accounts`',
      '`inspect` takes `this` while it holds `accounts`, and `transfer` takes `accounts` while it holds `this`',
      '`swap` takes `LOCK` while it holds `audit`, and another nesting in `swap` takes `audit` while it holds `LOCK`',
      '`swap` takes `audit` while it holds `LOCK`, and another nesting in `swap` takes `LOCK` while it holds `audit`',
    ]);
  });

  it('follows an aliased import of withLock and keeps a type-qualified lock of another object', () => {
    const findings = findingsFor([
      ledger(
        [
          take(3, 'withLock', 'accounts', [lambda('synchronized', 'Registry.LOCK')]),
          take(5, 'synchronized', 'Registry.LOCK', [lambda('guarded', 'accounts')], {
            member: 'report',
          }),
        ],
        { lockHosts: { guarded: 'withLock', synchronized: 'synchronized', withLock: 'withLock' } },
      ),
    ]);

    expect(summary(findings)).toEqual([
      `${LOCK_ORDER_RULE} Ledger.transfer: Registry.LOCK -> accounts 3`,
      `${LOCK_ORDER_RULE} Ledger.report: accounts -> Registry.LOCK 5`,
    ]);
  });

  it.each([
    [
      'a consistent order',
      [
        take(4, 'synchronized', 'audit', [lambda('synchronized', 'accounts')]),
        take(9, 'synchronized', 'audit', [lambda('synchronized', 'this.accounts')], {
          member: 'report',
        }),
      ],
    ],
    ['a single lock', [take(4, 'synchronized', 'accounts'), take(9, 'withLock', 'accounts')]],
    [
      'a reentrant re-acquire inside another lock',
      [
        take(4, 'synchronized', 'accounts'),
        take(5, 'synchronized', 'audit', [lambda('synchronized', 'accounts')]),
        take(6, 'synchronized', 'accounts', [
          lambda('synchronized', 'audit'),
          lambda('synchronized', 'accounts'),
        ]),
      ],
    ],
    [
      'a reentrant re-acquire',
      [
        take(4, 'synchronized', 'accounts', [lambda('synchronized', 'accounts')]),
        take(5, 'synchronized', 'accounts', [lambda('synchronized', 'this.accounts')]),
      ],
    ],
    [
      'a lock passed in or held in a local',
      [
        take(4, 'synchronized', 'accounts', [lambda('synchronized', 'outer')], {
          locals: ['outer'],
        }),
        take(9, 'synchronized', 'outer', [lambda('synchronized', 'accounts')], {
          member: 'report',
          locals: ['outer'],
        }),
        take(12, 'synchronized', 'accounts', [lambda('synchronized', 'audit')], {
          locals: ['audit'],
        }),
        take(14, 'synchronized', 'audit', [lambda('synchronized', 'accounts')], {
          member: 'audit',
          locals: ['audit'],
        }),
      ],
    ],
    [
      'a nesting across a lambda that may run later',
      [
        take(4, 'synchronized', 'audit', [
          { k: 'lambda', host: 'launch', qualifier: 'scope' },
          lambda('synchronized', 'accounts'),
        ]),
        take(9, 'synchronized', 'accounts', [lambda('synchronized', 'audit')], {
          member: 'report',
        }),
      ],
    ],
  ])('spares %s', (_name, acquisitions) => {
    expect(findingsFor([ledger(acquisitions)])).toEqual([]);
  });

  it('keeps classes apart and skips anonymous objects', () => {
    const other = { ...CLASS_SCOPE, name: 'Other', qualified: 'Other' };
    const findings = findingsFor([
      ledger(
        [
          take(4, 'synchronized', 'audit', [lambda('synchronized', 'accounts')]),
          {
            ...take(9, 'synchronized', 'accounts', [lambda('synchronized', 'audit')]),
            scopes: [lambda('synchronized', 'audit'), fun('report'), other],
          },
          {
            ...take(12, 'synchronized', 'accounts', [lambda('synchronized', 'audit')]),
            scopes: [
              lambda('synchronized', 'audit'),
              fun('run'),
              { k: 'object' },
              fun('x'),
              CLASS_SCOPE,
            ],
          },
        ],
        { properties: [property('accounts', 'Ledger'), property('accounts', 'Other')] },
      ),
    ]);

    expect(findings).toEqual([]);
  });
});
