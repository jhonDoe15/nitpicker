import { describe, expect, it } from 'vitest';
import { fieldsOf, listOf } from '../../../../../shared/values/readers.mts';
import { MODULE, designRows, fn, owner } from './support.mts';
import type { DesignCallable } from '../../go-types.mts';

type Fields = { readonly [field: string]: unknown };

const session = owner('db/session.go', 'Session');
const begin = fn(session, 'Begin');
const write = fn(session, 'Write');
const commit = fn(session, 'Commit');
const rollback = fn(session, 'Rollback');
const steps = [begin, write, commit, rollback];

function caller(file: string, name: string, calls: readonly Fields[]) {
  return fn(owner(file), name, {
    calls: calls.map((call: Fields, line: number) => ({ receiver: 's', line: line + 3, ...call })),
  });
}

function sessionUsers(callers: readonly DesignCallable[]) {
  return {
    types: [session, ...callers.map(({ file }) => owner(file))],
    callables: [...steps, ...callers],
  };
}

const sequence = [{ target: begin.id }, { target: write.id }, { target: commit.id }];

describe('caller-protocol on Go facts', () => {
  it('reports steps that three callers in two files repeat on one struct', () => {
    const facts = sessionUsers([
      caller('app/save.go', 'Save', sequence),
      caller('app/update.go', 'Update', sequence),
      caller('jobs/import.go', 'Load', sequence),
    ]);
    expect(designRows(facts, 'caller-protocol', { module: 'shop' })).toEqual([
      {
        path: 'db/session.go',
        identity: 'db/session.go#Session|Begin>Write>Commit',
        classification: 'descriptive',
        line: 1,
      },
    ]);
  });

  it('passes steps two callers repeat and steps on a package other modules import', () => {
    const saves = [
      caller('app/save.go', 'Save', sequence),
      caller('app/update.go', 'Update', sequence),
    ];
    expect(designRows(sessionUsers(saves), 'caller-protocol', { module: 'shop' })).toEqual([]);
    const three = sessionUsers([...saves, caller('jobs/import.go', 'Load', sequence)]);
    expect(designRows(three, 'caller-protocol')).toEqual([]);
  });
});

describe('protocol-contract on Go facts', () => {
  const contract = {
    type: 'Session',
    open: ['Begin'],
    close: ['Commit', 'Rollback'],
    steps: ['Write'],
  };

  function violations(calls: readonly Fields[], { receiver }: { receiver?: string } = {}) {
    const user = caller('app/save.go', 'Save', calls);
    const facts = sessionUsers([
      receiver === undefined
        ? user
        : {
            ...user,
            calls: listOf(user['calls']).map((call) => ({ ...fieldsOf(call), receiver })),
          },
    ]);
    return designRows(facts, 'protocol-contract', {
      module: MODULE,
      policy: { protocols: [contract] },
    }).map(({ identity, classification }) => [identity, classification]);
  }

  it.each([
    ['no close on every exit', sequence, ['app/save.go#Save|s|unclosed:Begin']],
    [
      'a step before the open',
      [{ target: write.id }, { target: begin.id }, { target: commit.id, cleanup: true }],
      ['app/save.go#Save|s|early:Write'],
    ],
    [
      'a close that is not deferred',
      [{ target: begin.id }, { target: commit.id, branch: ['0:then'] }],
      ['app/save.go#Save|s|unclosed:Begin'],
    ],
  ])('fails %s', (_, calls, identities) => {
    expect(violations(calls)).toEqual(identities.map((identity) => [identity, 'enforceable']));
  });

  it.each([
    [
      'a deferred close',
      [{ target: begin.id }, { target: write.id }, { target: rollback.id, cleanup: true }],
    ],
    [
      'a step on the other arm of the same conditional',
      [
        { target: write.id, branch: ['0:then'] },
        { target: begin.id, branch: ['0:else'] },
        { target: commit.id, cleanup: true },
      ],
    ],
  ])('passes %s', (_, calls) => {
    expect(violations(calls)).toEqual([]);
  });

  it('passes a session kept in a field of the receiver', () => {
    expect(violations([{ target: begin.id }], { receiver: 'this.session' })).toEqual([]);
  });
});
