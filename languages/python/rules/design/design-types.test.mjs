import { describe, expect, it } from 'vitest';
import { pythonUsable } from '../../metrics/python-helpers.mjs';
import { designFacts, factsById } from './test-support/design-harness.mjs';

const MODELS = 'shop/models.py';

function typeIn(facts, id) {
  return factsById(facts).type(id);
}

function type(kind, name, line, extra = {}) {
  return { id: `${MODELS}#${name}`, file: MODELS, name, line, kind, exported: true, ...extra };
}

describe.skipIf(!pythonUsable())('the Python design producer type facts', () => {
  const facts = designFacts('kinds');

  it('lists one module type per file and a type per class, nested class and Literal alias', () => {
    expect(facts.types.map((entry) => entry.id)).toEqual([
      'shop/__init__.py',
      MODELS,
      `${MODELS}#Mode`,
      `${MODELS}#Status`,
      `${MODELS}#Level`,
      `${MODELS}#Item`,
      `${MODELS}#Point`,
      `${MODELS}#Payload`,
      `${MODELS}#Customer`,
      `${MODELS}#Plain`,
      `${MODELS}#Cart`,
      `${MODELS}#Repo`,
      `${MODELS}#Store`,
      `${MODELS}#Outer`,
      `${MODELS}#Outer.Inner`,
      `${MODELS}#_Hidden`,
    ]);
  });

  it('gives a module its top-level state as fields, private unless __all__ exports it', () => {
    expect(typeIn(facts, MODELS)).toEqual({
      id: MODELS,
      file: MODELS,
      name: 'models',
      line: 1,
      kind: 'module',
      exported: true,
      fields: [
        { name: 'REGISTRY', mutable: true },
        { name: '_CACHE', mutable: true, private: true },
        { name: 'LIMIT', private: true },
        { name: 'LABELS', private: true },
        { name: 'PLAIN', mutable: true, private: true },
      ],
    });
    expect(typeIn(facts, 'shop/__init__.py').fields).toEqual([]);
  });

  it.each([
    ['Enum subclass', 'Status', 18, ['OPEN', 'PAID']],
    ['IntEnum subclass', 'Level', 26, ['LOW', 'HIGH']],
    ['Literal alias', 'Mode', 10, ['fast', 'slow']],
  ])('reads a %s as an enum with its cases', (_label, name, line, cases) => {
    expect(typeIn(facts, `${MODELS}#${name}`)).toEqual(type('enum', name, line, { cases }));
  });

  it.each([
    [
      'dataclass, ClassVar fields included,',
      'Item',
      32,
      [{ name: 'name' }, { name: 'tags', mutable: true }, { name: 'qty' }, { name: 'kind' }],
    ],
    ['NamedTuple', 'Point', 39, [{ name: 'x' }, { name: 'y' }]],
    ['TypedDict', 'Payload', 44, [{ name: 'body' }]],
    ['pydantic model', 'Customer', 48, [{ name: 'name' }, { name: 'history', mutable: true }]],
    [
      'class with only attributes and dunder methods',
      'Plain',
      57,
      [{ name: 'name' }, { name: '_secret', mutable: true, private: true }],
    ],
  ])('reads a %s as data with its declared fields', (_label, name, line, fields) => {
    expect(typeIn(facts, `${MODELS}#${name}`)).toEqual(type('data', name, line, { fields }));
  });

  it('reads a behavioural class with class-level and self attributes, mutable by assigned value', () => {
    expect(typeIn(facts, `${MODELS}#Cart`)).toEqual(
      type('class', 'Cart', 70, {
        fields: [
          { name: 'registry', mutable: true },
          { name: 'limit' },
          { name: '_items', mutable: true, private: true },
          { name: 'owner' },
          { name: 'index' },
          { name: 'names', mutable: true },
          { name: 'status' },
          { name: 'copy', mutable: true },
        ],
      }),
    );
  });

  it.each([
    ['Protocol', 'Repo', 92],
    ['abstract base class', 'Store', 96],
  ])('reads a %s as an interface', (_label, name, line) => {
    expect(typeIn(facts, `${MODELS}#${name}`)).toEqual(
      type('interface', name, line, { fields: [] }),
    );
  });

  it('keeps nested classes as their own types and marks names outside __all__ or with an underscore unexported', () => {
    expect(typeIn(facts, `${MODELS}#Outer.Inner`)).toEqual(
      type('class', 'Inner', 103, { id: `${MODELS}#Outer.Inner`, exported: false, fields: [] }),
    );
    expect(typeIn(facts, `${MODELS}#_Hidden`)).toEqual(
      type('class', '_Hidden', 111, { exported: false, fields: [] }),
    );
  });
});

describe.skipIf(!pythonUsable())('the Python design producer published surface', () => {
  const facts = designFacts('published');

  function publishedIds(list) {
    return list.filter((entry) => entry.published === true).map((entry) => entry.id);
  }

  it('marks the public module-level names of a published distribution, limited by __all__', () => {
    expect(publishedIds(facts.types)).toEqual(['src/lib/api.py#Mode', 'src/lib/api.py#Client']);
    expect(publishedIds(facts.callables)).toEqual(['src/lib/api.py#connect']);
  });

  it.each([
    ['a name __all__ leaves out', 'src/lib/__init__.py#helper'],
    ['an underscore name', 'src/lib/api.py#_secret'],
    ['a name in an underscore module', 'src/lib/_impl.py#run'],
    ['a script outside the packages', 'scripts/build.py#main'],
    ['a package of a nested distribution without a build backend', 'plugins/plug/__init__.py#hook'],
    ['a method, which counts through its published owner', 'src/lib/api.py#Client.send'],
  ])('does not mark %s', (_label, id) => {
    expect(factsById(facts).callable(id).published).toBeUndefined();
  });
});

describe.skipIf(!pythonUsable())('the Python design producer export lists and layouts', () => {
  const facts = designFacts('surface');

  function flags(list) {
    return list
      .filter((entry) => entry.kind !== 'module' && entry.kind !== 'method')
      .map(({ id, exported, published }) => [id, exported, published === true]);
  }

  it('reads __all__ appends and extends, gives up on a computed or conditional __all__, and follows re-exports', () => {
    expect(flags(facts.types)).toEqual([
      ['pkg/_impl.py#Engine', true, true],
      ['pkg/_impl.py#Internal', true, false],
      ['pkg/conditional.py#Three', true, true],
      ['pkg/dynamic.py#Extra', true, true],
      ['pkg/listed.py#Shown', true, true],
      ['pkg/listed.py#Added', true, true],
      ['pkg/listed.py#More', true, true],
      ['pkg/listed.py#Hidden', false, false],
      ['six.py#Six', true, true],
    ]);
  });

  it('publishes a single-file distribution and a module of a namespace package', () => {
    expect(flags(facts.callables)).toEqual([
      ['ns/loose.py#stray', true, false],
      ['ns/sub/tool.py#run', true, true],
      ['six.py#_private', false, false],
    ]);
  });

  it.each([
    ['pkg/listed.py', [{ name: 'STATE', mutable: true, private: true }]],
    ['pkg/dynamic.py', [{ name: 'CACHE', mutable: true }]],
  ])(
    'marks the module state of %s private only when a known __all__ leaves it out',
    (id, fields) => {
      expect(facts.types.find((entry) => entry.id === id).fields).toEqual(fields);
    },
  );
});

describe.skipIf(!pythonUsable())('the Python design producer supertypes', () => {
  const facts = designFacts('hierarchy');

  it('lists the project bases of each class, Protocol and ABC bases included, without library bases', () => {
    expect(
      facts.types
        .filter((entry) => entry.supertypes !== undefined)
        .map(({ id, supertypes }) => [id, supertypes]),
    ).toEqual([
      ['store/impl.py#File', ['store/base.py#Closer', 'store/base.py#Store']],
      ['store/impl.py#Logged', ['store/impl.py#File']],
      ['store/impl.py#Boxes', ['store/base.py#Box', 'store/base.py#Store']],
      ['store/impl.py#Outer.Inner', ['store/impl.py#File']],
    ]);
  });
});
