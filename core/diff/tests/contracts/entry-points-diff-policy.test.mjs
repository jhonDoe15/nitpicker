import {
  expectedOutput26_42,
  expectedOutput32_36,
  expectedOutput104_57,
} from '../../fixtures/expected-output/core-diff-entry-points-diff-policy.mjs';
import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { analyzeEntryPoints } from '../../../../languages/typescript/preset/entry-points/analyze.mjs';
import { compareFindings } from '../../comparison/compare.mjs';
import {
  createEntryPointAnalyzer,
  toEntryPointDiffFindings,
} from '../../../../languages/typescript/adapters/entry-points.mjs';
import { configuredAnalyzers } from '../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { runAnalyzers } from '../../execution/run-analyzers.mjs';

const packageRoot = path.resolve(new URL('../../', import.meta.url).pathname, '../..');

describe('entry-point differential adapter', () => {
  it('reports a new public-entry-point bypass separately from an unchanged baseline bypass', () => {
    const baseReport = analyzeEntryPoints(graph(false), 'src/main');
    const headReport = analyzeEntryPoints(graph(true), 'src/main');

    const comparison = compareFindings({
      baseFindings: toEntryPointDiffFindings(baseReport),
      headFindings: toEntryPointDiffFindings(headReport),
    });

    expect(comparison.unchangedFindings).toEqual(expectedOutput26_42());
    expect(comparison.newFindings).toEqual(expectedOutput32_36());
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
      const run = runAnalyzers({
        analyzers: [analyzer],
        projectRoot,
        policyRoot: packageRoot,
        toolRoot: packageRoot,
        liveProjectRoot: packageRoot,
        snapshot: 'head',
      });
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
    expect([...new Set(configuredAnalyzers.map(({ name }) => name))].sort()).toEqual(
      expectedOutput104_57(),
    );
  });
});

function graph(includeIntroducedBypass) {
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

function module(source, dependencies = []) {
  return { source, dependencies };
}

function dependency(resolved, dependencyTypes = []) {
  return { resolved, dependencyTypes };
}

function reportFor({ publicEntryPoint, dependencyKind }) {
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
