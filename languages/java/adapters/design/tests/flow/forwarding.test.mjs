import { describe, expect, it } from 'vitest';
import {
  accessor,
  callable,
  fixtureFacts,
  ref,
  type,
} from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('forwarding');

const MODULES = [
  { file: 'src/main/java/fwd/Backend.java', role: 'production' },
  { file: 'src/main/java/fwd/Context.java', role: 'production' },
  { file: 'src/main/java/fwd/Gateway.java', role: 'production' },
];
const TYPES_0 = [
  type({ file: 'fwd/Backend.java', symbol: 'Backend', line: 3, kind: 'class' }),
  type({
    file: 'fwd/Context.java',
    symbol: 'Context',
    line: 3,
    kind: 'data',
    fields: [
      { name: 'name', private: true },
      { name: 'depth', private: true },
      { name: 'region', private: true },
      { name: 'user', private: true },
      { name: 'debug', private: true },
    ],
  }),
  type({
    file: 'fwd/Gateway.java',
    symbol: 'Gateway',
    line: 3,
    kind: 'class',
    fields: [{ name: 'backend', private: true }],
  }),
];
const CALLABLES_0 = [
  callable({
    file: 'fwd/Backend.java',
    owner: 'Backend',
    member: 'fetch',
    line: 4,
    params: [
      { name: 'id', type: 'String' },
      { name: 'retries', type: 'int' },
    ],
    returns: 'String',
  }),
  callable({
    file: 'fwd/Backend.java',
    owner: 'Backend',
    member: 'fetchSwapped',
    line: 8,
    params: [
      { name: 'retries', type: 'int' },
      { name: 'id', type: 'String' },
    ],
    returns: 'String',
  }),
  callable({
    file: 'fwd/Backend.java',
    owner: 'Backend',
    member: 'send',
    line: 12,
    params: [{ name: 'id', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'fwd/Backend.java',
    owner: 'Backend',
    member: 'size',
    line: 14,
    returns: 'int',
  }),
  callable({
    file: 'fwd/Backend.java',
    owner: 'Backend',
    member: 'load(String)',
    line: 18,
    name: 'load',
    params: [{ name: 'id', type: 'String' }],
    returns: 'String',
  }),
  callable({
    file: 'fwd/Backend.java',
    owner: 'Backend',
    member: 'load(String,int)',
    line: 22,
    name: 'load',
    params: [
      { name: 'id', type: 'String' },
      { name: 'retries', type: 'int' },
    ],
    returns: 'String',
  }),
  callable({
    file: 'fwd/Backend.java',
    owner: 'Backend',
    member: 'render',
    line: 26,
    params: [
      { name: 'context', type: ref('fwd/Context.java', 'Context') },
      { name: 'id', type: 'String' },
    ],
    returns: 'String',
    calls: [{ target: ref('fwd/Context.java', 'Context.name'), line: 27, receiver: 'context' }],
    paramUses: [{ param: 0, fields: ['name'], forwards: [] }],
    reads: [{ type: ref('fwd/Context.java', 'Context'), fields: ['name'], line: 27 }],
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: '<init>',
    line: 6,
    name: 'Gateway',
    kind: 'constructor',
    params: [{ name: 'backend', type: ref('fwd/Backend.java', 'Backend') }],
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
    ownFields: ['backend'],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'fetch',
    line: 10,
    params: [
      { name: 'id', type: 'String' },
      { name: 'retries', type: 'int' },
    ],
    returns: 'String',
    forward: {
      target: ref('fwd/Backend.java', 'Backend.fetch'),
      arguments: [0, 1],
      returned: true,
    },
    calls: [
      { target: ref('fwd/Backend.java', 'Backend.fetch'), line: 11, receiver: 'this.backend' },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['fetch'], line: 11 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'swapped',
    line: 14,
    params: [
      { name: 'id', type: 'String' },
      { name: 'retries', type: 'int' },
    ],
    returns: 'String',
    forward: {
      target: ref('fwd/Backend.java', 'Backend.fetchSwapped'),
      arguments: [1, 0],
      returned: true,
    },
    calls: [
      {
        target: ref('fwd/Backend.java', 'Backend.fetchSwapped'),
        line: 15,
        receiver: 'this.backend',
      },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['fetchSwapped'], line: 15 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'twice',
    line: 26,
    params: [{ name: 'id', type: 'String' }],
    returns: 'String',
    calls: [
      {
        target: ref('fwd/Backend.java', 'Backend.load(String)'),
        line: 27,
        receiver: 'this.backend',
      },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['load'], line: 27 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'changed',
    line: 31,
    params: [{ name: 'id', type: 'String' }],
    returns: 'String',
    calls: [
      {
        target: ref('fwd/Backend.java', 'Backend.load(String)'),
        line: 32,
        receiver: 'this.backend',
      },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['load'], line: 32 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'send',
    line: 35,
    params: [{ name: 'id', type: 'String' }],
    returns: 'void',
    forward: { target: ref('fwd/Backend.java', 'Backend.send'), arguments: [0], returned: false },
    calls: [
      { target: ref('fwd/Backend.java', 'Backend.send'), line: 36, receiver: 'this.backend' },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['send'], line: 36 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'size',
    line: 39,
    returns: 'int',
    forward: { target: ref('fwd/Backend.java', 'Backend.size'), arguments: [], returned: true },
    calls: [
      { target: ref('fwd/Backend.java', 'Backend.size'), line: 40, receiver: 'this.backend' },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['size'], line: 40 }],
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'constant',
    line: 18,
    params: [{ name: 'id', type: 'String' }],
    returns: 'String',
    forward: {
      target: ref('fwd/Backend.java', 'Backend.fetch'),
      arguments: [0, -1],
      returned: true,
    },
    calls: [
      { target: ref('fwd/Backend.java', 'Backend.fetch'), line: 19, receiver: 'this.backend' },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['fetch'], line: 19 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'computed',
    line: 22,
    params: [{ name: 'id', type: 'String' }],
    returns: 'String',
    calls: [
      { target: ref('fwd/Backend.java', 'Backend.fetch'), line: 23, receiver: 'this.backend' },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['fetch'], line: 23 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'absent',
    line: 67,
    params: [{ name: 'context', type: ref('fwd/Context.java', 'Context') }],
    returns: 'boolean',
    paramUses: [{ param: 0, fields: [], forwards: [] }],
  }),
];
const CALLABLES_3 = [
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'ambiguous',
    line: 43,
    params: [{ name: 'id', type: 'String' }],
    returns: 'String',
    forward: {
      target: ref('fwd/Backend.java', 'Backend.load(String,int)'),
      arguments: [0, -1],
      returned: true,
    },
    calls: [
      {
        target: ref('fwd/Backend.java', 'Backend.load(String,int)'),
        line: 44,
        receiver: 'this.backend',
      },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['load'], line: 44 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'render',
    line: 47,
    params: [
      { name: 'context', type: ref('fwd/Context.java', 'Context') },
      { name: 'id', type: 'String' },
    ],
    returns: 'String',
    forward: {
      target: ref('fwd/Backend.java', 'Backend.render'),
      arguments: [0, 1],
      returned: true,
    },
    calls: [
      { target: ref('fwd/Backend.java', 'Backend.render'), line: 48, receiver: 'this.backend' },
    ],
    paramUses: [
      {
        param: 0,
        fields: [],
        forwards: [{ target: ref('fwd/Backend.java', 'Backend.render'), position: 0 }],
      },
    ],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['render'], line: 48 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'threaded',
    line: 51,
    params: [{ name: 'context', type: ref('fwd/Context.java', 'Context') }],
    returns: 'String',
    forward: {
      target: ref('fwd/Gateway.java', 'Gateway.render'),
      arguments: [0, -1],
      returned: true,
    },
    calls: [{ target: ref('fwd/Gateway.java', 'Gateway.render'), line: 52, receiver: 'this' }],
    paramUses: [
      {
        param: 0,
        fields: [],
        forwards: [{ target: ref('fwd/Gateway.java', 'Gateway.render'), position: 0 }],
      },
    ],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'peek',
    line: 55,
    params: [{ name: 'context', type: ref('fwd/Context.java', 'Context') }],
    returns: 'String',
    calls: [
      { target: ref('fwd/Context.java', 'Context.name'), line: 56, receiver: 'context' },
      { target: ref('fwd/Context.java', 'Context.depth'), line: 56, receiver: 'context' },
    ],
    paramUses: [{ param: 0, fields: ['name', 'depth'], forwards: [] }],
    reads: [{ type: ref('fwd/Context.java', 'Context'), fields: ['name', 'depth'], line: 56 }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'keep',
    line: 59,
    params: [{ name: 'context', type: ref('fwd/Context.java', 'Context') }],
    returns: 'String',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'same',
    line: 63,
    params: [{ name: 'context', type: ref('fwd/Context.java', 'Context') }],
    returns: ref('fwd/Context.java', 'Context'),
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
  }),
  callable({
    file: 'fwd/Gateway.java',
    owner: 'Gateway',
    member: 'later',
    line: 71,
    params: [{ name: 'context', type: ref('fwd/Context.java', 'Context') }],
    returns: 'Runnable',
    calls: [
      { target: ref('fwd/Backend.java', 'Backend.render'), line: 72, receiver: 'this.backend' },
    ],
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
    ownFields: ['backend'],
    reads: [{ type: ref('fwd/Backend.java', 'Backend'), fields: ['render'], line: 72 }],
  }),
];
const CALLABLES_4 = [
  accessor({
    file: 'fwd/Context.java',
    owner: 'Context',
    member: 'name',
    line: 3,
    returns: 'String',
  }),
  accessor({
    file: 'fwd/Context.java',
    owner: 'Context',
    member: 'depth',
    line: 3,
    returns: 'int',
  }),
  accessor({
    file: 'fwd/Context.java',
    owner: 'Context',
    member: 'region',
    line: 3,
    returns: 'String',
  }),
  accessor({
    file: 'fwd/Context.java',
    owner: 'Context',
    member: 'user',
    line: 3,
    returns: 'String',
  }),
  accessor({
    file: 'fwd/Context.java',
    owner: 'Context',
    member: 'debug',
    line: 3,
    returns: 'boolean',
  }),
];

describe('design facts: calls that pass their parameters on', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('fwd/Backend.java', 'Backend'),
      ref('fwd/Context.java', 'Context'),
      ref('fwd/Gateway.java', 'Gateway'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('fwd/Backend.java', 'Backend.fetch'),
      ref('fwd/Backend.java', 'Backend.fetchSwapped'),
      ref('fwd/Backend.java', 'Backend.load(String)'),
      ref('fwd/Backend.java', 'Backend.load(String,int)'),
      ref('fwd/Backend.java', 'Backend.render'),
      ref('fwd/Backend.java', 'Backend.send'),
      ref('fwd/Backend.java', 'Backend.size'),
      ref('fwd/Context.java', 'Context.debug'),
      ref('fwd/Context.java', 'Context.depth'),
      ref('fwd/Context.java', 'Context.name'),
      ref('fwd/Context.java', 'Context.region'),
      ref('fwd/Context.java', 'Context.user'),
      ref('fwd/Gateway.java', 'Gateway.<init>'),
      ref('fwd/Gateway.java', 'Gateway.absent'),
      ref('fwd/Gateway.java', 'Gateway.ambiguous'),
      ref('fwd/Gateway.java', 'Gateway.changed'),
      ref('fwd/Gateway.java', 'Gateway.computed'),
      ref('fwd/Gateway.java', 'Gateway.constant'),
      ref('fwd/Gateway.java', 'Gateway.fetch'),
      ref('fwd/Gateway.java', 'Gateway.keep'),
      ref('fwd/Gateway.java', 'Gateway.later'),
      ref('fwd/Gateway.java', 'Gateway.peek'),
      ref('fwd/Gateway.java', 'Gateway.render'),
      ref('fwd/Gateway.java', 'Gateway.same'),
      ref('fwd/Gateway.java', 'Gateway.send'),
      ref('fwd/Gateway.java', 'Gateway.size'),
      ref('fwd/Gateway.java', 'Gateway.swapped'),
      ref('fwd/Gateway.java', 'Gateway.threaded'),
      ref('fwd/Gateway.java', 'Gateway.twice'),
    ]);
  });

  it.each(TYPES_0)('describes the types: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)('declares the target methods: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_1)('hands parameters to a call: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_2)('passes no parameter on unchanged: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_3)('covers the remaining parameter uses: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_4)('answers record components through implicit accessors: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });
});
