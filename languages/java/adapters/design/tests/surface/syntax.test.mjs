import { describe, expect, it } from 'vitest';
import { callable, fixtureFacts, ref, type } from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('syntax');

const MODULES = [{ file: 'src/main/java/mix/Syntax.java', role: 'production' }];
const TYPES_0 = [
  type({
    file: 'mix/Syntax.java',
    symbol: 'Syntax',
    line: 7,
    kind: 'class',
    fields: [
      { name: 'names', mutable: true, private: true },
      { name: 'counts', mutable: true, private: true },
      { name: 'title', private: true },
    ],
  }),
  type({ file: 'mix/Syntax.java', symbol: 'Syntax.Node', line: 16, kind: 'interface' }),
  type({
    file: 'mix/Syntax.java',
    symbol: 'Syntax.Leaf',
    line: 18,
    kind: 'data',
    fields: [{ name: 'value', private: true }],
  }),
  type({
    file: 'mix/Syntax.java',
    symbol: 'Syntax.Branch',
    line: 26,
    kind: 'data',
    fields: [
      { name: 'left', private: true },
      { name: 'right', private: true },
    ],
  }),
  type({
    file: 'mix/Syntax.java',
    symbol: 'Syntax.Mode',
    line: 28,
    kind: 'enum',
    cases: ['FAST', 'SLOW'],
  }),
  type({ file: 'mix/Syntax.java', symbol: 'Syntax.Visitor', line: 45, kind: 'interface' }),
];
const CALLABLES_0 = [
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax',
    member: 'pick',
    line: 53,
    params: [
      { name: 'nodes', type: 'List' },
      { name: 'more', type: 'T[]', variadic: true },
    ],
    returns: 'T',
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax',
    member: 'anonymous',
    line: 57,
    params: [{ name: 'leaf', type: ref('mix/Syntax.java', 'Syntax.Leaf') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
    ownFields: ['names', 'title'],
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax',
    member: 'local',
    line: 69,
    params: [{ name: 'leaf', type: ref('mix/Syntax.java', 'Syntax.Leaf') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax',
    member: 'lambdas',
    line: 78,
    params: [{ name: 'leaves', type: 'List' }],
    returns: 'String',
    ownFields: ['names'],
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax',
    member: 'patterns',
    line: 84,
    params: [{ name: 'node', type: ref('mix/Syntax.java', 'Syntax.Node') }],
    returns: 'int',
    calls: [
      { target: ref('mix/Syntax.java', 'Syntax.patterns'), line: 90, receiver: 'this' },
      { target: ref('mix/Syntax.java', 'Syntax.patterns'), line: 90, receiver: 'this' },
    ],
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
    reads: [
      {
        type: ref('mix/Syntax.java', 'Syntax.Leaf'),
        fields: ['value'],
        decided: ['value'],
        line: 85,
      },
      { type: ref('mix/Syntax.java', 'Syntax.Branch'), fields: ['left', 'right'], line: 90 },
    ],
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax',
    member: 'labeled',
    line: 94,
    returns: 'int',
    ownFields: ['counts'],
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax',
    member: 'array',
    line: 112,
    params: [{ name: 'values', type: 'String[]', variadic: true }],
    returns: 'String[]',
    ownFields: ['counts'],
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax',
    member: 'generic',
    line: 118,
    params: [
      { name: 'mode', type: ref('mix/Syntax.java', 'Syntax.Mode') },
      { name: 'visitor', type: ref('mix/Syntax.java', 'Syntax.Visitor') },
    ],
    returns: 'Object',
    calls: [
      { target: ref('mix/Syntax.java', 'Syntax.Mode.speed'), line: 119, receiver: 'mode' },
      { target: ref('mix/Syntax.java', 'Syntax.Visitor.visit'), line: 119, receiver: 'visitor' },
    ],
    paramUses: [{ param: 1, fields: ['visit'], forwards: [] }],
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax.Leaf',
    member: '<init>',
    line: 19,
    name: 'Leaf',
    kind: 'constructor',
    params: [{ name: 'value', type: 'String' }],
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax.Mode',
    member: 'speed',
    line: 42,
    exported: false,
    returns: 'int',
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax.Visitor',
    member: 'visit',
    line: 46,
    params: [{ name: 'node', type: ref('mix/Syntax.java', 'Syntax.Node') }],
    returns: 'T',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
  }),
  callable({
    file: 'mix/Syntax.java',
    owner: 'Syntax.Visitor',
    member: 'hidden',
    line: 48,
    exported: false,
    returns: 'int',
  }),
];

describe('design facts: sources that use the less common syntax', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('mix/Syntax.java', 'Syntax'),
      ref('mix/Syntax.java', 'Syntax.Branch'),
      ref('mix/Syntax.java', 'Syntax.Leaf'),
      ref('mix/Syntax.java', 'Syntax.Mode'),
      ref('mix/Syntax.java', 'Syntax.Node'),
      ref('mix/Syntax.java', 'Syntax.Visitor'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('mix/Syntax.java', 'Syntax.Leaf.<init>'),
      ref('mix/Syntax.java', 'Syntax.Mode.speed'),
      ref('mix/Syntax.java', 'Syntax.Visitor.hidden'),
      ref('mix/Syntax.java', 'Syntax.Visitor.visit'),
      ref('mix/Syntax.java', 'Syntax.anonymous'),
      ref('mix/Syntax.java', 'Syntax.array'),
      ref('mix/Syntax.java', 'Syntax.generic'),
      ref('mix/Syntax.java', 'Syntax.labeled'),
      ref('mix/Syntax.java', 'Syntax.lambdas'),
      ref('mix/Syntax.java', 'Syntax.local'),
      ref('mix/Syntax.java', 'Syntax.patterns'),
      ref('mix/Syntax.java', 'Syntax.pick'),
    ]);
  });

  it.each(TYPES_0)('describes the types: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)('reads every construct without losing a member: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });
});
