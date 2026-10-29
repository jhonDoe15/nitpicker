import { beforeAll, describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { byId, factsOfFixture } from '../test-support/project.mjs';

let facts;

beforeAll(() => {
  facts = factsOfFixture('callables');
});

describe('the callables of a fixture project', () => {
  it('produces facts that pass the schema', () => {
    expect(() => validateFacts(facts)).not.toThrow();
  });

  it('lists the kind, owner and visibility of every callable', () => {
    expect(
      facts.callables.map(({ id, kind, owner, exported }) => ({ id, kind, owner, exported })),
    ).toEqual([
      {
        id: 'src/base.ts#Listener.handle',
        kind: 'method',
        owner: 'src/base.ts#Listener',
        exported: true,
      },
      { id: 'src/base.ts#Base.run', kind: 'method', owner: 'src/base.ts#Base', exported: true },
      { id: 'src/base.ts#Base.stop', kind: 'method', owner: 'src/base.ts#Base', exported: true },
      { id: 'src/legacy.js#load', kind: 'function', owner: 'src/legacy.js', exported: true },
      {
        id: 'src/legacy.js#Counter.constructor',
        kind: 'constructor',
        owner: 'src/legacy.js#Counter',
        exported: true,
      },
      {
        id: 'src/legacy.js#Counter.add',
        kind: 'method',
        owner: 'src/legacy.js#Counter',
        exported: true,
      },
      {
        id: 'src/legacy.js#Counter.values2',
        kind: 'accessor',
        owner: 'src/legacy.js#Counter',
        exported: true,
      },
      { id: 'src/service.ts#logged', kind: 'function', owner: 'src/service.ts', exported: false },
      { id: 'src/service.ts#retry', kind: 'function', owner: 'src/service.ts', exported: false },
      {
        id: 'src/service.ts#Service.constructor',
        kind: 'constructor',
        owner: 'src/service.ts#Service',
        exported: true,
      },
      {
        id: 'src/service.ts#Service.run',
        kind: 'method',
        owner: 'src/service.ts#Service',
        exported: true,
      },
      {
        id: 'src/service.ts#Service.handle',
        kind: 'method',
        owner: 'src/service.ts#Service',
        exported: true,
      },
      {
        id: 'src/service.ts#Service.other',
        kind: 'method',
        owner: 'src/service.ts#Service',
        exported: true,
      },
      {
        id: 'src/service.ts#Service.decorated',
        kind: 'method',
        owner: 'src/service.ts#Service',
        exported: true,
      },
      {
        id: 'src/service.ts#Service.[Symbol.iterator]',
        kind: 'method',
        owner: 'src/service.ts#Service',
        exported: true,
      },
      {
        id: 'src/service.ts#Service.create(static)',
        kind: 'method',
        owner: 'src/service.ts#Service',
        exported: true,
      },
      { id: 'src/service.ts#open', kind: 'function', owner: 'src/service.ts', exported: true },
      { id: 'src/service.ts#pick', kind: 'function', owner: 'src/service.ts', exported: true },
      { id: 'src/service.ts#main', kind: 'function', owner: 'src/service.ts', exported: true },
      { id: 'src/service.ts#page', kind: 'function', owner: 'src/service.ts', exported: true },
      { id: 'src/service.ts#arrow', kind: 'function', owner: 'src/service.ts', exported: true },
      { id: 'src/service.ts#untyped', kind: 'function', owner: 'src/service.ts', exported: true },
      { id: 'src/service.ts#register@1', kind: 'function', owner: undefined, exported: false },
    ]);
  });

  it('marks the callables a framework or the language calls as entries', () => {
    expect(facts.callables.filter(({ entry }) => entry === true).map(({ id }) => id)).toEqual([
      'src/service.ts#Service.run',
      'src/service.ts#Service.handle',
      'src/service.ts#Service.decorated',
      'src/service.ts#Service.[Symbol.iterator]',
      'src/service.ts#main',
      'src/service.ts#register@1',
    ]);
  });

  it.each([
    [
      'src/legacy.js#load',
      [
        { name: 'config', type: 'src/base.ts#Config' },
        { name: 'suffix', type: 'string' },
      ],
    ],
    ['src/legacy.js#Counter.add', [{ name: 'value' }]],
    [
      'src/service.ts#logged',
      [
        { name: '_target', type: 'unknown' },
        { name: '_context', type: 'ClassMethodDecoratorContext' },
      ],
    ],
    ['src/service.ts#retry', [{ name: 'task', type: '()=>void' }]],
    [
      'src/service.ts#Service.constructor',
      [
        { name: 'config', type: 'src/base.ts#Config' },
        { name: 'name', type: 'string' },
      ],
    ],
    ['src/service.ts#Service.handle', [{ name: 'value', type: 'string' }]],
    [
      'src/service.ts#open',
      [
        { name: 'config', type: 'src/base.ts#Config' },
        { name: 'options', type: 'src/base.ts#Options', optional: true },
        { name: 'rest', type: 'number[]', variadic: true },
      ],
    ],
    [
      'src/service.ts#pick',
      [
        { name: 'arg0', type: 'src/base.ts#Config', pattern: true },
        { name: 'mode', type: 'src/base.ts#Mode' },
        { name: 'list', type: 'Config[]' },
        { name: 'tuple', type: 'number', optional: true },
      ],
    ],
    ['src/service.ts#arrow', [{ name: 'config', type: 'src/base.ts#Config' }]],
    [
      'src/service.ts#untyped',
      [{ name: 'first' }, { name: 'second', type: 'string', optional: true }],
    ],
    ['src/service.ts#register@1', [{ name: 'value', type: 'string' }]],
  ])('lists the parameters of %s', (id, expected) => {
    expect(byId(facts.callables, id).params).toEqual(expected);
  });

  it.each([
    ['src/base.ts#Base.run', 'void'],
    ['src/base.ts#Base.stop', 'void'],
    ['src/legacy.js#load', 'string'],
    ['src/legacy.js#Counter.constructor', undefined],
    ['src/legacy.js#Counter.add', undefined],
    ['src/legacy.js#Counter.values2', undefined],
    ['src/service.ts#logged', 'void'],
    ['src/service.ts#retry', 'void'],
    ['src/service.ts#Service.constructor', undefined],
    ['src/service.ts#Service.run', 'void'],
    ['src/service.ts#Service.handle', 'void'],
    ['src/service.ts#Service.other', 'void'],
    ['src/service.ts#Service.decorated', 'void'],
    ['src/service.ts#Service.[Symbol.iterator]', 'Iterator'],
    ['src/service.ts#Service.create(static)', 'src/service.ts#Service'],
    ['src/service.ts#open', 'src/service.ts#Service'],
    ['src/service.ts#pick', 'string'],
    ['src/service.ts#main', 'void'],
    ['src/service.ts#page', 'void'],
    ['src/service.ts#arrow', 'string'],
    ['src/service.ts#untyped', undefined],
    ['src/service.ts#register@1', undefined],
  ])('declares the return type of %s', (id, expected) => {
    expect(byId(facts.callables, id).returns).toEqual(expected);
  });

  it.each([
    ['src/legacy.js#load', [{ param: 0, fields: ['host'], forwards: [] }]],
    ['src/service.ts#Service.constructor', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    [
      'src/service.ts#open',
      [
        {
          param: 0,
          fields: [],
          forwards: [{ target: 'src/service.ts#Service.constructor', position: 0 }],
        },
        { param: 1, fields: ['retries'], forwards: [] },
      ],
    ],
    ['src/service.ts#pick', [{ param: 0, fields: ['host'], forwards: [] }]],
    ['src/service.ts#arrow', [{ param: 0, fields: ['host'], forwards: [] }]],
  ])('lists the parameter uses of %s', (id, expected) => {
    expect(byId(facts.callables, id).paramUses).toEqual(expected);
  });

  it('lists the types, with the fields a JavaScript class assigns in its constructor', () => {
    expect(facts.types.filter(({ kind }) => kind !== 'module')).toEqual([
      {
        id: 'src/base.ts#Listener',
        file: 'src/base.ts',
        name: 'Listener',
        line: 1,
        kind: 'interface',
        exported: true,
      },
      {
        id: 'src/base.ts#Base',
        file: 'src/base.ts',
        name: 'Base',
        line: 5,
        kind: 'class',
        exported: true,
      },
      {
        id: 'src/base.ts#Options',
        file: 'src/base.ts',
        name: 'Options',
        line: 11,
        kind: 'data',
        exported: true,
        fields: [{ name: 'retries' }, { name: 'label' }],
      },
      {
        id: 'src/base.ts#Config',
        file: 'src/base.ts',
        name: 'Config',
        line: 13,
        kind: 'data',
        exported: true,
        fields: [{ name: 'host' }, { name: 'port' }],
      },
      {
        id: 'src/base.ts#Mode',
        file: 'src/base.ts',
        name: 'Mode',
        line: 18,
        kind: 'enum',
        exported: true,
        cases: ['a', 'b'],
      },
      {
        id: 'src/legacy.js#Counter',
        file: 'src/legacy.js',
        name: 'Counter',
        line: 12,
        kind: 'class',
        exported: true,
        fields: [{ name: 'values', mutable: true }, { name: '_total' }],
      },
      {
        id: 'src/service.ts#Service',
        file: 'src/service.ts',
        name: 'Service',
        line: 12,
        kind: 'class',
        exported: true,
        fields: [{ name: 'config', private: true }, { name: 'name' }],
      },
    ]);
  });
});
