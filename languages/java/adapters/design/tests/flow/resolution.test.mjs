import { describe, expect, it } from 'vitest';
import { callable, fixtureFacts, ref, type } from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('resolution');

const MODULES = [
  { file: 'src/main/java/a/Base.java', role: 'production' },
  { file: 'src/main/java/a/Circle.java', role: 'production' },
  { file: 'src/main/java/a/Outer.java', role: 'production' },
  { file: 'src/main/java/a/Same.java', role: 'production' },
  { file: 'src/main/java/a/Shape.java', role: 'production' },
  { file: 'src/main/java/a/Util.java', role: 'production' },
  { file: 'src/main/java/b/Util.java', role: 'production' },
  { file: 'src/main/java/c/Client.java', role: 'production' },
];
const TYPES_0 = [
  type({
    file: 'a/Base.java',
    symbol: 'Base',
    line: 3,
    kind: 'class',
    fields: [{ name: 'label', private: true }],
  }),
  type({
    file: 'a/Circle.java',
    symbol: 'Circle',
    line: 3,
    kind: 'class',
    fields: [{ name: 'radius', private: true }],
  }),
  type({ file: 'a/Outer.java', symbol: 'Outer', line: 3, kind: 'class' }),
  type({ file: 'a/Outer.java', symbol: 'Outer.Inner', line: 4, kind: 'class' }),
  type({ file: 'a/Outer.java', symbol: 'Outer.Weird', line: 23, kind: 'class' }),
  type({ file: 'a/Same.java', symbol: 'Same', line: 3, kind: 'class' }),
  type({ file: 'a/Shape.java', symbol: 'Shape', line: 3, kind: 'interface' }),
  type({ file: 'a/Util.java', symbol: 'Util', line: 3, kind: 'class' }),
  type({ file: 'b/Util.java', symbol: 'Util', line: 3, kind: 'class' }),
  type({
    file: 'c/Client.java',
    symbol: 'Client',
    line: 10,
    kind: 'class',
    fields: [
      { name: 'circle', private: true },
      { name: 'shapes', mutable: true, private: true },
    ],
  }),
];
const CALLABLES_0 = [
  callable({
    file: 'a/Base.java',
    owner: 'Base',
    member: '<init>',
    line: 6,
    name: 'Base',
    kind: 'constructor',
    params: [{ name: 'label', type: 'String' }],
    ownFields: ['label'],
  }),
  callable({
    file: 'a/Base.java',
    owner: 'Base',
    member: 'hello',
    line: 10,
    returns: 'String',
    ownFields: ['label'],
  }),
  callable({
    file: 'a/Circle.java',
    owner: 'Circle',
    member: '<init>(double)',
    line: 6,
    name: 'Circle',
    kind: 'constructor',
    params: [{ name: 'radius', type: 'double' }],
    calls: [{ target: ref('a/Base.java', 'Base.<init>'), line: 7 }],
    ownFields: ['radius'],
  }),
  callable({
    file: 'a/Circle.java',
    owner: 'Circle',
    member: '<init>()',
    line: 11,
    name: 'Circle',
    kind: 'constructor',
    calls: [{ target: ref('a/Circle.java', 'Circle.<init>(double)'), line: 12 }],
  }),
  callable({
    file: 'a/Circle.java',
    owner: 'Circle',
    member: 'area',
    line: 15,
    entry: true,
    returns: 'double',
    ownFields: ['radius'],
  }),
  callable({
    file: 'a/Circle.java',
    owner: 'Circle',
    member: 'hello',
    line: 20,
    entry: true,
    returns: 'String',
    calls: [
      { target: ref('a/Base.java', 'Base.hello'), line: 22, receiver: 'this' },
      { target: ref('a/Shape.java', 'Shape.describe'), line: 22, receiver: 'this' },
    ],
  }),
  callable({
    file: 'a/Circle.java',
    owner: 'Circle',
    member: 'grow',
    line: 25,
    returns: ref('a/Circle.java', 'Circle'),
    calls: [{ target: ref('a/Circle.java', 'Circle.<init>(double)'), line: 26 }],
    ownFields: ['radius'],
  }),
  callable({ file: 'a/Shape.java', owner: 'Shape', member: 'area', line: 4, returns: 'double' }),
  callable({
    file: 'a/Shape.java',
    owner: 'Shape',
    member: 'describe',
    line: 6,
    returns: 'String',
    calls: [{ target: ref('a/Shape.java', 'Shape.area'), line: 7, receiver: 'this' }],
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'a/Outer.java',
    owner: 'Outer',
    member: 'outerOnly',
    line: 14,
    exported: false,
    returns: 'int',
  }),
  callable({
    file: 'a/Outer.java',
    owner: 'Outer',
    member: 'use',
    line: 18,
    returns: 'int',
    calls: [
      { target: ref('a/Outer.java', 'Outer.Inner.make'), line: 19 },
      { target: ref('a/Outer.java', 'Outer.Inner.value'), line: 20, receiver: 'inner' },
    ],
    reads: [{ type: ref('a/Outer.java', 'Outer.Inner'), fields: ['value'], line: 20 }],
  }),
  callable({
    file: 'a/Outer.java',
    owner: 'Outer.Inner',
    member: 'make',
    line: 5,
    returns: ref('a/Outer.java', 'Outer.Inner'),
  }),
  callable({
    file: 'a/Outer.java',
    owner: 'Outer.Inner',
    member: 'value',
    line: 9,
    returns: 'int',
    forward: { target: ref('a/Outer.java', 'Outer.outerOnly'), arguments: [], returned: true },
    calls: [{ target: ref('a/Outer.java', 'Outer.outerOnly'), line: 10 }],
  }),
  callable({
    file: 'a/Outer.java',
    owner: 'Outer.Weird',
    member: 'ask',
    line: 24,
    entry: true,
    returns: 'int',
    calls: [{ target: ref('a/Outer.java', 'Outer.Weird.start2'), line: 25, receiver: 'this' }],
  }),
  callable({
    file: 'a/Outer.java',
    owner: 'Outer.Weird',
    member: 'start2',
    line: 28,
    entry: true,
    returns: 'int',
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'a/Same.java',
    owner: 'Same',
    member: 'plain',
    line: 4,
    returns: 'int',
    forward: { target: ref('a/Util.java', 'Util.plain'), arguments: [], returned: true },
    calls: [{ target: ref('a/Util.java', 'Util.plain'), line: 5 }],
  }),
  callable({
    file: 'a/Util.java',
    owner: 'Util',
    member: 'twice',
    line: 4,
    params: [{ name: 'value', type: 'int' }],
    returns: 'int',
  }),
  callable({
    file: 'a/Util.java',
    owner: 'Util',
    member: 'pick(int)',
    line: 8,
    name: 'pick',
    params: [{ name: 'value', type: 'int' }],
    returns: 'int',
  }),
  callable({
    file: 'a/Util.java',
    owner: 'Util',
    member: 'pick(String)',
    line: 12,
    name: 'pick',
    params: [{ name: 'value', type: 'String' }],
    returns: 'String',
  }),
  callable({ file: 'a/Util.java', owner: 'Util', member: 'plain', line: 16, returns: 'int' }),
  callable({
    file: 'a/Util.java',
    owner: 'Util',
    member: 'total',
    line: 20,
    returns: 'int',
    calls: [
      { target: ref('a/Util.java', 'Util.plain'), line: 21 },
      { target: ref('a/Util.java', 'Util.twice'), line: 21 },
    ],
  }),
  callable({ file: 'b/Util.java', owner: 'Util', member: 'plain', line: 4, returns: 'int' }),
];
const CALLABLES_3 = [
  callable({
    file: 'c/Client.java',
    owner: 'Client',
    member: 'ambiguousImport',
    line: 14,
    returns: 'int',
  }),
  callable({
    file: 'c/Client.java',
    owner: 'Client',
    member: 'staticImported',
    line: 18,
    returns: 'int',
    calls: [{ target: ref('a/Util.java', 'Util.twice'), line: 19 }],
  }),
  callable({
    file: 'c/Client.java',
    owner: 'Client',
    member: 'overloadedSameArity',
    line: 22,
    returns: 'int',
  }),
  callable({
    file: 'c/Client.java',
    owner: 'Client',
    member: 'viaField',
    line: 26,
    returns: 'String',
    calls: [{ target: ref('a/Circle.java', 'Circle.hello'), line: 28, receiver: 'this.circle' }],
    ownFields: ['shapes', 'circle'],
    reads: [{ type: ref('a/Circle.java', 'Circle'), fields: ['hello'], line: 28 }],
  }),
  callable({
    file: 'c/Client.java',
    owner: 'Client',
    member: 'viaVar',
    line: 31,
    returns: 'double',
    calls: [
      { target: ref('a/Circle.java', 'Circle.<init>()'), line: 32 },
      { target: ref('a/Circle.java', 'Circle.grow'), line: 33, receiver: 'made' },
      { target: ref('a/Shape.java', 'Shape.area'), line: 34, receiver: 'shape' },
    ],
    reads: [{ type: ref('a/Circle.java', 'Circle'), fields: ['grow'], line: 33 }],
  }),
  callable({
    file: 'c/Client.java',
    owner: 'Client',
    member: 'viaCast',
    line: 37,
    params: [{ name: 'value', type: 'Object' }],
    returns: 'double',
    forward: { target: ref('a/Circle.java', 'Circle.area'), arguments: [], returned: true },
    calls: [{ target: ref('a/Circle.java', 'Circle.area'), line: 38, receiver: 'value' }],
  }),
  callable({
    file: 'c/Client.java',
    owner: 'Client',
    member: 'shadowed',
    line: 41,
    params: [{ name: 'shape', type: 'Shape' }],
    returns: 'double',
  }),
  callable({
    file: 'c/Client.java',
    owner: 'Client',
    member: 'viaInnerLoop',
    line: 45,
    params: [{ name: 'circles', type: 'List' }],
    returns: 'double',
    calls: [{ target: ref('a/Circle.java', 'Circle.area'), line: 48, receiver: 'each' }],
    reads: [{ type: ref('a/Circle.java', 'Circle'), fields: ['area'], line: 48 }],
  }),
  callable({
    file: 'c/Client.java',
    owner: 'Client',
    member: 'nested',
    line: 53,
    returns: 'int',
    forward: { target: ref('a/Outer.java', 'Outer.Inner.value'), arguments: [], returned: true },
    calls: [
      { target: ref('a/Outer.java', 'Outer.Inner.make'), line: 54 },
      { target: ref('a/Outer.java', 'Outer.Inner.value'), line: 54 },
    ],
  }),
];

describe('design facts: how calls are resolved to declarations', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('a/Base.java', 'Base'),
      ref('a/Circle.java', 'Circle'),
      ref('a/Outer.java', 'Outer'),
      ref('a/Outer.java', 'Outer.Inner'),
      ref('a/Outer.java', 'Outer.Weird'),
      ref('a/Same.java', 'Same'),
      ref('a/Shape.java', 'Shape'),
      ref('a/Util.java', 'Util'),
      ref('b/Util.java', 'Util'),
      ref('c/Client.java', 'Client'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('a/Base.java', 'Base.<init>'),
      ref('a/Base.java', 'Base.hello'),
      ref('a/Circle.java', 'Circle.<init>()'),
      ref('a/Circle.java', 'Circle.<init>(double)'),
      ref('a/Circle.java', 'Circle.area'),
      ref('a/Circle.java', 'Circle.grow'),
      ref('a/Circle.java', 'Circle.hello'),
      ref('a/Outer.java', 'Outer.Inner.make'),
      ref('a/Outer.java', 'Outer.Inner.value'),
      ref('a/Outer.java', 'Outer.Weird.ask'),
      ref('a/Outer.java', 'Outer.Weird.start2'),
      ref('a/Outer.java', 'Outer.outerOnly'),
      ref('a/Outer.java', 'Outer.use'),
      ref('a/Same.java', 'Same.plain'),
      ref('a/Shape.java', 'Shape.area'),
      ref('a/Shape.java', 'Shape.describe'),
      ref('a/Util.java', 'Util.pick(String)'),
      ref('a/Util.java', 'Util.pick(int)'),
      ref('a/Util.java', 'Util.plain'),
      ref('a/Util.java', 'Util.total'),
      ref('a/Util.java', 'Util.twice'),
      ref('b/Util.java', 'Util.plain'),
      ref('c/Client.java', 'Client.ambiguousImport'),
      ref('c/Client.java', 'Client.nested'),
      ref('c/Client.java', 'Client.overloadedSameArity'),
      ref('c/Client.java', 'Client.shadowed'),
      ref('c/Client.java', 'Client.staticImported'),
      ref('c/Client.java', 'Client.viaCast'),
      ref('c/Client.java', 'Client.viaField'),
      ref('c/Client.java', 'Client.viaInnerLoop'),
      ref('c/Client.java', 'Client.viaVar'),
    ]);
  });

  it.each(TYPES_0)('describes the types: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)('resolves through the type hierarchy: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_1)('resolves nested and inherited member types: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_2)('resolves utility classes by import: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_3)('leaves out calls that are ambiguous or unresolved: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });
});
