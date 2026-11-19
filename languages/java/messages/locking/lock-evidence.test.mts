import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ingest,
  positionAt,
  rulesetMessage,
  sarifResult,
  sourceProjectMaker,
} from '../__tests__/sarif-fixtures.mts';
import type { Ingested, SarifResult } from '../__tests__/sarif-fixtures.mts';
import { FIELD_LOCKING_RULE, LOCK_ORDER_RULE, withLockEvidence } from './lock-evidence.mts';

const RULESET = path.resolve(import.meta.dirname, '../../gradle/pmd-ruleset.xml');
const FILE = 'src/main/java/shop/Ledger.java';
const SOURCE = `package shop;

final class Ledger {
  private final Object accounts = new Object();
  private final Object audit = new Object();
  private final Lock journal = new ReentrantLock();
  private long moved;
  private String label = "synchronized (audit) { moved = 1; }";

  void transfer() {
    synchronized (accounts) {
      synchronized (audit) {
        moved += 1;
      }
    }
  }

  void report() {
    synchronized (this.audit) {
      synchronized (accounts) {
        moved = 0;
      }
    }
  }

  synchronized void settle() {
    journal.lock();
    try {
      moved *= 2;
    } finally {
      journal.unlock();
    }
  }

  void close() {
    journal.lock();
    try {
      synchronized (this) {
        moved--;
      }
    } finally {
      journal.unlock();
    }
  }

  void swap() {
    synchronized (Registry.LOCK) {
      synchronized (audit) {
        label = "a";
      }
    }
    synchronized (audit) {
      synchronized (Registry.LOCK) {
        label = "b";
      }
    }
  }

  void reset() {
    this.moved = 0;
    ++moved;
  }

  void rename(String value) {
    label = value;
  }
}
`;
type Site = [rule: string, snippet: string, nth?: number];

const project = sourceProjectMaker('nitpicker-lock-evidence-', FILE);

function result(source: string, [rule, snippet, nth = 0]: Site): SarifResult {
  const offset = Array.from({ length: nth + 1 }).reduce<number>(
    (from) => source.indexOf(snippet, from + 1),
    -1,
  );
  const text = rulesetMessage(RULESET, rule) ?? '';
  return sarifResult({ ruleId: rule, text, file: FILE }, positionAt(source, offset));
}

function findings(source: string, sites: Site[]): Ingested[] {
  const root = project(source);
  const log = { version: '2.1.0', runs: [{ results: sites.map((site) => result(source, site)) }] };
  return ingest(withLockEvidence(log, { projectRoot: root }), { tool: 'pmd' }).findings;
}

const ORDER_SITES: Site[] = [
  [LOCK_ORDER_RULE, 'synchronized (audit) {\n        moved'],
  [LOCK_ORDER_RULE, 'synchronized (accounts) {\n        moved'],
  [LOCK_ORDER_RULE, 'journal.lock();'],
  [LOCK_ORDER_RULE, 'synchronized (this)'],
  [LOCK_ORDER_RULE, 'synchronized (audit) {\n        label'],
  [LOCK_ORDER_RULE, 'synchronized (Registry.LOCK) {\n        label'],
];
const FIELD_SITES: Site[] = [
  [FIELD_LOCKING_RULE, 'this.moved = 0'],
  [FIELD_LOCKING_RULE, '++moved'],
  [FIELD_LOCKING_RULE, 'label = value'],
];

function evidence(message: string): string {
  return message.slice(0, message.indexOf(': '));
}

describe('lock evidence in Java PMD findings', () => {
  it('names both nestings of a lock-order inversion and keys it by class, method and lock pair', () => {
    const named = findings(SOURCE, ORDER_SITES);

    expect(named.map(({ message }) => evidence(message))).toEqual([
      'transfer() takes `audit` while it holds `accounts`, and report() takes `accounts` while it holds `audit`',
      'report() takes `accounts` while it holds `audit`, and transfer() takes `audit` while it holds `accounts`',
      'settle() takes `journal` while it holds `this`, and close() takes `this` while it holds `journal`',
      'close() takes `this` while it holds `journal`, and settle() takes `journal` while it holds `this`',
      'swap() takes `audit` while it holds `Registry.LOCK`, and another nesting in swap() takes `Registry.LOCK` while it holds `audit`',
      'swap() takes `Registry.LOCK` while it holds `audit`, and another nesting in swap() takes `audit` while it holds `Registry.LOCK`',
    ]);
    expect(named.map(({ identity }) => identity)).toEqual([
      'fp:nitpicker/subject=Ledger.transfer(): accounts -> audit',
      'fp:nitpicker/subject=Ledger.report(): audit -> accounts',
      'fp:nitpicker/subject=Ledger.settle(): this -> journal',
      'fp:nitpicker/subject=Ledger.close(): journal -> this',
      'fp:nitpicker/subject=Ledger.swap(): Registry.LOCK -> audit',
      'fp:nitpicker/subject=Ledger.swap(): audit -> Registry.LOCK',
    ]);
    expect(named[0]?.message).toBe(
      'transfer() takes `audit` while it holds `accounts`, and report() takes `accounts` while it holds ' +
        '`audit`: two threads that run both can each hold one lock and wait forever for the other, a ' +
        'deadlock that no test reliably shows. Take nested locks in one order everywhere in the class (if ' +
        'any path takes a and then b, no path takes b and then a), or guard the state with one lock. Only ' +
        'locks held in fields of the class, this, Type.class and Type.FIELD are compared; a lock passed ' +
        'in, held in a local or taken in a called method is not followed.',
    );
  });

  it('names the unlocked and the locked write of a field and keys it by class, method and field', () => {
    const named = findings(SOURCE, FIELD_SITES);

    expect(named.map(({ message }) => evidence(message))).toEqual([
      'reset() writes `moved` without a lock, while transfer() writes it holding `audit`',
      'reset() writes `moved` without a lock, while transfer() writes it holding `audit`',
      'rename() writes `label` without a lock, while swap() writes it holding `audit`',
    ]);
    expect(named.map(({ identity }) => identity)).toEqual([
      'fp:nitpicker/subject=Ledger.reset(): moved',
      'fp:nitpicker/subject=Ledger.reset(): moved#2',
      'fp:nitpicker/subject=Ledger.rename(): label',
    ]);
  });

  it('keeps every identity when lines move', () => {
    const moved = SOURCE.replace(
      '  private long moved;\n',
      '  private long moved;\n  private int spare;\n\n',
    );
    const sites = [...ORDER_SITES, ...FIELD_SITES];
    function identities(source: string): string[] {
      return findings(source, sites).map(({ identity }) => identity);
    }

    expect(identities(moved)).toEqual(identities(SOURCE));
  });

  it('keeps the generic text when the evidence cannot be read, keyed by class and method', () => {
    const root = project(SOURCE);
    const gone = result(SOURCE, ORDER_SITES[0] ?? [LOCK_ORDER_RULE, '']);
    gone.locations = [
      {
        physicalLocation: {
          artifactLocation: { uri: 'src/main/java/shop/Gone.java' },
          region: { startLine: 1, startColumn: 1 },
        },
      },
    ];
    const unmatched = result(SOURCE, [LOCK_ORDER_RULE, 'moved += 1']);
    const plain = result(SOURCE, [FIELD_LOCKING_RULE, 'label = value']);
    plain.ruleId = 'SwallowedInterrupt';
    const log = { version: '2.1.0', runs: [{ results: [gone, unmatched, plain] }] };
    const unlockedOnly = SOURCE.replace('label = "a"', 'moved = 2').replace(
      'label = "b"',
      'moved = 3',
    );
    const fieldOnly = result(unlockedOnly, [FIELD_LOCKING_RULE, 'label = value']);
    function subject(value: string): object {
      return { partialFingerprints: { 'nitpicker/subject': value } };
    }

    expect(withLockEvidence(log, { projectRoot: root })).toEqual({
      ...log,
      runs: [{ results: [gone, { ...unmatched, ...subject('Ledger.transfer()') }, plain] }],
    });
    expect(
      withLockEvidence(
        { ...log, runs: [{ results: [fieldOnly] }] },
        { projectRoot: project(unlockedOnly) },
      ),
    ).toEqual({
      ...log,
      runs: [{ results: [{ ...fieldOnly, ...subject('Ledger.rename(): label') }] }],
    });
    expect(withLockEvidence(log, { projectRoot: undefined })).toEqual(log);
  });

  it('skips a local lock and a local declaration, and keeps a dollar sign in a name', () => {
    const source = `package shop;

final class Ledger {
  private final Object first = new Object();
  private final Object second = new Object();
  private final Object a$$b = new Object();
  private int count;

  void add() {
    synchronized (first) {
      synchronized (second) {
        count += 1;
      }
    }
  }

  void local() {
    Object second = new Object();
    synchronized (second) {
      synchronized (first) {
        int count = 5;
      }
    }
  }

  void real() {
    synchronized (second) {
      synchronized (first) {
        count -= 1;
      }
    }
  }

  void dollar() {
    synchronized (a$$b) {
      synchronized (first) {
        count -= 2;
      }
    }
  }

  void dollarBack() {
    synchronized (first) {
      synchronized (a$$b) {
        count += 2;
      }
    }
  }

  void bump() {
    count = 0;
  }
}
`;
    const named = findings(source, [
      [LOCK_ORDER_RULE, 'synchronized (second) {\n        count'],
      [LOCK_ORDER_RULE, 'synchronized (first) {\n        count -= 2'],
      [FIELD_LOCKING_RULE, 'count = 0'],
    ]);

    expect(named.map(({ message }) => evidence(message))).toEqual([
      'add() takes `second` while it holds `first`, and real() takes `first` while it holds `second`',
      'dollar() takes `first` while it holds `a$$b`, and dollarBack() takes `a$$b` while it holds `first`',
      'bump() writes `count` without a lock, while add() writes it holding `second`',
    ]);
  });
});
