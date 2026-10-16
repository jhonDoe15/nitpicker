import { describe, expect, it } from 'vitest';
import {
  EVERYTHING,
  NAMED_EXPORTS,
  isCovered,
  moduleLinks,
  reexportGraph,
} from './reexport-graph.mjs';

function named(exported, source, imported = exported, extra = {}) {
  return { exported, imported, source, ...extra };
}

function graphOf(modules) {
  return reexportGraph((file) => ({ edges: modules[file] ?? [], references: [] }));
}

function surface(modules, entries) {
  const used = graphOf(modules).surfaceOf(entries);
  return (file, name) => isCovered(used, { file, name });
}

describe('the public surface of entries', () => {
  it('follows named, renamed and star re-exports through barrels', () => {
    const isPublic = surface(
      {
        '/index.ts': [named('shown', '/barrel.ts', 'inner'), { star: true, source: '/stars.ts' }],
        '/barrel.ts': [
          named('inner', '/deep.ts', 'original'),
          named('hidden', '/deep.ts', 'secret'),
        ],
        '/stars.ts': [named('leaf', '/leaf.ts')],
      },
      ['/index.ts'],
    );

    expect(isPublic('/deep.ts', 'original')).toBe(true);
    expect(isPublic('/deep.ts', 'secret')).toBe(false);
    expect(isPublic('/leaf.ts', 'leaf')).toBe(true);
  });

  it('does not let a star re-export carry the default export', () => {
    const isPublic = surface({ '/index.ts': [{ star: true, source: '/leaf.ts' }] }, ['/index.ts']);

    expect(isPublic('/leaf.ts', 'value')).toBe(true);
    expect(isPublic('/leaf.ts', 'default')).toBe(false);
  });

  it('takes everything a namespace re-export names', () => {
    const isPublic = surface({ '/index.ts': [named('all', '/leaf.ts', EVERYTHING)] }, [
      '/index.ts',
    ]);

    expect(isPublic('/leaf.ts', 'default')).toBe(true);
  });
});

describe('the declarations behind a re-export', () => {
  it('names no host export for an export * as, which knip never lists', () => {
    const graph = graphOf({
      '/entry.ts': [named('shelf', '/shelf.ts', EVERYTHING, { namespace: true })],
    });

    expect(graph.chainsOf('/entry.ts')).toEqual([
      {
        hostFile: '/entry.ts',
        hostName: undefined,
        node: { file: '/shelf.ts', name: EVERYTHING, viaImport: false },
      },
    ]);
  });

  it('follows barrels, renames and imports that are only exported again to the declaration', () => {
    const graph = graphOf({
      '/entry.ts': [named('final', '/one.ts', 'step')],
      '/one.ts': [named('step', '/two.ts', 'inner', { viaImport: true })],
      '/two.ts': [named('inner', '/impl.ts', 'original')],
    });

    expect(graph.chainsOf('/entry.ts')).toEqual([
      {
        hostFile: '/entry.ts',
        hostName: 'final',
        node: { file: '/impl.ts', name: 'original', viaImport: true },
      },
    ]);
  });

  it('stops on a cycle', () => {
    const graph = graphOf({
      '/a.ts': [named('x', '/b.ts')],
      '/b.ts': [named('x', '/a.ts')],
    });

    expect(graph.chainsOf('/a.ts')).toEqual([]);
  });

  it('keeps a star re-export as the names of its source', () => {
    const graph = graphOf({ '/entry.ts': [{ star: true, source: '/feature.ts' }] });

    expect(graph.chainsOf('/entry.ts')).toEqual([
      {
        hostFile: '/entry.ts',
        hostName: undefined,
        node: { file: '/feature.ts', name: NAMED_EXPORTS, viaImport: false },
      },
    ]);
  });
});

describe('the links of one module', () => {
  const NO_EXPORTS = { aliases: [], locals: [], namespaces: [], reexports: [] };
  const IMPORTS = [{ specifier: './api', named: [{ local: 'handle', imported: 'handle' }] }];

  function linksOf({ exports = {}, referenced = [] }) {
    return moduleLinks({
      imports: IMPORTS,
      dynamicImports: [],
      exports: { ...NO_EXPORTS, ...exports },
      referenced: new Set(referenced),
    });
  }

  it('marks the edge of an export * as, which knip never lists as an export of its own', () => {
    const { edges } = linksOf({
      exports: { namespaces: [{ specifier: './shelf', name: 'shelf' }] },
    });

    expect(edges).toEqual([
      { exported: 'shelf', imported: EVERYTHING, namespace: true, specifier: './shelf' },
    ]);
  });

  it('turns a const that only aliases an import into an edge, not a reference', () => {
    const exports = { aliases: [{ local: 'handle', exported: 'serve' }] };

    expect(linksOf({ exports })).toEqual({
      edges: [{ exported: 'serve', imported: 'handle', specifier: './api', viaImport: true }],
      references: [],
    });
  });

  it('keeps the import a reference when the module reads the alias', () => {
    const exports = { aliases: [{ local: 'handle', exported: 'serve' }] };

    expect(linksOf({ exports, referenced: ['serve'] })).toEqual({
      edges: [],
      references: [{ specifier: './api', imported: 'handle' }],
    });
  });
});
