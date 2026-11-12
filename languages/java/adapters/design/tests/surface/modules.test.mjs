import { describe, expect, it } from 'vitest';
import { callable, fixtureFacts, ref, type } from '../../test-support/design-facts-support.mjs';

const CORE = 'core/src/main/java';
const APP = 'app/src/main/java';
const MODULES = [
  { dir: 'core', sourceRoots: [CORE], published: true },
  { dir: 'app', sourceRoots: [APP], published: false },
];

const facts = fixtureFacts('modules', MODULES);

const LEDGER = ref('core/Ledger.java', 'Ledger', CORE);

describe('design facts: sources spread over several modules', () => {
  it('lists every file of every module and the published state of each module', () => {
    expect(facts.modules).toEqual([
      { file: `${APP}/app/Hidden.java`, role: 'production' },
      { file: `${APP}/app/Report.java`, role: 'production' },
      { file: `${CORE}/core/Ledger.java`, role: 'production' },
    ]);
    expect(facts.packages).toEqual([
      { root: 'core', published: true },
      { root: 'app', published: false },
    ]);
  });

  it.each([
    type({
      file: 'core/Ledger.java',
      root: CORE,
      symbol: 'Ledger',
      line: 6,
      kind: 'data',
      fields: [{ name: 'entries', mutable: true, private: true }],
      published: true,
    }),
    type({ file: 'app/Hidden.java', root: APP, symbol: 'Hidden', line: 5, kind: 'class' }),
    type({ file: 'app/Report.java', root: APP, symbol: 'Report', line: 5, kind: 'class' }),
  ])('describes the type $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each([
    callable({
      file: 'core/Ledger.java',
      root: CORE,
      owner: 'Ledger',
      member: 'entries',
      line: 9,
      kind: 'accessor',
      returns: 'List',
      ownFields: ['entries'],
      returnsField: 'entries',
    }),
    callable({
      file: 'app/Report.java',
      root: APP,
      owner: 'Report',
      member: 'note',
      line: 6,
      params: [{ name: 'ledger', type: LEDGER }],
      returns: 'void',
      calls: [{ target: `${LEDGER}.entries`, line: 7, receiver: 'ledger', mutation: 'add' }],
      paramUses: [{ param: 0, fields: ['entries'], forwards: [] }],
      reads: [{ type: LEDGER, fields: ['entries'], line: 7 }],
    }),
    callable({
      file: 'app/Hidden.java',
      root: APP,
      owner: 'Hidden',
      member: 'note',
      line: 6,
      params: [{ name: 'missing', type: 'Missing' }],
      returns: 'void',
    }),
  ])('resolves a call across modules, but not one into an unknown type: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it('gives no package list for a single module', () => {
    const single = fixtureFacts('modules', [
      { dir: '', sourceRoots: [CORE, APP], published: false },
    ]);

    expect(single.packages).toEqual([]);
    expect(single.callables.map(({ id }) => id).toSorted()).toEqual(
      facts.callables.map(({ id }) => id).toSorted(),
    );
  });
});
