import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { packageNameOf, reachableModules, resolveModuleSpecifier } from './module-resolution.mjs';

const roots = [];
const PINNED = { types: [], lib: ['ES2022'] };

function compilerOptions(options) {
  return { ...PINNED, ...options };
}

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-module-resolution-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function resolved(root, specifier, from = 'src/app/main.ts', options = {}) {
  const result = resolveModuleSpecifier(specifier, path.join(root, from), options);
  return result.path === undefined ? result : { ...result, path: path.relative(root, result.path) };
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const SOURCES = {
  'src/app/main.ts': 'export {};\n',
  'src/app/helper.ts': 'export {};\n',
  'src/app/page.tsx': 'export {};\n',
  'src/shared/index.ts': 'export {};\n',
  'src/shared/format.ts': 'export {};\n',
  'data.json': '{}\n',
};

describe('relative specifiers', () => {
  const root = project(SOURCES);

  it('adds the extension, maps .js to .ts and finds directory barrels', () => {
    expect(resolved(root, './helper')).toEqual({ kind: 'file', path: 'src/app/helper.ts' });
    expect(resolved(root, './helper.js')).toEqual({ kind: 'file', path: 'src/app/helper.ts' });
    expect(resolved(root, './page')).toEqual({ kind: 'file', path: 'src/app/page.tsx' });
    expect(resolved(root, '../shared')).toEqual({ kind: 'file', path: 'src/shared/index.ts' });
    expect(resolved(root, '../../data.json')).toEqual({ kind: 'file', path: 'data.json' });
  });

  it('ignores a relative specifier that resolves to nothing', () => {
    expect(resolved(root, './missing')).toEqual({ kind: 'ignored' });
  });
});

describe('specifier kinds', () => {
  const root = project(SOURCES);

  it('names the package for package specifiers', () => {
    expect(resolved(root, 'react-dom/client')).toEqual({ kind: 'package', name: 'react-dom' });
    expect(resolved(root, '@scope/tool/deep/path')).toEqual({
      kind: 'package',
      name: '@scope/tool',
    });
  });

  it('ignores Node built-ins and specifiers that are neither packages nor files', () => {
    expect(resolved(root, 'node:fs')).toEqual({ kind: 'ignored' });
    expect(resolved(root, 'path')).toEqual({ kind: 'ignored' });
    expect(resolved(root, '@/unmapped')).toEqual({ kind: 'ignored' });
    expect(resolved(root, '#internal')).toEqual({ kind: 'ignored' });
  });

  it('extracts package names', () => {
    expect(packageNameOf('lodash/fp')).toBe('lodash');
    expect(packageNameOf('@scope/pkg/sub')).toBe('@scope/pkg');
  });
});

describe('tsconfig discovery', () => {
  it('follows paths aliases and baseUrl from the nearest tsconfig', () => {
    const root = project({
      ...SOURCES,
      'tsconfig.json': JSON.stringify({
        compilerOptions: compilerOptions({ baseUrl: '.', paths: { '@/*': ['src/*'] } }),
      }),
    });
    expect(resolved(root, '@/shared/format')).toEqual({
      kind: 'file',
      path: 'src/shared/format.ts',
    });
    expect(resolved(root, '@/shared')).toEqual({ kind: 'file', path: 'src/shared/index.ts' });
    expect(resolved(root, 'src/shared/format')).toEqual({
      kind: 'file',
      path: 'src/shared/format.ts',
    });
  });

  it('reads paths through extends and comments in the config', () => {
    const root = project({
      ...SOURCES,
      'tsconfig.base.json':
        '{ // base\n "compilerOptions": { "types": [], "lib": ["ES2022"], "paths": { "~/*": ["./src/*"] } } }',
      'tsconfig.json': JSON.stringify({ extends: './tsconfig.base.json' }),
    });
    expect(resolved(root, '~/app/helper')).toEqual({ kind: 'file', path: 'src/app/helper.ts' });
  });

  it('takes paths from the referenced config of a solution tsconfig', () => {
    const root = project({
      ...SOURCES,
      'tsconfig.json': JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }),
      'tsconfig.app.json': JSON.stringify({
        compilerOptions: compilerOptions({ paths: { '@app/*': ['./src/app/*'] } }),
        include: ['src'],
      }),
    });
    expect(resolved(root, '@app/helper')).toEqual({ kind: 'file', path: 'src/app/helper.ts' });
  });

  it('uses the tsconfig nearest to the importing file', () => {
    const root = project({
      ...SOURCES,
      'tsconfig.json': JSON.stringify({
        compilerOptions: compilerOptions({ paths: { '@/*': ['src/shared/*'] } }),
      }),
      'packages/ui/tsconfig.json': JSON.stringify({
        compilerOptions: compilerOptions({ paths: { '@/*': ['./lib/*'] } }),
      }),
      'packages/ui/lib/button.ts': 'export {};\n',
      'packages/ui/lib/main.ts': 'export {};\n',
    });
    expect(resolved(root, '@/button', 'packages/ui/lib/main.ts')).toEqual({
      kind: 'file',
      path: 'packages/ui/lib/button.ts',
    });
    expect(resolved(root, '@/format')).toEqual({ kind: 'file', path: 'src/shared/format.ts' });
  });

  it('reads a jsconfig when there is no tsconfig', () => {
    const root = project({
      ...SOURCES,
      'jsconfig.json': JSON.stringify({
        compilerOptions: compilerOptions({ paths: { '@/*': ['./src/*'] } }),
      }),
    });
    expect(resolved(root, '@/app/helper')).toEqual({ kind: 'file', path: 'src/app/helper.ts' });
  });

  it('resolves relative specifiers when the config is unreadable', () => {
    const root = project({ ...SOURCES, 'tsconfig.json': '{ not json' });
    expect(resolved(root, './helper')).toEqual({ kind: 'file', path: 'src/app/helper.ts' });
  });
});

describe('workspace packages', () => {
  const root = project({
    ...SOURCES,
    'packages/test-utils/package.json': JSON.stringify({
      name: '@acme/test-utils',
      main: 'src/index.ts',
    }),
    'packages/test-utils/src/index.ts': 'export {};\n',
    'node_modules/installed-tool/package.json': JSON.stringify({
      name: 'installed-tool',
      main: 'index.js',
    }),
    'node_modules/installed-tool/index.js': 'module.exports = {};\n',
    'node_modules/typed-tool/package.json': JSON.stringify({
      name: 'typed-tool',
      types: 'index.d.ts',
    }),
    'node_modules/typed-tool/index.d.ts': 'export {};\n',
  });
  mkdirSync(path.join(root, 'node_modules/@acme'), { recursive: true });
  symlinkSync('../../packages/test-utils', path.join(root, 'node_modules/@acme/test-utils'));

  it('adds the source path of a package linked from inside the repository', () => {
    expect(resolved(root, '@acme/test-utils')).toEqual({
      kind: 'package',
      name: '@acme/test-utils',
      path: 'packages/test-utils/src/index.ts',
    });
  });

  it('keeps installed packages as bare package results', () => {
    expect(resolved(root, 'installed-tool')).toEqual({ kind: 'package', name: 'installed-tool' });
    expect(resolved(root, 'typed-tool')).toEqual({ kind: 'package', name: 'typed-tool' });
  });
});

describe('bundler aliases', () => {
  const root = project(SOURCES);
  const aliases = [
    { find: '@', replacement: path.join(root, 'src') },
    { find: /^~shared\/(.*)$/u, replacement: `${path.join(root, 'src/shared')}/$1` },
    { find: 'tool', replacement: 'other-tool' },
  ];

  it('rewrites a string alias as a path prefix', () => {
    expect(resolved(root, '@/app/helper', undefined, { aliases })).toEqual({
      kind: 'file',
      path: 'src/app/helper.ts',
    });
    expect(resolved(root, '@scope/tool', undefined, { aliases })).toEqual({
      kind: 'package',
      name: '@scope/tool',
    });
  });

  it('rewrites a pattern alias with its replacement', () => {
    expect(resolved(root, '~shared/format', undefined, { aliases })).toEqual({
      kind: 'file',
      path: 'src/shared/format.ts',
    });
  });

  it('reports an alias to another package as that package', () => {
    expect(resolved(root, 'tool/sub', undefined, { aliases })).toEqual({
      kind: 'package',
      name: 'other-tool',
    });
  });
});

describe('reachableModules', () => {
  const root = project({
    'tsconfig.json': JSON.stringify({
      compilerOptions: compilerOptions({ paths: { '@/*': ['src/*'] } }),
    }),
    'src/entry.ts': 'export {};\n',
    'src/a.ts': 'export {};\n',
    'src/b.ts': 'export {};\n',
    'src/c.ts': 'export {};\n',
  });
  const graph = new Map([
    ['src/entry.ts', ['@/a', './b']],
    ['src/a.ts', ['./b', './entry']],
    ['src/b.ts', ['./c']],
    ['src/c.ts', ['./a']],
  ]);
  const specifiersOf = (file) => graph.get(path.relative(root, file)) ?? [];
  const walk = (limits) =>
    [...reachableModules(path.join(root, 'src/entry.ts'), specifiersOf, limits)].map((step) =>
      step.truncated === true
        ? 'truncated'
        : `${path.relative(root, step.file)}@${String(step.depth)}`,
    );

  it('visits each module once, breadth first, through aliases and cycles', () => {
    expect(walk({ maxDepth: 8, maxFiles: 200 })).toEqual([
      'src/a.ts@1',
      'src/b.ts@1',
      'src/c.ts@2',
    ]);
  });

  it('ends with a truncation step when a limit leaves modules unvisited', () => {
    expect(walk({ maxDepth: 1, maxFiles: 200 })).toEqual(['src/a.ts@1', 'src/b.ts@1', 'truncated']);
    expect(walk({ maxDepth: 8, maxFiles: 2 })).toEqual(['truncated']);
    expect(walk({ maxDepth: 2, maxFiles: 4 })).toEqual(['src/a.ts@1', 'src/b.ts@1', 'src/c.ts@2']);
  });

  it('follows bundler aliases and linked workspace packages', () => {
    const linked = project({
      'src/entry.ts': 'export {};\n',
      'src/a.ts': 'export {};\n',
      'packages/kit/package.json': JSON.stringify({ name: 'kit', main: 'index.ts' }),
      'packages/kit/index.ts': 'export {};\n',
    });
    mkdirSync(path.join(linked, 'node_modules'), { recursive: true });
    symlinkSync('../packages/kit', path.join(linked, 'node_modules/kit'));
    const imports = new Map([['src/entry.ts', ['~/a', 'kit', 'vitest']]]);
    const steps = reachableModules(
      path.join(linked, 'src/entry.ts'),
      (file) => imports.get(path.relative(linked, file)) ?? [],
      {
        maxDepth: 8,
        maxFiles: 200,
        aliases: [{ find: '~', replacement: path.join(linked, 'src') }],
      },
    );
    expect([...steps].map((step) => path.relative(linked, step.file))).toEqual([
      'src/a.ts',
      'packages/kit/index.ts',
    ]);
  });
});
