import { describe, expect, it } from 'vitest';
import { pythonUsable } from '../../metrics/python-helpers.mjs';
import { designFacts, factsById } from './test-support/design-harness.mjs';

function callable(file, qualified, line, extra = {}) {
  const owner = qualified.includes('.')
    ? `${file}#${qualified.split('.').slice(0, -1).join('.')}`
    : file;
  return {
    id: `${file}#${qualified}`,
    file,
    name: qualified.split('.').at(-1),
    line,
    kind: 'method',
    exported: true,
    owner,
    params: [],
    calls: [],
    ...extra,
  };
}

function fn(file, name, line, extra = {}) {
  return callable(file, name, line, { kind: 'function', ...extra });
}

const MODELS = 'shop/models.py';
const GATEWAY = 'gateway.py';
const MEMBERS = 'app/members.py';

describe.skipIf(!pythonUsable())('the Python design producer callable facts', () => {
  describe('kinds, ownership and fields', () => {
    const facts = designFacts('kinds');
    const byId = factsById(facts);

    it.each([
      [
        'a constructor lists the fields it assigns and the calls it makes',
        callable(MODELS, 'Cart.__init__', 74, {
          kind: 'constructor',
          params: [{ name: 'owner' }],
          calls: [{ target: `${MODELS}#Cart.reset`, line: 81, receiver: 'self' }],
          ownFields: ['_items', 'owner', 'index', 'names', 'status', 'copy'],
        }),
      ],
      [
        'a property is an accessor that names the field it returns',
        callable(MODELS, 'Plain.title', 63, {
          kind: 'accessor',
          ownFields: ['name'],
          returnsField: 'name',
        }),
      ],
      [
        'a dunder method is an entry because callers never name it',
        callable(MODELS, 'Plain.__repr__', 66, {
          entry: true,
          ownFields: ['name'],
          returnsField: 'name',
        }),
      ],
      [
        'a framework validator is an entry',
        callable(MODELS, 'Customer.clean', 53, { entry: true, params: [{ name: 'value' }] }),
      ],
      [
        'a method of an interface has no fields',
        callable(MODELS, 'Repo.save', 93, { params: [{ name: 'item' }] }),
      ],
      [
        'a method of an underscore class is not exported',
        callable(MODELS, '_Hidden.run', 112, { exported: false }),
      ],
      [
        'a method of a nested class is owned by the nested class, unexported outside __all__',
        callable(MODELS, 'Outer.Inner.run', 104, { exported: false }),
      ],
    ])('%s', (_label, expected) => {
      expect(byId.callable(expected.id)).toEqual(expected);
    });

    it('keeps enum methods owned by the enum without field facts', () => {
      expect(byId.callable(`${MODELS}#Status.label`)).toEqual(callable(MODELS, 'Status.label', 22));
    });
  });

  describe('annotated parameters and return types', () => {
    const byId = factsById(designFacts('resolution'));
    const ANNOTATED = 'app/annotated.py';
    const CART = 'app/core/cart.py#Cart';

    it('normalises each annotation to a project type id or a compact text', () => {
      expect(byId.callable(`${ANNOTATED}#annotated`)).toEqual(
        fn(ANNOTATED, 'annotated', 9, {
          params: [
            { name: 'first', type: 'list[int]' },
            { name: 'second', type: 'dict' },
            { name: 'third', type: 'str|None' },
            { name: 'fourth', type: 'typing.Callable[[int],str]' },
            { name: 'fifth', type: 'numpy.ndarray' },
            { name: 'sixth', type: 'int|str' },
            { name: 'seventh', type: 'list' },
            { name: 'eighth' },
            { name: 'ninth', type: 'int', optional: true },
            { name: 'rest', type: 'str', variadic: true },
            { name: 'flag', type: 'bool', optional: true },
            { name: 'options', type: 'int', variadic: true },
          ],
          returns: CART,
        }),
      );
    });

    it('resolves a quoted annotation and records that the parameter is only passed on', () => {
      expect(byId.callable(`${ANNOTATED}#only_cart`)).toEqual(
        fn(ANNOTATED, 'only_cart', 26, {
          params: [{ name: 'cart', type: CART }],
          returns: CART,
          paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
        }),
      );
    });

    it('keeps a union of project types as text instead of choosing a member', () => {
      expect(byId.callable(`${ANNOTATED}#either`)).toEqual(
        fn(ANNOTATED, 'either', 30, {
          params: [{ name: 'item', type: 'Cart|Repo' }],
          returns: 'Cart|Repo',
        }),
      );
    });

    it('names the id of the first definition and numbers later redefinitions by ordinal', () => {
      expect(byId.callable('app/helpers.py#twice').line).toBe(5);
      expect(byId.callable('app/helpers.py#twice@2').line).toBe(9);
    });
  });

  describe('member ids, return types and abstract targets', () => {
    const byId = factsById(designFacts('resolution'));
    const SINK = `${MEMBERS}#Sink`;
    const GAUGE = `${MEMBERS}#Gauge`;

    it.each([
      [
        'an overloaded method keeps the plain id for its implementation',
        callable(MEMBERS, 'Gauge.read', 27, { params: [{ name: 'unit' }] }),
      ],
      [
        'a property setter has its own id without a position, and calls a Protocol method',
        callable(MEMBERS, 'Gauge.level', 35, {
          id: `${GAUGE}.level(setter)`,
          params: [{ name: 'value', type: 'int' }],
          returns: 'None',
          forward: { target: `${SINK}.write`, arguments: [0], returned: false },
          calls: [{ target: `${SINK}.write`, line: 36, receiver: 'self.sink' }],
          ownFields: ['sink'],
        }),
      ],
      [
        'a property deleter has its own id without a position',
        callable(MEMBERS, 'Gauge.level', 39, { id: `${GAUGE}.level(deleter)`, returns: 'None' }),
      ],
      [
        'a property getter calls an abstract method through a field typed as the ABC',
        callable(MEMBERS, 'Gauge.level', 31, {
          kind: 'accessor',
          returns: 'int',
          calls: [{ target: `${MEMBERS}#Engine.run`, line: 32, receiver: 'self.engine' }],
          ownFields: ['engine'],
        }),
      ],
      [
        'a Protocol method is a callable site without body facts',
        callable(MEMBERS, 'Sink.write', 6, {
          params: [{ name: 'value', type: 'int' }],
          returns: 'None',
        }),
      ],
      [
        'an underscore method is not exported',
        callable(MEMBERS, 'Gauge._reset', 42, { exported: false, returns: 'None' }),
      ],
      [
        'a quoted optional return of a project type is its type id',
        fn(MEMBERS, 'find_gauge', 50, { params: [{ name: 'name', type: 'str' }], returns: GAUGE }),
      ],
    ])('%s', (_label, expected) => {
      expect(byId.callable(expected.id)).toEqual(expected);
    });

    it('returns the project type id of an annotated return, normalised like a parameter', () => {
      expect(byId.callable(`${MEMBERS}#make_gauge`).returns).toBe(GAUGE);
    });

    it('marks an underscore field private', () => {
      expect(byId.type(GAUGE).fields).toEqual([
        { name: 'sink' },
        { name: 'engine' },
        { name: '_history', mutable: true, private: true },
      ]);
    });
  });

  describe('forwarding', () => {
    const byId = factsById(designFacts('forwarding'));
    const backendSend = `${GATEWAY}#Backend.send`;

    function gateway(name, line, extra) {
      return callable(GATEWAY, `Gateway.${name}`, line, extra);
    }

    function viaBackend(line, target = backendSend) {
      return { target, line, receiver: 'self.backend' };
    }

    const twoParams = [{ name: 'to' }, { name: 'body' }];

    it.each([
      ['passes every argument on after a docstring', 'send', 20, [0, 1], true, 22],
      ['passes the arguments in another order', 'send_reordered', 24, [1, 0], true, 25],
      ['passes a literal as an unmapped slot', 'send_literal', 27, [0, -1], true, 28],
      ['passes keyword arguments by the callee position', 'send_keywords', 30, [0, 1], true, 31],
      ['returns the awaited result', 'send_async', 61, [0, 1], true, 62],
    ])('a method that %s is a forward', (_label, name, line, args, returned, callLine) => {
      const params = name === 'send_literal' ? [{ name: 'to' }] : twoParams;
      expect(byId.callable(`${GATEWAY}#Gateway.${name}`)).toEqual(
        gateway(name, line, {
          params,
          forward: { target: backendSend, arguments: args, returned },
          calls: [viaBackend(callLine)],
          ownFields: ['backend'],
        }),
      );
    });

    it('treats a call that discards a result the callee does not return as a returned=false forward', () => {
      expect(byId.callable(`${GATEWAY}#Gateway.push`)).toEqual(
        gateway('push', 43, {
          params: [{ name: 'item' }],
          forward: { target: `${GATEWAY}#Backend.push`, arguments: [0], returned: false },
          calls: [viaBackend(44, `${GATEWAY}#Backend.push`)],
          ownFields: ['backend'],
        }),
      );
    });

    it('forwards self as a negative slot and a function target as a plain call', () => {
      expect(byId.callable(`${GATEWAY}#Gateway.forwards_self`).forward).toEqual({
        target: `${GATEWAY}#util`,
        arguments: [-1, 0],
        returned: true,
      });
      expect(byId.callable(`${GATEWAY}#Gateway.helper`)).toEqual(
        gateway('helper', 49, {
          params: [{ name: 'first' }, { name: 'second', optional: true }],
          forward: { target: `${GATEWAY}#util`, arguments: [0, 1], returned: true },
          calls: [{ target: `${GATEWAY}#util`, line: 50 }],
        }),
      );
    });

    it.each([
      'send_extra_logic',
      'send_changed_result',
      'send_discarded',
      'ping',
      'make',
      'unresolved',
      'variadic',
      'reassigned',
    ])('does not report %s as a forward', (name) => {
      expect(byId.callable(`${GATEWAY}#Gateway.${name}`).forward).toBeUndefined();
    });
  });
});

describe.skipIf(!pythonUsable())('the Python design producer value references', () => {
  const facts = designFacts('references');
  const byId = factsById(facts);
  const REGISTRY = 'registry.py';

  function ids(...names) {
    return names.map((name) => `${REGISTRY}#${name}`);
  }

  it.each([
    ['reads a module-level dispatch table', `${REGISTRY}#dispatch`, ids('on_a', 'on_b')],
    ['reads a dispatch table it imports', 'client.py#run', ids('on_a', 'on_b')],
    ['returns functions', `${REGISTRY}#pick`, ids('on_a', 'on_b')],
    ['passes a callback', `${REGISTRY}#wire`, ids('fallback')],
    ['stores a function', `${REGISTRY}#store`, ids('on_a')],
    ['passes a bound method', `${REGISTRY}#Router.bind`, ids('Router.handle')],
    ['lists a function, also inside a lambda', 'client.py#callbacks', ids('on_b')],
  ])('lists what a callable that %s uses as values', (_label, id, references) => {
    expect(byId.callable(id).references).toEqual(references);
  });

  it.each([
    ['only calls a function', `${REGISTRY}#calls_only`],
    ['refers to itself', `${REGISTRY}#Router.again`],
  ])('lists no reference for a callable that %s', (_label, id) => {
    expect(byId.callable(id).references).toBeUndefined();
  });

  it('lists what module-level code calls or uses, decorators and class tables included', () => {
    expect(byId.type(REGISTRY).references).toEqual(
      ids('on_a', 'on_b', 'register', 'make', 'fallback'),
    );
    expect(byId.type('client.py').references).toBeUndefined();
  });
});
