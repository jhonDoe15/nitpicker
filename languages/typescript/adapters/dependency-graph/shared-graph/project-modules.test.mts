import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARED_BUILD_DIRECTORY_ENVIRONMENT } from '../../../../../core/tooling/build-once/build-once.mts';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { writeFileTree } from '../../test-support/file-tree.mts';
import { type CruiseReport, loadDependencyGraph } from '../project-dependency-graph.mts';
import { compactGraphText } from './compact-graph.mts';
import { loadProjectModules, withoutExcludedModules } from './project-modules.mts';

const RING = 400;
const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryDirectory(prefix: string): string {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  roots.push(directory);
  return directory;
}

function ringProject(): string {
  const root = temporaryDirectory('nitpicker-ring-graph-');
  const modules = Array.from({ length: RING }, (_, index): [string, string] => [
    `src/m${String(index)}.ts`,
    `import { v${String((index + 1) % RING)} } from './m${String((index + 1) % RING)}';\n` +
      `export const v${String(index)} = () => v${String((index + 1) % RING)};\n`,
  ]);
  writeFileTree(root, {
    'package.json': '{"name":"ring","type":"module"}\n',
    'src/built.ts': "import { out } from '../dist/out';\nexport const built = out;\n",
    'dist/out.ts': 'export const out = 1;\n',
    ...Object.fromEntries(modules),
  });
  return root;
}

function sources(report: CruiseReport): string[] {
  return listOf(report.modules).map((module) => textOf(fieldOf(module, 'source')));
}

describe('the shared project graph', () => {
  it('drops the per-dependency cycle lists that grow with the square of a cycle', () => {
    const report = loadProjectModules({
      projectRoot: ringProject(),
      policyRoot: PACKAGE_ROOT,
      patterns: ['src'],
    });
    const dependencies = listOf(report.modules).flatMap((module) =>
      listOf(fieldOf(module, 'dependencies')),
    );

    expect(dependencies.length).toBeGreaterThanOrEqual(RING);
    expect(dependencies.every((dependency) => fieldOf(dependency, 'cycle') === undefined)).toBe(
      true,
    );
    expect(dependencies.some((dependency) => fieldOf(dependency, 'circular') === true)).toBe(true);
    expect(JSON.stringify(report).length).toBeLessThan(RING * 1000);
  });

  it('keeps cycle violations in the summary', () => {
    const text = JSON.stringify({
      summary: { violations: [{ type: 'cycle', cycle: [{ name: 'a' }, { name: 'b' }] }] },
      modules: [{ source: 'a', dependencies: [{ resolved: 'b', cycle: [{ name: 'b' }] }] }],
    });

    expect(JSON.parse(compactGraphText(text))).toEqual({
      summary: { violations: [{ type: 'cycle', cycle: [{ name: 'a' }, { name: 'b' }] }] },
      modules: [{ source: 'a', dependencies: [{ resolved: 'b' }] }],
    });
  });

  it('serves the architecture check and the module readers from one cruise', () => {
    const root = ringProject();
    const shared = temporaryDirectory('nitpicker-shared-graph-');
    vi.stubEnv(SHARED_BUILD_DIRECTORY_ENVIRONMENT, shared);
    const request = { projectRoot: root, policyRoot: PACKAGE_ROOT, patterns: ['src'] };

    const architecture = loadDependencyGraph({
      ...request,
      liveProjectRoot: PACKAGE_ROOT,
      exclude: undefined,
      reportsConfigErrors: true,
    });
    const entryPoints = loadProjectModules(request);
    const qualityAreas = loadProjectModules({ ...request, liveProjectRoot: PACKAGE_ROOT });

    expect(readdirSync(shared)).toHaveLength(1);
    expect(sources(architecture).filter((source) => source.startsWith('dist/'))).toEqual([
      'dist/out.ts',
    ]);
    expect(sources(entryPoints)).not.toContain('dist/out.ts');
    expect(qualityAreas).toEqual(entryPoints);
  });

  it('removes excluded modules and the dependencies on them', () => {
    const report = withoutExcludedModules({
      modules: [
        { source: 'src/a.ts', dependencies: [{ resolved: 'dist/b.js' }, { resolved: 'src/c.ts' }] },
        { source: 'dist/b.js', dependencies: [] },
        { source: 'node_modules/x/index.js' },
      ],
    });

    expect(report.modules).toEqual([
      { source: 'src/a.ts', dependencies: [{ resolved: 'src/c.ts' }] },
    ]);
  });
});
