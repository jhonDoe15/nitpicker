import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { analyzeEntryPoints as analyzeEntryPointsJs } from '../../../../languages/typescript/preset/entry-points/analyze.mjs';
import { compareFindings } from '../../comparison/test-support/typed-compare.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import {
  createEntryPointAnalyzer as createEntryPointAnalyzerJs,
  toEntryPointDiffFindings as toEntryPointDiffFindingsJs,
} from '../../../../languages/typescript/adapters/entry-points.mjs';
import { configuredAnalyzers as configuredAnalyzersJs } from '../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { type AnalyzerRequest, runAnalyzers } from '../../execution/run-analyzers.mts';
import { fileURLToPath } from 'node:url';

type Dependency = { readonly resolved: string; readonly dependencyTypes: readonly string[] };
type Module = { readonly source: string; readonly dependencies: readonly Dependency[] };
type Bypass = {
  readonly source: string;
  readonly target: string;
  readonly publicEntryPoint: string;
  readonly dependencyKind: string;
};
type BypassReport = { readonly publicAlternativeBypasses: readonly Bypass[] };

const configuredAnalyzers: () => { readonly name: string }[] = configuredAnalyzersJs;
const analyzeEntryPoints: (
  graph: { readonly modules: readonly Module[] },
  sourceRoot: string,
) => BypassReport = analyzeEntryPointsJs;
const toEntryPointDiffFindings: (report: BypassReport) => Finding[] = toEntryPointDiffFindingsJs;
const createEntryPointAnalyzer: (options: {
  readonly version: string;
  readonly configurationHash: string;
  readonly exclusions: readonly string[];
  readonly sourceRoot: string;
  readonly sourceRoots: undefined;
  readonly shardWeight: number;
}) => unknown = createEntryPointAnalyzerJs;
const packageAnalyzers = configuredAnalyzers();
const packageRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)), '../..');

describe('entry-point differential adapter', () => {
  it('reports a new public-entry-point bypass separately from an unchanged baseline bypass', () => {
    const baseReport = analyzeEntryPoints(graph(false), 'src/main');
    const headReport = analyzeEntryPoints(graph(true), 'src/main');

    const comparison = compareFindings({
      baseFindings: toEntryPointDiffFindings(baseReport),
      headFindings: toEntryPointDiffFindings(headReport),
    });

    expect(comparison.unchangedFindings).toEqual([
      {
        tool: 'entry-points',
        rule: 'public-alternative-bypass',
        path: 'src/main/alpha/existing.ts',
        identity: 'target:src/main/beta/internal.ts',
        message: 'Import src/main/beta/internal.ts through src/main/beta/index.ts (runtime)',
        classification: 'enforceable',
      },
    ]);
    expect(comparison.newFindings).toEqual([
      {
        tool: 'entry-points',
        rule: 'public-alternative-bypass',
        path: 'src/main/gamma/introduced.ts',
        identity: 'target:src/main/beta/internal.ts',
        message: 'Import src/main/beta/internal.ts through src/main/beta/index.ts (runtime)',
        classification: 'enforceable',
      },
    ]);
    expect(comparison.resolvedFindings).toEqual([]);
  });

  it('keeps one bypass identity when remediation details or dependency kind change', () => {
    const baseFindings = toEntryPointDiffFindings(
      reportFor({
        publicEntryPoint: 'src/main/beta/index.ts',
        dependencyKind: 'type-only',
      }),
    );
    const headFindings = toEntryPointDiffFindings(
      reportFor({
        publicEntryPoint: 'src/main/beta/public.ts',
        dependencyKind: 'runtime',
      }),
    );

    const comparison = compareFindings({ baseFindings, headFindings });

    expect(comparison.unchangedFindings).toHaveLength(1);
    expect(comparison.newFindings).toEqual([]);
    expect(comparison.resolvedFindings).toEqual([]);
  });

  it('runs the entry-point policy through the differential analyzer process', () => {
    const analyzer = createEntryPointAnalyzer({
      version: 'fixture',
      configurationHash: 'fixture',
      exclusions: [],
      sourceRoot: 'src/main',
      sourceRoots: undefined,
      shardWeight: 1,
    });
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
    const projectRoot = path.join(temporaryRoot, 'base');
    cpSync(
      path.join(packageRoot, 'languages/typescript/preset/entry-points/fixtures/signals'),
      projectRoot,
      {
        recursive: true,
      },
    );
    try {
      const request: AnalyzerRequest = {
        analyzers: [analyzer],
        projectRoot,
        policyRoot: packageRoot,
        toolRoot: packageRoot,
        liveProjectRoot: packageRoot,
        snapshot: 'head',
        baselineRoot: undefined,
        baselineMovesFile: undefined,
        headPolicyFile: undefined,
        mutationScope: undefined,
        logRoot: undefined,
        runTasks: undefined,
      };
      const run = runAnalyzers(request);
      expect(run.toolErrors).toEqual([]);
      expect(run.reports.get('entry-points')?.findings).toHaveLength(3);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('preserves legacy src/main bypasses with the common source root', () => {
    const report = analyzeEntryPoints(graph(true), 'src');
    expect(report.publicAlternativeBypasses.map((entry) => entry.source)).toEqual([
      'src/main/alpha/existing.ts',
      'src/main/gamma/introduced.ts',
    ]);
  });

  it('includes entry-point bypasses in the production differential analyzers', () => {
    expect(
      [...new Set(packageAnalyzers.map(({ name }) => name))].toSorted(
        (a, b) => Number(a > b) - Number(a < b),
      ),
    ).toEqual([
      'coding-standards',
      'coupling',
      'coverage',
      'crap',
      'dead-code',
      'dependency-architecture',
      'duplicates',
      'entry-points',
      'eslint-errors',
      'eslint-lint',
      'eslint-logging',
      'eslint-module-effects',
      'mutation',
      'prettier-format',
      'structure',
      'test-console',
      'test-runtime',
      'typescript-typecheck',
    ]);
  });
});

function graph(includeIntroducedBypass: boolean) {
  return {
    modules: [
      module('src/main/alpha/existing.ts', [dependency('src/main/beta/internal.ts')]),
      module(
        'src/main/gamma/introduced.ts',
        includeIntroducedBypass ? [dependency('src/main/beta/internal.ts')] : [],
      ),
      module('src/main/beta/index.ts', [dependency('src/main/beta/internal.ts', ['export'])]),
      module('src/main/beta/internal.ts'),
    ],
  };
}

function module(source: string, dependencies: readonly Dependency[] = []): Module {
  return { source, dependencies };
}

function dependency(resolved: string, dependencyTypes: readonly string[] = []): Dependency {
  return { resolved, dependencyTypes };
}

function reportFor({
  publicEntryPoint,
  dependencyKind,
}: Pick<Bypass, 'publicEntryPoint' | 'dependencyKind'>): BypassReport {
  return {
    publicAlternativeBypasses: [
      {
        source: 'src/main/alpha/consumer.ts',
        target: 'src/main/beta/internal.ts',
        publicEntryPoint,
        dependencyKind,
      },
    ],
  };
}
