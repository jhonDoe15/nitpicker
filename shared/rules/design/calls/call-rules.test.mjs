import { describe, expect, it } from 'vitest';
import { designFacts, designRun, fn, owner, summaries } from '../test-support/design-facts.mjs';

const api = owner('src/api/orders.ts');
const service = owner('src/orders/service.ts');
const store = owner('src/orders/store.ts');
const params = [
  { name: 'id', type: 'string' },
  { name: 'limit', type: 'number' },
];

function forwarder(module, name, target, extra = {}) {
  return fn(module, name, {
    params,
    returns: 'Order',
    forward: { target, arguments: [0, 1], returned: true },
    ...extra,
  });
}

function chain(extra = {}) {
  const load = fn(store, 'load', { params, returns: 'Order' });
  const find = forwarder(service, 'find', load.id, extra.find);
  const get = forwarder(api, 'get', find.id, extra.get);
  return designFacts({ types: [api, service, store], callables: [get, find, load] });
}

describe('forwarding-chain', () => {
  it('reports the head of two forwarding hops into other modules', () => {
    const findings = designRun(chain(), 'forwarding-chain');
    expect(summaries(findings)).toEqual([
      {
        rule: 'forwarding-chain',
        path: 'src/api/orders.ts',
        identity: 'src/api/orders.ts#get>src/orders/service.ts#find>src/orders/store.ts#load',
        classification: 'descriptive',
        line: 2,
      },
    ]);
    expect(findings[0].message).toBe(
      'get (src/api/orders.ts) -> find (src/orders/service.ts) -> load (src/orders/store.ts) pass the same parameters in order and return the result unchanged, across 3 modules. Call load directly where get is used, or let a hop own something (a type change, a policy, a dependency) so it hides more than it forwards. If this is intended, add {"rule":"forwarding-chain","paths":["src/api/orders.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    ['an entry hop', { get: { entry: true } }],
    [
      'reordered arguments',
      {
        find: {
          forward: { target: 'src/orders/store.ts#load', arguments: [1, 0], returned: true },
        },
      },
    ],
    ['a changed return type', { find: { returns: 'OrderView' } }],
    ['an untyped parameter', { get: { params: [{ name: 'id' }, params[1]] } }],
    [
      'an any parameter',
      {
        get: { params: [{ name: 'id', type: 'any' }, params[1]] },
        find: { params: [{ name: 'id', type: 'any' }, params[1]] },
      },
    ],
  ])('passes a single hop when the other is %s', (_, extra) => {
    expect(designRun(chain(extra), 'forwarding-chain')).toEqual([]);
  });

  it.each([['a published head', { get: { published: true } }]])('passes %s', (_, extra) => {
    expect(designRun(chain(extra), 'forwarding-chain')).toEqual([]);
  });

  it('passes a head whose module is on the public surface of a published package', () => {
    const facts = chain();
    const types = facts.types.map((type) =>
      type.id === api.id ? { ...type, published: true } : type,
    );
    expect(designRun({ ...facts, types }, 'forwarding-chain')).toEqual([]);
  });

  it('passes a hop into a member that other modules cannot call', () => {
    const facts = chain();
    const load = { ...facts.callables[2], exported: false };
    expect(
      designRun(
        { ...facts, callables: [...facts.callables.slice(0, 2), load] },
        'forwarding-chain',
      ),
    ).toEqual([]);
  });
});

const session = owner('src/db/session.ts', 'Session');
const steps = ['begin', 'write', 'commit', 'rollback'].map((name) => fn(session, name));
const [begin, write, commit, rollback] = steps;

function caller(file, name, calls) {
  return fn(owner(file), name, {
    calls: calls.map((call, line) => ({ receiver: 's', line: line + 3, ...call })),
  });
}

function sessionUsers(callers) {
  return designFacts({
    types: [session, ...callers.map(({ file }) => owner(file))],
    callables: [...steps, ...callers],
  });
}

const sequence = [{ target: begin.id }, { target: write.id }, { target: commit.id }];

describe('caller-protocol', () => {
  it('reports steps that three callers in two modules repeat on one class', () => {
    const facts = sessionUsers([
      caller('src/a/save.ts', 'save', sequence),
      caller('src/a/update.ts', 'update', [...sequence, { target: write.id }]),
      caller('src/b/import.ts', 'load', [
        { target: begin.id },
        { target: write.id },
        { target: rollback.id },
        { target: commit.id },
      ]),
    ]);
    const findings = designRun(facts, 'caller-protocol');
    expect(summaries(findings)).toEqual([
      {
        rule: 'caller-protocol',
        path: 'src/db/session.ts',
        identity: 'src/db/session.ts#Session|begin>write>commit',
        classification: 'descriptive',
        line: 1,
      },
    ]);
  });

  it('reports the longest repeated steps once and keeps a sequence in another order', () => {
    const long = [begin, write, rollback, commit].map(({ id }) => ({ target: id }));
    const reversed = [commit, write, begin].map(({ id }) => ({ target: id }));
    const facts = sessionUsers([
      caller('src/a/one.ts', 'one', long),
      caller('src/a/two.ts', 'two', long),
      caller('src/b/three.ts', 'three', long),
      caller('src/c/four.ts', 'four', reversed),
      caller('src/c/five.ts', 'five', reversed),
      caller('src/d/six.ts', 'six', reversed),
    ]);
    const identities = designRun(facts, 'caller-protocol').map(({ identity }) => identity);
    expect(identities.toSorted()).toEqual([
      'src/db/session.ts#Session|begin>write>rollback>commit',
      'src/db/session.ts#Session|commit>write>begin',
    ]);
  });

  it('keeps shorter steps that more callers repeat than the longer ones', () => {
    const long = [begin, write, rollback, commit].map(({ id }) => ({ target: id }));
    const facts = sessionUsers([
      caller('src/a/one.ts', 'one', long),
      caller('src/a/two.ts', 'two', long),
      caller('src/b/three.ts', 'three', long),
      caller('src/c/four.ts', 'four', sequence),
    ]);
    const identities = designRun(facts, 'caller-protocol').map(({ identity }) => identity);
    expect(identities.toSorted()).toEqual([
      'src/db/session.ts#Session|begin>write>commit',
      'src/db/session.ts#Session|begin>write>rollback>commit',
    ]);
  });

  it('passes steps on a class on the public surface of a published package', () => {
    const facts = sessionUsers([
      caller('src/a/save.ts', 'save', sequence),
      caller('src/a/update.ts', 'update', sequence),
      caller('src/b/import.ts', 'load', sequence),
    ]);
    const types = facts.types.map((type) =>
      type.id === session.id ? { ...type, published: true } : type,
    );
    expect(designRun({ ...facts, types }, 'caller-protocol')).toEqual([]);
  });

  it('passes steps two callers share, and a builder that returns itself', () => {
    const builder = owner('src/db/query.ts', 'Query');
    const chained = ['select', 'where', 'limit'].map((name) =>
      fn(builder, name, { returns: builder.id }),
    );
    const calls = chained.map(({ id }) => ({ target: id }));
    const facts = designFacts({
      types: [session, builder, owner('src/a/save.ts'), owner('src/b/x.ts'), owner('src/c/y.ts')],
      callables: [
        ...steps,
        ...chained,
        caller('src/a/save.ts', 'save', [...sequence, ...calls]),
        caller('src/b/x.ts', 'x', [...sequence, ...calls]),
        caller('src/c/y.ts', 'y', calls),
      ],
    });
    expect(designRun(facts, 'caller-protocol')).toEqual([]);
  });

  const contract = {
    type: 'Session',
    open: ['begin'],
    close: ['commit', 'rollback'],
    steps: ['write'],
  };

  it.each([
    ['no close on every exit', sequence, ['src/a/save.ts#save|s|unclosed:begin']],
    [
      'a step before open',
      [{ target: write.id }, { target: begin.id }, { target: commit.id, cleanup: true }],
      ['src/a/save.ts#save|s|early:write'],
    ],
    ['no open call', [{ target: write.id }, { target: commit.id, cleanup: true }], []],
    ['a receiver kept in a field', [{ target: begin.id, receiver: 'this.session' }], []],
    [
      'a close in finally',
      [{ target: begin.id }, { target: write.id }, { target: rollback.id, cleanup: true }],
      [],
    ],
  ])('checks the protocols contract: %s', (_, calls, identities) => {
    const facts = sessionUsers([caller('src/a/save.ts', 'save', calls)]);
    const findings = designRun(facts, 'protocol-contract', { protocols: [contract] });
    expect(findings.map(({ identity, classification }) => [identity, classification])).toEqual(
      identities.map((identity) => [identity, 'enforceable']),
    );
    expect(designRun(facts, 'caller-protocol', { protocols: [contract] })).toEqual([]);
  });

  it('passes a function that opens the resource and returns it', () => {
    const opener = fn(owner('src/a/open.ts'), 'opened', {
      returns: session.id,
      calls: [{ target: begin.id, receiver: 's', line: 3 }],
    });
    const facts = sessionUsers([opener]);
    expect(designRun(facts, 'protocol-contract', { protocols: [contract] })).toEqual([]);
  });
});

describe('protocol-contract across a class hierarchy', () => {
  const resource = owner('src/io/resource.ts', 'Resource');
  const file = owner('src/io/file.ts', 'FileRes', { supertypes: [resource.id] });
  const conn = owner('src/db/conn.ts', 'Conn', { kind: 'interface' });
  const pg = owner('src/db/pg.ts', 'Pg', { supertypes: [conn.id] });
  const user = owner('src/a/use.ts');
  const open = fn(resource, 'open');
  const close = fn(resource, 'close');
  const fileClose = fn(file, 'close');
  const pgOpen = fn(pg, 'open');
  const protocols = [
    { type: 'Resource', open: ['open'], close: ['close'] },
    { type: 'Conn', open: ['open'], close: ['close'] },
  ];

  function run(calls) {
    const use = fn(user, 'use', {
      calls: calls.map((call, index) => ({ receiver: 'f', line: 3 + index, ...call })),
    });
    const facts = designFacts({
      types: [resource, file, conn, pg, user],
      callables: [open, close, fileClose, pgOpen, use],
    });
    return designRun(facts, 'protocol-contract', { protocols }).map(({ identity }) => identity);
  }

  it.each([
    [
      'an override that closes in finally',
      [{ target: open.id }, { target: fileClose.id, cleanup: true }],
      [],
    ],
    ['an override that never closes', [{ target: open.id }], ['src/a/use.ts#use|f|unclosed:open']],
    [
      'a subclass of a contract interface',
      [{ target: pgOpen.id }],
      ['src/a/use.ts#use|f|unclosed:open'],
    ],
  ])('matches the contract of a supertype: %s', (_, calls, identities) => {
    expect(run(calls)).toEqual(identities);
  });
});
