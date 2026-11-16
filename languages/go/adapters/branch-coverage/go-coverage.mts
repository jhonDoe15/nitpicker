import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { moduleFileText, parseCoverProfile, readGoModule } from '../typed/go-readers.mts';
import { COVERAGE_PROFILE } from '../tests/go-test.mts';
import { goBranchFindings } from './go-branch-coverage.mts';
import { goCrapFindings } from './go-crap.mts';
import type { Branch, FindingRow, GoFunction, TestRun } from '../go-types.mts';

type CoverageContext = { reportRoot: string; projectRoot: string };

const CRASHED = /^panic: /mu;

function readProfile(context: CoverageContext, modulePath: string | undefined) {
  const file = path.join(context.reportRoot, COVERAGE_PROFILE);
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  return parseCoverProfile(text, modulePath);
}

function unmeasuredPackages(testRun: Pick<TestRun, 'failures' | 'buildFailures'>) {
  const crashed = testRun.failures
    .filter(({ id, package: name, output }) => id === name || CRASHED.test(output))
    .map(({ package: name }) => name);
  return new Set([...testRun.buildFailures, ...crashed]);
}

function measuredFiles(
  modulePath: string | undefined,
  testRun: Pick<TestRun, 'failures' | 'buildFailures'>,
) {
  const failed: ReadonlySet<string | undefined> = unmeasuredPackages(testRun);
  return ({ file }: { file: string }) => {
    const directory = path.posix.dirname(file);
    return !failed.has(directory === '.' ? modulePath : `${String(modulePath)}/${directory}`);
  };
}

function sourceReader(projectRoot: string) {
  const files = new Map<string, string[]>();
  return (file: string): string[] => {
    if (!files.has(file)) {
      files.set(file, (moduleFileText(projectRoot, file) ?? '').split(/\r?\n/u));
    }
    return files.get(file) ?? [];
  };
}

export function goCoverageFindings(
  context: CoverageContext,
  {
    report,
    testRun,
  }: {
    report: { branches: readonly Branch[]; functions: readonly GoFunction[] };
    testRun: Pick<TestRun, 'failures' | 'buildFailures'>;
  },
  policy: { crapLimit?: number | undefined } = {},
): FindingRow[] {
  const modulePath = readGoModule(context.projectRoot)?.module;
  const profile = readProfile(context, modulePath);
  const sourceLines = sourceReader(context.projectRoot);
  const measured = measuredFiles(modulePath, testRun);
  const branches = report.branches.filter(measured);
  return [
    ...goBranchFindings({ branches, profile, sourceLines }),
    ...goCrapFindings({
      functions: report.functions.filter(measured),
      branches,
      profile,
      limit: policy.crapLimit,
      functionText: ({ file, start, end }: { file: string; start: number; end: number }) =>
        sourceLines(file)
          .slice(start - 1, end)
          .join('\n'),
    }),
  ];
}
