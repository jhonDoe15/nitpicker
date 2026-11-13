import { describe, expect, it } from 'vitest';
import { designRows, fn, owner } from './support.mjs';

const store = owner('store/store.go', 'Store', {
  fields: [{ name: 'readings' }, { name: 'writes' }],
});
const members = {
  readA: fn(store, 'ReadA', { ownFields: ['readings'] }),
  readB: fn(store, 'ReadB', { ownFields: ['readings'] }),
  writeX: fn(store, 'WriteX', { ownFields: ['writes'] }),
  writeY: fn(store, 'WriteY', { ownFields: ['writes'] }),
};

function user(file, name, used) {
  return fn(owner(file), name, {
    calls: used.map(({ id }, line) => ({ target: id, line: line + 3, receiver: 's' })),
  });
}

function split(extra = {}) {
  const reports = user('reports/report.go', 'Render', [members.readA, members.readB]);
  const imports = user('imports/load.go', 'Load', [members.writeX, members.writeY]);
  const callables = [...Object.values(members), reports, imports];
  return {
    types: [store, owner('reports/report.go'), owner('imports/load.go')],
    callables: callables.map((callable) => ({ ...callable, ...extra[callable.name] })),
  };
}

describe('disjoint-consumer-groups on Go facts', () => {
  it('reports a struct whose methods split into two groups no caller file uses together', () => {
    const rows = designRows(split(), 'disjoint-consumer-groups', { module: 'shop' });
    expect(rows).toEqual([
      {
        path: 'store/store.go',
        identity: 'store/store.go#Store',
        classification: 'descriptive',
        line: 1,
      },
    ]);
  });

  it.each([
    ['one field shared by both groups', { WriteX: { ownFields: ['readings'] } }],
    [
      'a caller file that uses both groups',
      {
        Render: {
          calls: Object.values(members).map(({ id }, line) => ({ target: id, line: line + 3 })),
        },
      },
    ],
  ])('passes %s', (_, extra) => {
    expect(designRows(split(extra), 'disjoint-consumer-groups', { module: 'shop' })).toEqual([]);
  });

  it('passes a struct of a package other modules can import', () => {
    expect(designRows(split(), 'disjoint-consumer-groups')).toEqual([]);
  });

  it('counts a function value used from another file as a use', () => {
    const facts = split();
    const render = facts.callables.find(({ name }) => name === 'Render');
    const callables = facts.callables.map((callable) =>
      callable === render
        ? {
            ...render,
            calls: [],
            references: [members.readA.id, members.readB.id, members.writeX.id],
          }
        : callable,
    );
    expect(
      designRows({ ...facts, callables }, 'disjoint-consumer-groups', { module: 'shop' }),
    ).toEqual([]);
  });
});
