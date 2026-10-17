import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commitFiles,
  COMMON_EXCLUSIONS,
  comparisonOptions,
  fakeAnalyzer,
  useQualityDiffRepositories,
} from '../test-support/quality-diff-harness.mjs';
import { runQualityDiff } from '../../../comparison/run-diff.mjs';
import { commit, fixtureGit } from '../../../git/test-support/git-repository.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../../execution/test-support/analyzer-findings.mjs';
import { renameFile, writeFiles } from '../../../git/test-support/fixture-files.mjs';

const { createRepository } = useQualityDiffRepositories();

function removeWorkingTreeFiles(repositoryRoot) {
  for (const entry of readdirSync(repositoryRoot)) {
    if (entry !== '.git') {
      rmSync(path.join(repositoryRoot, entry), {
        recursive: true,
        force: true,
      });
    }
  }
}

describe('quality diff Git comparison', () => {
  it('uses the merge base rather than the requested branch tip', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    const mergeBaseSha = repository.baseSha;
    fixtureGit(repository.root, ['checkout', '-q', '-b', 'upstream']);
    commitFiles(repository.root, { 'upstream-only.txt': 'upstream\n' }, 'upstream change');
    fixtureGit(repository.root, ['checkout', '-q', 'main']);
    commitFiles(repository.root, { 'head-only.txt': 'head\n' }, 'head change');

    const report = runQualityDiff(comparisonOptions(repository, 'upstream'));

    expect(report.summary.mergeBaseSha).toBe(mergeBaseSha);
    expect(report.unchangedFindings).toHaveLength(1);
    expect(report.newFindings).toEqual([]);
  });
  it('separates unchanged, added, and removed findings', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/findings.ts': [
        findingLine(finding({ identity: 'stable' })),
        findingLine(finding({ identity: 'removed' })),
      ].join(''),
    });
    commitFiles(
      repository.root,
      {
        'src/main/findings.ts': [
          findingLine(finding({ identity: 'stable' })),
          findingLine(finding({ identity: 'added' })),
        ].join(''),
      },
      'change findings',
    );

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.unchangedFindings.map((entry) => entry.identity)).toEqual(['stable']);
    expect(report.newFindings.map((entry) => entry.identity)).toEqual(['added']);
    expect(report.resolvedFindings.map((entry) => entry.identity)).toEqual(['removed']);
  });
  it('ignores line movement when stable identity is unchanged', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/moved.ts': findingLine(finding({ identity: 'moved' })),
    });
    commitFiles(
      repository.root,
      {
        'src/main/moved.ts': `const unrelated = true;\n\n${findingLine(
          finding({ identity: 'moved' }),
        )}`,
      },
      'insert unrelated lines',
    );

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.unchangedFindings).toHaveLength(1);
    expect(report.unchangedFindings[0].location.line).toBe(3);
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
  });
  it('maps a renamed base path to its head path', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old-name.ts': findingLine(finding({ identity: 'renamed', identityFromPath: true })),
    });
    renameFile(repository.root, 'src/main/old-name.ts', 'src/main/new-name.ts');
    commit(repository.root, 'rename source');

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.summary.renamedPaths).toBe(1);
    expect(report.unchangedFindings).toHaveLength(1);
    expect(report.unchangedFindings[0].path).toBe('src/main/new-name.ts');
    expect(report.unchangedFindings[0].identity).toBe('path:src/main/new-name.ts');
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
  });
  it('reports a graph-wide finding at an unchanged source location', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
      'dependency.graph': '',
    });
    const graphFinding = finding({
      identity: 'src/main/source.ts->src/main/forbidden.ts',
      path: 'src/main/source.ts',
      rule: 'forbidden-dependency',
    });
    commitFiles(
      repository.root,
      {
        'dependency.graph': `src/main/source.ts -> src/main/forbidden.ts ${findingLine(graphFinding)}`,
      },
      'add forbidden dependency edge',
    );

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.newFindings).toEqual([
      {
        tool: 'fake-quality-analyzer',
        rule: 'forbidden-dependency',
        path: 'src/main/source.ts',
        identity: 'src/main/source.ts->src/main/forbidden.ts',
        message: 'Fixture finding',
        classification: 'enforceable',
        location: { line: 1, column: 48 },
      },
    ]);
    expect(
      fixtureGit(repository.root, ['diff', '--name-only', repository.baseSha, 'HEAD']).trim(),
    ).toBe('dependency.graph');
  });
  it('reports descriptive value changes only as metric deltas', () => {
    const baseMetric = finding({
      identity: 'module-fan-out',
      classification: 'descriptive',
      metric: { name: 'fanOut', value: 2 },
    });
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/metric.ts': findingLine(baseMetric),
    });
    commitFiles(
      repository.root,
      {
        'src/main/metric.ts': findingLine({
          ...baseMetric,
          metric: { name: 'fanOut', value: 5 },
        }),
      },
      'change metric',
    );

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
    expect(report.unchangedFindings).toEqual([]);
    expect(report.changedMetrics).toEqual([
      {
        tool: 'fake-quality-analyzer',
        rule: 'fixture-rule',
        path: 'src/main/metric.ts',
        symbol: undefined,
        identity: 'module-fan-out',
        message: 'Fixture finding',
        metric: 'fanOut',
        baseValue: 2,
        headValue: 5,
        delta: 3,
      },
    ]);
  });
  it('excludes non-production and generated paths', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/selected.ts': 'export const selected = true;\n',
    });
    const excludedFinding = finding({ identity: 'excluded' });
    const excludedFiles = [
      'src/main/generated/a.ts',
      'src/main/types/a.d.ts',
      'node_modules/package/a.js',
      'reports/a.txt',
      'coverage/a.txt',
      'dist/a.js',
      'build/a.js',
      'target/a.js',
    ];
    commitFiles(
      repository.root,
      Object.fromEntries(excludedFiles.map((filePath) => [filePath, findingLine(excludedFinding)])),
      'add excluded findings',
    );

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
    expect(report.unchangedFindings).toEqual([]);
    expect(report.summary.exclusions).toEqual(COMMON_EXCLUSIONS.slice().sort());
  });
  it('fails for an invalid base ref', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });

    expect(() => runQualityDiff(comparisonOptions(repository, 'missing-ref'))).toThrow(
      /Cannot resolve base ref "missing-ref"/,
    );
  });
  it('fails when disconnected histories have no merge base', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/base.ts': 'export const base = true;\n',
    });
    fixtureGit(repository.root, [
      'remote',
      'add',
      'upstream',
      'https://example.invalid/example.git',
    ]);
    fixtureGit(repository.root, ['update-ref', 'refs/remotes/upstream/base', repository.baseSha]);
    fixtureGit(repository.root, ['checkout', '-q', '--orphan', 'unrelated']);
    removeWorkingTreeFiles(repository.root);
    writeFiles(repository.root, {
      'quality-policy.json': policy(),
      'src/main/head.ts': 'export const head = true;\n',
    });
    commit(repository.root, 'unrelated head');

    expect(() => runQualityDiff(comparisonOptions(repository, 'upstream/base'))).toThrow(
      /git fetch 'upstream' 'base'/,
    );
  });
  it('leaves out only the tool that a tool error names when it is not the analyzer itself', () => {
    const mutant = finding({ tool: 'mutants', identity: 'mutant' });
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/kept.ts': findingLine(mutant),
    });
    commitFiles(
      repository.root,
      {
        'src/main/kept.ts': '',
        'src/main/new.ts': [
          findingLine(finding({ identity: 'new-lint' })),
          findingLine(
            finding({
              tool: 'mutants',
              rule: 'tests-failed-skipped',
              identity: 'tests-failed-skipped',
              message: 'mutants did not run',
              classification: 'tool-error',
            }),
          ),
        ].join(''),
      },
      'break the tests',
    );

    const report = runQualityDiff({
      ...comparisonOptions(repository),
      analyzers: [fakeAnalyzer({ reportedTools: ['mutants'] })],
    });

    expect({
      newFindings: report.newFindings.map(({ tool, identity }) => `${tool} ${identity}`),
      resolvedFindings: report.resolvedFindings,
      toolErrors: report.toolErrors.map(({ tool, snapshot, rule }) => ({ tool, snapshot, rule })),
    }).toEqual({
      newFindings: ['fake-quality-analyzer new-lint'],
      resolvedFindings: [],
      toolErrors: [{ tool: 'mutants', snapshot: 'head', rule: 'tests-failed-skipped' }],
    });
  });
  it('accepts valid findings output with a nonzero analyzer exit', () => {
    const repository = createRepository({
      'quality-policy.json': policy({ exitCodeWhenFindings: 1 }),
      'src/main/base.ts': 'export const base = true;\n',
    });
    commitFiles(
      repository.root,
      {
        'src/main/new.ts': findingLine(finding({ identity: 'nonzero-finding' })),
      },
      'add finding',
    );

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.summary.overallStatus).toBe('completed');
    expect(report.newFindings).toHaveLength(1);
    expect(report.toolErrors).toEqual([]);
  });
});
