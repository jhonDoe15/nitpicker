import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { moduleSyntax, reexportGraph } from './reexport-graph.mjs';

function syntaxOf(text) {
  return moduleSyntax(ts.createSourceFile('entry.ts', text, ts.ScriptTarget.Latest, true));
}

function strip(items) {
  return items.map(({ exported, specifier, imported, viaImport }) =>
    viaImport ? { exported, specifier, imported, viaImport } : { exported, specifier, imported },
  );
}

describe('the re-exports of a module', () => {
  it('reads named, renamed, star and namespace re-exports', () => {
    const { edges, references } = syntaxOf(`export { a, b as c } from './one';
export * from './two';
export * as three from './three';
export type { Shape } from './four';
`);

    expect(strip(edges)).toEqual([
      { exported: 'a', specifier: './one', imported: 'a' },
      { exported: 'c', specifier: './one', imported: 'b' },
      { exported: '*', specifier: './two', imported: '*' },
      { exported: 'three', specifier: './three', imported: '*' },
      { exported: 'Shape', specifier: './four', imported: 'Shape' },
    ]);
    expect(references).toEqual([]);
  });

  it('reads an import that is only exported again, but not one the module also uses', () => {
    const { edges, references } = syntaxOf(`import lid, { a as b, used } from './one';
import * as all from './two';
export { b as renamed, used, all };
export default lid;
console.log(used);
`);

    expect(strip(edges)).toEqual([
      { exported: 'renamed', specifier: './one', imported: 'a', viaImport: true },
      { exported: 'all', specifier: './two', imported: '*', viaImport: true },
      { exported: 'default', specifier: './one', imported: 'default', viaImport: true },
    ]);
    expect(references).toEqual([{ local: 'used', specifier: './one', imported: 'used' }]);
  });

  it('reads the modules that code loads at run time as references to everything', () => {
    const { edges, references } = syntaxOf(
      "export const load = () => import('./lazy');\nconst legacy = require('./old');\n",
    );

    expect(edges).toEqual([]);
    expect(references).toEqual([
      { specifier: './lazy', imported: '*' },
      { specifier: './old', imported: '*' },
    ]);
  });
});

describe('the public surface of entries', () => {
  const edge = (from, exported, source, imported, extra = {}) => ({
    ...{ from, exported, source, imported },
    ...extra,
  });
  const graphOf = (edges, entries) => {
    const modules = new Map(entries.map((file) => [file, { edges: [], references: [] }]));
    for (const { from, ...rest } of edges) {
      const module = modules.get(from) ?? { edges: [], references: [] };
      modules.set(from, { ...module, edges: [...module.edges, rest] });
    }
    return reexportGraph(modules, entries);
  };

  it('follows named, renamed and star re-exports through barrels', () => {
    const graph = graphOf(
      [
        edge('/index.ts', 'shown', '/barrel.ts', 'inner'),
        edge('/index.ts', '*', '/stars.ts', '*'),
        edge('/barrel.ts', 'inner', '/deep.ts', 'original'),
        edge('/barrel.ts', 'hidden', '/deep.ts', 'secret'),
        edge('/stars.ts', 'named', '/leaf.ts', 'named'),
      ],
      ['/index.ts'],
    );

    expect(graph.isPublic('/deep.ts', 'original')).toBe(true);
    expect(graph.isPublic('/deep.ts', 'secret')).toBe(false);
    expect(graph.isPublic('/leaf.ts', 'named')).toBe(true);
    expect(graph.isPublic('/leaf.ts', 'default')).toBe(false);
  });

  it('does not let a star re-export carry the default export', () => {
    const graph = graphOf([edge('/index.ts', '*', '/leaf.ts', '*')], ['/index.ts']);

    expect(graph.isPublic('/leaf.ts', 'value')).toBe(true);
    expect(graph.isPublic('/leaf.ts', 'default')).toBe(false);
  });
});
