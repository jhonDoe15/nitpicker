import { describe, expect, it } from 'vitest';
import { analyzeEntryPoints } from '../../typescript/preset/entry-points/analyze.mjs';
import { resolveLayout } from '../../typescript/preset/layout.mjs';
import { analyzeTestRuntime } from '../../typescript/preset/test-runtime/analyze.mjs';

const javascriptLayout = resolveLayout({}, [], { javascript: true });
const typescriptLayout = resolveLayout();
const noFoundations = new Set();

function graphOf(edges) {
  const sources = new Set(edges.flatMap(([from, to]) => [from, to]));
  return {
    modules: [...sources].map((source) => ({
      source,
      dependencies: edges
        .filter(([from]) => from === source)
        .map(([, to, types = ['local', 'import']]) => ({ resolved: to, dependencyTypes: types })),
    })),
  };
}

function entryPointReport(edges, layout, options = {}) {
  return analyzeEntryPoints(graphOf(edges), 'src/main', {
    layout,
    foundationDirectories: noFoundations,
    ...options,
  });
}

const publicImport = [
  ['src/main/composition-root.mjs', 'src/main/greeting/index.js'],
  ['src/main/greeting/index.js', 'src/main/greeting/adapters/run.js', ['export']],
];

describe('entry points of a JavaScript project', () => {
  it('treats index.js as the public entry point of a component', () => {
    const report = entryPointReport(
      [['src/main/other/use.js', 'src/main/greeting/index.js'], ...publicImport],
      javascriptLayout,
    );
    const { components, declaredEntryPoints, throughEntryPoint, missingEntryPointImports } =
      report.summary;
    expect({
      components,
      declaredEntryPoints,
      throughEntryPoint,
      missingEntryPointImports,
    }).toEqual({
      components: 2,
      declaredEntryPoints: 1,
      throughEntryPoint: 1,
      missingEntryPointImports: 0,
    });
  });

  it('accepts index.mjs and index.cjs as entry points', () => {
    for (const extension of ['mjs', 'cjs']) {
      const report = entryPointReport(
        [[`src/main/other/use.js`, `src/main/greeting/index.${extension}`]],
        javascriptLayout,
      );
      expect([report.summary.declaredEntryPoints, report.summary.throughEntryPoint]).toEqual([
        1, 1,
      ]);
    }
  });

  it('reports a bypass of the entry point that the entry point re-exports', () => {
    const report = entryPointReport(
      [['src/main/other/use.js', 'src/main/greeting/adapters/run.js'], ...publicImport],
      javascriptLayout,
    );
    expect(report.summary.publicAlternativeBypasses).toBe(1);
    const { source, target, publicEntryPoint } = report.publicAlternativeBypasses[0];
    expect({ source, target, publicEntryPoint }).toEqual({
      source: 'src/main/other/use.js',
      target: 'src/main/greeting/adapters/run.js',
      publicEntryPoint: 'src/main/greeting/index.js',
    });
  });

  it('reports an import of a component that has no entry point', () => {
    const report = entryPointReport(
      [
        ['src/main/other/use.js', 'src/main/greeting/adapters/run.js'],
        ['src/main/greeting/adapters/run.js', 'src/main/greeting/domain/x.js'],
      ],
      javascriptLayout,
    );
    expect(report.summary.missingEntryPointImports).toBe(1);
  });

  it('does not see index.js as an entry point of a TypeScript project', () => {
    const report = entryPointReport(
      [['src/main/other/use.ts', 'src/main/greeting/index.js']],
      typescriptLayout,
    );
    expect([report.summary.declaredEntryPoints, report.summary.missingEntryPointImports]).toEqual([
      0, 1,
    ]);
  });

  it('exempts composition roots of every JavaScript extension', () => {
    for (const root of ['composition-root.mjs', 'composition-root.js', 'main.cjs', 'server.js']) {
      const report = entryPointReport(
        [[`src/main/${root}`, 'src/main/greeting/adapters/run.js'], ...publicImport.slice(1)],
        javascriptLayout,
      );
      expect(report.summary.publicAlternativeBypasses, root).toBe(0);
    }
  });

  it('exempts a TypeScript composition root of a project that is migrating', () => {
    const report = entryPointReport(
      [
        ['src/main/composition-root.ts', 'src/main/greeting/adapters/run.js'],
        ...publicImport.slice(1),
      ],
      javascriptLayout,
    );
    expect(report.summary.publicAlternativeBypasses).toBe(0);
  });

  it('flags concrete clients imported across components', () => {
    for (const file of ['client.js', 'pool.mjs', 'store.cjs']) {
      const report = entryPointReport(
        [
          ['src/main/other/use.js', `src/main/greeting/${file}`],
          ['src/main/greeting/index.js', `src/main/greeting/${file}`, ['export']],
        ],
        javascriptLayout,
      );
      expect(report.summary.concreteCrossBoundaryImports, file).toBe(1);
    }
  });

  it('flags a TypeScript client name in both projects and a JavaScript one only in JavaScript', () => {
    const edges = [['src/main/other/use.js', 'src/main/greeting/client.ts']];
    expect(entryPointReport(edges, javascriptLayout).summary.concreteCrossBoundaryImports).toBe(1);
    expect(entryPointReport(edges, typescriptLayout).summary.concreteCrossBoundaryImports).toBe(1);
    const jsEdges = [['src/main/other/use.ts', 'src/main/greeting/client.js']];
    expect(entryPointReport(jsEdges, typescriptLayout).summary.concreteCrossBoundaryImports).toBe(
      0,
    );
  });

  it('flags only whole-name suffix matches', () => {
    const report = entryPointReport(
      [['src/main/other/use.js', 'src/main/greeting/clients.js']],
      javascriptLayout,
    );
    expect(report.summary.concreteCrossBoundaryImports).toBe(0);
  });

  it('uses the default layout of the TypeScript preset when none is given', () => {
    const report = analyzeEntryPoints(
      graphOf([['src/main/other/use.ts', 'src/main/greeting/index.ts']]),
      'src/main',
      { foundationDirectories: noFoundations },
    );
    expect(report.summary.declaredEntryPoints).toBe(1);
  });
});

function bridgeUsage(text, layout) {
  const test = 'test/app.test.js';
  return analyzeTestRuntime(
    { modules: [{ source: test, dependencies: [] }] },
    { layout, productionRoot: 'src/main', sourceTexts: new Map([[test, text]]) },
  ).tests[0];
}

describe('test runtime of a JavaScript project', () => {
  it('accepts the JavaScript app-process bridges of every test root', () => {
    for (const extension of ['js', 'mjs', 'cjs']) {
      const usage = bridgeUsage(`spawn('./fixtures/app-process.${extension}')`, javascriptLayout);
      expect(usage.category, extension).toBe('subprocess-production-runtime');
      expect(usage.subprocessBridges).toEqual([
        `test/fixtures/app-process.${extension}`,
        `tests/fixtures/app-process.${extension}`,
        `__tests__/fixtures/app-process.${extension}`,
        `e2e/fixtures/app-process.${extension}`,
      ]);
    }
  });

  it('accepts the TypeScript bridge of a JavaScript project that is migrating', () => {
    expect(bridgeUsage("spawn('./fixtures/app-process.ts')", javascriptLayout).category).toBe(
      'subprocess-production-runtime',
    );
  });

  it('accepts only the TypeScript bridge in a TypeScript project', () => {
    const { category, subprocessBridges } = bridgeUsage(
      "spawn('./fixtures/app-process.ts')",
      typescriptLayout,
    );
    expect({ category, subprocessBridges }).toEqual({
      category: 'subprocess-production-runtime',
      subprocessBridges: [
        'test/fixtures/app-process.ts',
        'tests/fixtures/app-process.ts',
        '__tests__/fixtures/app-process.ts',
        'e2e/fixtures/app-process.ts',
      ],
    });
    expect(bridgeUsage("spawn('./fixtures/app-process.js')", typescriptLayout).category).toBe(
      'no-production-runtime',
    );
  });

  it('counts a JavaScript test that imports production code', () => {
    const report = analyzeTestRuntime(graphOf([['test/app.test.js', 'src/main/app.js']]), {
      layout: javascriptLayout,
      productionRoot: 'src/main',
    });
    expect(report.tests.map((entry) => entry.category)).toEqual(['direct-production-runtime']);
    expect(report.findings).toEqual([]);
  });
});
