import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineExtraction } from './engine-dependencies.mts';

const engine = vi.hoisted(() => ({
  calls: [] as { baseDirectory: string; files: readonly string[] }[],
  found: new Map<string, unknown>(),
}));

vi.mock('./engine-dependencies.mts', () => ({
  engineExtraction: (request: { baseDirectory: string; files: readonly string[] }) => {
    engine.calls.push(request);
    return engine.found;
  },
}));

const {
  readsLikeEngine,
  transpilesLikeEngine,
  withEngineJavaScriptExtract,
  withEngineSources,
  withEngineTypeScriptExtract,
} = await import('./engine-hooks.mts');

const READ_OPTIONS = {
  moduleSystems: ['es6', 'cjs', 'tsd', 'amd'],
  exoticRequireStrings: [],
  baseDir: '/project',
};
const TRANSPILE = { tsConfig: { options: { module: 99 } } };

const EXTRACTION: EngineExtraction = {
  dependencies: [
    {
      dynamic: false,
      module: './b',
      moduleSystem: 'es6',
      exoticallyRequired: false,
      dependencyTypes: ['import'],
    },
    {
      dynamic: false,
      module: 'fs',
      moduleSystem: 'cjs',
      exoticallyRequired: false,
      dependencyTypes: ['require'],
    },
  ],
  kept: [{ module: './b', dynamic: false }],
};

const SOURCES = ['a.ts', 'b.d.ts', 'c.mjs', 'd.json', 'e.d.mts'];

function gathered(options: Record<string, unknown>): string[] {
  return withEngineSources(() => SOURCES)([], options);
}

const fallback = vi.fn(() => ['from dependency-cruiser']);

beforeEach(() => {
  engine.calls.length = 0;
  engine.found = new Map([['a.ts', EXTRACTION]]);
  fallback.mockClear();
});

describe('reading like the engine', () => {
  it('matches only the default module systems with no exotic or extra detection', () => {
    expect(readsLikeEngine(READ_OPTIONS)).toBe(true);
    expect(readsLikeEngine({ ...READ_OPTIONS, exoticRequireStrings: ['want'] })).toBe(false);
    expect(readsLikeEngine({ ...READ_OPTIONS, detectJSDocImports: true })).toBe(false);
    expect(readsLikeEngine({ ...READ_OPTIONS, detectProcessBuiltinModuleCalls: true })).toBe(false);
    expect(readsLikeEngine({ ...READ_OPTIONS, moduleSystems: ['es6', 'cjs'] })).toBe(false);
  });

  it('matches only an ES module output with no babel and no elision options', () => {
    expect(transpilesLikeEngine(TRANSPILE)).toBe(true);
    expect(transpilesLikeEngine({ ...TRANSPILE, babelConfig: { presets: [] } })).toBe(false);
    expect(transpilesLikeEngine({ tsConfig: { options: { module: 1 } } })).toBe(false);
    expect(transpilesLikeEngine({ tsConfig: { options: { module: 99, jsx: 4 } } })).toBe(false);
  });
});

describe('gathering sources for the engine', () => {
  it('hands the code files that are not declarations to the engine', () => {
    expect(gathered(READ_OPTIONS)).toEqual(SOURCES);
    expect(engine.calls).toEqual([{ baseDirectory: '/project', files: ['a.ts', 'c.mjs'] }]);
  });

  it('uses the working directory when there is no base directory', () => {
    gathered({ ...READ_OPTIONS, baseDir: undefined });
    expect(engine.calls).toEqual([{ baseDirectory: process.cwd(), files: ['a.ts', 'c.mjs'] }]);
  });

  it('leaves the engine out when the options read differently', () => {
    expect(gathered({ ...READ_OPTIONS, detectJSDocImports: true })).toEqual(SOURCES);
    expect(engine.calls).toEqual([]);
  });
});

describe('extracting with the engine', () => {
  it('answers TypeScript files with copies of what the engine found', () => {
    gathered(READ_OPTIONS);
    const extract = withEngineTypeScriptExtract(fallback);
    const answered = extract(READ_OPTIONS, 'a.ts', TRANSPILE);

    expect(answered).toEqual(EXTRACTION.dependencies);
    expect(answered[0]).not.toBe(EXTRACTION.dependencies[0]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back for files the engine did not read or options it does not match', () => {
    gathered(READ_OPTIONS);
    const extract = withEngineTypeScriptExtract(fallback);

    expect(extract(READ_OPTIONS, 'c.mjs', TRANSPILE)).toEqual(['from dependency-cruiser']);
    expect(extract({ ...READ_OPTIONS, detectJSDocImports: true }, 'a.ts', TRANSPILE)).toEqual([
      'from dependency-cruiser',
    ]);
    expect(extract(READ_OPTIONS, 'a.ts', { tsConfig: { options: { module: 1 } } })).toEqual([
      'from dependency-cruiser',
    ]);
  });

  it('answers JavaScript extraction from the kept list only for pre-compilation dependencies', () => {
    gathered(READ_OPTIONS);
    const extract = withEngineJavaScriptExtract(fallback);
    const specified = { ...READ_OPTIONS, tsPreCompilationDeps: 'specify' };

    expect(extract(specified, 'a.ts', TRANSPILE)).toEqual([{ module: './b', dynamic: false }]);
    expect(extract(specified, 'c.mjs', TRANSPILE)).toEqual(['from dependency-cruiser']);
    expect(extract(READ_OPTIONS, 'a.ts', TRANSPILE)).toEqual(['from dependency-cruiser']);
  });
});
