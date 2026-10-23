import { beforeAll, describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { byId, factsOfFixture } from '../test-support/project.mjs';

const TYPES = [
  {
    id: 'src/cart.ts',
    file: 'src/cart.ts',
    name: 'cart',
    line: 1,
    kind: 'module',
    exported: true,
    fields: [{ name: 'hidden' }],
  },
  {
    id: 'src/cart.ts#Cart',
    file: 'src/cart.ts',
    name: 'Cart',
    line: 3,
    kind: 'class',
    exported: true,
    fields: [
      { name: 'items', mutable: true, private: true },
      { name: 'copy', private: true },
      { name: 'frozen', private: true },
      { name: 'tags', mutable: true },
      { name: '#secret', mutable: true, private: true },
      { name: 'total' },
    ],
  },
  {
    id: 'src/cart.ts#Point',
    file: 'src/cart.ts',
    name: 'Point',
    line: 24,
    kind: 'data',
    exported: true,
    fields: [{ name: 'x' }, { name: 'y' }],
  },
  {
    id: 'src/cart.ts#Hidden',
    file: 'src/cart.ts',
    name: 'Hidden',
    line: 37,
    kind: 'class',
    exported: false,
  },
  {
    id: 'src/priced.ts',
    file: 'src/priced.ts',
    name: 'priced',
    line: 1,
    kind: 'module',
    exported: true,
  },
  {
    id: 'src/priced.ts#Priced',
    file: 'src/priced.ts',
    name: 'Priced',
    line: 1,
    kind: 'interface',
    exported: true,
  },
  {
    id: 'src/priced.ts#Plain',
    file: 'src/priced.ts',
    name: 'Plain',
    line: 5,
    kind: 'data',
    exported: true,
    fields: [{ name: 'id' }, { name: 'label' }],
  },
  {
    id: 'src/priced.ts#Shape',
    file: 'src/priced.ts',
    name: 'Shape',
    line: 10,
    kind: 'data',
    exported: true,
    fields: [{ name: 'width' }, { name: 'height' }],
  },
  {
    id: 'src/priced.ts#Mode',
    file: 'src/priced.ts',
    name: 'Mode',
    line: 12,
    kind: 'enum',
    exported: true,
    cases: ['fast', 'slow', 'off'],
  },
  {
    id: 'src/priced.ts#Level',
    file: 'src/priced.ts',
    name: 'Level',
    line: 14,
    kind: 'enum',
    exported: true,
    cases: ['1', '2', '-3'],
  },
  {
    id: 'src/priced.ts#Combined',
    file: 'src/priced.ts',
    name: 'Combined',
    line: 16,
    kind: 'enum',
    exported: true,
    cases: ['fast', 'slow', 'off', 'extra'],
  },
  {
    id: 'src/state.ts',
    file: 'src/state.ts',
    name: 'state',
    line: 1,
    kind: 'module',
    exported: true,
    fields: [
      { name: 'registry', mutable: true },
      { name: 'hidden', mutable: true, private: true },
      { name: 'counter' },
      { name: 'queue', private: true },
      { name: 'log', mutable: true, private: true },
      { name: 'limit' },
    ],
  },
  {
    id: 'src/status.ts',
    file: 'src/status.ts',
    name: 'status',
    line: 1,
    kind: 'module',
    exported: true,
  },
  {
    id: 'src/status.ts#Status',
    file: 'src/status.ts',
    name: 'Status',
    line: 1,
    kind: 'enum',
    exported: true,
    cases: ['Active', 'Closed'],
  },
];

const CALLABLES = [
  {
    id: 'src/cart.ts#Cart.add',
    file: 'src/cart.ts',
    name: 'add',
    line: 11,
    kind: 'method',
    owner: 'src/cart.ts#Cart',
    exported: true,
    params: [{ name: 'item', type: 'string' }],
    returns: 'void',
    ownFields: ['items'],
  },
  {
    id: 'src/cart.ts#Cart.reset',
    file: 'src/cart.ts',
    name: 'reset',
    line: 15,
    kind: 'method',
    owner: 'src/cart.ts#Cart',
    exported: true,
    returns: 'void',
    ownFields: ['copy'],
  },
  {
    id: 'src/cart.ts#Cart.price',
    file: 'src/cart.ts',
    name: 'price',
    line: 19,
    kind: 'method',
    owner: 'src/cart.ts#Cart',
    exported: true,
    entry: true,
    returns: 'number',
    ownFields: ['total', 'frozen'],
  },
  {
    id: 'src/cart.ts#Point.norm',
    file: 'src/cart.ts',
    name: 'norm',
    line: 28,
    kind: 'accessor',
    owner: 'src/cart.ts#Point',
    exported: true,
    returns: 'number',
    ownFields: ['x', 'y'],
  },
  {
    id: 'src/cart.ts#Point.toString',
    file: 'src/cart.ts',
    name: 'toString',
    line: 32,
    kind: 'method',
    owner: 'src/cart.ts#Point',
    exported: true,
    returns: 'string',
    ownFields: ['x'],
  },
  {
    id: 'src/cart.ts#Hidden.run',
    file: 'src/cart.ts',
    name: 'run',
    line: 38,
    kind: 'method',
    owner: 'src/cart.ts#Hidden',
    exported: false,
    returns: 'void',
  },
  {
    id: 'src/state.ts#handler',
    file: 'src/state.ts',
    name: 'handler',
    line: 7,
    kind: 'function',
    owner: 'src/state.ts',
    exported: true,
    params: [{ name: 'value', type: 'number' }],
    returns: 'number',
    ownFields: ['limit'],
  },
  {
    id: 'src/state.ts#bump',
    file: 'src/state.ts',
    name: 'bump',
    line: 11,
    kind: 'function',
    owner: 'src/state.ts',
    exported: true,
    returns: 'number',
    ownFields: ['log', 'hidden', 'counter'],
  },
];

const MODULES = [
  { file: 'src/cart.ts', role: 'production' },
  { file: 'src/priced.ts', role: 'production' },
  { file: 'src/state.ts', role: 'production' },
  { file: 'src/status.ts', role: 'production' },
];

describe('the types of a fixture project', () => {
  let facts;

  beforeAll(() => {
    facts = factsOfFixture('types');
  });

  it('produces facts that pass the schema', () => {
    expect(() => validateFacts(facts)).not.toThrow();
  });

  it('lists the production modules', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('leaves out the packages of a private single-package project', () => {
    expect(facts.packages).toEqual([]);
  });

  it.each(TYPES)('describes the type $id', (expected) => {
    expect(byId(facts.types, expected.id)).toEqual(expected);
  });

  it('lists exactly these types', () => {
    expect(facts.types.map(({ id }) => id)).toEqual(TYPES.map(({ id }) => id));
  });

  it.each(CALLABLES)('describes the callable $id', (expected) => {
    expect(byId(facts.callables, expected.id)).toEqual(expected);
  });

  it('lists exactly these callables', () => {
    expect(facts.callables.map(({ id }) => id)).toEqual(CALLABLES.map(({ id }) => id));
  });
});
