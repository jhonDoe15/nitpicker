import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from './compare.mjs';
import { parseAnalyzerReport } from './finding-schema.mjs';
import { readRenameMap, resolveComparison, runGit } from './git.mjs';

const conformanceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../spec/conformance',
);
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-conformance-'));

afterAll(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

function readJson(...segments) {
  return JSON.parse(readFileSync(path.join(conformanceRoot, ...segments), 'utf8'));
}

function caseNames(kind) {
  return readdirSync(path.join(conformanceRoot, kind), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function project(finding) {
  return {
    tool: finding.tool,
    rule: finding.rule,
    path: finding.path,
    ...(finding.symbol === undefined ? {} : { symbol: finding.symbol }),
    identity: finding.identity,
    classification: finding.classification,
  };
}

describe('findings conformance fixtures', () => {
  it.each(caseNames('findings'))('%s', (name) => {
    const expected = readJson('findings', name, 'expected.json');
    const baseFindings = parseAnalyzerReport(
      readJson('findings', name, 'base.json'),
      'base',
    ).findings;
    const headFindings = parseAnalyzerReport(
      readJson('findings', name, 'head.json'),
      'head',
    ).findings;
    const compare = () =>
      compareFindings({
        baseFindings,
        headFindings,
        baseToHeadRenames: new Map(Object.entries(expected.renames ?? {})),
      });

    if (expected.error !== undefined) {
      expect(compare).toThrow(expected.error);
      return;
    }
    const result = compare();
    expect(result.newFindings.map(project)).toEqual(expected.new);
    expect(result.resolvedFindings.map(project)).toEqual(expected.resolved);
    expect(result.unchangedFindings.map(project)).toEqual(expected.unchanged);
    expect(
      result.changedMetrics.map(
        ({ tool, rule, path: findingPath, identity, metric, ...values }) => ({
          tool,
          rule,
          path: findingPath,
          identity,
          metric,
          baseValue: values.baseValue,
          headValue: values.headValue,
          delta: values.delta,
        }),
      ),
    ).toEqual(expected.changedMetrics);
  });
});

describe('git conformance fixtures', () => {
  it.each(caseNames('git'))('%s', (name) => {
    const expected = readJson('git', name, 'expected.json');
    const repositoryRoot = path.join(temporaryRoot, name);
    execFileSync('sh', [path.join(conformanceRoot, 'git', name, 'build.sh'), repositoryRoot], {
      stdio: 'pipe',
    });

    if (expected.error !== undefined) {
      expect(() => resolveComparison(repositoryRoot, expected.baseRef)).toThrow(expected.error);
      return;
    }
    const resolve = (tag) => runGit(repositoryRoot, ['rev-parse', `${tag}^{commit}`]).trim();
    const comparison = resolveComparison(repositoryRoot, expected.baseRef);
    expect(comparison.mergeBaseSha).toBe(resolve(expected.mergeBase));
    expect(comparison.headSha).toBe(resolve(expected.head));

    const renames = readRenameMap({
      repositoryRoot,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      projectRelativePath: expected.projectPath,
    });
    expect(Object.fromEntries(renames)).toEqual(expected.renames);
  });
});
