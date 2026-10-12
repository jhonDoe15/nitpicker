import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARED_BUILD_DIRECTORY_ENVIRONMENT } from '../../../core/tooling/build-once.mjs';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { EXCLUDED_PATH_PATTERN } from '../preset/dependency-graph/cruise.mjs';
import { loadDependencyGraph } from './project-dependency-graph.mjs';

const ALL_SOURCES = ['src/a.ts', 'src/b.ts', 'src/leaky.ts', 'test/a.test.ts', 'test/fixture.ts'];
const temporaryRoots = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryDirectory(prefix) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  temporaryRoots.push(directory);
  return directory;
}

function project() {
  const root = temporaryDirectory('nitpicker-project-graph-');
  const files = {
    'package.json': '{"name":"p","type":"module"}\n',
    'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
    'src/b.ts': 'export const b = 1;\n',
    'src/leaky.ts': "import { fixture } from '../test/fixture';\nexport const leaky = fixture;\n",
    'test/fixture.ts': 'export const fixture = 1;\n',
    'test/a.test.ts': "import { a } from '../src/a';\nexport const t = a;\n",
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function requestFor(root, overrides = {}) {
  return {
    projectRoot: root,
    policyRoot: PACKAGE_ROOT,
    liveProjectRoot: PACKAGE_ROOT,
    patterns: ['src', 'test'],
    exclude: EXCLUDED_PATH_PATTERN,
    ...overrides,
  };
}

function sources(graph) {
  return graph.modules.map((module) => module.source).sort();
}

describe('loadDependencyGraph', () => {
  it('cruises the roots with the architecture rules and leaves no temporary files', () => {
    const root = project();

    const graph = loadDependencyGraph(requestFor(root));

    expect(sources(graph)).toEqual(ALL_SOURCES);
    expect(graph.summary.violations.map((violation) => violation.rule.name)).toEqual([
      'no-production-to-test',
    ]);
    expect(readdirSync(root).filter((name) => name.startsWith('.nitpicker-'))).toEqual([]);
  });

  it('cruises once per side and serves every later request from the shared directory', () => {
    const root = project();
    const shared = temporaryDirectory('nitpicker-shared-graph-');
    vi.stubEnv(SHARED_BUILD_DIRECTORY_ENVIRONMENT, shared);

    const first = loadDependencyGraph(requestFor(root));
    rmSync(path.join(root, 'src/b.ts'));
    const second = loadDependencyGraph(requestFor(root));

    expect(second).toEqual(first);
    expect(sources(second)).toEqual(ALL_SOURCES);
    expect(readdirSync(shared)).toHaveLength(1);
  });

  it('keeps graphs of different roots, filters and snapshots apart', () => {
    const root = project();
    const other = project();
    const shared = temporaryDirectory('nitpicker-shared-graph-');
    vi.stubEnv(SHARED_BUILD_DIRECTORY_ENVIRONMENT, shared);

    const sourceOnly = loadDependencyGraph(requestFor(root, { patterns: ['src'] }));
    const filtered = loadDependencyGraph(requestFor(root, { includeOnly: '^src/' }));
    loadDependencyGraph(requestFor(other));

    expect(sources(sourceOnly)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/leaky.ts',
      'test/fixture.ts',
    ]);
    expect(sources(filtered)).toEqual(['src/a.ts', 'src/b.ts', 'src/leaky.ts']);
    expect(readdirSync(shared)).toHaveLength(3);
  });

  it('cruises directly when no shared directory is configured', () => {
    const root = project();

    const first = loadDependencyGraph(requestFor(root));
    rmSync(path.join(root, 'src/b.ts'));
    const second = loadDependencyGraph(requestFor(root));

    expect(sources(first)).toEqual(ALL_SOURCES);
    expect(sources(second)).toEqual([
      './b',
      'src/a.ts',
      'src/leaky.ts',
      'test/a.test.ts',
      'test/fixture.ts',
    ]);
  });

  it('rejects a policy config outside the policy root', () => {
    expect(() =>
      loadDependencyGraph(requestFor(project(), { configRelativePath: '../outside.mjs' })),
    ).toThrow('Policy path must stay within the policy root');
  });
});
