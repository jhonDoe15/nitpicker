import { describe, expect, it } from 'vitest';
import { callable, fixtureFacts, ref, type } from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('lifecycle');

const MODULES = [
  { file: 'src/main/java/life/Client.java', role: 'production' },
  { file: 'src/main/java/life/Session.java', role: 'production' },
];
const TYPES_0 = [
  type({
    file: 'life/Client.java',
    symbol: 'Client',
    line: 3,
    kind: 'class',
    fields: [{ name: 'shared', private: true }],
  }),
  type({ file: 'life/Session.java', symbol: 'Session', line: 3, kind: 'class' }),
];
const CALLABLES_0 = [
  callable({
    file: 'life/Client.java',
    owner: 'Client',
    member: 'guarded',
    line: 6,
    params: [{ name: 'session', type: ref('life/Session.java', 'Session') }],
    returns: 'void',
    calls: [
      { target: ref('life/Session.java', 'Session.begin'), line: 7, receiver: 'session' },
      { target: ref('life/Session.java', 'Session.write'), line: 9, receiver: 'session' },
      { target: ref('life/Session.java', 'Session.commit'), line: 10, receiver: 'session' },
      { target: ref('life/Session.java', 'Session.rollback'), line: 12, receiver: 'session' },
      {
        target: ref('life/Session.java', 'Session.close'),
        line: 14,
        receiver: 'session',
        cleanup: true,
      },
    ],
    paramUses: [
      { param: 0, fields: ['begin', 'write', 'commit', 'rollback', 'close'], forwards: [] },
    ],
    reads: [
      {
        type: ref('life/Session.java', 'Session'),
        fields: ['begin', 'write', 'commit', 'rollback', 'close'],
        line: 7,
      },
    ],
  }),
  callable({
    file: 'life/Client.java',
    owner: 'Client',
    member: 'resource',
    line: 18,
    returns: 'void',
    calls: [
      { target: ref('life/Session.java', 'Session.begin'), line: 20, receiver: 'session' },
      { target: ref('life/Session.java', 'Session.write'), line: 21, receiver: 'session' },
      {
        target: ref('life/Session.java', 'Session.close'),
        line: 19,
        receiver: 'session',
        cleanup: true,
      },
    ],
    reads: [{ type: ref('life/Session.java', 'Session'), fields: ['begin', 'write'], line: 20 }],
  }),
  callable({
    file: 'life/Client.java',
    owner: 'Client',
    member: 'existing',
    line: 25,
    params: [{ name: 'session', type: ref('life/Session.java', 'Session') }],
    returns: 'void',
    calls: [
      { target: ref('life/Session.java', 'Session.begin'), line: 27, receiver: 'session' },
      {
        target: ref('life/Session.java', 'Session.close'),
        line: 26,
        receiver: 'session',
        cleanup: true,
      },
    ],
    paramUses: [{ param: 0, fields: ['begin'], forwards: [] }],
    reads: [{ type: ref('life/Session.java', 'Session'), fields: ['begin'], line: 27 }],
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'life/Client.java',
    owner: 'Client',
    member: 'leaked',
    line: 31,
    params: [{ name: 'session', type: ref('life/Session.java', 'Session') }],
    returns: 'void',
    calls: [
      { target: ref('life/Session.java', 'Session.begin'), line: 32, receiver: 'session' },
      { target: ref('life/Session.java', 'Session.write'), line: 33, receiver: 'session' },
    ],
    paramUses: [{ param: 0, fields: ['begin', 'write'], forwards: [] }],
    reads: [{ type: ref('life/Session.java', 'Session'), fields: ['begin', 'write'], line: 32 }],
  }),
  callable({
    file: 'life/Client.java',
    owner: 'Client',
    member: 'field',
    line: 36,
    returns: 'void',
    calls: [
      { target: ref('life/Session.java', 'Session.begin'), line: 37, receiver: 'this.shared' },
      { target: ref('life/Session.java', 'Session.write'), line: 39, receiver: 'this.shared' },
      {
        target: ref('life/Session.java', 'Session.rollback'),
        line: 41,
        receiver: 'this.shared',
        cleanup: true,
      },
    ],
    ownFields: ['shared'],
    reads: [
      {
        type: ref('life/Session.java', 'Session'),
        fields: ['begin', 'write', 'rollback'],
        line: 37,
      },
    ],
  }),
  callable({
    file: 'life/Client.java',
    owner: 'Client',
    member: 'deferred',
    line: 45,
    params: [{ name: 'session', type: ref('life/Session.java', 'Session') }],
    returns: 'void',
    calls: [
      { target: ref('life/Session.java', 'Session.begin'), line: 47, receiver: 'session' },
      { target: ref('life/Session.java', 'Session.rollback'), line: 49, receiver: 'session' },
    ],
    paramUses: [{ param: 0, fields: ['begin', 'rollback'], forwards: [], opaque: true }],
    reads: [{ type: ref('life/Session.java', 'Session'), fields: ['begin', 'rollback'], line: 47 }],
  }),
  callable({
    file: 'life/Client.java',
    owner: 'Client',
    member: 'open',
    line: 54,
    returns: ref('life/Session.java', 'Session'),
    calls: [{ target: ref('life/Session.java', 'Session.begin'), line: 56, receiver: 'created' }],
    reads: [{ type: ref('life/Session.java', 'Session'), fields: ['begin'], line: 56 }],
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'life/Session.java',
    owner: 'Session',
    member: 'begin',
    line: 4,
    entry: true,
    returns: 'void',
  }),
  callable({
    file: 'life/Session.java',
    owner: 'Session',
    member: 'write',
    line: 6,
    entry: true,
    params: [{ name: 'row', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'life/Session.java',
    owner: 'Session',
    member: 'commit',
    line: 8,
    entry: true,
    returns: 'void',
  }),
  callable({
    file: 'life/Session.java',
    owner: 'Session',
    member: 'rollback',
    line: 10,
    entry: true,
    returns: 'void',
  }),
  callable({
    file: 'life/Session.java',
    owner: 'Session',
    member: 'close',
    line: 12,
    entry: true,
    returns: 'void',
  }),
];

describe('design facts: cleanup and release of opened resources', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('life/Client.java', 'Client'),
      ref('life/Session.java', 'Session'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('life/Client.java', 'Client.deferred'),
      ref('life/Client.java', 'Client.existing'),
      ref('life/Client.java', 'Client.field'),
      ref('life/Client.java', 'Client.guarded'),
      ref('life/Client.java', 'Client.leaked'),
      ref('life/Client.java', 'Client.open'),
      ref('life/Client.java', 'Client.resource'),
      ref('life/Session.java', 'Session.begin'),
      ref('life/Session.java', 'Session.close'),
      ref('life/Session.java', 'Session.commit'),
      ref('life/Session.java', 'Session.rollback'),
      ref('life/Session.java', 'Session.write'),
    ]);
  });

  it.each(TYPES_0)('describes the types: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)(
    'marks calls made in a finally block or a closed resource as cleanup: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );

  it.each(CALLABLES_1)('leaves out calls that do not release the receiver: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_2)('describes the session methods: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });
});
