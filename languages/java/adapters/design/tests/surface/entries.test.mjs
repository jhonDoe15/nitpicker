import { describe, expect, it } from 'vitest';
import { callable, fixtureFacts, ref, type } from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('entries');

const MODULES = [
  { file: 'src/main/java/app/Controller.java', role: 'production', entry: true },
  { file: 'src/main/java/app/Marker.java', role: 'production' },
  { file: 'src/main/java/app/MemoryRepo.java', role: 'production' },
  { file: 'src/main/java/app/Point.java', role: 'production' },
  { file: 'src/main/java/app/Ranked.java', role: 'production' },
  { file: 'src/main/java/app/Repo.java', role: 'production' },
];
const TYPES_0 = [
  type({
    file: 'app/Controller.java',
    symbol: 'Controller',
    line: 7,
    kind: 'class',
    fields: [{ name: 'repo', private: true }],
  }),
  type({ file: 'app/MemoryRepo.java', symbol: 'MemoryRepo', line: 3, kind: 'class' }),
  type({
    file: 'app/Point.java',
    symbol: 'Point',
    line: 3,
    kind: 'data',
    exported: false,
    fields: [
      { name: 'x', private: true },
      { name: 'y', private: true },
    ],
  }),
  type({
    file: 'app/Ranked.java',
    symbol: 'Ranked',
    line: 3,
    kind: 'class',
    fields: [{ name: 'rank', private: true }],
  }),
  type({ file: 'app/Repo.java', symbol: 'Repo', line: 3, kind: 'interface' }),
];
const CALLABLES_0 = [
  callable({
    file: 'app/Controller.java',
    owner: 'Controller',
    member: '<init>',
    line: 11,
    name: 'Controller',
    kind: 'constructor',
    entry: true,
    params: [{ name: 'repo', type: ref('app/Repo.java', 'Repo') }],
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
    ownFields: ['repo'],
  }),
  callable({
    file: 'app/Controller.java',
    owner: 'Controller',
    member: 'index',
    line: 15,
    entry: true,
    params: [{ name: 'request', type: 'String' }],
    returns: 'String',
  }),
  callable({
    file: 'app/Controller.java',
    owner: 'Controller',
    member: 'marked',
    line: 20,
    returns: 'void',
  }),
  callable({
    file: 'app/Controller.java',
    owner: 'Controller',
    member: 'maybe',
    line: 23,
    returns: 'String',
  }),
  callable({
    file: 'app/Controller.java',
    owner: 'Controller',
    member: 'quiet',
    line: 28,
    returns: 'void',
  }),
  callable({
    file: 'app/Controller.java',
    owner: 'Controller',
    member: 'main',
    line: 31,
    entry: true,
    params: [{ name: 'args', type: 'String[]' }],
    returns: 'void',
  }),
  callable({
    file: 'app/Controller.java',
    owner: 'Controller',
    member: 'hidden',
    line: 33,
    exported: false,
    returns: 'void',
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'app/MemoryRepo.java',
    owner: 'MemoryRepo',
    member: 'save',
    line: 4,
    entry: true,
    params: [{ name: 'value', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'app/MemoryRepo.java',
    owner: 'MemoryRepo',
    member: 'load',
    line: 6,
    entry: true,
    params: [{ name: 'key', type: 'String' }],
    returns: 'String',
  }),
  callable({
    file: 'app/MemoryRepo.java',
    owner: 'MemoryRepo',
    member: 'helper',
    line: 11,
    returns: 'void',
  }),
  callable({
    file: 'app/Repo.java',
    owner: 'Repo',
    member: 'save',
    line: 4,
    params: [{ name: 'value', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'app/Repo.java',
    owner: 'Repo',
    member: 'load',
    line: 6,
    params: [{ name: 'key', type: 'String' }],
    returns: 'String',
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'app/Point.java',
    owner: 'Point',
    member: 'getX',
    line: 7,
    kind: 'accessor',
    exported: false,
    returns: 'int',
    ownFields: ['x'],
    returnsField: 'x',
  }),
  callable({
    file: 'app/Point.java',
    owner: 'Point',
    member: 'setX',
    line: 11,
    exported: false,
    params: [{ name: 'x', type: 'int' }],
    returns: 'void',
    ownFields: ['x'],
  }),
  callable({
    file: 'app/Point.java',
    owner: 'Point',
    member: 'getY',
    line: 15,
    kind: 'accessor',
    exported: false,
    returns: 'int',
    ownFields: ['y'],
    returnsField: 'y',
  }),
  callable({
    file: 'app/Point.java',
    owner: 'Point',
    member: 'equals',
    line: 19,
    exported: false,
    params: [{ name: 'other', type: 'Object' }],
    returns: 'boolean',
  }),
  callable({
    file: 'app/Point.java',
    owner: 'Point',
    member: 'hashCode',
    line: 24,
    kind: 'accessor',
    exported: false,
    entry: true,
    returns: 'int',
    ownFields: ['x'],
    returnsField: 'x',
  }),
  callable({
    file: 'app/Point.java',
    owner: 'Point',
    member: 'toString',
    line: 29,
    exported: false,
    returns: 'String',
  }),
  callable({
    file: 'app/Ranked.java',
    owner: 'Ranked',
    member: 'compareTo',
    line: 6,
    entry: true,
    params: [{ name: 'other', type: ref('app/Ranked.java', 'Ranked') }],
    returns: 'int',
    paramUses: [{ param: 0, fields: ['rank'], forwards: [] }],
    ownFields: ['rank'],
    reads: [{ type: ref('app/Ranked.java', 'Ranked'), fields: ['rank'], line: 7 }],
  }),
  callable({
    file: 'app/Ranked.java',
    owner: 'Ranked',
    member: 'other',
    line: 10,
    entry: true,
    returns: 'void',
  }),
  callable({
    file: 'app/Ranked.java',
    owner: 'Ranked',
    member: 'internal',
    line: 12,
    exported: false,
    returns: 'void',
  }),
  callable({ file: 'app/Ranked.java', owner: 'Ranked', member: 'util', line: 14, returns: 'void' }),
];

describe('design facts: entry points and the exported surface', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('app/Controller.java', 'Controller'),
      ref('app/MemoryRepo.java', 'MemoryRepo'),
      ref('app/Point.java', 'Point'),
      ref('app/Ranked.java', 'Ranked'),
      ref('app/Repo.java', 'Repo'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('app/Controller.java', 'Controller.<init>'),
      ref('app/Controller.java', 'Controller.hidden'),
      ref('app/Controller.java', 'Controller.index'),
      ref('app/Controller.java', 'Controller.main'),
      ref('app/Controller.java', 'Controller.marked'),
      ref('app/Controller.java', 'Controller.maybe'),
      ref('app/Controller.java', 'Controller.quiet'),
      ref('app/MemoryRepo.java', 'MemoryRepo.helper'),
      ref('app/MemoryRepo.java', 'MemoryRepo.load'),
      ref('app/MemoryRepo.java', 'MemoryRepo.save'),
      ref('app/Point.java', 'Point.equals'),
      ref('app/Point.java', 'Point.getX'),
      ref('app/Point.java', 'Point.getY'),
      ref('app/Point.java', 'Point.hashCode'),
      ref('app/Point.java', 'Point.setX'),
      ref('app/Point.java', 'Point.toString'),
      ref('app/Ranked.java', 'Ranked.compareTo'),
      ref('app/Ranked.java', 'Ranked.internal'),
      ref('app/Ranked.java', 'Ranked.other'),
      ref('app/Ranked.java', 'Ranked.util'),
      ref('app/Repo.java', 'Repo.load'),
      ref('app/Repo.java', 'Repo.save'),
    ]);
  });

  it.each(TYPES_0)('describes the types: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)('marks framework and main entries: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_1)('treats interface overrides as part of the surface: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_2)('classifies accessors, object methods and comparisons: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });
});
