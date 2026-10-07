import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cruise } from '../dependency-graph/cruise.mjs';
import { analyzeTestRuntime, loadModuleSources } from './analyze.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const fixtureRoot = 'preset/test-runtime/fixtures';

async function analyzeFixture(name, options = {}) {
  const root = `${fixtureRoot}/${name}`;
  const graph = cruise([root], { typeScriptRoot: root });
  return analyzeTestRuntime(graph, {
    productionRoot: `${root}/src/main`,
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

  it('reports type-only and missing runtimes while excluding contract and generated tests', async () => {
    const report = await analyzeFixture('negative');

    expect(report.findings.map((entry) => [path.basename(entry.test), entry.category])).toEqual([
      ['none.test.ts', 'no-production-runtime'],
      ['type-only.test.ts', 'type-only-production-dependency'],
    ]);
    expect(report.exclusions).toEqual([`${fixtureRoot}/negative/tests/contract/contract.test.ts`]);
    expect(report.tests.some((entry) => entry.test.includes('/generated/'))).toBe(false);
  });

  it('fails visibly for a malformed analyzer graph', () => {
    expect(() => analyzeTestRuntime({ modules: null })).toThrow(/modules array/);
  });
});
