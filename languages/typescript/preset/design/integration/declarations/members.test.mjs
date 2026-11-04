import { describe, expect, it } from 'vitest';
import { byId, factsOfFiles } from '../../test-support/project.mjs';

function idsOf(files, policy) {
  return factsOfFiles(files, policy).callables.map(({ id }) => id);
}

describe('the sites of interface and abstract members', () => {
  const files = {
    'src/shapes.ts': [
      'export interface Shape {',
      '  area(scale: number): number;',
      '  get label(): string;',
      '}',
      'export abstract class Base {',
      '  abstract run(input: string): void;',
      '  abstract get size(): number;',
      '  protected abstract hidden(): void;',
      "  check(): void { this.run('x'); }",
      '}',
      '',
    ].join('\n'),
  };

  it('lists a callable for each interface signature and abstract member', () => {
    const facts = factsOfFiles(files);

    expect(
      facts.callables.map(({ id, kind, owner, exported }) => ({ id, kind, owner, exported })),
    ).toEqual([
      {
        id: 'src/shapes.ts#Shape.area',
        kind: 'method',
        owner: 'src/shapes.ts#Shape',
        exported: true,
      },
      {
        id: 'src/shapes.ts#Shape.label',
        kind: 'accessor',
        owner: 'src/shapes.ts#Shape',
        exported: true,
      },
      { id: 'src/shapes.ts#Base.run', kind: 'method', owner: 'src/shapes.ts#Base', exported: true },
      {
        id: 'src/shapes.ts#Base.size',
        kind: 'accessor',
        owner: 'src/shapes.ts#Base',
        exported: true,
      },
      {
        id: 'src/shapes.ts#Base.hidden',
        kind: 'method',
        owner: 'src/shapes.ts#Base',
        exported: false,
      },
      {
        id: 'src/shapes.ts#Base.check',
        kind: 'method',
        owner: 'src/shapes.ts#Base',
        exported: true,
      },
    ]);
  });

  it('gives them a signature and no facts about a body', () => {
    const facts = factsOfFiles(files);

    expect(byId(facts.callables, 'src/shapes.ts#Shape.area')).toEqual({
      id: 'src/shapes.ts#Shape.area',
      file: 'src/shapes.ts',
      name: 'area',
      line: 2,
      kind: 'method',
      owner: 'src/shapes.ts#Shape',
      exported: true,
      params: [{ name: 'scale', type: 'number' }],
      returns: 'number',
    });
  });

  it('resolves a call on an abstract member of the class itself', () => {
    const facts = factsOfFiles(files);

    expect(byId(facts.callables, 'src/shapes.ts#Base.check').calls).toEqual([
      { target: 'src/shapes.ts#Base.run', line: 9, receiver: 'this' },
    ]);
  });

  it('leaves out the overloads of an abstract member', () => {
    const overloaded = {
      'src/o.ts':
        'export abstract class O {\n  abstract f(a: string): void;\n  abstract f(a: number): void;\n}\n',
    };

    expect(idsOf(overloaded)).toEqual([]);
  });
});

describe('the visibility of members', () => {
  const files = {
    'src/base.ts': [
      'export class Base {',
      '  open(): void {}',
      '  protected shared(): void {}',
      '  private own(): void {}',
      '  #secret(): void {}',
      '}',
      '',
    ].join('\n'),
  };

  it('counts only the public members of an exported class as exported', () => {
    const facts = factsOfFiles(files);

    expect(facts.callables.map(({ name, exported }) => ({ name, exported }))).toEqual([
      { name: 'open', exported: true },
      { name: 'shared', exported: false },
      { name: 'own', exported: false },
      { name: '#secret', exported: false },
    ]);
  });
});

describe('merged declarations and namespaces', () => {
  const merged = {
    'src/box.ts':
      'interface Box {\n  size: number;\n}\nexport class Box {\n  private items: string[] = [];\n  size = 0;\n  list(): string[] {\n    return this.items;\n  }\n}\n',
  };

  it('describes the class when an interface of the same name comes first', () => {
    const facts = factsOfFiles(merged);

    expect(facts.types.filter(({ kind }) => kind !== 'module')).toEqual([
      {
        id: 'src/box.ts#Box',
        file: 'src/box.ts',
        name: 'Box',
        line: 4,
        kind: 'class',
        exported: true,
        fields: [{ name: 'items', mutable: true, private: true }, { name: 'size' }],
      },
    ]);
  });

  it('lists the methods of the class it merged with an interface', () => {
    expect(idsOf(merged)).toEqual(['src/box.ts#Box.list']);
  });

  it('keeps the interface when no class joins it', () => {
    const facts = factsOfFiles({ 'src/plain.ts': 'export interface Plain {\n  id: string;\n}\n' });

    expect(facts.types.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'src/plain.ts', kind: 'module' },
      { id: 'src/plain.ts#Plain', kind: 'data' },
    ]);
  });

  const spaces = {
    'src/space.ts': [
      'export namespace Outer {',
      '  export class Cart {',
      '    total(): number { return 1; }',
      '  }',
      '  export function make(): Cart { hidden(); return new Cart(); }',
      '  function hidden(): void {}',
      '  export namespace Inner {',
      '    export function deep(): void {}',
      '  }',
      '}',
      'export namespace Dotted.Path {',
      '  export interface Node { id: string }',
      '}',
      '',
    ].join('\n'),
  };

  it('collects the types and functions inside namespaces, with the namespace path in their ids', () => {
    const facts = factsOfFiles(spaces);

    expect(facts.types.map(({ id, kind, exported }) => ({ id, kind, exported }))).toEqual([
      { id: 'src/space.ts', kind: 'module', exported: true },
      { id: 'src/space.ts#Outer.Cart', kind: 'class', exported: true },
      { id: 'src/space.ts#Dotted.Path.Node', kind: 'data', exported: true },
    ]);
    expect(facts.callables.map(({ id, owner, exported }) => ({ id, owner, exported }))).toEqual([
      { id: 'src/space.ts#Outer.Cart.total', owner: 'src/space.ts#Outer.Cart', exported: true },
      { id: 'src/space.ts#Outer.make', owner: 'src/space.ts', exported: true },
      { id: 'src/space.ts#Outer.hidden', owner: 'src/space.ts', exported: false },
      { id: 'src/space.ts#Outer.Inner.deep', owner: 'src/space.ts', exported: true },
    ]);
  });

  it('resolves the calls inside a namespace', () => {
    const facts = factsOfFiles(spaces);

    expect(byId(facts.callables, 'src/space.ts#Outer.make').calls).toEqual([
      { target: 'src/space.ts#Outer.hidden', line: 5 },
    ]);
  });

  it('publishes what an exported namespace of a published entry exports', () => {
    const facts = factsOfFiles(spaces, {
      manifest: { name: 'lib', main: 'src/space.ts' },
    });

    expect(facts.callables.map(({ id, published }) => ({ id, published }))).toEqual([
      { id: 'src/space.ts#Outer.Cart.total', published: undefined },
      { id: 'src/space.ts#Outer.make', published: true },
      { id: 'src/space.ts#Outer.hidden', published: undefined },
      { id: 'src/space.ts#Outer.Inner.deep', published: true },
    ]);
  });
});
