import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ingestSarif } from '../../../../shared/ingest/sarif.mjs';
import { FIELD_LOCKING_RULE, LOCK_ORDER_RULE, withLockEvidence } from './lock-evidence.mjs';

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
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function rulesetMessage(rule) {
  const xml = readFileSync(RULESET, 'utf8');
  return /message="([^"]*)"/u.exec(xml.slice(xml.indexOf(`<rule name="${rule}"`)))[1];
}

function project(source) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-lock-evidence-'));
  roots.push(root);
  mkdirSync(path.join(root, path.dirname(FILE)), { recursive: true });
  writeFileSync(path.join(root, FILE), source);
  return root;
}

function result(source, [rule, snippet, nth = 0]) {
  const offset = Array.from({ length: nth + 1 }).reduce(
    (from) => source.indexOf(snippet, from + 1),
    -1,
  );
  const before = source.slice(0, offset).split('\n');
  return {
    ruleId: rule,
    message: { text: rulesetMessage(rule) },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: FILE },
          region: { startLine: before.length, startColumn: before.at(-1).length + 1 },
        },
      },
    ],
  };
}

function findings(source, sites) {
  const root = project(source);
  const log = { version: '2.1.0', runs: [{ results: sites.map((site) => result(source, site)) }] };
  return ingestSarif(withLockEvidence(log, { projectRoot: root }), { tool: 'pmd' }).findings;
}

const ORDER_SITES = [
  [LOCK_ORDER_RULE, 'synchronized (audit) {\n        moved'],
  [LOCK_ORDER_RULE, 'synchronized (accounts) {\n        moved'],
  [LOCK_ORDER_RULE, 'journal.lock();'],
  [LOCK_ORDER_RULE, 'synchronized (this)'],
  [LOCK_ORDER_RULE, 'synchronized (audit) {\n        label'],
  [LOCK_ORDER_RULE, 'synchronized (Registry.LOCK) {\n        label'],
];
const FIELD_SITES = [
  [FIELD_LOCKING_RULE, 'this.moved = 0'],
  [FIELD_LOCKING_RULE, '++moved'],
  [FIELD_LOCKING_RULE, 'label = value'],
];

function evidence(message) {
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
    expect(named[0].message).toBe(
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
    const identities = (source) => findings(source, sites).map(({ identity }) => identity);

    expect(identities(moved)).toEqual(identities(SOURCE));
  });

  it('keeps the generic text when the evidence cannot be read', () => {
    const root = project(SOURCE);
    const gone = result(SOURCE, ORDER_SITES[0]);
    gone.locations[0].physicalLocation.artifactLocation.uri = 'src/main/java/shop/Gone.java';
    const unmatched = result(SOURCE, [LOCK_ORDER_RULE, 'moved += 1']);
    const plain = result(SOURCE, [FIELD_LOCKING_RULE, 'label = value']);
    plain.ruleId = 'SwallowedInterrupt';
    const log = { version: '2.1.0', runs: [{ results: [gone, unmatched, plain] }] };

    expect(withLockEvidence(log, { projectRoot: root })).toEqual(log);
    expect(withLockEvidence(log, { projectRoot: undefined })).toEqual(log);
  });
});
