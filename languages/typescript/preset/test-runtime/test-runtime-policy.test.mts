import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cruiseInProcess as untypedCruise } from '../dependency-graph/test-support/in-process-cruise.mts';
import type { AnalysisLayout, AnalyzeOptions, Graph } from './analysis-types.mts';
import { analyzeTestRuntime, loadModuleSources } from './analyze.mts';
import { resolveLayout as untypedResolveLayout } from '../layout.mjs';
import { defaultTestFiles as untypedDefaultTestFiles } from '../test-runner/test-files/test-file-patterns.mjs';

const cruise: (paths: string[], options: { typeScriptRoot: string }) => Promise<Graph> =
  untypedCruise;
const resolveLayout: (
  layout: object,
  exclude: string[],
  options: { testFiles: unknown },
) => AnalysisLayout = untypedResolveLayout;
const defaultTestFiles: (runner: string) => unknown = untypedDefaultTestFiles;

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const fixtureRoot = 'languages/typescript/preset/test-runtime/fixtures';

async function analyzeFixture(name: string, options: AnalyzeOptions = {}) {
  const root = `${fixtureRoot}/${name}`;
  const graph = await cruise([root], { typeScriptRoot: root });
  return analyzeTestRuntime(graph, {
    productionRoots: [`${root}/src/main`],
    sourceTexts: await loadModuleSources(graph, projectRoot),
    subprocessBridges: [`${root}/tests/fixtures/app-process.ts`],
    ...options,
  });
}

describe('resolved test runtime report', () => {
  it('accepts direct, dynamic, transitive, and exact subprocess production runtimes', async () => {
    const report = await analyzeFixture('positive');
    const categories = Object.fromEntries(
      report.tests.map((entry) => [path.basename(entry.test), entry.category]),
    );

    expect(categories).toEqual({
      'bridge.test.ts': 'subprocess-production-runtime',
      'direct.test.ts': 'direct-production-runtime',
      'dynamic.test.ts': 'dynamic-production-runtime',
      'transitive.test.ts': 'transitive-production-runtime',
    });
    expect(report.findings).toEqual([]);
  });

  it('reports type-only and missing runtimes, excluding contract tests but not a generated folder', async () => {
    const report = await analyzeFixture('negative');

    expect(report.findings.map((entry) => [path.basename(entry.test), entry.category])).toEqual([
      ['generated.test.ts', 'no-production-runtime'],
      ['none.test.ts', 'no-production-runtime'],
      ['type-only.test.ts', 'type-only-production-dependency'],
    ]);
    expect(report.exclusions).toEqual([`${fixtureRoot}/negative/tests/contract/contract.test.ts`]);
  });

  it.each([
    ['jest', 'src/__tests__/format.js'],
    ['node', 'test/format-test.js'],
    ['mocha', 'test/format.js'],
  ])('analyzes the files %s runs, whatever their names', (runner: string, test: string) => {
    const graph = {
      modules: [
        { source: test, dependencies: [{ resolved: 'src/format.js', dependencyTypes: ['local'] }] },
        { source: 'src/format.js', dependencies: [] },
        { source: 'tests/helpers/format.js', dependencies: [] },
      ],
    };
    const layout = resolveLayout({}, [], { testFiles: defaultTestFiles(runner) });

    expect(analyzeTestRuntime(graph, { layout }).tests).toEqual([
      {
        test,
        category: 'direct-production-runtime',
        directProductionModules: ['src/format.js'],
        runtimeProductionModules: ['src/format.js'],
        typeOnlyProductionModules: [],
        subprocessBridges: [],
      },
    ]);
  });

  it('fails visibly for a malformed analyzer graph', () => {
    expect(() => analyzeTestRuntime({ modules: undefined })).toThrow(/modules array/);
  });
});
