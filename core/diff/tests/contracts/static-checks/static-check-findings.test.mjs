import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeArchitectureViolations } from '../../../../../languages/typescript/adapters/static-checks-runner.mjs';
import { withDefaultAnalyzerParallelism } from '../../../execution/test-support/analyzer-parallelism.mjs';
import { runQualityDiff } from '../../../comparison/run-diff.mjs';
import { configuredAnalyzers } from '../../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import {
  toolRoot,
  useStaticCheckFixtures,
  fixtureAnalyzers,
  policyFiles,
  architectureReport,
} from './test-support/static-check-fixtures.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';
import { commit } from '../../../git/test-support/git-repository.mjs';

const { createRepository } = useStaticCheckFixtures();

describe('static differential adapters', () => {
  let difference;
  function runStaticDifference() {
    if (difference !== undefined) {
      return difference;
    }
    const repository = createRepository({
      ...policyFiles(),
      'src/main/server.ts': 'export const server = true;\n',
      'src/main/auth/logic.ts': 'export const valid: number = 1;\n',
      'src/main/auth/drift.ts': 'export const first={value:1}\n',
      'src/main/ignored/ignored.ts': 'export const ignored=true\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    writeFiles(repository.root, {
      'src/main/auth/logic.ts': [
        "import { server } from '../server.js'",
        "export const valid:number = 'broken'",
        'void server',
        '',
      ].join('\n'),
      'src/main/auth/drift.ts': [
        'export const first={value:1}',
        'export const second={value:2}',
        '',
      ].join('\n'),
    });
    commit(repository.root, 'introduce static findings');

    difference = withDefaultAnalyzerParallelism(() =>
      runQualityDiff({
        repositoryRoot: repository.root,
        projectRelativePath: '.',
        headProjectRoot: toolRoot,
        requestedBaseRef: repository.baseRef,
        outputRoot: path.join(repository.root, 'reports/quality/diff'),
        analyzers: fixtureAnalyzers(),
      }),
    );
    return difference;
  }
  const atPath = (findings, filePath) => findings.filter((finding) => finding.path === filePath);
  it('reports new formatting, type, and architecture findings', () => {
    const report = runStaticDifference();

    expect(report.toolErrors).toEqual([]);
    expect(report.summary.overallStatus).toBe('completed');
    expect(new Set(report.newFindings.map((finding) => finding.tool))).toEqual(
      new Set(['prettier-format', 'typescript-typecheck', 'dependency-architecture']),
    );
    expect(report.newFindings).toEqual([
      {
        tool: 'dependency-architecture',
        rule: 'features-do-not-import-bootstrap',
        path: 'src/main/auth/logic.ts',
        identity: 'target:src/main/server.ts|occurrence:1',
        message: 'src/main/auth/logic.ts must not depend on src/main/server.ts',
        classification: 'enforceable',
      },
      {
        tool: 'prettier-format',
        rule: 'prettier/prettier',
        path: 'src/main/auth/drift.ts',
        identity: 'format-diff:9f7a98502a664a32843099ca',
        message: 'Format these lines with Prettier',
        classification: 'enforceable',
        location: { line: 1, endLine: 2 },
      },
      {
        tool: 'prettier-format',
        rule: 'prettier/prettier',
        path: 'src/main/auth/logic.ts',
        identity: 'format-diff:30a09f8cdd43aeffcc325cbc',
        message: 'Format these lines with Prettier',
        classification: 'enforceable',
        location: { line: 1, endLine: 3 },
      },
      {
        tool: 'typescript-typecheck',
        rule: 'TS2322',
        path: 'src/main/auth/logic.ts',
        identity: 'diagnostic:2322|message:f4d9667471f422b62248edc2|symbol:valid|occurrence:1',
        message: "Type 'string' is not assignable to type 'number'.",
        classification: 'enforceable',
        symbol: 'valid',
        location: { line: 2, column: 14 },
      },
    ]);
  });
  it('reports added formatting drift in an already unformatted file', () => {
    const report = runStaticDifference();
    const driftPath = 'src/main/auth/drift.ts';

    expect(report.toolErrors).toEqual([]);
    expect(atPath(report.newFindings, driftPath)).toEqual([
      {
        tool: 'prettier-format',
        rule: 'prettier/prettier',
        path: driftPath,
        identity: 'format-diff:9f7a98502a664a32843099ca',
        message: 'Format these lines with Prettier',
        classification: 'enforceable',
        location: { line: 1, endLine: 2 },
      },
    ]);
    expect(atPath(report.resolvedFindings, driftPath)).toHaveLength(1);
    expect(atPath(report.unchangedFindings, driftPath)).toEqual([]);
  });
  it('canonicalizes equivalent dependency cycle rotations', () => {
    const first = normalizeArchitectureViolations(
      architectureReport(['src/main/b.ts', 'src/main/c.ts', 'src/main/a.ts'], 'src/main/b.ts'),
      'dependency-architecture',
    );
    const second = normalizeArchitectureViolations(
      architectureReport(['src/main/a.ts', 'src/main/b.ts', 'src/main/c.ts'], 'src/main/a.ts'),
      'dependency-architecture',
    );

    expect(first[0].identity).toBe(second[0].identity);
    expect(first[0].path).toBe(second[0].path);
    expect(first[0].path).toBe('src/main/a.ts');
  });
  it.each([['single-command', configuredAnalyzers]])(
    'includes all deterministic static checks in the %s analyzer catalog',
    (_dial, analyzers) => {
      expect([...new Set(analyzers.map(({ name }) => name))].sort()).toEqual([
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
        'test-runtime',
        'typescript-typecheck',
      ]);
    },
  );
});
