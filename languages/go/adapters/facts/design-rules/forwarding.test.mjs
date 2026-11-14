import { describe, expect, it } from 'vitest';
import { designRows, fn, owner } from './support.mjs';

const api = owner('api/orders.go');
const service = owner('service/orders.go');
const store = owner('store/orders.go');
const params = [
  { name: 'id', type: 'string' },
  { name: 'limit', type: 'int' },
];

function forwarder(module, name, target, extra = {}) {
  return fn(module, name, {
    params,
    returns: 'store/orders.go#Order',
    forward: { target, arguments: [0, 1], returned: true },
    ...extra,
  });
}

function chain(extra = {}) {
  const load = fn(store, 'Load', { params, returns: 'store/orders.go#Order' });
  const find = forwarder(service, 'Find', load.id, extra.find);
  const get = forwarder(api, 'Get', find.id, extra.get);
  return { types: [api, service, store], callables: [get, find, load] };
}

describe('forwarding-chain on Go facts', () => {
  it('reports the head of two forwarding hops into other files', () => {
    expect(designRows(chain(), 'forwarding-chain', { module: 'shop' })).toEqual([
      {
        path: 'api/orders.go',
        identity: 'api/orders.go#Get>service/orders.go#Find>store/orders.go#Load',
        classification: 'descriptive',
        line: 2,
      },
    ]);
  });

  it.each([
    [
      'a hop that reorders its arguments',
      { find: { forward: { target: 'store/orders.go#Load', arguments: [1, 0], returned: true } } },
    ],
    ['a hop that changes the result type', { find: { returns: 'int' } }],
    ['an entry hop', { get: { entry: true } }],
    ['a variadic parameter', { get: { params: [params[0], { ...params[1], variadic: true }] } }],
  ])('passes %s', (_, extra) => {
    expect(designRows(chain(extra), 'forwarding-chain', { module: 'shop' })).toEqual([]);
  });

  it('passes a chain in a package other modules can import', () => {
    expect(designRows(chain(), 'forwarding-chain')).toEqual([]);
  });
});
