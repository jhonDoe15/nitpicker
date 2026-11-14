import { describe, expect, it } from 'vitest';
import { analyzeEntryPoints as untypedAnalyzeEntryPoints } from '../../typescript/preset/entry-points/analyze.mjs';
import { resolveLayout as untypedResolveLayout } from '../../typescript/preset/layout.mjs';
import { analyzeTestRuntime as untypedAnalyzeTestRuntime } from '../../typescript/preset/test-runtime/analyze.mjs';

type Layout = ReturnType<typeof untypedResolveLayout>;
type Edge = [string, string] | [string, string, string[]];
type Graph = {
  readonly modules: readonly {
    readonly source: string;
    readonly dependencies: readonly { resolved: string; dependencyTypes: string[] }[];
  }[];
};
type EntryReport = {
  readonly summary: {
    readonly components?: number;
    readonly declaredEntryPoints?: number;
    readonly throughEntryPoint?: number;
    readonly missingEntryPointImports?: number;
    readonly publicAlternativeBypasses?: number;
    readonly concreteCrossBoundaryImports?: number;
  };
  readonly publicAlternativeBypasses: readonly {
    readonly source: string;
    readonly target: string;
    readonly publicEntryPoint: string;
  }[];
};
type EntryOptions = {
  readonly layout?: Layout;
  readonly foundationDirectories: Set<string>;
  readonly compositionRoots?: Set<string>;
};
type TestRuntimeUsage = { readonly category: string; readonly subprocessBridges: string[] };

const analyzeEntryPoints: (graph: Graph, sourceRoot: string, options: EntryOptions) => EntryReport =
  untypedAnalyzeEntryPoints;
const analyzeTestRuntime: (
  graph: Graph,
  options: {
    readonly layout: Layout;
    readonly productionRoot: string;
    readonly sourceTexts?: Map<string, string>;
  },
) => { readonly tests: TestRuntimeUsage[]; readonly findings: unknown[] } =
  untypedAnalyzeTestRuntime;
const resolveLayout: (
  config?: object,
  roots?: string[],
  options?: { javascript: boolean },
) => Layout = untypedResolveLayout;

const javascriptLayout = resolveLayout({}, [], { javascript: true });
const typescriptLayout = resolveLayout();
const noFoundations = new Set<string>();

function graphOf(edges: Edge[]): Graph {
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

function entryPointReport(
  edges: Edge[],
  layout: Layout,
  options: { compositionRoots?: Set<string> } = {},
): EntryReport {
  return analyzeEntryPoints(graphOf(edges), 'src/main', {
    layout,
    foundationDirectories: noFoundations,
    ...options,
  });
}

const publicImport: Edge[] = [
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
    const counts = ['mjs', 'cjs'].map((extension) => {
      const report = entryPointReport(
        [[`src/main/other/use.js`, `src/main/greeting/index.${extension}`]],
        javascriptLayout,
      );
      return [report.summary.declaredEntryPoints, report.summary.throughEntryPoint];
    });
    expect(counts).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it('reports a bypass of the entry point that the entry point re-exports', () => {
    const report = entryPointReport(
      [['src/main/other/use.js', 'src/main/greeting/adapters/run.js'], ...publicImport],
      javascriptLayout,
    );
    expect(report.summary.publicAlternativeBypasses).toBe(1);
    const { source, target, publicEntryPoint } = report.publicAlternativeBypasses[0] ?? {};
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
    const roots = ['composition-root.mjs', 'composition-root.js', 'main.cjs', 'server.js'];
    const bypasses = roots.map(
      (root) =>
        entryPointReport(
          [[`src/main/${root}`, 'src/main/greeting/adapters/run.js'], ...publicImport.slice(1)],
          javascriptLayout,
        ).summary.publicAlternativeBypasses,
    );
    expect(bypasses).toEqual(roots.map(() => 0));
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
    const files = ['client.js', 'pool.mjs', 'store.cjs'];
    const crossings = files.map(
      (file) =>
        entryPointReport(
          [
            ['src/main/other/use.js', `src/main/greeting/${file}`],
            ['src/main/greeting/index.js', `src/main/greeting/${file}`, ['export']],
          ],
          javascriptLayout,
        ).summary.concreteCrossBoundaryImports,
    );
    expect(crossings).toEqual(files.map(() => 1));
  });

  it('flags a TypeScript client name in both projects and a JavaScript one only in JavaScript', () => {
    const edges: Edge[] = [['src/main/other/use.js', 'src/main/greeting/client.ts']];
    expect(entryPointReport(edges, javascriptLayout).summary.concreteCrossBoundaryImports).toBe(1);
    expect(entryPointReport(edges, typescriptLayout).summary.concreteCrossBoundaryImports).toBe(1);
    const jsEdges: Edge[] = [['src/main/other/use.ts', 'src/main/greeting/client.js']];
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

function bridgeUsage(text: string, layout: Layout): TestRuntimeUsage {
  const test = 'test/app.test.js';
  const [usage] = analyzeTestRuntime(
    { modules: [{ source: test, dependencies: [] }] },
    { layout, productionRoot: 'src/main', sourceTexts: new Map([[test, text]]) },
  ).tests;
  if (usage === undefined) {
    throw new Error('No test runtime usage was reported');
  }
  return usage;
}

describe('test runtime of a JavaScript project', () => {
  it('accepts the JavaScript app-process bridges of every test root', () => {
    const extensions = ['js', 'mjs', 'cjs'];
    const usages = extensions.map((extension) =>
      bridgeUsage(`spawn('./fixtures/app-process.${extension}')`, javascriptLayout),
    );
    expect(usages.map(({ category }) => category)).toEqual(
      extensions.map(() => 'subprocess-production-runtime'),
    );
    expect(usages.map(({ subprocessBridges }) => subprocessBridges)).toEqual(
      extensions.map((extension) => [
        `test/fixtures/app-process.${extension}`,
        `tests/fixtures/app-process.${extension}`,
        `__tests__/fixtures/app-process.${extension}`,
        `e2e/fixtures/app-process.${extension}`,
      ]),
    );
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
