import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { fieldOf, fieldsOf, parseJson, textOf } from '../../../shared/values/readers.mts';
import { type ComparedFinding, compareFindings } from './test-support/typed-compare.mts';
import { parseAnalyzerReport } from './test-support/parsed-findings.mts';
import { readProjectMoves as readProjectMovesJs } from '../git/patches/project-moves.mjs';
import { resolveComparison as resolveComparisonJs } from '../git/repository/git.mjs';
import { runGit as runGitJs } from '../git/repository/command.mjs';

const readProjectMoves: (request: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
  readonly projectRelativePath: string;
}) => { readonly files: ReadonlyMap<string, string> } = readProjectMovesJs;
const resolveComparison: (
  repositoryRoot: string,
  requestedBaseRef: string,
) => { readonly mergeBaseSha: string; readonly headSha: string } = resolveComparisonJs;
const runGit: (repositoryRoot: string, args: readonly string[]) => string = runGitJs;

const conformanceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../spec/conformance',
);
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-conformance-'));

afterAll(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

function readJson(...segments: readonly string[]): Readonly<Record<string, unknown>> {
  return fieldsOf(parseJson(readFileSync(path.join(conformanceRoot, ...segments), 'utf8')));
}

function renamesOf(expected: Readonly<Record<string, unknown>>): Map<string, string> {
  return new Map(
    Object.entries(fieldsOf(expected['renames'])).map(([from, to]): [string, string] => [
      from,
      textOf(to),
    ]),
  );
}

function thrownMessage(operation: () => unknown): string | undefined {
  try {
    operation();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

function expectedFailure(error: unknown): unknown {
  return error === undefined ? undefined : expect.stringContaining(textOf(error));
}

function caseNames(kind: string): string[] {
  return readdirSync(path.join(conformanceRoot, kind), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function project(finding: ComparedFinding) {
  return {
    tool: finding['tool'],
    rule: finding['rule'],
    path: finding.path,
    ...(finding['symbol'] === undefined ? {} : { symbol: finding['symbol'] }),
    identity: finding.identity,
    classification: finding['classification'],
  };
}

describe('findings conformance fixtures', () => {
  it.each(successfulCases('findings'))('%s', (name) => {
    const expected = readJson('findings', name, 'expected.json');
    const baseFindings = parseAnalyzerReport(
      readJson('findings', name, 'base.json'),
      'base',
    ).findings;
    const headFindings = parseAnalyzerReport(
      readJson('findings', name, 'head.json'),
      'head',
    ).findings;
    function compare() {
      return compareFindings({
        baseFindings,
        headFindings,
        baseToHeadRenames: renamesOf(expected),
      });
    }

    expect(thrownMessage(compare)).toEqual(expectedFailure(expected['error']));
    const result = compare();
    expect(result.newFindings.map(project)).toEqual(expected['new']);
    expect(result.resolvedFindings.map(project)).toEqual(expected['resolved']);
    expect(result.unchangedFindings.map(project)).toEqual(expected['unchanged']);
    expect(
      result.changedMetrics.map(
        ({ tool, rule, path: findingPath, identity, metric, ...values }) => ({
          tool,
          rule,
          path: findingPath,
          identity,
          metric,
          baseValue: fieldOf(values, 'baseValue'),
          headValue: fieldOf(values, 'headValue'),
          delta: fieldOf(values, 'delta'),
        }),
      ),
    ).toEqual(expected['changedMetrics']);
  });
});

describe('git conformance fixtures', () => {
  it.each(successfulCases('git'))('%s', (name) => {
    const expected = readJson('git', name, 'expected.json');
    const repositoryRoot = path.join(temporaryRoot, name);
    execFileSync('sh', [path.join(conformanceRoot, 'git', name, 'build.sh'), repositoryRoot], {
      stdio: 'pipe',
    });

    expect(
      thrownMessage(() => resolveComparison(repositoryRoot, textOf(expected['baseRef']))),
    ).toEqual(expectedFailure(expected['error']));
    const resolve = (tag: string) =>
      runGit(repositoryRoot, ['rev-parse', `${tag}^{commit}`]).trim();
    const comparison = resolveComparison(repositoryRoot, textOf(expected['baseRef']));
    expect(comparison.mergeBaseSha).toBe(resolve(textOf(expected['mergeBase'])));
    expect(comparison.headSha).toBe(resolve(textOf(expected['head'])));

    const { files: renames } = readProjectMoves({
      repositoryRoot,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      projectRelativePath: textOf(expected['projectPath']),
    });
    expect(Object.fromEntries(renames)).toEqual(expected['renames']);
  });
});

function successfulCases(kind: string): string[] {
  return caseNames(kind).filter(
    (name) => readJson(kind, name, 'expected.json')['error'] === undefined,
  );
}

function failingCases(kind: string): string[] {
  return caseNames(kind).filter(
    (name) => readJson(kind, name, 'expected.json')['error'] !== undefined,
  );
}

describe('invalid findings conformance fixtures', () => {
  it.each(failingCases('findings'))('%s', (name) => {
    const expected = readJson('findings', name, 'expected.json');
    const baseFindings = parseAnalyzerReport(
      readJson('findings', name, 'base.json'),
      'base',
    ).findings;
    const headFindings = parseAnalyzerReport(
      readJson('findings', name, 'head.json'),
      'head',
    ).findings;
    expect(
      thrownMessage(() =>
        compareFindings({
          baseFindings,
          headFindings,
          baseToHeadRenames: renamesOf(expected),
        }),
      ),
    ).toEqual(expectedFailure(expected['error']));
  });
});

describe('invalid git conformance fixtures', () => {
  it.each(failingCases('git'))('%s', (name) => {
    const expected = readJson('git', name, 'expected.json');
    const repositoryRoot = path.join(temporaryRoot, name);
    execFileSync('sh', [path.join(conformanceRoot, 'git', name, 'build.sh'), repositoryRoot], {
      stdio: 'pipe',
    });
    expect(
      thrownMessage(() => resolveComparison(repositoryRoot, textOf(expected['baseRef']))),
    ).toEqual(expectedFailure(expected['error']));
  });
});
